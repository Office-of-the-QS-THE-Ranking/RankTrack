/*
 * Figures and years in a page's text, by pattern. A figure is a number with what it counts ("1,240 participants",
 * "₱2.5 million", "86%"); dates, times, page and section numbers, phone numbers and bare years aren't. Nothing is
 * worked out or rounded: a figure is offered exactly as the text has it. Plain functions (tests/review.test.ts).
 */
import { isStop, sentences } from "./text";
import type { Figure } from "./types";

const MONTH = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\.?$/i;
/** Words after a number that say it is a reference, not a count. */
const NOT_A_COUNT = /^(am|pm|a\.m|p\.m|st|nd|rd|th|of|to|and|or|series|s\.|no|vol|volume|issue|pp|page|pages|figure|fig|table|section|chapter|article|annex|appendix|room|floor|st\.|ave|street|version|v)$/i;
const BEFORE_A_REFERENCE = /(page|pages|pp\.?|p\.|figure|fig\.?|table|section|chapter|article|annex|appendix|no\.?|number|series of|s\.|room|rm\.?|vol\.?|volume|issue|sdg|goal|target|indicator|item|step|phase|grade|level|year|ay|sy|fy|cy|batch)\s*$/i;
const SCALE: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, mn: 1e6, billion: 1e9, b: 1e9, bn: 1e9 };

const NUMBER = /(?<cur>₱|\bPHP\b\.?|\bPhp\b\.?|\bP(?=\s?\d)|US\$|\$)?\s?(?<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?<pct>\s?%|\s+percent\b)?(?:\s?(?<scale>thousand|million|billion|mn|bn|[kKmMbB])\b)?/g;

const isYear = (raw: string, value: number) => /^\d{4}$/.test(raw) && value >= 1900 && value <= 2100;

/** Up to two words after a number that say what it counts: stops at punctuation, another number or a stop word run. */
function labelAfter(rest: string) {
  const words: string[] = [];
  for (const raw of rest.trimStart().split(/\s+/)) {
    const cut = /[.,;:!?()\[\]]/.test(raw);
    const word = raw.replace(/[.,;:!?()\[\]"“”]+/g, "");
    if (!word || /\d/.test(word)) break;
    if (!words.length && (isStop(word.toLowerCase()) || NOT_A_COUNT.test(word) || MONTH.test(word))) return { words: [], barred: NOT_A_COUNT.test(word) || MONTH.test(word) };
    if (words.length && isStop(word.toLowerCase())) break;
    words.push(word);
    if (cut || words.length === 2) break;
  }
  return { words, barred: false };
}

/** The figures in a page's text, each with the sentence it sits in. */
export function figuresIn(text: string, page: number): Figure[] {
  const out: Figure[] = [];
  for (const sentence of sentences(text, 400)) {
    NUMBER.lastIndex = 0;
    for (let m = NUMBER.exec(sentence); m; m = NUMBER.exec(sentence)) {
      const g = m.groups!;
      const raw = g.num;
      const at = m.index + m[0].indexOf(raw);
      const before = sentence.slice(Math.max(0, at - 24), at);
      const after = sentence.slice(at + raw.length);
      let value = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(value) || value <= 0) continue;
      // Part of a longer run of digits, a date, a time, a decimal outline number, an ordinal or a phone number.
      if (/[\d.,/:-]$/.test(before.slice(-1)) && !g.cur) continue;
      if (/^[/:-]\d|^\.\d+\.\d|^(st|nd|rd|th)\b/.test(after)) continue;
      if (raw.length >= 7 && !raw.includes(",") && !raw.includes(".")) continue;
      const money = !!g.cur;
      const percent = !!g.pct;
      const scale = g.scale ? SCALE[g.scale.toLowerCase()] : undefined;
      // A lone letter after a number is only a scale when it follows money ("₱2.5M"): "5 m" is metres.
      const scaled = scale && (g.scale.length > 1 || money) ? scale : undefined;
      if (scaled) value *= scaled;
      const tail = sentence.slice(m.index + m[0].length - (scale && !scaled ? g.scale.length : 0));
      const label = money || percent ? { words: [] as string[], barred: false } : labelAfter(tail);
      if (label.barred) continue;
      if (!money && !percent) {
        if (!label.words.length) continue;
        if (isYear(raw, value) || BEFORE_A_REFERENCE.test(before) || MONTH.test(before.trim().split(/\s+/).at(-1) ?? "")) continue;
        // A line that starts "1. " or "3) " is a list, not a count.
        if (at <= 2 && /^[.)]\s/.test(after)) continue;
      }
      const written = scale && !scaled ? m[0].slice(0, m[0].length - g.scale.length) : m[0];
      const shown = money || percent ? written.trim() : `${written.trim()} ${label.words.join(" ")}`;
      out.push({ value, text: shown.replace(/\s+/g, " ").slice(0, 80), page, quote: sentence });
    }
  }
  return out;
}

/** How often each calendar year is named, most named first; "AY 2024-2025" and "2024–25" count both years. */
export function yearsIn(text: string): { year: number; count: number }[] {
  const counts = new Map<number, number>();
  const add = (y: number) => {
    if (y >= 1990 && y <= 2100) counts.set(y, (counts.get(y) ?? 0) + 1);
  };
  for (const m of text.matchAll(/(?<![\d,.])(19\d{2}|20\d{2})(?:\s?[-–/]\s?(\d{4}|\d{2}))?(?![\d,])/g)) {
    const first = Number(m[1]);
    add(first);
    if (m[2]) {
      const second = m[2].length === 2 ? Math.floor(first / 100) * 100 + Number(m[2]) : Number(m[2]);
      if (second === first + 1) add(second);
    }
  }
  return [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => b.count - a.count || b.year - a.year);
}

/**
 * Whether a file's years fit an edition's. `fits`: one of the years it mostly names is allowed. The year to record on
 * a link is the most named one that is allowed, or else the most named.
 */
export function periodFit(years: { year: number; count: number }[], allowed: number[]) {
  if (!years.length) return { fits: true, year: undefined as number | undefined, main: undefined as number | undefined };
  const top = years[0].count;
  const main = years.filter((y) => y.count >= Math.max(1, top * 0.25));
  const inside = main.find((y) => allowed.includes(y.year));
  return { fits: !allowed.length || !!inside, year: inside?.year ?? years[0].year, main: years[0].year };
}
