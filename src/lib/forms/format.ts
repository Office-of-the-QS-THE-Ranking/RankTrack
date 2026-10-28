/*
 * How Digital Forms write numbers, money and days: pesos, Manila dates, plural nouns. Shared by the responder
 * page, the responses table, CSV export and the analytics.
 */
import type { DateRange } from "./types";

const PESO = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PESO_WHOLE = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

/** Php 12,300.50, or Php 12,300 with `whole` (for totals in charts and tables). */
export const peso = (n: number, whole = false) => `Php ${(whole && Number.isInteger(Math.round(n * 100) / 100) ? PESO_WHOLE : PESO).format(Number.isFinite(n) ? n : 0)}`;

export const num = (n: number) => NUMBER.format(Number.isFinite(n) ? n : 0);

/** Format Philippine mobile numbers progressively; preserve landlines and other international numbers. */
export function formatPhone(value: string): string {
  let digits = value.replace(/[\s().-]/g, "");
  if (/^\+639\d{0,9}$/.test(digits)) digits = `0${digits.slice(3)}`;
  else if (/^639\d{9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  if (!/^09\d{0,9}$/.test(digits)) return value;
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7)].filter(Boolean).join("-");
}

/** Rounded to centavos. */
export const cents = (n: number) => Math.round(n * 100) / 100;

const MANILA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });

/** The day it is (or was) in Manila, YYYY-MM-DD. */
export const manilaDay = (at: Date = new Date()) => MANILA_DAY.format(at);

const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const isIso = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** November 5, 2026, for a YYYY-MM-DD day. */
export const dayLabel = (d: string) => (isIso(d) ? DAY.format(new Date(`${d}T00:00:00Z`)) : "");

/** Full dates at both ends of a range, or one day. */
export function rangeLabel(from: string, to: string) {
  if (!isIso(from) || !isIso(to)) return dayLabel(from || to);
  return `${dayLabel(from)} - ${dayLabel(to)}`;
}

const STAMP = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/** 27 Oct 2026, 11:42 pm, in Manila. */
export const stampLabel = (iso: string) => STAMP.format(new Date(iso));

/** A noun for a count: person → people, activity → activities, phase → phases. */
export const nounFor = (n: number, one: string) => (n === 1 ? one : one === "person" ? "people" : /[^aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(one) ? `${one}es` : `${one}s`);

export const plural = (n: number, one: string, many = nounFor(2, one)) => `${num(n)} ${n === 1 ? one : many}`;

/** Retired helper copy can still be present in saved form schemas. */
const RETIRED_HELP = new Set([
  "Per phase. Totals add up as you go.",
  "Rates are fixed.",
  "Fixed rates for CSF only. Set your own for Organization or Community.",
  "Fixed rates for Community Service Fund (CSF) only. Set your own for Organization or Community.",
  "The value of everyone’s time. No funds are released.",
  "Academic staff, administrators or support staff",
  "The community’s need it answers. Up to 5 sentences.",
  "What the project sets out to do. Up to 5 sentences.",
  "One for each.",
  "Each activity, phase by phase.",
]);
export const formHelpText = (text: string | undefined) => text && !RETIRED_HELP.has(text) ? text : undefined;

/** Date selections in readback, exports and printed responses. */
export function dateEntries(value: DateRange | undefined): NonNullable<DateRange["entries"]> {
  if (value?.entries) return value.entries;
  if (value?.dates) return value.dates.map((from) => ({ mode: "day", from, to: "" }));
  return [{ mode: value?.from && value.from === value.to ? "day" : "range", from: value?.from ?? "", to: value?.to ?? "" }];
}

export const datesLabel = (value: DateRange) => dateEntries(value)
  .filter((entry) => entry.from || entry.to)
  .map((entry) => entry.mode === "day" ? `Date only - ${dayLabel(entry.from)}` : `Date range - ${rangeLabel(entry.from, entry.to)}`)
  .join("; ");
