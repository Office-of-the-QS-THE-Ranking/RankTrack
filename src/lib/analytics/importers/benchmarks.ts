/*
 * Peer benchmarks from a table: a ranking body's portal export, or the Office's own sheet. Long tables have one row
 * per figure (Institution, Year, Metric, Value or Rank); wide ones have a column per metric (Institution, Year,
 * Overall, Academic Reputation…). The University itself is recognised by name and recorded as its own result.
 */
import { cellText, findHeader, headerKey } from "../tabular/text";
import type { Cell, Sheet } from "../tabular/xlsx";
import { PEER_BANDS, type PeerBand } from "../types";

export interface BenchmarkRow {
  institution: string;
  country: string;
  band: PeerBand;
  own: boolean;
  year: number;
  metric: string;
  value?: number;
  label?: string;
}

export interface BenchmarkRead {
  rows: BenchmarkRow[];
  institutions: string[];
  metrics: string[];
  skipped: number;
}

const META = ["institution", "university", "peer", "name", "country", "location", "band", "group", "year", "edition", "metric", "indicator", "value", "score", "rank", "label"];

/** “University of Santo Tomas”, “UST”, “Univ. of Santo Tomas Manila” all name the University. */
export const isOwnName = (s: string) => /\bsanto\s+tomas\b/i.test(s) || /^ust$/i.test(s.trim());

const bandOf = (s: string, country: string): PeerBand => {
  const k = headerKey(s);
  const hit = PEER_BANDS.find((b) => headerKey(b) === k || (k && headerKey(b).startsWith(k)));
  if (hit) return hit;
  if (/philippines/i.test(country)) return "Philippines";
  return "Other";
};

/** A cell as a number, when it is one: "54.2", "1,912", 37. */
const numberOf = (c: Cell | undefined): number | undefined => {
  if (typeof c === "number") return c;
  const t = cellText(c).replace(/,/g, "");
  return /^-?\d+(?:\.\d+)?$/.test(t) ? Number(t) : undefined;
};

/** A metric name as a stable key: "Academic Reputation" → academic-reputation; codes like EC4 or 17.2.1 stay as they are. */
export const metricKey = (s: string) => {
  const t = s.trim();
  if (/^[A-Z]{1,4}\d{1,2}$|^\d+(?:\.\d+){1,3}$|^SDG\s?\d{1,2}$/i.test(t)) return t.replace(/\s+/g, "").toUpperCase().replace(/^SDG/, "SDG");
  return headerKey(t).replace(/\s+/g, "-");
};

export function readBenchmarks(sheets: Sheet[], fallbackYear: number): BenchmarkRead {
  const out: BenchmarkRow[] = [];
  let skipped = 0;
  for (const sheet of sheets) {
    const head = findHeader(sheet.rows, ["Institution"]) ?? findHeader(sheet.rows, ["University"]) ?? findHeader(sheet.rows, ["Peer"]);
    if (!head) continue;
    const header = (sheet.rows[head.row] ?? []).map((c) => cellText(c));
    const keys = header.map(headerKey);
    const col = (...names: string[]) => keys.findIndex((k) => names.some((n) => k === n || k.startsWith(`${n} `)));
    const cName = Object.values(head.cols)[0];
    const cCountry = col("country", "location");
    const cBand = col("band", "group");
    const cYear = col("year", "edition");
    const cMetric = col("metric", "indicator");
    const cValue = col("value", "score");
    const cRank = col("rank", "label");
    const long = cMetric >= 0 && (cValue >= 0 || cRank >= 0);
    const metricCols = long ? [] : keys.map((k, i) => (k && !META.includes(k.split(" ")[0]) && i !== cName ? i : -1)).filter((i) => i >= 0);
    for (const row of sheet.rows.slice(head.row + 1)) {
      const institution = cellText(row[cName]).replace(/\s+/g, " ");
      if (!institution) continue;
      const country = cCountry >= 0 ? cellText(row[cCountry]) : "";
      const band = bandOf(cBand >= 0 ? cellText(row[cBand]) : "", country);
      const year = (cYear >= 0 ? numberOf(row[cYear]) : undefined) ?? fallbackYear;
      if (year < 2000 || year > 2100) {
        skipped++;
        continue;
      }
      const base = { institution: institution.slice(0, 200), country: country.slice(0, 80), band, own: isOwnName(institution), year: Math.round(year) };
      if (long) {
        const metric = cellText(row[cMetric]);
        if (!metric) {
          skipped++;
          continue;
        }
        const value = cValue >= 0 ? numberOf(row[cValue]) : undefined;
        const label = cRank >= 0 ? cellText(row[cRank]) : "";
        if (value === undefined && !label) {
          skipped++;
          continue;
        }
        out.push({ ...base, metric: metricKey(metric), ...(value !== undefined && { value }), ...(label && { label: label.slice(0, 40) }) });
      } else {
        for (const i of metricCols) {
          const value = numberOf(row[i]);
          const text = cellText(row[i]);
          if (value === undefined && !text) continue;
          out.push({ ...base, metric: metricKey(header[i]), ...(value !== undefined ? { value } : { label: text.slice(0, 40) }) });
        }
        if (cRank >= 0 && cellText(row[cRank])) out.push({ ...base, metric: "overall:rank", label: cellText(row[cRank]).slice(0, 40) });
      }
    }
  }
  return { rows: out, institutions: [...new Set(out.map((r) => r.institution))], metrics: [...new Set(out.map((r) => r.metric))], skipped };
}
