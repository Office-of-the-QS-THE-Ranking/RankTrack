/*
 * The analytics engine: a form's responses summed up field by field, each in the shape its module reads best:
 * bars for choices and units, SDG counts, sums and averages for numbers and money, totals by group for counts,
 * totals by source and category for budgets, months for dates, the latest few for text, and how many rows or
 * people for tables and people. Plus the totals over time and by review status. Pure, so it runs wherever the
 * responses are.
 */
import { budgetTotals, partsOf } from "./budget";
import { fieldShows, type CheckContext } from "./check";
import { cents, manilaDay } from "./format";
import { choiceOptions, countsTotal, fieldMap, moduleOf, OTHER } from "./modules";
import { STATUSES } from "./review";
import type { Answers, BudgetValue, ChoiceValue, DateRange, FieldSpec, FormSchema, Person, ResponseStatus, Row } from "./types";

type Bar = { key: string; label: string; count: number };

export type FieldStat = { id: string; label: string; section: string; answered: number; shown: number } & (
  | { kind: "bars"; bars: Bar[]; multiple: boolean }
  | { kind: "sdgs"; sdgs: { n: number; count: number }[] }
  | { kind: "numbers"; sum: number; mean: number; min: number; max: number; money: boolean; unit?: string }
  | { kind: "counts"; rows: { id: string; label: string; sum: number }[]; sum: number }
  | { kind: "budget"; sources: { id: string; label: string; sum: number }[]; categories: { id: string; label: string; sum: number }[]; sum: number; mean: number; theoretical: boolean }
  | { kind: "dates"; months: { month: string; count: number }[] }
  | { kind: "text"; latest: string[] }
  | { kind: "rows"; items: number; noun: string; columns: { id: string; label: string; bars: Bar[] }[] }
);

export interface FormStats {
  total: number;
  /** In the last seven days. */
  week: number;
  /** The last 30 days, oldest first. */
  days: { day: string; count: number }[];
  statuses: Record<ResponseStatus, number>;
  fields: FieldStat[];
}

export interface Analysed {
  answers: Answers;
  status: ResponseStatus;
  submittedAt: string;
}

const DAY_MS = 86_400_000;

function bump(bars: Bar[], key: string, label: string) {
  const bar = bars.find((b) => b.key === key);
  if (bar) bar.count++;
  else bars.push({ key, label, count: 1 });
}

export function analyze(schema: FormSchema, responses: Analysed[], ctx: CheckContext, now = new Date()): FormStats {
  const fields = fieldMap(schema.sections);
  const today = manilaDay(now);
  const days = Array.from({ length: 30 }, (_, i) => ({ day: manilaDay(new Date(now.getTime() - (29 - i) * DAY_MS)), count: 0 }));
  const statuses = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ResponseStatus, number>;
  let week = 0;
  for (const r of responses) {
    const day = manilaDay(new Date(r.submittedAt));
    const slot = days.find((d) => d.day === day);
    if (slot) slot.count++;
    if (Date.parse(`${today}T00:00:00+08:00`) - Date.parse(`${day}T00:00:00+08:00`) < 7 * DAY_MS) week++;
    statuses[r.status]++;
  }

  const stats: FieldStat[] = [];
  for (const section of schema.sections) {
    for (const spec of section.fields) {
      const stat = fieldStat(spec, section.id, responses.filter((r) => fieldShows(section, spec, r.answers, fields)), { ...ctx, fields });
      if (stat) stats.push(stat);
    }
  }
  return { total: responses.length, week, days, statuses, fields: stats };
}

