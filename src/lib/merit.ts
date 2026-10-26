/*
 * Honours, the game layer of a unit's profile. Merit comes only from validated evidence and grows with
 * reuse and depth of impact, never with the number of files uploaded (the Recognition rule). Each
 * reporting cycle is a season with its own honour; achievements, once earned, are kept. A unit is only
 * ever measured against its own record, never ranked against other units.
 */
import type { EvidenceItem } from "@/lib/data";
import { bodyOfMapping } from "@/lib/governance/catalog";
import type { IconName } from "@/components/ui/Icon";

/** What a validated submission earns, and what adds to it. */
export const MERIT = {
  validated: 100,
  /** Each further ranking the submission counts in. */
  reuse: 50,
  /** Each rung above "Activity documented" on the impact evidence ladder. */
  rung: 25,
  /** Accepted without a revision. */
  firstPass: 40,
  /** Reached "Result achieved". */
  result: 60,
} as const;

/** The season's honours, by merit earned in the cycle. */
export const HONOURS = [
  { numeral: "I", name: "Matriculant", at: 0 },
  { numeral: "II", name: "Cum Laude", at: 200 },
  { numeral: "III", name: "Magna Cum Laude", at: 600 },
  { numeral: "IV", name: "Summa Cum Laude", at: 1200 },
  { numeral: "V", name: "Laureate", at: 2400 },
] as const;

export type Honour = (typeof HONOURS)[number];

const YEAR = /\b(?:19|20)\d{2}\b/;

/**
 * The reporting cycle a submission counts toward. Cycle 2026–2027 collects evidence for 2025 or academic
 * year 2025–2026, so the first year of the reporting period, plus one, opens the cycle. A period without
 * a year falls back to the submission date, with cycles turning on 1 June.
 */
export function cycleOf(e: Pick<EvidenceItem, "period" | "submitted">): string {
  const year = Number(e.period.match(YEAR)?.[0]);
  const start = year ? year + 1 : Number(e.submitted.slice(0, 4)) - (Number(e.submitted.slice(5, 7)) < 6 ? 1 : 0);
  return `${start}–${start + 1}`;
}

/** The rankings a submission counts in, by short name ("THE Impact"). */
export const rankingsOf = (e: Pick<EvidenceItem, "mappedTo">) => [...new Set(e.mappedTo.map((m) => m.split(" · ")[0]))];

/** The unit wrote back on a submission: it answered a revision request. */
const answered = (e: EvidenceItem) => e.comments.some((c) => !/^(Reviewer|Validator)\b/.test(c.role));

export const firstPass = (e: EvidenceItem) => e.status === "Validated" && !answered(e);

/** A validated submission's merit, part by part. */
export function meritParts(e: EvidenceItem): { label: string; points: number }[] {
  if (e.status !== "Validated") return [];
  const n = rankingsOf(e).length;
  return [
    { label: "Validated", points: MERIT.validated },
    { label: `Counts in ${n} rankings`, points: MERIT.reuse * Math.max(0, n - 1) },
    { label: `Impact level ${e.level} of 5`, points: MERIT.rung * (e.level - 1) },
    { label: "Accepted first time", points: firstPass(e) ? MERIT.firstPass : 0 },
    { label: "Result achieved", points: e.stage >= 5 ? MERIT.result : 0 },
  ].filter((p) => p.points > 0);
}

export const meritOf = (e: EvidenceItem) => meritParts(e).reduce((a, p) => a + p.points, 0);

export function honourFor(merit: number) {
  const i = HONOURS.findLastIndex((h) => merit >= h.at);
  const honour = HONOURS[Math.max(0, i)];
  const next = HONOURS[i + 1];
  return { honour, next, progress: next ? (merit - honour.at) / (next.at - honour.at) : 1 };
}

export interface Season {
  cycle: string;
  /** The cycle's submissions, newest first; closed ("Not applicable") ones are left out. */
  items: EvidenceItem[];
  validated: EvidenceItem[];
  merit: number;
  /** Share of validated submissions accepted without a revision, or null before any is validated. */
  firstPassRate: number | null;
  rankings: string[];
  sdgs: number[];
  honour: Honour;
  next?: Honour;
  /** 0–1 of the way from this honour to the next. */
  progress: number;
}

export function seasonOf(cycle: string, evidence: EvidenceItem[]): Season {
  const items = evidence
    .filter((e) => e.status !== "Not applicable" && cycleOf(e) === cycle)
    .sort((a, b) => b.submitted.localeCompare(a.submitted));
  const validated = items.filter((e) => e.status === "Validated");
  const merit = validated.reduce((a, e) => a + meritOf(e), 0);
  return {
    cycle,
    items,
    validated,
    merit,
    firstPassRate: validated.length ? validated.filter(firstPass).length / validated.length : null,
    rankings: [...new Set(validated.flatMap(rankingsOf))],
    sdgs: [...new Set(validated.flatMap((e) => e.sdgs))].sort((a, b) => a - b),
    ...honourFor(merit),
  };
}

