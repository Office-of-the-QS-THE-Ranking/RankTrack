/*
 * The Hub's live data as the assistant's tools hand it to a model, as plain functions (tests/assistant-data.test.ts): who
 * gets which tool, text made safe to pass on, and the comparisons and causes worked out here in code, so that a model
 * reports figures rather than doing the sums itself. Personal details are left out. See docs/assistant.md.
 */
import { baseline, movement, summarize } from "@/lib/analytics/brief";
import { valueText } from "@/lib/analytics/format";
import type { Catalog, CatalogIndicator, EditionReport, IndicatorReport, Snapshot } from "@/lib/analytics/types";
import { canWith, type Grant } from "@/lib/governance/rbac";

/* ---------- Who gets which tool ---------- */

export const DATA_TOOLS = ["hub_overview", "ranking_detail", "investigate_gaps", "compare_editions", "activity_summary", "benchmarks", "data_requests", "action_items", "unit_standings", "unit_detail", "search_evidence", "forms_summary", "publications_status"] as const;
export type DataTool = (typeof DATA_TOOLS)[number];

/**
 * The same permission each tool's page asks for, so the assistant shows nobody what their pages wouldn't. A tool is what a
 * model is offered at all; those that reach into a unit (unit_detail, search_evidence) check that unit again when called.
 */
export function dataToolsFor(grants: Grant[]): DataTool[] {
  const can = (module: Parameters<typeof canWith>[1], action: Parameters<typeof canWith>[2] = "view") => canWith(grants, module, action);
  const rankings = can("rankings");
  const evidence = can("evidence");
  const allowed: Record<DataTool, boolean> = {
    hub_overview: rankings,
    ranking_detail: rankings,
    investigate_gaps: rankings,
    compare_editions: rankings,
    activity_summary: rankings,
    benchmarks: rankings,
    data_requests: rankings || can("data"),
    action_items: rankings || evidence,
    unit_standings: can("units"),
    unit_detail: evidence,
    search_evidence: evidence,
    // A Student's forms are their own, on their own pages, and hold other people's answers.
    forms_summary: can("forms") && evidence,
    publications_status: can("posts") || can("stories"),
  };
  return DATA_TOOLS.filter((t) => allowed[t]);
}

/* ---------- Text ---------- */

/**
 * Text someone in the Hub typed, ready to pass to a model: it can't close a tag, carry a link for a model to repeat, or
 * pass on an email address. Names written into free text can't be told apart in code, so those stay.
 */
export function cleanText(text: string | null | undefined, max = 300) {
  const clean = (text ?? "")
    .replace(/<\/?\s*(?:unit_)?sources\s*>/gi, " ")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email removed]")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** A list cut to size, saying how many more there were so a model can't mistake it for the whole. */
export function take<T>(rows: readonly T[], most: number): { rows: T[]; more?: number } {
  return rows.length > most ? { rows: rows.slice(0, most), more: rows.length - most } : { rows: [...rows] };
}

/* ---------- Names ---------- */

