/*
 * The Office's own outputs, as its procedures describe them: the one-page positioning brief (current position,
 * three-year trend, peer benchmark, strengths, weaknesses, risks, opportunities, decisions, timeline) and the
 * quarterly review (indicator movement, action updates, risks). Plain Markdown and CSV, so they paste anywhere.
 */
import { gapMatrix, ownTrend, rankNumber } from "./gap";
import type { ActionRow, Catalog, EditionReport, PeerBand, Snapshot, SnapshotSummary } from "./types";
import type { UnitStanding } from "./units";
import type { Benchmark } from "./types";

const r1 = (n: number) => Math.round(n * 10) / 10;
const pts = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-PH") : String(r1(n)));

/** What a report keeps for a snapshot. */
export function summarize(report: EditionReport): SnapshotSummary {
  return {
    readiness: report.readiness,
    total: { secured: report.total.secured, claimed: report.total.claimed, open: report.total.open, max: report.total.max },
    groups: report.groups.map((g) => ({ code: g.code, claimed: r1(g.points?.claimed ?? 0), secured: r1(g.points?.secured ?? 0), readiness: g.readiness })),
    counts: report.counts,
  };
}

export interface Movement {
  key: string;
  label: string;
  before: number;
  now: number;
  delta: number;
}

/** What moved since a snapshot: the headline, readiness, and each group. */
export function movement(catalog: Catalog, now: SnapshotSummary, before: SnapshotSummary | null): Movement[] {
  if (!before) return [];
  const rows: Movement[] = [
    { key: "total", label: "Claimed score", before: before.total.claimed, now: now.total.claimed, delta: r1(now.total.claimed - before.total.claimed) },
    { key: "readiness", label: "Readiness", before: before.readiness, now: now.readiness, delta: r1(now.readiness - before.readiness) },
  ];
  for (const g of now.groups) {
    const was = before.groups.find((x) => x.code === g.code);
    if (!was) continue;
    const name = catalog.groups.find((x) => x.code === g.code)?.name ?? g.code;
    rows.push({ key: g.code, label: name, before: was.claimed, now: g.claimed, delta: r1(g.claimed - was.claimed) });
  }
  return rows;
}

/** The snapshot closest to `days` before now (a quarter by default), not newer than a week. */
export function baseline(snapshots: Snapshot[], now: Date, days = 90): Snapshot | null {
  const target = now.getTime() - days * 86_400_000;
  const old = snapshots.filter((s) => Date.parse(s.at) <= now.getTime() - 7 * 86_400_000);
  if (!old.length) return null;
  return old.reduce((best, s) => (Math.abs(Date.parse(s.at) - target) < Math.abs(Date.parse(best.at) - target) ? s : best));
}

export interface BriefInput {
  title: string;
  catalog: Catalog;
  report: EditionReport;
  benchmarks: Benchmark[];
  peerBand: Map<string, PeerBand>;
  unitName: (id: string) => string;
  standings: UnitStanding[];
  actions: ActionRow[];
  snapshot: Snapshot | null;
  campaignsDue: { title: string; due: string }[];
  today: string;
}

const list = (items: string[], none: string) => (items.length ? items.map((i) => `- ${i}`).join("\n") : `- ${none}`);