/** Every season from the oldest cycle on, including cycles that only appear in the evidence. */
export function seasonsOf(cycles: string[], evidence: EvidenceItem[]): Season[] {
  return [...new Set([...cycles, ...evidence.map(cycleOf)])].sort().map((c) => seasonOf(c, evidence));
}

/* ---------- Achievements ---------- */


export interface Achievement {
  id: string;
  name: string;
  /** What counts toward it, in a few words. */
  how: string;
  icon: IconName;
  /** The count each tier needs; one goal means a single honour. */
  goals: readonly number[];
}

/** Counted over the seasons so far, so each tier knows the cycle it was earned in. */
type Count = (seasons: Season[], citations: number) => number;

const all = (s: Season[]) => s.flatMap((x) => x.validated);

/** The longest run of consecutive cycles with validated evidence. */
function longestRun(s: Season[]) {
  let best = 0;
  let run = 0;
  for (const x of s) {
    run = x.validated.length ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export const ACHIEVEMENTS: (Achievement & { count: Count })[] = [
  { id: "evidence", name: "Body of Evidence", how: "Validated submissions", icon: "evidence", goals: [1, 5, 15], count: (s) => all(s).length },
  { id: "first-pass", name: "Clean Sheet", how: "Accepted without a revision", icon: "check-circle", goals: [1, 5, 10], count: (s) => all(s).filter(firstPass).length },
  { id: "reuse", name: "Twice Counted", how: "Submissions counting in two or more rankings", icon: "layers", goals: [1, 3, 8], count: (s) => all(s).filter((e) => rankingsOf(e).length > 1).length },
  {
    id: "bodies",
    name: "Grand Tour",
    how: "Ranking bodies reached: THE, QS, UI GreenMetric, WURI",
    icon: "globe",
    goals: [2, 3, 4],
    count: (s) => new Set(all(s).flatMap((e) => rankingsOf(e).flatMap((r) => bodyOfMapping(r) ?? []))).size,
  },
  { id: "sdgs", name: "Global Goals", how: "Sustainable Development Goals supported", icon: "sustainability", goals: [3, 6, 10], count: (s) => new Set(all(s).flatMap((e) => e.sdgs)).size },
  { id: "impact", name: "Proof of Impact", how: "Evidence of verified change for beneficiaries", icon: "ladder", goals: [1, 3, 6], count: (s) => all(s).filter((e) => e.level >= 4).length },
  { id: "results", name: "Full Circle", how: "Submissions that reached Result achieved", icon: "target", goals: [1, 3, 6], count: (s) => all(s).filter((e) => e.stage >= 5).length },
  { id: "revisions", name: "Second Wind", how: "Revisions answered and accepted", icon: "refresh", goals: [1, 3, 6], count: (s) => all(s).filter(answered).length },
  { id: "streak", name: "Unbroken", how: "Consecutive cycles with validated evidence", icon: "history", goals: [2, 3, 5], count: longestRun },
  {
    id: "sweep",
    name: "All Accounted For",
    how: "A cycle with every submission validated, three or more",
    icon: "shield-check",
    goals: [1],
    count: (s) => s.filter((x) => x.items.length >= 3 && x.items.every((e) => e.status === "Validated")).length,
  },
  { id: "citation", name: "Office Citation", how: "Named in the Office’s recognition", icon: "recognition", goals: [1], count: (_, citations) => citations },
];

export interface AchievementState extends Achievement {
  count: number;
  /** Tiers reached, from 0 to the number of goals. */
  tier: number;
  /** The cycle each reached tier was earned in. */
  earned: string[];
  /** The next goal, while one is left. */
  goal?: number;
}

/**
 * Where the unit stands on every achievement after each season. Office recognition carries no cycle of its
 * own, so it counts from the current cycle.
 */
export function achievementsOf(seasons: Season[], citations: number, currentCycle: string): AchievementState[] {
  const from = Math.max(0, seasons.findIndex((s) => s.cycle === currentCycle));
  return ACHIEVEMENTS.map(({ count: tally, ...a }) => {
    const earned: string[] = [];
    let count = 0;
    seasons.forEach((s, i) => {
      count = tally(seasons.slice(0, i + 1), i >= from ? citations : 0);
      while (earned.length < a.goals.length && count >= a.goals[earned.length]) earned.push(s.cycle);
    });
    return { ...a, count, tier: earned.length, earned, goal: a.goals[earned.length] };
  });
}

/** Total tiers on offer, for "7 of 29". */
export const TIERS_ON_OFFER = ACHIEVEMENTS.reduce((a, x) => a + x.goals.length, 0);

/** The metal a medal is struck in: steel for a first tier, gold for a second, onyx and gold for the last. */
export function metalOf(a: Pick<AchievementState, "goals">, tier: number): "steel" | "gold" | "onyx" {
  if (a.goals.length === 1 || tier >= 3) return "onyx";
  return tier === 2 ? "gold" : "steel";
}

export const ROMAN = ["", "I", "II", "III", "IV", "V"];
