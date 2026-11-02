/*
 * Institutional data templates (the Registrar's student counts, HR's staff lists, the Health Service's disability
 * register, FMO's figures) reduced to counts in memory. A profile, stored as data, says which headers identify the
 * template, which rows to skip, what to count or add up, and by which columns to break the counts down. Only the
 * columns a profile names are ever read; names, birthdates and diagnoses are not. Breakdown cells under the
 * profile's minimum are dropped, so a count of one student can't single anyone out. The rows themselves are
 * discarded once counted: only the totals and the breakdowns leave this module.
 */
import { cellText, findHeader, headerKey } from "./tabular/text";
import type { Cell, Sheet } from "./tabular/xlsx";

export interface Where {
  column: string;
  /** The cell's text is one of these (case-insensitive). */
  in?: string[];
  notIn?: string[];
  /** The cell's text matches this pattern (case-insensitive). */
  match?: string;
  /** The cell is empty (true) or filled (false). */
  empty?: boolean;
}

export interface Measure {
  key: string;
  label: string;
  /** count: rows; distinct: different values in `column`; sum: total of `column`; fte: Σ min(column ÷ full, 1). */
  op: "count" | "distinct" | "sum" | "fte";
  column?: string;
  full?: number;
  where?: Where[];
}

export interface Profile {
  key: string;
  name: string;
  /** The unit that keeps the source data (org_units id). */
  owner?: string;
  description: string;
  kind: "rows" | "pairs";
  /** Headers that identify the template; all must appear in one row near the top. */
  headers: string[];
  /** Rows to leave out, such as the templates' “*sample only” notes. */
  skip?: Where[];
  measures: Measure[];
  dimensions: string[];
  /** Breakdown cells smaller than this are dropped. */
  minCell: number;
  /** For "pairs" templates: which label row holds which figure. */
  pairs?: { label: string; key: string }[];
}

export interface Breakdown {
  dimension: string;
  cells: { value: string; counts: Record<string, number> }[];
  /** Cells dropped for being too small. */
  suppressed: number;
}

export interface TemplateResult {
  profile: string;
  sheet: string;
  rows: number;
  skipped: number;
  totals: Record<string, number>;
  breakdowns: Breakdown[];
}

export class TemplateError extends Error {}

const norm = (s: string) => s.trim().toUpperCase();