/** The one-page positioning brief, in Markdown. */
export function positioningBrief(b: BriefInput): string {
  const { catalog, report } = b;
  const e = catalog.edition;
  const t = report.total;
  const overall = ownTrend(e.ranking, b.benchmarks, "overall:rank");
  const score = ownTrend(e.ranking, b.benchmarks, "overall");
  const recent = (overall.length ? overall : score).slice(-3);
  const trend = recent.length
    ? recent.map((p) => `${p.year}: ${p.label ?? (p.value !== undefined ? pts(p.value) : "—")}`).join(" → ")
    : "No published results recorded yet.";
  const ranks = overall.map((p) => rankNumber(p.label)).filter((x): x is number => x !== null);
  const direction = ranks.length >= 2 ? (ranks[ranks.length - 1] < ranks[0] ? "improving" : ranks[ranks.length - 1] > ranks[0] ? "declining" : "steady") : null;
  const gaps = gapMatrix(e.ranking, b.benchmarks, b.peerBand, catalog);
  const share = (g: (typeof report.groups)[number]) => (g.points && g.points.max ? g.points.claimed / g.points.max : 0);
  const scored = report.groups.filter((g) => g.points && g.points.max > 0);
  const strong = [...scored].sort((a, c) => share(c) - share(a)).slice(0, 3);
  const weak = [...scored].sort((a, c) => share(a) - share(c)).slice(0, 3);
  const overdue = b.standings.filter((s) => s.overdue > 0);
  const errors = report.issues.filter((i) => i.level === "error");
  const atRisk = b.actions.filter((a) => a.status === "At risk");
  const unowned = catalog.indicators.filter((i) => !i.owners.length && i.input.type !== "none" && i.input.type !== "result");
  const lost = report.groups.reduce((s, g) => s + (g.points?.lost ?? 0), 0);

  return [
    `# ${b.title}`,
    `${e.label} · prepared ${b.today}`,
    "",
    "## Current position",
    `- ${t.label}: ${pts(t.claimed)} claimed, ${pts(t.secured)} secured, of ${pts(t.max)}${t.open ? ` (${pts(t.open)} not yet computable)` : ""}.`,
    `- Readiness: ${r1(report.readiness)}%. ${report.counts.validated} of ${report.counts.indicators} indicators validated.`,
    ...(t.note ? [`- ${t.note}`] : []),
    "",
    "## Three-year trend",
    `- ${trend}${direction ? ` (${direction})` : ""}`,
    "",
    "## Peer benchmark",
    gaps.length
      ? list(
          gaps.slice(0, 6).map((g) => {
            const parts = (Object.entries(g.gaps) as [PeerBand, number][]).map(([band, gap]) => `${gap >= 0 ? "+" : ""}${gap}% vs ${band} median`);
            return `${g.label}: ${g.ownLabel ?? (g.own !== null ? pts(g.own) : "—")}${parts.length ? ` (${parts.join("; ")})` : ""}`;
          }),
          "",
        )
      : "- No peer figures recorded yet.",
    "",
    "## Strengths",
    list(strong.map((g) => `${g.name}: ${Math.round(share(g) * 100)}% of its points claimed`), "Not enough data yet."),
    "",
    "## Weaknesses",
    list(weak.map((g) => `${g.name}: ${Math.round(share(g) * 100)}% of its points claimed`), "Not enough data yet."),
    "",
    "## Strategic risks",
    list(
      [
        ...(overdue.length ? [`${overdue.length} ${overdue.length === 1 ? "unit is" : "units are"} overdue: ${overdue.slice(0, 5).map((s) => b.unitName(s.unit)).join(", ")}`] : []),
        ...(errors.length ? [`${errors.length} data ${errors.length === 1 ? "error" : "errors"} to correct before submission`] : []),
        ...(lost > 0 ? [`${pts(lost)} points cannot be earned with the current answers`] : []),
        ...atRisk.map((a) => `Action at risk: ${a.action}`),
      ],
      "None recorded.",
    ),
    "",
    "## Opportunities",
    list(report.fixes.slice(0, 5).map((f) => `${f.title} (+${pts(f.gain)})`), "No open fixes."),
    "",
    "## Decisions required",
    list(
      [
        ...(unowned.length ? [`Assign a lead office for ${unowned.length} ${unowned.length === 1 ? "indicator" : "indicators"} with none`] : []),
        ...(report.fixes.some((f) => f.kind === "public") ? ["Approve publishing the evidence that is still private"] : []),
        ...(overdue.length ? ["Direct the overdue units to submit"] : []),
      ],
      "None at this time.",
    ),
    "",
    "## Timeline",
    list(
      [
        ...(e.closesOn ? [`${e.label} data collection closes ${e.closesOn}`] : []),
        ...b.campaignsDue.map((c) => `${c.title}: due ${c.due}`),
        ...b.actions.filter((a) => a.due && a.status !== "Complete").map((a) => `${a.action}: due ${a.due}`),
      ],
      "No dates recorded.",
    ),
    "",
  ].join("\n");
}

/**
 * Rows as CSV, every field quoted. Text a spreadsheet would read as a formula (starting = + - @, a tab or a return)
 * is prefixed with ' so it stays text; numbers stay numbers.
 */
export function csv(rows: (string | number | null | undefined)[][]): string {
  const cell = (c: string | number | null | undefined) => {
    const s = c === null || c === undefined ? "" : String(c);
    const safe = typeof c === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}
