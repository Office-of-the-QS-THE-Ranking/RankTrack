/*
 * What the rules do with a file once it is text: choose the indicators the submission could count toward, match the
 * pages against them, and sum up which SDGs and years the text is about. No model is involved, so the same file and
 * the same terms always give the same suggestions. Plain functions (tests/review.test.ts).
 */
import type { Catalog, CatalogIndicator } from "@/lib/analytics/types";
import { yearsIn } from "./figures";
import { buildLexicons, matchPages, type Lexicon } from "./match";
import { countTerm, indexPage, plain, termStems } from "./text";
import type { Candidate, FileSummary, Match, PageText, SdgHit } from "./types";

/** A term the Office keeps: for an SDG, or for one indicator of a ranking. */
export interface TermRow {
  id: string;
  sdg?: number;
  ranking?: string;
  code?: string;
  term: string;
  by: string;
}

/** An indicator someone answers, as opposed to one computed from others, published by the body or reviewed as cases. */
export const answerable = (i: CatalogIndicator) => !["none", "result", "cases"].includes(i.input.type);

const candidateOf = (edition: string, i: CatalogIndicator, extra: string[]): Candidate => ({
  edition,
  code: i.code,
  name: i.name,
  guidance: i.guidance,
  unit: i.unit,
  numeric: i.input.type === "number",
  extra,
});

/**
 * The groups of an edition a submission counts toward, from where it is mapped ("THE Impact · SDG 4", "UI GreenMetric ·
 * Water"). A ranking it isn't mapped to gives none; one it is mapped to under a heading the edition doesn't have gives
 * them all.
 */
export function groupsFor(catalog: Catalog, short: string, mappedTo: string[]): Set<string> | null {
  const pillars = mappedTo.filter((m) => m.split(" · ")[0] === short).map((m) => m.split(" · ").slice(1).join(" · "));
  if (!pillars.length) return null;
  const hit = new Set<string>();
  for (const p of pillars) {
    const sdg = /^SDG\s*(\d{1,2})$/i.exec(p.trim());
    for (const g of catalog.groups) {
      if (sdg ? g.code.toUpperCase() === `SDG${sdg[1]}` : plain(g.name) === plain(p) || plain(g.code) === plain(p)) hit.add(g.code);
    }
  }
  return hit.size ? hit : new Set(catalog.groups.map((g) => g.code));
}

/** The lexicons to match a submission's files against: answerable indicators, in the groups it is mapped to, of each active edition. */
export function lexiconsFor(evidence: { mappedTo: string[] }, editions: { catalog: Catalog; short: string }[], terms: TermRow[]): Lexicon[] {
  const out: Lexicon[] = [];
  for (const { catalog, short } of editions) {
    const groups = groupsFor(catalog, short, evidence.mappedTo);
    if (!groups) continue;
    const extra = (code: string) => terms.filter((t) => t.ranking === catalog.edition.ranking && t.code === code).map((t) => t.term);
    // Weights come from the whole edition, then only the mapped groups are matched.
    const all = buildLexicons(catalog.indicators.filter(answerable).map((i) => candidateOf(catalog.edition.id, i, extra(i.code))));
    const inGroup = new Set(catalog.indicators.filter((i) => groups.has(i.group)).map((i) => i.code));
    out.push(...all.filter((l) => inGroup.has(l.candidate.code)));
  }
  return out;
}

/** Which SDGs a text is about: the terms kept for each, and the goal named outright ("SDG 4"). */
export function sdgHits(pages: PageText[], terms: TermRow[]): SdgHit[] {
  const index = pages.map((p) => indexPage(p.n, p.text));
  const out: SdgHit[] = [];
  for (let n = 1; n <= 17; n++) {
    const list = [{ label: `SDG ${n}`, stems: [`sdg${n}`] }, ...terms.filter((t) => t.sdg === n).map((t) => ({ label: t.term, stems: termStems(t.term) }))].filter((t) => t.stems.length);
    const found: { label: string; hits: number }[] = [];
    const on = new Set<number>();
    for (const t of list) {
      let hits = 0;
      for (const p of index) {
        const c = countTerm(p, t.stems);
        if (c) {
          hits += c;
          on.add(p.n);
        }
      }
      if (hits) found.push({ label: t.label, hits });
    }
    if (found.length) out.push({ n, terms: found.sort((a, b) => b.hits - a.hits).map((f) => f.label).slice(0, 8), pages: [...on].sort((a, b) => a - b).slice(0, 40) });
  }
  return out.sort((a, b) => b.terms.length - a.terms.length || a.n - b.n);
}

/** An SDG counts as covered by a text that names it outright or holds two of its terms. */
export const sdgFound = (hit: SdgHit | undefined) => !!hit && (hit.terms.length >= 2 || hit.terms.includes(`SDG ${hit.n}`));

export function summarize(pages: PageText[], terms: TermRow[]): FileSummary {
  const text = pages.map((p) => p.text).join("\n");
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    sdgs: sdgHits(pages, terms),
    years: yearsIn(text).slice(0, 8),
  };
}

/** Everything the rules say about one file. */
export function reviewPages(pages: PageText[], lexicons: Lexicon[], terms: TermRow[]): { matches: Match[]; summary: FileSummary } {
  return { matches: matchPages(pages, lexicons), summary: summarize(pages, terms) };
}
