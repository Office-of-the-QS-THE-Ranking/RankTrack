/*
 * Reading text the way the rules need it: words reduced to a common stem so "events" finds "event", sentences to
 * quote, and what to hide before a page goes to a model. Plain functions, no dependencies (tests/review.test.ts).
 */

/** Lower case, plain quotes and dashes, "SDG 4" as one word, and nothing but letters, digits and spaces between words. */
export function plain(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\bsdgs?\s*(\d{1,2})\b/g, "sdg$1")
    .replace(/'s\b/g, "")
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .trim();
}

/** Words that say nothing about what a text is about. Filipino's commonest are here too, since reports mix both. */
const STOP = new Set(
  `a an and are as at be been being but by can could did do does for from had has have having he her his how i if in into is it its may might more most must no nor not of on or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your
   about above after again against all also am any because before below between both each few further here itself just me my myself once only ourselves s t themselves theirs yours yourself don now via per etc eg ie e g i
   ang ng mga sa na at ay para kay kung may mula ito iyon nang din rin po ni si sina nila namin natin ating kanilang ating ko mo niya siya sila kami tayo kayo ba lang pa pero o
   university universities institution institutions provide provides provided providing include includes including included refer refers relevant specific specifically ensure ensures please data needed number numbers total proportion percentage ratio amount whether either within across towards toward related relate relates example examples`.split(/\s+/),
);

export const isStop = (word: string) => STOP.has(word);

/** A light stemmer: plurals, -ing, -ed, -ation and a final e, enough for "collaborating" to meet "collaboration". */
export function stem(word: string) {
  let w = word;
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith("ability") || w.endsWith("ibility")) w = `${w.slice(0, -5)}le`;
  else if (w.endsWith("al") && w.length > 6) w = w.slice(0, -2);
  if (w.endsWith("ization") || w.endsWith("isation")) w = `${w.slice(0, -7)}ize`;
  else if (w.endsWith("ation") && w.length > 7) w = `${w.slice(0, -5)}ate`;
  else if (w.endsWith("ing") && w.length > 5) w = undouble(w.slice(0, -3));
  else if (w.endsWith("ed") && w.length > 4) w = undouble(w.slice(0, -2));
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  if (w.endsWith("is") && w.length > 5 && word.endsWith("ise")) w = `${w.slice(0, -2)}iz`;
  return w;
}

const undouble = (w: string) => (w.length > 3 && w.at(-1) === w.at(-2) && !/[lsz]$/.test(w) ? w.slice(0, -1) : w);

/** A text's words as stems, in order, stop words included (phrases need the order kept). */
export function stems(text: string) {
  const p = plain(text);
  return p ? p.split(" ").map(stem) : [];
}

/** A term as the rules compare it: its stems, with stop words dropped from the ends only. */
export function termStems(term: string) {
  const list = plain(term).split(" ").filter(Boolean);
  while (list.length && isStop(list[0])) list.shift();
  while (list.length && isStop(list.at(-1)!)) list.pop();
  return list.map(stem);
}

/** A page as the rules search it: the stems as one string (for phrases) and how often each one occurs. */
export interface PageIndex {
  n: number;
  joined: string;
  counts: Map<string, number>;
  words: number;
}

export function indexPage(n: number, text: string): PageIndex {
  const list = stems(text);
  const counts = new Map<string, number>();
  for (const s of list) counts.set(s, (counts.get(s) ?? 0) + 1);
  return { n, joined: ` ${list.join(" ")} `, counts, words: list.length };
}

/** How many times a term (one stem or several in a row) occurs on a page, up to `cap`. */
export function countTerm(page: PageIndex, term: string[], cap = 3) {
  if (!term.length) return 0;
  if (term.length === 1) return Math.min(cap, page.counts.get(term[0]) ?? 0);
  const needle = ` ${term.join(" ")} `;
  let at = page.joined.indexOf(needle);
  let n = 0;
  while (at >= 0 && n < cap) {
    n++;
    at = page.joined.indexOf(needle, at + needle.length - 1);
  }
  return n;
}

/** A page's sentences, each short enough to quote. Lines that end without a full stop (headings, table rows) count too. */
export function sentences(text: string, max = 320): string[] {
  const out: string[] = [];
  for (const line of text.replace(/\r/g, "").split(/\n+/)) {
    const clean = line.replace(/[ \t ]+/g, " ").trim();
    if (!clean) continue;
    for (const part of clean.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(\[])/)) {
      const s = part.trim();
      if (s.length < 3) continue;
      out.push(s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
    }
  }
  return out;
}

const NEGATION = /\b(no|not|none|never|without|neither|nor|lack(?:s|ed|ing)? of|absence of|did not|does not|do not|has not|have not|is not|are not|was not|were not|cannot|can't|doesn't|don't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|wala(?:ng)?|hindi)\b/i;

/** A sentence that denies something, in English or Filipino. Only a prompt to read it: rules can't tell what is denied. */
export const denies = (sentence: string) => NEGATION.test(sentence);

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const PHONE = /(?<![\p{L}\p{N}])(?:\+?63|0)[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)|(?<![\p{L}\p{N}])\(?0\d{1,2}\)?[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)/gu;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** Text as a model gets it: no email addresses, phone numbers or web addresses. Names can't be told apart in code, so they stay. */
export function masked(text: string) {
  return text.replace(EMAIL, "[email]").replace(LINK, "[link]").replace(PHONE, "[phone]");
}

/** For telling whether a quote is on a page: case, spacing, quote marks and hyphenation at line ends don't count. */
export function comparable(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/-\s*\n\s*/g, "")
    .replace(/[\s ]+/g, " ")
    .trim();
}

/** Pages as a short label: [3, 4, 5, 9] → "3–5, 9". */
export function pageRanges(pages: number[]) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return out.join(", ");
}
