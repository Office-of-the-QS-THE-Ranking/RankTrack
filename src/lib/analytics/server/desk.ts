import "server-only";

/*
 * Each analytics page's data (desk-types.ts), built for one viewer: the Office's pages need rankings: view, and what
 * they offer follows rankings: edit (the University's figures, evidence, results), data: approve (validating units'
 * values) and rankings: manage (methodologies, campaigns, imports). A unit's Data requests page shows only that
 * unit's requests, and only someone who may submit its data can send them.
 */
import { directorySection } from "@/lib/governance/directory";
import { evidenceList } from "@/lib/governance/records";
import { reference } from "@/lib/governance/server/reference";
import { readState } from "@/lib/governance/server/store";
import type { GovernanceState } from "@/lib/governance/types";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { familyOf, type Reference } from "@/lib/reference";
import { baseline, movement, summarize } from "../brief";
import type {
  ActivitiesDesk,
  BenchmarksDesk,
  CampaignCard,
  Can,
  CollectionDesk,
  ContributionView,
  EditionCard,
  EditionRef,
  ImportsDesk,
  IndicatorView,
  IndicatorsDesk,
  LinkView,
  MethodologyDesk,
  RequestsDesk,
  ScorecardDesk,
  UnitRef,
} from "../desk-types";
import { refsOf } from "../expr";
import { valueText } from "../format";
import { gapMatrix, metricLabel } from "../gap";
import { isDriveLink, isFolderLink } from "../links";
import type { Campaign, Catalog, CatalogIndicator, Edition, EditionReport, Facts, LinkRow, ValueRow } from "../types";
import { OWN, UNIVERSITY } from "../types";
import { unitStandings } from "../units";
import { readActions, readActivities, readAliases, readBenchmarks, readCampaigns, readEditionFacts, readImports, readProfiles, readSnapshots } from "./db";
import { bundleFor, catalogs, reportFor } from "./load";

export const canOf = (viewer: Viewer): Can => ({
  view: viewerCan(viewer, "rankings", "view"),
  edit: viewerCan(viewer, "rankings", "edit"),
  validate: viewerCan(viewer, "data", "approve"),
  manage: viewerCan(viewer, "rankings", "manage"),
  export: viewerCan(viewer, "rankings", "export"),
});

interface Ctx {
  state: GovernanceState;
  ref: Reference;
  evidence: Map<string, { title: string }>;
  units: UnitRef[];
  unitName: (id: string) => string;
  person: (id: string) => string;
}

