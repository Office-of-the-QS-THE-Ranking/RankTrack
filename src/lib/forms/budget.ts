/*
 * The budget module's arithmetic: a line is quantity × rate × days, paid from one source, and totals add up by
 * source, by category and by part (a phase, when the budget is split by a table's rows). One copy of the sums
 * for the form, the server's checks, the responses table and the analytics.
 */
import { cents } from "./format";
import type { Answers, BudgetLine, BudgetPreset, BudgetSource, BudgetSpec, BudgetValue, Row, TableSpec } from "./types";

export const lineAmount = (l: Pick<BudgetLine, "qty" | "rate" | "days">) => cents(l.qty * l.rate * l.days);

/** Use the current fund names in existing saved forms as well as new templates. */
export const budgetSourceLabel = (source: BudgetSource) => {
  switch (source.id) {
    case "csf": return "Community Service Fund (CSF)";
    case "org": return "Organizational Counterpart";
    case "community": return "Community Counterpart";
    default: return source.label;
  }
};

/** Keep the stored item key stable so existing counterpart quantities are preserved. */
export const budgetItemLabel = (item: string) => item === "Staff volunteers" ? "Staff volunteers (administrators, Academic or support staff)" : item;

/** In a CSF budget, prescribed rates apply only to CSF. Fixed counterpart valuations stay fixed. */
export const rateIsLocked = (spec: BudgetSpec, preset: BudgetPreset | undefined, source: string) =>
  !!spec.fixed || (!!preset?.locked && (!spec.sources.some((s) => s.id === "csf") || source === "csf"));

export interface BudgetTotals {
  total: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
  /** Per part, in order; a single part when the budget isn't split. */
  byPart: { total: number; bySource: Record<string, number> }[];
}

/** How many parts a budget has: the rows of its `per` table, or one. */
export const partsOf = (spec: BudgetSpec, answers: Answers) => (spec.per ? Math.max(0, ((answers[spec.per] as Row[] | undefined) ?? []).length) : 1);

export function budgetTotals(spec: BudgetSpec, value: BudgetValue | undefined, parts = 1): BudgetTotals {
  const zero = () => Object.fromEntries(spec.sources.map((s) => [s.id, 0])) as Record<string, number>;
  const out: BudgetTotals = {
    total: 0,
    bySource: zero(),
    byCategory: Object.fromEntries(spec.categories.map((c) => [c.id, 0])),
    byPart: Array.from({ length: Math.max(1, parts) }, () => ({ total: 0, bySource: zero() })),
  };
  for (const l of value?.lines ?? []) {
    const amount = lineAmount(l);
    const part = out.byPart[spec.per ? (l.part ?? 0) : 0];
    out.total = cents(out.total + amount);
    out.bySource[l.source] = cents((out.bySource[l.source] ?? 0) + amount);
    out.byCategory[l.category] = cents((out.byCategory[l.category] ?? 0) + amount);
    if (part) {
      part.total = cents(part.total + amount);
      part.bySource[l.source] = cents((part.bySource[l.source] ?? 0) + amount);
    }
  }
  return out;
}

export interface SourceSummary {
  source: BudgetSource | undefined;
  /** Every category, with its lines from that source (phase by phase) and their subtotal. */
  categories: { id: string; label: string; lines: BudgetLine[]; total: number }[];
  total: number;
}

/** One source of a budget, category by category: the lines it pays for in every part, their subtotals and the total. */
export function sourceSummary(spec: BudgetSpec, value: BudgetValue | undefined, source: string): SourceSummary {
  const lines = (value?.lines ?? []).filter((l) => l.source === source && lineAmount(l) > 0).sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
  const fund = spec.sources.find((s) => s.id === source);
  return {
    source: fund && { ...fund, label: budgetSourceLabel(fund) },
    categories: spec.categories.map((c) => {
      const mine = lines.filter((l) => l.category === c.id);
      return { id: c.id, label: c.label, lines: mine, total: cents(mine.reduce((a, l) => a + lineAmount(l), 0)) };
    }),
    total: cents(lines.reduce((a, l) => a + lineAmount(l), 0)),
  };
}

/** The fixed lines a budget always has, in order: its presets, nothing in them yet. */
export function fixedLines(spec: BudgetSpec): BudgetLine[] {
  return spec.categories.flatMap((c) =>
    (c.presets ?? []).map((p, i) => ({
      key: `${c.id}-${i}`,
      category: c.id,
      item: p.item,
      qty: 0,
      rate: p.rate ?? 0,
      days: 1,
      source: p.source ?? spec.sources[0]?.id ?? "",
    })),
  );
}

/** The name of a part of a split budget: "Phase 2", and the phase's own name when it has one. */
export function partName(spec: BudgetSpec, table: TableSpec | undefined, rows: Row[], i: number) {
  const base = `${table?.numbered ?? "Part"} ${i + 1}`;
  const named = table?.columns.find((c) => c.type === "text");
  const name = named ? rows[i]?.[named.id] : "";
  return typeof name === "string" && name.trim() ? `${base} · ${name.trim()}` : base;
}
