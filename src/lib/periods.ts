/**
 * When evidence happened, in the words units plan in: an academic year and a term. The rankings count calendar
 * years (THE Impact, QS Sustainability, UI GreenMetric), so each term is placed in one calendar year here and
 * nobody has to sort records by hand. UST's academic year runs August to July:
 *   First term (Aug–Dec) → the first year · Second term (Jan–May) and Special term (Jun–Jul) → the second year
 *   Whole year → both, for programmes and policies that run all year.
 * The record keeps one readable label, "AY 2025–2026 · First term", which parsePeriod reads back. Records saved
 * before terms ("Calendar year 2025") still parse, by the years they name.
 */

export const TERMS = ["First term", "Second term", "Special term", "Whole year"] as const;
export type Term = (typeof TERMS)[number];

export const TERM_MONTHS: Record<Term, string> = {
  "First term": "Aug–Dec",
  "Second term": "Jan–May",
  "Special term": "Jun–Jul",
  "Whole year": "Aug–Jul",
};

const AY = /^(\d{4})[–-](\d{4})$/;

/** "2025-2026" or "2025–2026" → "2025–2026", or null when it isn't two consecutive years. */
export function academicYear(s: string): string | null {
  const m = AY.exec(s.trim());
  if (!m || Number(m[2]) !== Number(m[1]) + 1) return null;
  return `${m[1]}–${m[2]}`;
}

/** The first academic year evidence can be filed under. */
export const FIRST_ACADEMIC_YEAR = 2000;

/** The academic year running on a date; UST's starts in August. */
export function currentAcademicYear(on = new Date()): string {
  const start = on.getMonth() >= 7 ? on.getFullYear() : on.getFullYear() - 1;
  return `${start}–${start + 1}`;
}

/** Every academic year from 2000–2001 to the one running now, newest first. Fixed: nobody opens or closes them. */
export function academicYears(on = new Date()): string[] {
  const last = Number(currentAcademicYear(on).slice(0, 4));
  return Array.from({ length: last - FIRST_ACADEMIC_YEAR + 1 }, (_, i) => `${last - i}–${last - i + 1}`);
}

export const isTerm = (s: unknown): s is Term => typeof s === "string" && (TERMS as readonly string[]).includes(s);

/** The calendar years a term of an academic year falls in. */
export function calendarYears(ay: string, term: Term): number[] {
  const start = Number(ay.slice(0, 4));
  if (term === "First term") return [start];
  if (term === "Whole year") return [start, start + 1];
  return [start + 1];
}

export const periodLabel = (ay: string, term: Term) => `AY ${ay} · ${term}`;

const LABEL = /^AY (\d{4}–\d{4}) · (.+)$/;
const YEARS = /\b(?:19|20)\d{2}\b/g;

export interface Period {
  academicYear?: string;
  term?: Term;
  calendarYears: number[];
}

/** Reads a record's period label back into its academic year, term and calendar years. */
export function parsePeriod(label: string): Period {
  const m = LABEL.exec(label.trim());
  if (m && isTerm(m[2])) return { academicYear: m[1], term: m[2], calendarYears: calendarYears(m[1], m[2]) };
  return { calendarYears: [...new Set((label.match(YEARS) ?? []).map(Number))] };
}

/** "Counts toward 2025" or "Counts toward 2025 and 2026". */
export function countsToward(years: number[]): string {
  return years.length ? `Counts toward ${years.join(" and ")}` : "";
}
