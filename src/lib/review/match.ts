/*
 * Which indicators a file's pages speak to. Each indicator gets a lexicon: the telling words and two-word phrases of
 * its own name and guidance, weighed by how few other indicators share them, plus any terms the Office added. A page
 * matches by the share of that lexicon it holds. Nothing here guesses: every match names the terms it found, the
 * pages they are on and a sentence to read. Plain functions (tests/review.test.ts).
 */
import { figuresIn } from "./figures";
import { countTerm, denies, indexPage, isStop, plain, sentences, stem, termStems, type PageIndex } from "./text";
import type { Candidate, Figure, Match, PageText } from "./types";

interface Term {
  /** As a person reads it. */
  label: string;
  stems: string[];
  weight: number;
  /** A phrase, or one the Office added: enough on its own to make a page worth a look. */
  strong: boolean;
  /** The Office added it. */
  added?: boolean;
}

export interface Lexicon {
  key: string;
  candidate: Candidate;
  terms: Term[];
  /** The weight of everything but the Office's terms: what a page's share is measured against. */
  total: number;
}

const key = (c: Pick<Candidate, "edition" | "code">) => `${c.edition}:${c.code}`;

const KEEP_WORDS = 14;
const KEEP_PHRASES = 8;

/** A text's telling words and adjacent pairs, as stems with the wording they came from. */
function wordsOf(text: string) {
  const raw = plain(text).split(" ").filter(Boolean);
  const words = new Map<string, string>();
  const pairs = new Map<string, { label: string; stems: string[] }>();
  let before: { word: string; stem: string } | null = null;
  for (const word of raw) {
    if (isStop(word) || word.length < 3 || /^\d+$/.test(word)) {
      before = null;
      continue;
    }
    const s = stem(word);
    if (!words.has(s)) words.set(s, word);
    if (before && before.stem !== s) {
      const id = `${before.stem} ${s}`;
      if (!pairs.has(id)) pairs.set(id, { label: `${before.word} ${word}`, stems: [before.stem, s] });
    }
    before = { word, stem: s };
  }
  return { words, pairs };
}

/**
 * A lexicon for each indicator of one edition. Weights come from the whole edition, so a word every indicator uses
 * ("sustainability" in a sustainability ranking) counts for little and one that only this indicator uses counts most.
 */
export function buildLexicons(edition: Candidate[]): Lexicon[] {
  const parsed = edition.map((c) => ({ c, name: wordsOf(c.name), guide: wordsOf(c.guidance) }));
  const seenIn = new Map<string, number>();
  for (const p of parsed) for (const s of new Set([...p.name.words.keys(), ...p.guide.words.keys()])) seenIn.set(s, (seenIn.get(s) ?? 0) + 1);
  const n = Math.max(1, edition.length);
  const rarity = (s: string) => Math.log(1 + n / (seenIn.get(s) ?? 1));

  return parsed.map(({ c, name, guide }) => {
    const words: Term[] = [];
    for (const [s, label] of name.words) words.push({ label, stems: [s], weight: rarity(s) * 1.5, strong: false });
    for (const [s, label] of guide.words) if (!name.words.has(s)) words.push({ label, stems: [s], weight: rarity(s), strong: false });
    const phrases: Term[] = [];
    for (const p of name.pairs.values()) phrases.push({ label: p.label, stems: p.stems, weight: (rarity(p.stems[0]) + rarity(p.stems[1])) * 1.5, strong: true });
    for (const [id, p] of guide.pairs) if (!name.pairs.has(id)) phrases.push({ label: p.label, stems: p.stems, weight: rarity(p.stems[0]) + rarity(p.stems[1]), strong: true });
    const byWeight = (a: Term, b: Term) => b.weight - a.weight;
    const own = [...words.sort(byWeight).slice(0, KEEP_WORDS), ...phrases.sort(byWeight).slice(0, KEEP_PHRASES)];
    const total = own.reduce((sum, t) => sum + t.weight, 0);
    const top = own.reduce((max, t) => Math.max(max, t.weight), 1);
    const extra = c.extra
      .map((term): Term => ({ label: term, stems: termStems(term), weight: top * 2, strong: true, added: true }))
      .filter((t) => t.stems.length && !own.some((o) => o.stems.join(" ") === t.stems.join(" ")));
    return { key: key(c), candidate: c, terms: [...extra, ...own], total: total || 1 };
  });
}

interface PageScore {
  n: number;
  score: number;
  found: Term[];
}

function scorePage(lex: Lexicon, page: PageIndex): PageScore {
  let score = 0;
  const found: Term[] = [];
  for (const t of lex.terms) {
    const hits = countTerm(page, t.stems);
    if (!hits) continue;
    found.push(t);
    score += t.weight * (1 + 0.25 * (hits - 1));
  }
  return { n: page.n, score, found };
}

