/*
 * How each kind of indicator scores. One function per ScoreRule kind; the engine resolves the values and evidence
 * first and hands them in, so these stay pure. Every result has two tiers: claimed (everything submitted) and
 * secured (only what the Office validated), and says when nothing can be computed yet.
 */
import { evaluate } from "./expr";
import type { Band, BandHit, ISODate, ScoreRule, Value } from "./types";

/** The best evidence an indicator has: its relevance (specific 1, general 0.5) and whether any of it is public. */
export interface Grade {
  any: boolean;
  relevance: number;
  public: boolean;
}

export const NO_GRADE: Grade = { any: false, relevance: 0, public: false };

export interface Tier {
  value: Value | null;
  /** Another indicator's number in the same tier. */
  lookup: (code: string) => number | null;
  grade: Grade;
}

export interface RuleContext {
  claimed: Tier;
  secured: Tier;
  /** Peers' values for a normalised ratio, and the University's own published score for an external one (0–100). */
  peers: number[];
  published: number | null;
  /** Reviewed cases' totals as shares of the rubric's maximum, best first. */
  cases: number[];
}

export interface RuleResult {
  claimed: number;
  secured: number;
  /** Nothing to compute from yet: the whole indicator is open. */
  open: boolean;
  computed: number | null;
  securedComputed: number | null;
  band: BandHit | null;
  /** The ratio was projected from peers rather than computed. */
  estimate?: boolean;
}

const OPEN: RuleResult = { claimed: 0, secured: 0, open: true, computed: null, securedComputed: null, band: null };

const inBand = (b: Band, v: number) =>
  (b.min === undefined || (b.minIncl ? v >= b.min : v > b.min)) && (b.max === undefined || (b.maxIncl ? v <= b.max : v < b.max));

/** The band a value falls in: the first that holds it, as the bodies list them. */
export const bandOf = (bands: Band[], v: number) => bands.find((b) => inBand(b, v)) ?? null;

/** Whether higher values earn more: the band with the largest share sits above the one with the smallest. */
function direction(bands: Band[]): "raise" | "lower" {
  const best = [...bands].sort((a, b) => b.share - a.share)[0];
  const worst = [...bands].sort((a, b) => a.share - b.share)[0];
  const mid = (b: Band) => b.min ?? (b.max !== undefined ? b.max - 1 : 0);
  return mid(best) >= mid(worst) ? "raise" : "lower";
}

/** The band reached, and what the next one up asks for. */
export function bandHit(bands: Band[], v: number, points: number): BandHit | null {
  const hit = bandOf(bands, v);
  if (!hit) return null;
  const up = bands.filter((b) => b.share > hit.share).sort((a, b) => a.share - b.share)[0];
  if (!up) return { label: hit.label, share: hit.share };
  const dir = direction(bands);
  const target = dir === "raise" ? (up.min ?? up.max ?? v) : (up.max ?? up.min ?? v);
  return { label: hit.label, share: hit.share, next: { label: up.label, target, gain: (up.share - hit.share) * points, direction: dir } };
}

/** Existence, as a share of its one point, from the answer given. */
function existence(rule: Extract<ScoreRule, { kind: "claim" }>, v: Value): number {
  const ex = rule.existence;
  if (v.picks?.length) {
    if (ex.each !== undefined) return Math.min(ex.cap ?? 1, ex.each * v.picks.length);
    if (ex.shares && ex.sum) return Math.min(ex.cap ?? 1, v.picks.reduce((s, p) => s + (ex.shares![p] ?? 0), 0));
    if (ex.shares) return Math.max(0, ...v.picks.map((p) => ex.shares![p] ?? 0));
    return 1;
  }
  if (v.choice !== undefined) return ex.shares?.[v.choice] ?? 0;
  if (v.yes !== undefined) return v.yes ? (ex.yes ?? 1) : 0;
  return 0;
}

const answered = (v: Value | null): v is Value =>
  !!v && (v.num !== undefined || v.choice !== undefined || !!v.picks?.length || v.yes !== undefined || !!v.text || !!v.date);

function claimShare(rule: Extract<ScoreRule, { kind: "claim" }>, t: Tier) {
  const v = t.value!;
  const e = existence(rule, v);
  if (e <= 0) return 0;
  const dates = rule.dates && v.created && v.reviewed ? rule.dates : 0;
  const ev = t.grade.any ? rule.evidence * t.grade.relevance : 0;
  const pub = t.grade.any && t.grade.public && t.grade.relevance > 0 ? rule.public : 0;
  return (e + ev + pub + dates) / (1 + rule.evidence + rule.public + (rule.dates ?? 0));
}