async function context(): Promise<Ctx> {
  const [state, ref] = await Promise.all([readState(), reference()]);
  const units = state.units
    .filter((u) => u.status === "Active" && u.kind !== "University")
    .map((u) => ({ id: u.id, name: u.name, code: u.code }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const names = new Map(state.units.map((u) => [u.id, u.name]));
  const people = new Map(state.accounts.map((a) => [a.id, a.name]));
  return {
    state,
    ref,
    evidence: new Map(evidenceList(state).map((e) => [e.id, { title: e.title }])),
    units,
    unitName: (id) => (id === UNIVERSITY ? "University" : (names.get(id) ?? id)),
    person: (id) => (id === "system" ? "Hub" : (people.get(id) ?? "Former account")),
  };
}

export function editionRef(e: Edition, ref: Reference): EditionRef {
  const r = ref.rankings.find((x) => x.slug === e.ranking);
  return {
    id: e.id,
    ranking: e.ranking,
    rankingShort: r?.short ?? e.ranking,
    color: r ? familyOf(ref, r.family).color : "#6b7280",
    label: e.label,
    year: e.year,
    status: e.status,
    aggregate: e.aggregate,
    scale: e.scale,
    period: e.period,
    methodology: e.methodology,
    ...(e.closesOn && { closesOn: e.closesOn }),
    ...(e.opensOn && { opensOn: e.opensOn }),
    years: e.years ?? [],
    notes: e.notes,
  };
}

const STATUS_ORDER = { Active: 0, Draft: 1, Closed: 2, Archived: 3 } as const;

/** Editions in the order the pages show them: active first, then by ranking menu order and newest year. */
function ordered(list: Catalog[], ref: Reference) {
  const pos = (slug: string) => {
    const i = ref.rankings.findIndex((r) => r.slug === slug);
    return i < 0 ? 999 : i;
  };
  return [...list].sort((a, b) => STATUS_ORDER[a.edition.status] - STATUS_ORDER[b.edition.status] || pos(a.edition.ranking) - pos(b.edition.ranking) || b.edition.year - a.edition.year);
}

function card(c: Catalog, report: EditionReport, ref: Reference, snapshots: Awaited<ReturnType<typeof readSnapshots>>): EditionCard {
  const mine = snapshots.filter((s) => s.edition === c.edition.id);
  const base = baseline(mine, new Date());
  return {
    ...editionRef(c.edition, ref),
    total: report.total,
    readiness: report.readiness,
    counts: report.counts,
    groups: report.groups.map((g) => ({ code: g.code, name: g.name, claimed: g.points?.claimed ?? 0, secured: g.points?.secured ?? 0, open: g.points?.open ?? 0, max: g.points?.max ?? 0, readiness: g.readiness })),
    fixes: report.fixes.slice(0, 6),
    issues: { errors: report.issues.filter((i) => i.level === "error").length, warnings: report.issues.filter((i) => i.level === "warn").length },
    movement: movement(c, summarize(report), base?.summary ?? null),
    ...(mine[0] && { snapshotAt: mine[0].at }),
  };
}

async function campaignCards(ctx: Ctx, list: Campaign[]): Promise<CampaignCard[]> {
  const today = new Date().toISOString().slice(0, 10);
  const out: CampaignCard[] = [];
  for (const c of list) {
    const [bundle, rep] = await Promise.all([bundleFor(c.edition), reportFor(c.edition)]);
    if (!bundle) continue;
    const standings = unitStandings(c, bundle.facts, rep?.report ?? null, today);
    out.push({
      id: c.id,
      code: c.code,
      edition: c.edition,
      editionLabel: bundle.catalog.edition.label,
      title: c.title,
      memo: c.memo,
      message: c.message,
      due: c.due,
      status: c.status,
      remindDays: c.remindDays,
      escalateDays: c.escalateDays,
      at: c.at,
      by: ctx.person(c.by),
      units: standings.map((s) => {
        const u = c.units.find((x) => x.unit === s.unit)!;
        return { ...s, name: ctx.unitName(s.unit), codes: u.codes, ...(u.remindedAt && { remindedAt: u.remindedAt }), ...(u.escalatedAt && { escalatedAt: u.escalatedAt }), ...(u.thankedAt && { thankedAt: u.thankedAt }) };
      }),
    });
  }
  return out;
}

export async function scorecardDesk(viewer: Viewer): Promise<ScorecardDesk> {
  const ctx = await context();
  const list = ordered((await catalogs()).filter((c) => c.edition.status !== "Archived"), ctx.ref);
  const [snapshots, campaigns, actions] = await Promise.all([readSnapshots(), readCampaigns(), readActions()]);
  const editions: EditionCard[] = [];
  for (const c of list) {
    const r = await reportFor(c.edition.id);
    if (r) editions.push(card(c, r.report, ctx.ref, snapshots));
  }
  const labels = new Map(list.map((c) => [c.edition.id, c.edition.label]));
  return {
    editions,
    campaigns: await campaignCards(ctx, campaigns.filter((c) => c.status === "Open" || Date.now() - Date.parse(c.closedAt ?? c.at) < 60 * 86_400_000)),
    actions: actions.map((a) => ({ ...a, editionLabel: labels.get(a.edition) ?? a.edition, ...(a.owner && { ownerName: ctx.unitName(a.owner) }) })),
    units: ctx.units,
    can: canOf(viewer),
  };
}

function linkView(ctx: Ctx, l: LinkRow): LinkView {
  const rec = l.evidenceId ? ctx.evidence.get(l.evidenceId) : undefined;
  return {
    id: l.id,
    unit: l.unit,
    unitName: ctx.unitName(l.unit),
    ...(l.url && { url: l.url }),
    ...(l.evidenceId && { evidenceId: l.evidenceId }),
    ...(rec && { evidenceTitle: rec.title }),
    label: l.label,
    ...(l.year !== undefined && { year: l.year }),
    ...(l.relevance && { relevance: l.relevance }),
    ...(l.public !== undefined && { public: l.public }),
    ...(l.selfContained !== undefined && { selfContained: l.selfContained }),
    folder: !!l.url && isFolderLink(l.url),
    drive: !!l.url && isDriveLink(l.url),
    ...(l.assessedBy && { assessedBy: ctx.person(l.assessedBy) }),
    ...(l.assessedAt && { assessedAt: l.assessedAt }),
    by: ctx.person(l.by),
    at: l.at,
  };
}

function contribution(ctx: Ctx, ind: CatalogIndicator, v: ValueRow): ContributionView {
  return {
    id: v.id,
    unit: v.unit,
    unitName: ctx.unitName(v.unit),
    value: v.value,
    text: valueText(ind.input, v.value, ind.unit),
    note: v.note,
    status: v.status,
    source: v.source,
    by: ctx.person(v.by),
    at: v.at,
    ...(v.reviewedBy && { reviewedBy: ctx.person(v.reviewedBy) }),
    ...(v.reviewedAt && { reviewedAt: v.reviewedAt }),
    ...(v.reviewNote && { reviewNote: v.reviewNote }),
  };
}

function indicatorView(ctx: Ctx, ind: CatalogIndicator, report: EditionReport, facts: Facts): IndicatorView {
  const r = report.indicators[ind.code];
  const rows = facts.values.filter((v) => v.code === ind.code);
  const office = rows.find((v) => v.unit === UNIVERSITY);
  const rule = ind.score;
  return {
    code: ind.code,
    ref: ind.ref,
    name: ind.name,
    group: ind.group,
    parent: ind.parent,
    guidance: ind.guidance,
    unit: ind.unit,
    input: ind.input,
    rule: rule?.kind ?? null,
    points: r.points,
    max: rule?.points ?? 0,
    evidence: ind.evidence,
    owners: ind.owners.map((id) => ({ id, name: ctx.unitName(id), code: ctx.state.units.find((u) => u.id === id)?.code ?? id })),
    ownerLabels: ind.ownerLabels,
    rollup: ind.rollup,
    tags: ind.tags,
    state: r.state,
    readiness: r.readiness,
    value: r.value,
    valueText: valueText(ind.input, r.value, ind.unit),
    computed: r.computed,
    band: r.band,
    checks: r.checks,
    suggested: r.suggested,
    links: facts.links.filter((l) => l.code === ind.code).map((l) => linkView(ctx, l)),
    office: office ? contribution(ctx, ind, office) : null,
    contributions: rows.filter((v) => v.unit !== UNIVERSITY).map((v) => contribution(ctx, ind, v)),
    ...(r.updatedAt && { updatedAt: r.updatedAt }),
    ...(rule && (rule.kind === "bands" || rule.kind === "ratio") && { formula: rule.expr, reads: refsOf(rule.expr) }),
    ...(rule?.kind === "bands" && { bands: rule.bands.map((b) => ({ label: b.label, share: b.share })) }),
    ...(rule?.kind === "choice" &&
      ind.input.type === "choice" && { shares: ind.input.options.map((o) => ({ key: o.key, label: o.label, share: rule.shares[o.key] ?? 0 })) }),
    ...(rule?.kind === "claim" &&
      rule.existence.shares &&
      (ind.input.type === "picks" || ind.input.type === "choice") && { shares: ind.input.options.map((o) => ({ key: o.key, label: o.label, share: rule.existence.shares![o.key] ?? 0 })) }),
    ...(rule?.kind === "rubric" && { criteria: rule.criteria }),
  };
}

export async function indicatorsDesk(viewer: Viewer, editionId?: string): Promise<IndicatorsDesk | null> {
  const ctx = await context();
  const list = ordered(await catalogs(), ctx.ref);
  const chosen = list.find((c) => c.edition.id === editionId) ?? list.find((c) => c.edition.status === "Active") ?? list[0];
  if (!chosen) return null;
  const r = await reportFor(chosen.edition.id);
  if (!r) return null;
  const { bundle, report } = r;
  const evidence = evidenceList(ctx.state)
    .filter((e) => e.status === "Validated" || e.status === "For review")
    .map((e) => ({ id: e.id, title: e.title, unit: e.unitSlug, unitName: ctx.unitName(e.unitSlug), status: e.status }));
  return {
    edition: editionRef(chosen.edition, ctx.ref),
    editions: list.map((c) => editionRef(c.edition, ctx.ref)),
    groups: report.groups,
    rows: chosen.indicators.map((i) => indicatorView(ctx, i, report, bundle.facts)),
    total: report.total,
    readiness: report.readiness,
    issues: report.issues,
    fixes: report.fixes,
    units: ctx.units,
    evidence,
    cases: bundle.facts.cases.map((c) => {
      const reviews = bundle.facts.reviews.filter((x) => x.caseId === c.id);
      const mine = reviews.find((x) => x.reviewer === viewer.id);
      return {
        ...c,
        ...(c.unit && { unitName: ctx.unitName(c.unit) }),
        reviews: reviews.map((x) => ({ reviewer: x.reviewer, reviewerName: ctx.person(x.reviewer), total: x.total, scores: x.scores, note: x.note, at: x.at })),
        average: reviews.length ? Math.round((reviews.reduce((s, x) => s + x.total, 0) / reviews.length) * 10) / 10 : null,
        ...(mine && { mine: { scores: mine.scores, note: mine.note } }),
      };
    }),
    results: bundle.facts.benchmarks.filter((b) => b.peer === OWN).map((b) => b),
    can: canOf(viewer),
    viewer: viewer.id,
  };
}

export async function collectionDesk(viewer: Viewer): Promise<CollectionDesk> {
  const ctx = await context();
  const list = ordered((await catalogs()).filter((c) => c.edition.status === "Active" || c.edition.status === "Draft"), ctx.ref);
  const campaigns = await readCampaigns();
  return {
    campaigns: await campaignCards(ctx, campaigns),
    editions: list.map((c) => {
      const byUnit = new Map<string, string[]>();
      for (const i of c.indicators) if (i.input.type !== "none" && i.input.type !== "result") for (const u of i.owners) byUnit.set(u, [...(byUnit.get(u) ?? []), i.code]);
      return {
        ...editionRef(c.edition, ctx.ref),
        owners: [...byUnit.entries()].map(([unit, codes]) => ({ unit, codes })).sort((a, b) => ctx.unitName(a.unit).localeCompare(ctx.unitName(b.unit))),
        indicators: c.indicators.filter((i) => i.input.type !== "none" && i.input.type !== "result").map((i) => ({ code: i.code, ref: i.ref, name: i.name, group: i.group, owners: i.owners, ownerLabels: i.ownerLabels })),
      };
    }),
    units: ctx.state.units
      .filter((u) => u.status === "Active" && u.kind !== "University")
      .map((u) => ({ id: u.id, name: u.name, code: u.code, kind: u.kind, section: directorySection(ctx.state.units, u) ?? "offices" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    can: canOf(viewer),
  };
}

export async function activitiesDesk(viewer: Viewer): Promise<ActivitiesDesk> {
  const ctx = await context();
  const [activities, aliases] = await Promise.all([readActivities(), readAliases()]);
  return {
    activities: activities.map((a) => ({ ...a, ...(a.unit && { unitName: ctx.unitName(a.unit) }) })),
    years: [...new Set(activities.map((a) => a.year))].sort().reverse(),
    units: ctx.units,
    aliases,
    can: canOf(viewer),
  };
}

export async function benchmarksDesk(viewer: Viewer): Promise<BenchmarksDesk> {
  const ctx = await context();
  const { benchmarks, peers } = await readBenchmarks();
  const band = new Map(peers.map((p) => [p.id, p.band]));
  const cats = await catalogs();
  const rankings = ctx.ref.rankings.map((r) => ({ slug: r.slug, short: r.short, color: familyOf(ctx.ref, r.family).color }));
  const gaps: BenchmarksDesk["gaps"] = {};
  const metrics: BenchmarksDesk["metrics"] = {};
  for (const r of rankings) {
    const cat = ordered(cats.filter((c) => c.edition.ranking === r.slug), ctx.ref)[0] ?? null;
    gaps[r.slug] = gapMatrix(r.slug, benchmarks, band, cat);
    const keys = new Set(benchmarks.filter((b) => b.ranking === r.slug).map((b) => b.metric));
    metrics[r.slug] = [
      { key: "overall", label: "Overall score" },
      { key: "overall:rank", label: "Overall rank" },
      ...(cat?.groups.map((g) => ({ key: g.code, label: g.name })) ?? []),
      ...(cat?.indicators.filter((i) => i.score && i.score.kind !== "claim").map((i) => ({ key: i.code, label: `${i.ref ?? i.code} ${i.name}` })) ?? []),
      ...[...keys].filter((k) => !["overall", "overall:rank"].includes(k) && !cat?.groups.some((g) => g.code === k) && !cat?.indicators.some((i) => i.code === k)).map((k) => ({ key: k, label: metricLabel(k, cat) })),
    ];
  }
  return { rankings, peers, benchmarks, gaps, metrics, can: canOf(viewer) };
}

export async function importsDesk(viewer: Viewer): Promise<ImportsDesk> {
  const ctx = await context();
  const [profiles, imports, aliases] = await Promise.all([readProfiles(), readImports(), readAliases()]);
  const list = ordered(await catalogs(), ctx.ref);
  return {
    profiles: profiles.map((p) => ({ ...p, ...(p.owner && { ownerName: ctx.unitName(p.owner) }) })),
    imports: imports.map((i) => ({ ...i, ...(i.unit && { unitName: ctx.unitName(i.unit) }), byName: ctx.person(i.by) })),
    editions: list.map((c) => editionRef(c.edition, ctx.ref)),
    units: ctx.units,
    aliases,
    can: canOf(viewer),
  };
}

export async function methodologyDesk(viewer: Viewer, editionId?: string): Promise<MethodologyDesk> {
  const ctx = await context();
  const list = ordered(await catalogs(), ctx.ref);
  const chosen = list.find((c) => c.edition.id === editionId) ?? list[0];
  const facts = await readEditionFacts(list.map((c) => c.edition.id));
  return {
    editions: list.map((c) => {
      const kinds: Record<string, number> = {};
      for (const i of c.indicators) {
        const k = i.score?.kind ?? (i.input.type === "none" ? "computed" : "input");
        kinds[k] = (kinds[k] ?? 0) + 1;
      }
      return {
        ...editionRef(c.edition, ctx.ref),
        groups: c.groups.length,
        indicators: c.indicators.length,
        scored: c.indicators.filter((i) => i.score).length,
        kinds,
        facts: facts.values.filter((v) => v.edition === c.edition.id).length + facts.links.filter((l) => l.edition === c.edition.id).length + facts.cases.filter((x) => x.edition === c.edition.id).length,
      };
    }),
    rankings: ctx.ref.rankings.map((r) => ({ slug: r.slug, short: r.short, color: familyOf(ctx.ref, r.family).color })),
    selected: chosen ? { edition: editionRef(chosen.edition, ctx.ref), groups: chosen.groups, indicators: chosen.indicators } : null,
    units: ctx.units,
    can: canOf(viewer),
  };
}

/** The unit's Data requests: what each open campaign asked of it, what it sent, and its activities. */
export async function requestsDesk(viewer: Viewer): Promise<RequestsDesk> {
  const ctx = await context();
  const unitId = viewer.portal.programId ?? viewer.portal.unitId;
  const campaigns = (await readCampaigns()).filter((c) => c.units.some((u) => u.unit === unitId) && (c.status === "Open" || Date.now() - Date.parse(c.closedAt ?? c.at) < 90 * 86_400_000));
  const cats = await catalogs();
  const items: RequestsDesk["items"] = [];
  const heads: RequestsDesk["campaigns"] = [];
  for (const c of campaigns) {
    const cat = cats.find((x) => x.edition.id === c.edition);
    const bundle = cat ? await bundleFor(c.edition) : null;
    if (!cat || !bundle) continue;
    const codes = c.units.find((u) => u.unit === unitId)!.codes;
    let open = 0;
    for (const code of codes) {
      const ind = cat.indicators.find((i) => i.code === code);
      if (!ind) continue;
      const row = bundle.facts.values.find((v) => v.code === code && v.unit === unitId);
      const links = bundle.facts.links.filter((l) => l.code === code && l.unit === unitId);
      const state: RequestsDesk["items"][number]["state"] = !row
        ? links.length
          ? "Sent"
          : "To do"
        : row.status === "Validated"
          ? "Validated"
          : row.status === "Needs revision"
            ? "Returned"
            : row.status === "Not applicable"
              ? "Not applicable"
              : row.status === "Draft"
                ? "To do"
                : "Sent";
      if (state === "To do" || state === "Returned") open++;
      items.push({
        campaign: c.id,
        edition: c.edition,
        code,
        ref: ind.ref,
        name: ind.name,
        guidance: ind.guidance,
        input: ind.input,
        unit: ind.unit,
        evidence: ind.evidence,
        mine: row ? contribution(ctx, ind, row) : null,
        links: links.map((l) => linkView(ctx, l)),
        state,
      });
    }
    const r = ctx.ref.rankings.find((x) => x.slug === cat.edition.ranking);
    heads.push({ id: c.id, code: c.code, title: c.title, edition: c.edition, editionLabel: cat.edition.label, color: r ? familyOf(ctx.ref, r.family).color : "#6b7280", due: c.due, status: c.status, message: c.message, memo: c.memo, open, total: codes.length });
  }
  const activities = (await readActivities()).filter((a) => a.unit === unitId);
  return {
    unit: { id: unitId, name: ctx.unitName(unitId), code: ctx.state.units.find((u) => u.id === unitId)?.code ?? "" },
    campaigns: heads,
    items,
    activities,
    evidence: evidenceList(ctx.state)
      .filter((e) => e.unitSlug === unitId || e.programId === unitId)
      .map((e) => ({ id: e.id, title: e.title, status: e.status })),
    can: { submit: viewerCan(viewer, "data", "submit", { unitId }) },
  };
}
