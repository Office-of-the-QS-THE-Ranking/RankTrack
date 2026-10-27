/*
 * The submission calendar: each tracked ranking's deadline and the other dates in its calendar (survey windows,
 * portals closing in stages), soonest first. A date that closes for several rankings of one family at once
 * (QS WUR and QS by Subject share QS's institution data) shows once, naming them all.
 */
import type { Ranking } from "./data";
import { DEADLINE_LABEL } from "./governance/deadline-read";
import type { CalendarEntry } from "./governance/types";

export interface CalendarItem {
  key: string;
  slugs: string[];
  /** The rankings' short names: "QS WUR · QS by Subject". */
  lead: string;
  family: string;
  label: string;
  due: string;
  /** A ranking's own deadline, rather than another date in its calendar. */
  deadline: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Recently passed dates stay a while, so the calendar shows what just closed. */
const KEEP_PAST_DAYS = 45;

export function calendarOf(rankings: Ranking[], entries: CalendarEntry[], today = new Date().toISOString().slice(0, 10)): CalendarItem[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - KEEP_PAST_DAYS * 86_400_000).toISOString().slice(0, 10);
  const dates = [
    ...rankings.map((r) => ({ r, label: DEADLINE_LABEL, due: r.deadline, deadline: true })),
    ...entries.flatMap((e) => {
      const r = rankings.find((x) => x.slug === e.slug);
      return r ? [{ r, label: e.label, due: e.due, deadline: false }] : [];
    }),
  ].filter((d) => d.due && d.due >= from);
  const items = new Map<string, CalendarItem>();
  for (const d of dates) {
    const key = `${d.r.family}|${d.label.toLowerCase()}|${d.due}`;
    const item = items.get(key);
    if (item) {
      item.slugs.push(d.r.slug);
      item.lead = `${item.lead} · ${d.r.short}`;
    } else items.set(key, { key, slugs: [d.r.slug], lead: d.r.short, family: d.r.family, label: d.label, due: d.due, deadline: d.deadline });
  }
  return [...items.values()].sort((a, b) => a.due.localeCompare(b.due) || a.lead.localeCompare(b.lead));
}

/** The calendar as months of lines, for the pages that list it as text: "THE Impact data collection closes 9 Nov". */
export function calendarMonths(items: CalendarItem[]): { month: string; items: string[] }[] {
  const months: { month: string; items: string[] }[] = [];
  for (const it of items) {
    const month = MONTHS[Number(it.due.slice(5, 7)) - 1];
    const line = `${it.lead} ${it.label.charAt(0).toLowerCase()}${it.label.slice(1)} ${Number(it.due.slice(8, 10))} ${month}`;
    const last = months[months.length - 1];
    if (last?.month === month) last.items.push(line);
    else months.push({ month, items: [line] });
  }
  return months;
}