function fieldStat(spec: FieldSpec, section: string, shown: Analysed[], ctx: CheckContext & { fields: Map<string, FieldSpec> }): FieldStat | null {
  const m = moduleOf(spec);
  const filled = shown.filter((r) => m.filled(spec, r.answers[spec.id]));
  const base = { id: spec.id, label: spec.label, section, answered: filled.length, shown: shown.length };
  const values = filled.map((r) => r.answers[spec.id]);
  switch (spec.type) {
    case "choice": {
      const options = choiceOptions(spec);
      const bars: Bar[] = options.map((o) => ({ key: o.value, label: o.label, count: 0 }));
      for (const v of values) for (const p of (v as ChoiceValue).picked) bars.find((b) => b.key === p)!.count++;
      return { ...base, kind: "bars", bars: bars.filter((b) => b.count || b.key !== OTHER), multiple: !!spec.multiple };
    }
    case "yesno": {
      const bars: Bar[] = [
        { key: "yes", label: spec.yes ?? "Yes", count: values.filter((v) => v === "yes").length },
        { key: "no", label: spec.no ?? "No", count: values.filter((v) => v === "no").length },
      ];
      return { ...base, kind: "bars", bars, multiple: false };
    }
    case "unit": {
      const bars: Bar[] = [];
      for (const v of values) bump(bars, v as string, ctx.units.find((u) => u.id === v)?.name ?? String(v));
      return { ...base, kind: "bars", bars: bars.sort((a, b) => b.count - a.count), multiple: false };
    }
    case "sdgs": {
      const counts = new Map<number, number>();
      for (const v of values) for (const n of v as number[]) counts.set(n, (counts.get(n) ?? 0) + 1);
      return { ...base, kind: "sdgs", sdgs: [...counts].map(([n, count]) => ({ n, count })).sort((a, b) => b.count - a.count || a.n - b.n) };
    }
    case "number":
    case "money": {
      const nums = values as number[];
      const sum = cents(nums.reduce((a, n) => a + n, 0));
      return { ...base, kind: "numbers", sum, mean: nums.length ? cents(sum / nums.length) : 0, min: nums.length ? Math.min(...nums) : 0, max: nums.length ? Math.max(...nums) : 0, money: spec.type === "money", ...(spec.type === "number" && spec.unit && { unit: spec.unit }) };
    }
    case "counts": {
      const rows = spec.rows.map((r) => ({ id: r.id, label: r.label, sum: values.reduce<number>((a, v) => a + ((v as Record<string, number>)[r.id] ?? 0), 0) }));
      return { ...base, kind: "counts", rows, sum: values.reduce<number>((a, v) => a + countsTotal(v), 0) };
    }
    case "budget": {
      const sources = spec.sources.map((s) => ({ id: s.id, label: s.label, sum: 0 }));
      const categories = spec.categories.map((c) => ({ id: c.id, label: c.label, sum: 0 }));
      let sum = 0;
      for (const r of filled) {
        const t = budgetTotals(spec, r.answers[spec.id] as BudgetValue, partsOf(spec, r.answers));
        sum = cents(sum + t.total);
        for (const s of sources) s.sum = cents(s.sum + (t.bySource[s.id] ?? 0));
        for (const c of categories) c.sum = cents(c.sum + (t.byCategory[c.id] ?? 0));
      }
      return { ...base, kind: "budget", sources, categories, sum, mean: filled.length ? cents(sum / filled.length) : 0, theoretical: !!spec.theoretical };
    }
    case "date":
    case "daterange": {
      const months = new Map<string, number>();
      for (const v of values) {
        const day = typeof v === "string" ? v : (v as DateRange).entries?.find((e) => e.from)?.from || (v as DateRange).dates?.[0] || (v as DateRange).from || (v as DateRange).to;
        if (day) months.set(day.slice(0, 7), (months.get(day.slice(0, 7)) ?? 0) + 1);
      }
      return { ...base, kind: "dates", months: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })) };
    }
    case "text":
    case "paragraph":
    case "link": {
      const latest = [...filled]
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        .slice(0, 3)
        .map((r) => {
          const t = String(r.answers[spec.id]).replace(/\s+/g, " ");
          return t.length > 140 ? `${t.slice(0, 139)}…` : t;
        });
      return { ...base, kind: "text", latest };
    }
    case "people":
      return { ...base, kind: "rows", items: values.reduce<number>((a, v) => a + (v as Person[]).filter((p) => p.name).length, 0), noun: spec.noun ?? "person", columns: [] };
    case "table": {
      // Fixed rows (one per aspect) are answers in words: how many gave them is what there is to count.
      if (spec.rows?.length) return { ...base, kind: "text", latest: [] };
      const rows = values.flatMap((v) => v as Row[]);
      const columns = spec.columns
        .filter((c) => c.type === "choice" && c.options?.length)
        .map((c) => {
          const bars: Bar[] = c.options!.map((o) => ({ key: o.value, label: o.label, count: 0 }));
          for (const row of rows) {
            const bar = bars.find((b) => b.key === row[c.id]);
            if (bar) bar.count++;
          }
          return { id: c.id, label: c.label, bars };
        });
      return { ...base, kind: "rows", items: rows.length, noun: spec.numbered?.toLowerCase() ?? spec.add?.replace(/^add\s+/i, "").toLowerCase() ?? "row", columns };
    }
    default:
      return null;
  }
}
