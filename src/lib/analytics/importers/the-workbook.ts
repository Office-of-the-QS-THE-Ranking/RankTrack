/*
 * A unit's THE Impact data-collection workbook (the Office's “locate your unit then fill up” file, as SIMBAHAYAN
 * returned it): one sheet per SDG, rows typed Metric or Indicator, picklist options and continuous figures on the
 * rows beneath, then Yes/No, a value, and pairs of evidence links with a public flag. Read into values and links
 * for an edition's catalog; anything it can't place is listed, not guessed.
 */
import { cleanUrl, urlsIn } from "../links";
import { cellText, findHeader, headerKey } from "../tabular/text";
import type { Sheet } from "../tabular/xlsx";
import type { CatalogIndicator, Value } from "../types";

export interface WorkbookValue {
  code: string;
  value: Value;
  note: string;
}

export interface WorkbookLink {
  code: string;
  url: string;
  label: string;
  public?: boolean;
}

export interface WorkbookRead {
  values: WorkbookValue[];
  links: WorkbookLink[];
  /** Rows with an answer or a link the catalog has no place for. */
  unplaced: string[];
  sheets: number;
}

const yes = (s: string) => /^(y|yes|true|1)\b/i.test(s.trim());
const no = (s: string) => /^(n|no|false|0)\b/i.test(s.trim());

/** Whether a workbook is a THE data-collection workbook. */
export const isTheWorkbook = (sheets: Sheet[]) => sheets.filter((s) => /^SDG\s*\d+\s*$/i.test(s.name.trim())).length >= 3;

export function readTheWorkbook(sheets: Sheet[], indicators: CatalogIndicator[]): WorkbookRead {
  const byCode = new Map(indicators.map((i) => [i.code, i]));
  const values = new Map<string, WorkbookValue>();
  const links: WorkbookLink[] = [];
  const unplaced: string[] = [];
  let count = 0;
  for (const sheet of sheets.filter((s) => /^SDG\s*\d+\s*$/i.test(s.name.trim()))) {
    const head = findHeader(sheet.rows, ["Metric and indicator reference", "Metric / Indicator", "Yes/No"]);
    if (!head) continue;
    count++;
    const header = (sheet.rows[head.row] ?? []).map((c) => headerKey(cellText(c)));
    const col = (k: string) => header.indexOf(headerKey(k));
    const cType = col("Type");
    const cRef = head.cols["Metric and indicator reference"];
    const cLabel = head.cols["Metric / Indicator"];
    const cValue = header.findIndex((h) => h.startsWith("value"));
    const cYes = head.cols["Yes/No"];
    // Evidence columns come in pairs: Evidence1, Public, Evidence2, Public…
    const pairs = header.flatMap((h, i) => (/^evidence\s*\d*$/.test(h) ? [[i, header[i + 1]?.startsWith("public") ? i + 1 : -1] as const] : []));
    let current: CatalogIndicator | null = null;
    for (const row of sheet.rows.slice(head.row + 1)) {
      const type = cType >= 0 ? cellText(row[cType]) : "";
      const ref = cellText(row[cRef]).replace(/\s+/g, "");
      const label = cellText(row[cLabel]);
      if (/^metric$/i.test(type)) {
        current = null;
        continue;
      }
      if (ref && byCode.has(ref)) current = byCode.get(ref)!;
      else if (ref && /^\d+\.\d+\.\d+$/.test(ref)) {
        current = null;
        if (row.some((c, i) => i !== cRef && i !== cLabel && cellText(c))) unplaced.push(`${sheet.name} ${ref}: not in this edition`);
        continue;
      }
      if (!current) continue;
      const answer = cellText(row[cYes]);
      const rawValue = cValue >= 0 ? row[cValue] : null;
      const isIndicatorRow = !!ref;
      const ind = current;
      // The question's own answer, on its row.
      if (isIndicatorRow && answer && (yes(answer) || no(answer))) {
        const v = values.get(ind.code)?.value ?? {};
        values.set(ind.code, { code: ind.code, value: { ...v, yes: yes(answer) }, note: "" });
      }
      // A picklist option beneath it.
      if (!isIndicatorRow && label && (ind.input.type === "picks" || ind.input.type === "choice")) {
        const opt = ind.input.options.find((o) => headerKey(o.key) === headerKey(label) || headerKey(o.label) === headerKey(label) || headerKey(o.label).startsWith(headerKey(label)));
        if (opt && yes(answer)) {
          const v = values.get(ind.code)?.value ?? {};
          const next: Value = ind.input.type === "picks" ? { ...v, picks: [...new Set([...(v.picks ?? []), opt.key])], yes: true } : { ...v, choice: opt.key, yes: true };
          values.set(ind.code, { code: ind.code, value: next, note: "" });
        } else if (!opt && (answer || pairs.some(([e]) => cellText(row[e])))) unplaced.push(`${sheet.name} ${ind.code}: option “${label}”`);
      }
      // A continuous figure beneath it: one of the indicator's numeric inputs, matched by name.
      if (!isIndicatorRow && label && rawValue !== null && rawValue !== undefined && cellText(rawValue) !== "") {
        const n = typeof rawValue === "number" ? rawValue : Number(cellText(rawValue).replace(/[,\s]/g, ""));
        const target = indicators.find((i) => i.input.type === "number" && (i.parent === ind.code || i.code.startsWith(`${ind.code}.`)) && headerKey(i.name) === headerKey(label));
        if (target && Number.isFinite(n)) values.set(target.code, { code: target.code, value: { num: n }, note: "" });
        else unplaced.push(`${sheet.name} ${ind.code}: “${label}” = ${cellText(rawValue)}`);
      }
      // Evidence links, with the public flag (and often the evidence's title) beside each.
      for (const [e, p] of pairs) {
        const cell = cellText(row[e]);
        if (!cell) continue;
        const flag = p >= 0 ? cellText(row[p]) : "";
        const urls = urlsIn(cell);
        const list = urls.length ? urls : [cleanUrl(cell)].filter((u): u is string => !!u);
        for (const url of list) {
          const title = flag.replace(/^(yes|no)\b[\s:–-]*/i, "").trim() || cell.replace(url, "").trim();
          links.push({ code: ind.code, url, label: title.slice(0, 200), ...(yes(flag) ? { public: true } : no(flag) ? { public: false } : {}) });
        }
      }
    }
  }
  return { values: [...values.values()], links, unplaced, sheets: count };
}