/** A share from where the University's figure stands among its peers' (0 lowest, 1 highest), for normalised ratios. */
export function standing(own: number, peers: number[], better: "higher" | "lower" = "higher") {
  const all = [...peers, own].filter(Number.isFinite);
  if (all.length < 2) return null;
  const below = all.filter((x) => (better === "higher" ? x < own : x > own)).length;
  const equal = all.filter((x) => x === own).length - 1;
  return (below + equal / 2) / (all.length - 1);
}

function datedShare(rule: Extract<ScoreRule, { kind: "dated" }>, day: ISODate) {
  const step = [...rule.steps].sort((a, b) => a.until.localeCompare(b.until)).find((s) => day <= s.until);
  return step ? step.share : rule.later;
}

/** An indicator's score under its rule, in both tiers. */
export function score(rule: ScoreRule, ctx: RuleContext): RuleResult {
  const { points } = rule;
  switch (rule.kind) {
    case "bands": {
      const c = evaluate(rule.expr, ctx.claimed.lookup);
      if (c === null) return OPEN;
      const s = evaluate(rule.expr, ctx.secured.lookup);
      const hit = bandHit(rule.bands, c, points);
      const sHit = s === null ? null : bandOf(rule.bands, s);
      return { claimed: (hit?.share ?? 0) * points, secured: (sHit?.share ?? 0) * points, open: false, computed: c, securedComputed: s, band: hit };
    }
    case "choice": {
      const c = ctx.claimed.value?.choice;
      if (c === undefined) return OPEN;
      const s = ctx.secured.value?.choice;
      const shares = rule.shares;
      const best = Math.max(...Object.values(shares));
      const share = shares[c] ?? 0;
      const up = Object.entries(shares)
        .filter(([, x]) => x > share)
        .sort((a, b) => a[1] - b[1])[0];
      return {
        claimed: share * points,
        secured: s === undefined ? 0 : (shares[s] ?? 0) * points,
        open: false,
        computed: null,
        securedComputed: null,
        band: { label: c, share, ...(up && share < best && { next: { label: up[0], target: up[1], gain: (up[1] - share) * points, direction: "raise" as const } }) },
      };
    }
    case "claim": {
      if (!answered(ctx.claimed.value)) return OPEN;
      const c = claimShare(rule, ctx.claimed);
      const s = answered(ctx.secured.value) ? claimShare(rule, ctx.secured) : 0;
      return { claimed: c * points, secured: s * points, open: false, computed: null, securedComputed: null, band: null };
    }
    case "ratio": {
      const c = evaluate(rule.expr, ctx.claimed.lookup);
      if (c === null) return OPEN;
      const s = evaluate(rule.expr, ctx.secured.lookup);
      const share = standing(c, ctx.peers, rule.better);
      if (share === null) return { ...OPEN, computed: c, securedComputed: s };
      const sShare = s === null ? null : standing(s, ctx.peers, rule.better);
      return { claimed: share * points, secured: (sShare ?? 0) * points, open: false, computed: c, securedComputed: s, band: null, estimate: true };
    }
    case "external": {
      if (ctx.published === null) return OPEN;
      const share = Math.max(0, Math.min(1, ctx.published / 100));
      return { claimed: share * points, secured: share * points, open: false, computed: ctx.published, securedComputed: ctx.published, band: null };
    }
    case "dated": {
      const c = ctx.claimed.value?.date;
      if (!c) return OPEN;
      const s = ctx.secured.value?.date;
      return { claimed: datedShare(rule, c) * points, secured: s ? datedShare(rule, s) * points : 0, open: false, computed: null, securedComputed: null, band: null };
    }
    case "rubric": {
      if (!ctx.cases.length) return OPEN;
      const best = Math.max(...ctx.cases);
      return { claimed: best * points, secured: best * points, open: false, computed: Math.round(best * 1000) / 10, securedComputed: null, band: null };
    }
  }
}

/** The most a rubric's criteria add up to. */
export const rubricMax = (rule: Extract<ScoreRule, { kind: "rubric" }>) => rule.criteria.reduce((s, c) => s + c.max, 0);

/** A reviewer's scores, clamped to each criterion's range, and their total. */
export function rubricTotal(rule: Extract<ScoreRule, { kind: "rubric" }>, scores: Record<string, unknown>) {
  const clean: Record<string, number> = {};
  for (const c of rule.criteria) {
    const v = Number(scores[c.key]);
    clean[c.key] = Number.isFinite(v) ? Math.max(0, Math.min(c.max, Math.round(v))) : 0;
  }
  return { scores: clean, total: Object.values(clean).reduce((s, x) => s + x, 0) };
}

/** The level a criterion score sits in. */
export const levelOf = (c: { levels: { label: string; min: number; max: number }[] }, v: number) => c.levels.find((l) => v >= l.min && v <= l.max)?.label ?? "";