function matches(w: Where, text: string): boolean {
  if (w.empty !== undefined) return w.empty ? !text : !!text;
  const t = norm(text);
  if (w.in && !w.in.map(norm).includes(t)) return false;
  if (w.notIn && w.notIn.map(norm).includes(t)) return false;
  if (w.match) {
    try {
      if (!new RegExp(w.match, "i").test(text)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** The columns a profile reads: its headers, measures, conditions and dimensions, nothing else. */
export function columnsOf(p: Profile): string[] {
  const cols = new Set<string>(p.headers);
  for (const m of p.measures) {
    if (m.column) cols.add(m.column);
    for (const w of m.where ?? []) cols.add(w.column);
  }
  for (const w of p.skip ?? []) cols.add(w.column);
  for (const d of p.dimensions) cols.add(d);
  return [...cols];
}

/** Whether a sheet looks like this profile's template. */
export function recognises(p: Profile, sheets: Sheet[]): Sheet | null {
  if (p.kind === "pairs") return sheets.find((s) => p.pairs?.some((pair) => s.rows.some((r) => headerKey(cellText(r[0])) === headerKey(pair.label)))) ?? null;
  return sheets.find((s) => findHeader(s.rows, p.headers)) ?? null;
}

function readPairs(p: Profile, sheet: Sheet): TemplateResult {
  const totals: Record<string, number> = {};
  for (const pair of p.pairs ?? []) {
    const row = sheet.rows.find((r) => headerKey(cellText(r[0])) === headerKey(pair.label));
    const raw = row?.slice(1).find((c) => c !== null && cellText(c) !== "");
    const n = typeof raw === "number" ? raw : Number(cellText(raw).replace(/[,\s]/g, ""));
    if (raw !== undefined && Number.isFinite(n)) totals[pair.key] = n;
  }
  return { profile: p.key, sheet: sheet.name, rows: Object.keys(totals).length, skipped: 0, totals, breakdowns: [] };
}

/** Count a template under its profile. Throws a TemplateError fit for a toast when it isn't that template. */
export function applyProfile(p: Profile, sheets: Sheet[]): TemplateResult {
  const sheet = recognises(p, sheets);
  if (!sheet) throw new TemplateError(`This file doesn’t have the ${p.name} columns (${p.headers.join(", ")}).`);
  if (p.kind === "pairs") return readPairs(p, sheet);
  const found = findHeader(sheet.rows, p.headers)!;
  // Optional columns (dimensions, conditions) are found on the same header row when present.
  const at: Record<string, number> = { ...found.cols };
  const headerCells = (sheet.rows[found.row] ?? []).map((c) => headerKey(cellText(c)));
  for (const c of columnsOf(p))
    if (at[c] === undefined) {
      const i = headerCells.indexOf(headerKey(c));
      if (i >= 0) at[c] = i;
    }
  const get = (row: Cell[], col: string) => (at[col] === undefined ? "" : cellText(row[at[col]]));

  const totals: Record<string, number> = Object.fromEntries(p.measures.map((m) => [m.key, 0]));
  const distinct = new Map<string, Set<string>>(p.measures.filter((m) => m.op === "distinct").map((m) => [m.key, new Set()]));
  const groups = new Map<string, Map<string, { counts: Record<string, number>; sets: Map<string, Set<string>> }>>(p.dimensions.map((d) => [d, new Map()]));
  let rows = 0;
  let skipped = 0;
  for (const row of sheet.rows.slice(found.row + 1)) {
    if (!row || row.every((c) => cellText(c) === "")) continue;
    if (p.skip?.some((w) => matches(w, get(row, w.column))) || cellText(row[0]).startsWith("*")) {
      skipped++;
      continue;
    }
    rows++;
    const add = (key: string, m: Measure, target: { counts: Record<string, number>; sets?: Map<string, Set<string>> } | null) => {
      if (m.where?.some((w) => !matches(w, get(row, w.column)))) return;
      const v = m.column ? get(row, m.column) : "";
      let inc = 0;
      if (m.op === "count") inc = 1;
      else if (m.op === "sum") inc = Number(v.replace(/[,\s₱$]/g, "")) || 0;
      else if (m.op === "fte") inc = Math.min(1, (Number(v.replace(/[,\s]/g, "")) || 0) / (m.full || 1));
      else if (m.op === "distinct" && v) {
        const set = target?.sets ? (target.sets.get(key) ?? target.sets.set(key, new Set()).get(key)!) : distinct.get(key)!;
        if (set.has(norm(v))) return;
        set.add(norm(v));
        inc = 1;
      }
      if (target) target.counts[key] = (target.counts[key] ?? 0) + inc;
      else totals[key] += inc;
    };
    for (const m of p.measures) add(m.key, m, null);
    for (const d of p.dimensions) {
      const value = norm(get(row, d)) || "NOT GIVEN";
      const g = groups.get(d)!;
      const cell = g.get(value) ?? g.set(value, { counts: {}, sets: new Map() }).get(value)!;
      for (const m of p.measures) add(m.key, m, cell);
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  for (const k of Object.keys(totals)) totals[k] = round(totals[k]);
  const breakdowns: Breakdown[] = p.dimensions.map((d) => {
    let suppressed = 0;
    const cells = [...groups.get(d)!.entries()]
      .map(([value, c]) => ({ value, counts: Object.fromEntries(Object.entries(c.counts).map(([k, n]) => [k, round(n)])) }))
      .filter((c) => {
        const small = p.measures.some((m) => (m.op === "count" || m.op === "distinct") && (c.counts[m.key] ?? 0) > 0 && (c.counts[m.key] ?? 0) < p.minCell);
        if (small) suppressed++;
        return !small;
      })
      .sort((a, b) => a.value.localeCompare(b.value));
    return { dimension: d, cells, suppressed };
  });
  return { profile: p.key, sheet: sheet.name, rows, skipped, totals, breakdowns };
}

/** The profile a file matches best: the one with the most identifying headers that all appear. */
export function detectProfile(profiles: Profile[], sheets: Sheet[]): Profile | null {
  return [...profiles].sort((a, b) => b.headers.length - a.headers.length).find((p) => recognises(p, sheets)) ?? null;
}