/** What someone typed, as one thing or the things it could be: exact first, then any name containing it. */
export function findOne<T>(items: readonly T[], query: string, names: (item: T) => string[]): { found: T } | { options: T[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { options: [...items] };
  const exact = items.filter((i) => names(i).some((n) => n.toLowerCase() === q));
  if (exact.length === 1) return { found: exact[0]! };
  const close = exact.length ? exact : items.filter((i) => names(i).some((n) => n.toLowerCase().includes(q) || q.includes(n.toLowerCase())));
  return close.length === 1 ? { found: close[0]! } : { options: close };
}

/* ---------- One edition ---------- */

const round = (n: number) => Math.round(n * 100) / 100;

const failing = (r: IndicatorReport) => r.checks.filter((c) => !c.ok && c.key !== "owner").map((c) => c.label);

/** At stake: what it could still earn, and what the methodology says it has already lost. */
const atStake = (r: IndicatorReport) => (r.points?.open ?? 0) + (r.points?.lost ?? 0);

export function indicatorRow(ind: CatalogIndicator, r: IndicatorReport) {
  const value = valueText(ind.input, r.value, ind.unit);
  return {
    code: ind.code,
    name: cleanText(ind.name, 140),
    group: ind.group,
    state: r.state,
    ...(value && { value: cleanText(value, 120) }),
    ...(r.computed !== null && { computed: round(r.computed) }),
    ...(r.band && { band: r.band.label }),
    ...(r.points && { claimed: round(r.points.claimed), secured: round(r.points.secured), open: round(r.points.open), lost: round(r.points.lost), max: round(r.points.max) }),
    readinessPercent: Math.round(r.readiness),
    failing: failing(r),
  };
}

export function editionTotals(c: Catalog, report: EditionReport) {
  return {
    edition: c.edition.id,
    label: c.edition.label,
    ranking: c.edition.ranking,
    status: c.edition.status,
    ...(c.edition.closesOn && { closes: c.edition.closesOn, ...(c.edition.status === "Active" && c.edition.closesOn < new Date().toISOString().slice(0, 10) && { warning: "Its closing date has passed, though it's still marked Active." }) }),
    total: { kind: report.total.label, secured: round(report.total.secured), claimed: round(report.total.claimed), open: round(report.total.open), max: round(report.total.max), ...(report.total.note && { note: cleanText(report.total.note) }) },
    readinessPercent: Math.round(report.readiness),
    counts: report.counts,
  };
}

export function editionDetail(c: Catalog, report: EditionReport, filter: { group?: string; state?: string } = {}) {
  const wanted = c.indicators
    .map((ind) => ({ ind, r: report.indicators[ind.code] }))
    .filter((x): x is { ind: CatalogIndicator; r: IndicatorReport } => !!x.r)
    .filter(({ ind, r }) => (!filter.group || ind.group.toLowerCase() === filter.group.toLowerCase()) && (!filter.state || r.state.toLowerCase() === filter.state.toLowerCase()))
    .sort((a, b) => atStake(b.r) - atStake(a.r));
  return {
    ...editionTotals(c, report),
    groups: report.groups.map((g) => ({ code: g.code, name: cleanText(g.name, 100), claimed: round(g.points?.claimed ?? 0), secured: round(g.points?.secured ?? 0), max: round(g.points?.max ?? 0), groupScore: round(g.readiness), done: g.done, indicators: g.indicators })),
    indicators: take(wanted.map(({ ind, r }) => indicatorRow(ind, r)), 25),
  };
}

/* ---------- Why ---------- */

/**
 * What the Hub can say about why an edition stands where it does: which checks fail and what they hold back, the weakest
 * groups, the fixes worth most, data problems, and who hasn't supplied what. These are findings from the Hub's own
 * records. `limits` says what can't be told, so a model reports the gap rather than filling it with a guess.
 */
export function investigate(c: Catalog, report: EditionReport, context: { snapshots: Snapshot[]; hasPeerFigures: boolean; hasResults: boolean; unitName: (id: string) => string; now?: Date }) {
  const { snapshots, hasPeerFigures, hasResults, unitName, now = new Date() } = context;
  const rows = c.indicators.map((ind) => ({ ind, r: report.indicators[ind.code] })).filter((x): x is { ind: CatalogIndicator; r: IndicatorReport } => !!x.r && x.r.state !== "Not applicable");

  const checks = new Map<string, { check: string; indicatorsFailingIt: number; pointsItWouldAdd: number; examples: string[] }>();
  for (const { ind, r } of rows) {
    for (const check of r.checks) {
      if (check.ok || check.key === "owner") continue;
      const row = checks.get(check.key) ?? { check: check.label, indicatorsFailingIt: 0, pointsItWouldAdd: 0, examples: [] };
      row.indicatorsFailingIt += 1;
      row.pointsItWouldAdd += check.gain ?? 0;
      if (row.examples.length < 3) row.examples.push(`${ind.code} ${cleanText(ind.name, 70)}`);
      checks.set(check.key, row);
    }
  }

  const states: Record<string, number> = {};
  for (const { r } of rows) states[r.state] = (states[r.state] ?? 0) + 1;

  const owing = new Map<string, number>();
  for (const { ind, r } of rows) {
    if (r.state !== "Not started") continue;
    for (const owner of ind.owners.length ? ind.owners.map(unitName) : ind.ownerLabels) owing.set(owner, (owing.get(owner) ?? 0) + 1);
  }

  const mine = snapshots.filter((s) => s.edition === c.edition.id);
  const base = baseline(mine, now) ?? mine.at(-1) ?? null;
  const limits = [
    !base && "No earlier snapshot of this edition exists, so change over time can't be traced.",
    !hasPeerFigures && "No peer institutions' figures are recorded for this ranking, so it can't be compared with competitors.",
    !hasResults && "No published result is recorded for this ranking in the Hub, so nothing here shows how the ranking body scored UST.",
    report.counts.withValue === 0 && "Nothing has been entered for this edition yet, so every figure is zero because data is missing, not because UST scored badly.",
  ].filter((x): x is string => !!x);

  const groups = report.groups.filter((g) => (g.points?.max ?? 0) > 0);
  const allTied = groups.length > 1 && groups.every((g) => g.points!.claimed === 0);
  return {
    ...editionTotals(c, report),
    indicatorsByState: states,
    ...(allTied && { groupsTied: "Every group is at zero, so no group is weaker than another. The list below is only the first few." }),
    failingChecks: [...checks.values()].map((x) => ({ ...x, pointsItWouldAdd: round(x.pointsItWouldAdd) })).sort((a, b) => b.pointsItWouldAdd - a.pointsItWouldAdd || b.indicatorsFailingIt - a.indicatorsFailingIt),
    weakestGroups: groups
      .map((g) => ({ code: g.code, name: cleanText(g.name, 100), claimed: round(g.points!.claimed), max: round(g.points!.max), share: Math.round((g.points!.claimed / g.points!.max) * 100) }))
      .sort((a, b) => a.share - b.share)
      .slice(0, 6),
    fixesWorthMost: report.fixes.slice(0, 8).map((f) => ({ code: f.code, what: cleanText(f.title, 140), kind: f.kind, gain: round(f.gain), owners: f.owners.map(unitName) })),
    dataProblems: take(
      report.issues.filter((i) => i.level !== "info").map((i) => ({ level: i.level, ...(i.code && { code: i.code }), text: cleanText(i.text, 180) })),
      8,
    ),
    notStartedByOwner: [...owing.entries()].map(([owner, items]) => ({ owner, items })).sort((a, b) => b.items - a.items).slice(0, 10),
    ...(base && { sinceSnapshot: { at: base.at, changes: movement(c, summarize(report), base.summary).filter((m) => m.delta !== 0).slice(0, 12) } }),
    limits,
  };
}

/** One indicator, closely: its figures, each check it fails and what that holds back, and who supplies it. */
export function investigateIndicator(ind: CatalogIndicator, r: IndicatorReport, unitName: (id: string) => string) {
  return {
    ...indicatorRow(ind, r),
    guidance: cleanText(ind.guidance, 400),
    checks: r.checks.map((c) => ({ check: c.label, passes: c.ok, ...(c.gain && { pointsItWouldAdd: round(c.gain) }) })),
    ...(r.band?.next && { nextBand: { label: r.band.next.label, target: r.band.next.target, gain: round(r.band.next.gain), direction: r.band.next.direction } }),
    contributors: r.contributors.map(unitName),
    owners: ind.owners.length ? ind.owners.map(unitName) : ind.ownerLabels,
    evidenceLinks: r.links,
    ...(r.updatedAt && { updated: r.updatedAt }),
  };
}

/* ---------- Comparing ---------- */

const change = (before: number, now: number) => round(now - before);

/** Two editions side by side, differences worked out here. Different rankings use different scales, and it says so. */
export function compareEditions(a: { catalog: Catalog; report: EditionReport }, b: { catalog: Catalog; report: EditionReport }) {
  const sameRanking = a.catalog.edition.ranking === b.catalog.edition.ranking;
  const groups = a.report.groups.flatMap((g) => {
    const other = b.report.groups.find((x) => x.code === g.code);
    if (!other) return [];
    const [first, second] = [g.points?.claimed ?? 0, other.points?.claimed ?? 0];
    return [{ code: g.code, name: cleanText(g.name, 100), a: round(first), b: round(second), change: change(first, second), groupScoreA: round(g.readiness), groupScoreB: round(other.readiness) }];
  });
  const indicators = Object.values(a.report.indicators).flatMap((r) => {
    const other = b.report.indicators[r.code];
    const ind = b.catalog.indicators.find((i) => i.code === r.code);
    if (!other || !ind) return [];
    const moved = change(r.points?.claimed ?? 0, other.points?.claimed ?? 0);
    return moved !== 0 || r.state !== other.state ? [{ code: r.code, name: cleanText(ind.name, 100), stateA: r.state, stateB: other.state, claimedA: round(r.points?.claimed ?? 0), claimedB: round(other.points?.claimed ?? 0), change: moved }] : [];
  });
  return {
    a: editionTotals(a.catalog, a.report),
    b: editionTotals(b.catalog, b.report),
    change: {
      claimed: change(a.report.total.claimed, b.report.total.claimed),
      secured: change(a.report.total.secured, b.report.total.secured),
      readinessPercent: Math.round(b.report.readiness) - Math.round(a.report.readiness),
    },
    groups: take(groups.sort((x, y) => Math.abs(y.change) - Math.abs(x.change)), 10),
    indicators: take(indicators.sort((x, y) => Math.abs(y.change) - Math.abs(x.change)), 10),
    ...(!sameRanking && { warning: "These are different rankings with different methodologies and scales, so their totals can't be compared directly." }),
  };
}

/* ---------- Tallies ---------- */

/** Rows counted by one property, largest first. */
export function tally<T>(rows: readonly T[], keyOf: (row: T) => string | string[], add: (row: T) => number = () => 0) {
  const out = new Map<string, { key: string; count: number; total: number }>();
  for (const row of rows) {
    const keys = keyOf(row);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      const cell = out.get(key) ?? { key, count: 0, total: 0 };
      cell.count += 1;
      cell.total += add(row);
      out.set(key, cell);
    }
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Who leads a leaderboard, worked out here rather than left to a model's reading of a table. No leader until something is
 * validated, since that's what the leaderboard ranks, but what has been sent still has a most.
 */
export function leaders<T extends { unit: string; rank?: number; evidenceSent: number; analyticsItemsSent: number }>(rows: readonly T[]) {
  const most = (key: "evidenceSent" | "analyticsItemsSent") => {
    const top = Math.max(0, ...rows.map((r) => r[key]));
    return top > 0 ? { units: rows.filter((r) => r[key] === top).map((r) => r.unit), count: top } : null;
  };
  return { leader: rows.filter((r) => r.rank === 1).map((r) => r.unit), mostEvidenceSent: most("evidenceSent"), mostAnalyticsItemsSent: most("analyticsItemsSent") };
}