/** The sentence on a page that holds the most of what was found, and whether it denies something. */
function bestSentence(text: string, found: Term[]) {
  let best = { text: "", weight: 0 };
  for (const s of sentences(text)) {
    if (s.length < 20) continue;
    const idx = indexPage(0, s);
    const weight = found.reduce((sum, t) => sum + (countTerm(idx, t.stems, 1) ? t.weight : 0), 0);
    if (weight > best.weight) best = { text: s, weight };
  }
  return best.text;
}

const MAX_PAGES = 8;
const MAX_FIGURES = 4;

/** Figures in sentences that hold one of the found terms, the indicator's own unit first. */
function figuresFor(lex: Lexicon, pages: PageText[], found: Term[]): Figure[] {
  const unit = lex.candidate.unit ? termStems(lex.candidate.unit) : [];
  const ranked: { f: Figure; rank: number }[] = [];
  for (const page of pages) {
    for (const f of figuresIn(page.text, page.n)) {
      const idx = indexPage(0, f.quote);
      const weight = found.reduce((sum, t) => sum + (countTerm(idx, t.stems, 1) ? t.weight : 0), 0);
      if (!weight) continue;
      const label = indexPage(0, f.text);
      const fits = unit.length > 0 && countTerm(label, unit, 1) > 0;
      ranked.push({ f, rank: weight + (fits ? lex.total : 0) });
    }
  }
  const seen = new Set<string>();
  return ranked
    .sort((a, b) => b.rank - a.rank)
    .map((r) => r.f)
    .filter((f) => (seen.has(f.text) ? false : (seen.add(f.text), true)))
    .slice(0, MAX_FIGURES);
}

/**
 * One indicator against a file. High: a good share of its lexicon, several terms. Medium: enough to be worth a look.
 * An indicator with only a word or two to its name ("Number of graduates") matches when they sit in one sentence
 * with a figure.
 */
function matchOne(lex: Lexicon, pages: PageText[], index: PageIndex[]): Match | null {
  const scored = index.map((p) => scorePage(lex, p)).filter((s) => s.found.length);
  if (!scored.length) return null;
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  const small = lex.terms.length <= 3;
  const kept = scored
    .filter((s) => s.score >= best.score * 0.5 && (small ? s.found.length === lex.terms.length : s.found.length >= 2 || s.found.some((t) => t.strong)))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PAGES);
  if (!kept.length) return null;

  const found = new Map<string, Term>();
  for (const s of kept) for (const t of s.found) found.set(t.stems.join(" "), t);
  const terms = [...found.values()].sort((a, b) => b.weight - a.weight);
  const own = terms.filter((t) => !t.added);
  const share = Math.min(1, own.reduce((sum, t) => sum + t.weight, 0) / lex.total);
  const strong = terms.filter((t) => t.strong).length;
  const added = terms.length - own.length;

  const byPage = new Map(pages.map((p) => [p.n, p]));
  const keptPages = kept.map((s) => byPage.get(s.n)!).filter(Boolean);
  const quote = bestSentence(byPage.get(best.n)?.text ?? "", best.found);
  const figures = figuresFor(lex, keptPages, terms);

  let confidence: Match["confidence"] | null = null;
  if (small) {
    // Every word of a short name, in one sentence, beside a figure.
    const whole = quote && lex.terms.every((t) => countTerm(indexPage(0, quote), t.stems, 1));
    if (whole && figures.some((f) => f.quote === quote || f.page === best.n)) confidence = "medium";
  } else if ((share >= 0.45 && terms.length >= 4) || (added > 0 && terms.length >= 3)) confidence = "high";
  else if ((share >= 0.25 && terms.length >= 3) || (share >= 0.2 && strong >= 1 && terms.length >= 2) || added > 0) confidence = "medium";
  if (!confidence) return null;

  return {
    edition: lex.candidate.edition,
    code: lex.candidate.code,
    pages: kept.map((s) => s.n).sort((a, b) => a - b),
    confidence,
    score: Math.round((share + added * 0.2 + best.score / (lex.total * 4)) * 1000) / 1000,
    terms: terms.slice(0, 8).map((t) => t.label),
    quote: quote.slice(0, 600),
    ...(quote && { quotePage: best.n }),
    negated: !!quote && denies(quote),
    figures: lex.candidate.numeric ? figures : figures.slice(0, 2),
  };
}

const MAX_MATCHES = 16;

/** A file's pages against every candidate: the strongest matches, most certain first. */
export function matchPages(pages: PageText[], lexicons: Lexicon[]): Match[] {
  const index = pages.map((p) => indexPage(p.n, p.text));
  const out: Match[] = [];
  for (const lex of lexicons) {
    const m = matchOne(lex, pages, index);
    if (m) out.push(m);
  }
  return out.sort((a, b) => Number(b.confidence === "high") - Number(a.confidence === "high") || b.score - a.score).slice(0, MAX_MATCHES);
}
