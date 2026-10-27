/*
 * The deadline check's reading rules, without the network: a ranking body's page in, the dates it gives out.
 * Each source (deadline_sources) names one of three fixed rules: a row of a dates table, a sentence matched by a
 * pattern, or the part of a page to compare from one day to the next. Nothing is guessed: a page that no longer
 * matches its rule is reported, not read differently. server/deadline-check.ts fetches the pages.
 */
import type { DeadlineSource } from "@/lib/reference";
import type { DeadlineWatch } from "./types";

/** The label of a ranking's own deadline in its calendar. */
export const DEADLINE_LABEL = "Data collection closes";

export type Found = { slug: string; target: "deadline" | "milestone"; label: string; due: string; quote: string };

/** One source's reading: its status, a signature of what it read (to notice change), and the dates found. */
export type Reading = { sourceId: string; url: string; status: DeadlineWatch["status"]; signature: string; note: string; found: Found[] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** {year} and {next} in a source's address: this year and the next. */
export const fillUrl = (url: string, today: string) => url.replaceAll("{year}", today.slice(0, 4)).replaceAll("{next}", String(Number(today.slice(0, 4)) + 1));

/**
 * "27 November 2026", "15 Sep 2026" or "30 March" as an ISO date. Without a year, the next such day from today.
 * Null for anything else, including "Early March 2027" or "November 2026", which name no day.
 */
export function parseDay(text: string, today: string): string | null {
  const m = text.trim().replace(/[.,;:]+$/, "").match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?(?:\s+(\d{4}))?$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
  const day = Number(m[1]);
  if (month < 0 || day < 1) return null;
  const at = (y: number) => {
    const d = new Date(Date.UTC(y, month, day));
    return d.getUTCMonth() === month ? `${y}-${pad(month + 1)}-${pad(day)}` : null;
  };
  if (m[3]) return at(Number(m[3]));
  const year = Number(today.slice(0, 4));
  const thisYear = at(year);
  return thisYear && thisYear >= today ? thisYear : at(year + 1);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };

export const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? all),
  );

/** A page's words, as a reader sees them: no scripts, styles or tags, one space between words. */
export function pageText(html: string) {
  const bare = html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  return decode(bare.replace(/<(br|\/p|\/li|\/tr|\/h\d|\/div)\b[^>]*>/gi, ". ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/(\.\s*){2,}/g, ". ")
    .trim();
}

/** The sentence around a position in a text. */
function sentenceAt(text: string, at: number) {
  const start = Math.max(text.lastIndexOf(". ", at) + 2, 0);
  const end = text.indexOf(".", at);
  return text.slice(start, end < 0 ? undefined : end + 1).trim().slice(0, 300);
}

function datesFor(source: DeadlineSource, rule: DeadlineSource["rules"][number], due: string, quote: string): Found[] {
  return rule.slugs.map((slug) => ({ slug, target: rule.deadline ? "deadline" : "milestone", label: rule.deadline ? DEADLINE_LABEL : (rule.label ?? source.name), due, quote }));
}

/** A dates table (QS's Key Dates): each rule names a row; its last date is the one that counts, when it closes. */
export function readTable(html: string, source: DeadlineSource, today: string): { found: Found[]; missing: string[]; signature: string } {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => pageText(c[1])).filter(Boolean));
  const found: Found[] = [];
  const missing: string[] = [];
  const read: string[] = [];
  for (const rule of source.rules) {
    if (!rule.row) continue;
    const want = rule.row.toLowerCase();
    const row = rows.find((cells) => cells[0]?.toLowerCase().startsWith(want));
    const due = row ? [...row].reverse().map((c) => parseDay(c, today)).find(Boolean) : null;
    if (!row || !due) {
      missing.push(rule.row);
      continue;
    }
    read.push(row.join(" · "));
    found.push(...datesFor(source, rule, due, row.join(" · ")));
  }
  return { found, missing, signature: read.join(" | ") };
}

/** A sentence that gives the date: the pattern's named group `due`. */
export function readSentence(html: string, source: DeadlineSource, today: string): { found: Found[]; signature: string } {
  if (!source.pattern) return { found: [], signature: "" };
  const text = pageText(html);
  const m = new RegExp(source.pattern, "i").exec(text);
  const raw = m?.groups?.due;
  const due = raw ? parseDay(raw, today) : null;
  if (!m || !raw || !due) return { found: [], signature: "" };
  const quote = sentenceAt(text, m.index + m[0].length - raw.length);
  return { found: source.rules.flatMap((rule) => datesFor(source, rule, due, quote)), signature: quote };
}

/** What a watched page shows (each match of the pattern, or its first group), to compare with the last check. */
export function readWatch(html: string, source: DeadlineSource): string[] {
  if (!source.pattern) return [];
  return [...new Set([...html.matchAll(new RegExp(source.pattern, "gi"))].map((m) => m[1] ?? m[0]))].sort();
}
