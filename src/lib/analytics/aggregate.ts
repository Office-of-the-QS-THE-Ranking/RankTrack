/*
 * How an edition's groups add up to its headline figure. One function per AggregateKind: a ranking body with a new
 * formula needs one entry here, and everything else about it (groups, indicators, rules) stays data.
 */
import type { AggregateKind, Benchmark, Edition, GroupReport, IndicatorReport, Points, TotalReport } from "./types";
import { OWN } from "./types";

export const ZERO: Points = { max: 0, secured: 0, claimed: 0, open: 0, lost: 0 };

export function addPoints(a: Points, b: Points): Points {
  return { max: a.max + b.max, secured: a.secured + b.secured, claimed: a.claimed + b.claimed, open: a.open + b.open, lost: a.lost + b.lost };
}

const scale = (p: Points, k: number): Points => ({ max: p.max * k, secured: p.secured * k, claimed: p.claimed * k, open: p.open * k, lost: p.lost * k });

/** A group's points on a 0–100 scale, whatever the indicators' own scale. */
const pct = (p: Points | null): Points => (p && p.max > 0 ? scale(p, 100 / p.max) : ZERO);

interface AggregateInput {
  edition: Edition;
  groups: GroupReport[];
  indicators: IndicatorReport[];
  readiness: number;
  benchmarks: Benchmark[];
}

type Aggregate = (input: AggregateInput) => TotalReport;

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

const sum: Aggregate = ({ edition, groups }) => {
  const p = groups.reduce((s, g) => (g.points ? addPoints(s, g.points) : s), ZERO);
  return { kind: "sum", label: "Points", secured: p.secured, claimed: p.claimed, open: p.open, max: p.max || edition.scale };
};

/**
 * THE Impact: the mandatory goal (SDG 17) at its weight, plus the strongest other goals at theirs. THE scales every
 * SDG to 0–100 across universities first; the Hub can only scale to the methodology's maximum, so this is an
 * estimate of the annual score, not of the published one.
 */
const theImpact: Aggregate = ({ edition, groups }) => {
  const o = edition.options;
  const mandatory = o.mandatory ?? "SDG17";
  const mw = o.mandatoryWeight ?? 0.22;
  const best = o.best ?? 3;
  const bw = o.bestWeight ?? 0.26;
  const m = groups.find((g) => g.code === mandatory);
  const others = groups.filter((g) => g.code !== mandatory && g.points && g.points.claimed + g.points.secured > 0);
  const pick = (key: "claimed" | "secured") => [...others].sort((a, b) => pct(b.points)[key] - pct(a.points)[key]).slice(0, best);
  const claimedTop = pick("claimed");
  const securedTop = pick("secured");
  const mp = pct(m?.points ?? null);
  const claimed = mp.claimed * mw + claimedTop.reduce((s, g) => s + pct(g.points).claimed * bw, 0);
  const secured = mp.secured * mw + securedTop.reduce((s, g) => s + pct(g.points).secured * bw, 0);
  const open = mp.open * mw + claimedTop.reduce((s, g) => s + pct(g.points).open * bw, 0) + Math.max(0, best - claimedTop.length) * 100 * bw;
  const eligible = !!m?.points && m.points.claimed > 0 && claimedTop.length >= best;
  return {
    kind: "the-impact",
    label: "Annual score",
    secured: round(secured),
    claimed: round(claimed),
    open: round(open),
    max: 100,
    counted: [mandatory, ...claimedTop.map((g) => g.code)],
    note: eligible ? undefined : `The overall rating needs ${mandatory.replace("SDG", "SDG ")} and ${best} other goals with data.`,
  };
};

/** WURI: each category's best reviewed case; the headline is how strong the cases are where there are any. */
const bestPerGroup: Aggregate = ({ indicators }) => {
  const categories = indicators.filter((i) => i.points && i.points.max > 0);
  const scored = categories.filter((i) => !i.points!.open);
  const avg = (key: "claimed" | "secured") => (scored.length ? scored.reduce((s, i) => s + pct(i.points)[key], 0) / scored.length : 0);
  return {
    kind: "best-per-group",
    label: "Average best case",
    secured: round(avg("secured")),
    claimed: round(avg("claimed")),
    open: scored.length ? 0 : 100,
    max: 100,
    counted: scored.map((i) => i.code),
    note: `${scored.length} of ${categories.length} categories have a reviewed case.`,
  };
};

/** No published formula (QS Sustainability's portal): the headline is how ready the submission is. */
const readinessOnly: Aggregate = ({ indicators, readiness }) => {
  const validated = indicators.length ? (indicators.filter((i) => i.state === "Validated").length / indicators.length) * 100 : 0;
  return { kind: "readiness", label: "Readiness", secured: round(validated), claimed: round(readiness), open: round(100 - readiness), max: 100 };
};

/** Results only (QS by Subject): the published ranks the Office recorded for this edition. */
const results: Aggregate = ({ edition, benchmarks, indicators }) => {
  const own = benchmarks.filter((b) => b.peer === OWN && b.year === edition.year && b.ranking === edition.ranking);
  const ranked = new Set(own.filter((b) => /:rank$/.test(b.metric) && b.label && b.label !== "-").map((b) => b.metric.split(":")[0]));
  return {
    kind: "results",
    label: "Ranked subjects",
    secured: ranked.size,
    claimed: ranked.size,
    open: 0,
    max: Math.max(ranked.size, indicators.length),
    counted: [...ranked],
  };
};

export const AGGREGATES: Record<AggregateKind, Aggregate> = { sum, "the-impact": theImpact, "best-per-group": bestPerGroup, readiness: readinessOnly, results };

export function aggregate(kind: AggregateKind, input: AggregateInput): TotalReport {
  return (AGGREGATES[kind] ?? sum)(input);
}
