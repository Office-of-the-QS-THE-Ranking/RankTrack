/*
 * Where the University stands against its peers: for every figure it has a published value for, the median of each
 * peer band (Philippine competitors, ASEAN comparators, aspirational peers) and the gap to it, with the units that
 * own the figure. And the University's own results over the years.
 */
import type { Benchmark, Catalog, PeerBand } from "./types";
import { OWN, PEER_BANDS } from "./types";

export interface GapRow {
  metric: string;
  label: string;
  year: number;
  own: number | null;
  ownLabel?: string;
  medians: Partial<Record<PeerBand, { value: number; n: number }>>;
  /** (own − median) ÷ median, in percent; negative is behind. */
  gaps: Partial<Record<PeerBand, number>>;
  owners: string[];
}

export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** "701-850" → 701; "=45" → 45; "1001+" → 1001. Lower is better. */
export function rankNumber(label: string | undefined): number | null {
  const m = /(\d+)/.exec(label ?? "");
  return m ? Number(m[1]) : null;
}

/** What a metric is called: the catalog's indicator or group name, else the key made readable. */
export function metricLabel(metric: string, catalog?: Catalog | null): string {
  const ind = catalog?.indicators.find((i) => i.code === metric || i.ref === metric);
  if (ind) return `${ind.ref ?? ind.code} ${ind.name}`;
  const g = catalog?.groups.find((x) => x.code === metric);
  if (g) return g.name;
  const [a, b] = metric.split(":");
  const words = (s: string) => s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return b ? `${words(a)} · ${words(b)}` : words(a);
}

export function gapMatrix(ranking: string, benchmarks: Benchmark[], peerBand: Map<string, PeerBand>, catalog?: Catalog | null): GapRow[] {
  const rows = benchmarks.filter((b) => b.ranking === ranking);
  const own = rows.filter((b) => b.peer === OWN && (typeof b.value === "number" || b.label));
  if (!own.length) return [];
  const year = Math.max(...own.map((b) => b.year));
  const latest = own.filter((b) => b.year === year);
  const ownersOf = (metric: string) => {
    const ind = catalog?.indicators.find((i) => i.code === metric || i.ref === metric);
    if (ind) return ind.owners;
    return [...new Set(catalog?.indicators.filter((i) => i.group === metric).flatMap((i) => i.owners) ?? [])];
  };
  return latest
    .map((o) => {
      const peers = rows.filter((b) => b.peer !== OWN && b.metric === o.metric && b.year === year);
      const medians: GapRow["medians"] = {};
      const gaps: GapRow["gaps"] = {};
      for (const band of PEER_BANDS) {
        const vals = peers.filter((b) => peerBand.get(b.peer) === band).map((b) => (typeof b.value === "number" ? b.value : rankNumber(b.label))).filter((x): x is number => x !== null);
        if (!vals.length) continue;
        const med = median(vals);
        medians[band] = { value: Math.round(med * 100) / 100, n: vals.length };
        const mine = typeof o.value === "number" ? o.value : rankNumber(o.label);
        if (mine !== null && med !== 0) {
          // Ranks: lower is better, so being ahead means a smaller number.
          const isRank = typeof o.value !== "number";
          gaps[band] = Math.round(((isRank ? med - mine : mine - med) / Math.abs(med)) * 1000) / 10;
        }
      }
      return { metric: o.metric, label: metricLabel(o.metric, catalog), year, own: typeof o.value === "number" ? o.value : null, ...(o.label && { ownLabel: o.label }), medians, gaps, owners: ownersOf(o.metric) };
    })
    .sort((a, b) => a.metric.localeCompare(b.metric, undefined, { numeric: true }));
}

/** The University's own figure for a metric, year by year. */
export function ownTrend(ranking: string, benchmarks: Benchmark[], metric: string) {
  return benchmarks
    .filter((b) => b.ranking === ranking && b.peer === OWN && b.metric === metric)
    .sort((a, b) => a.year - b.year)
    .map((b) => ({ year: b.year, ...(typeof b.value === "number" && { value: b.value }), ...(b.label && { label: b.label }) }));
}
