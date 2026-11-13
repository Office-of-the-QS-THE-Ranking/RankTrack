import "server-only";

/*
 * The analytics tables as the engine's types (supabase/migrations/20261101200000_analytics_engine.sql). Reads page
 * through PostgREST's row limit, so an edition with thousands of values reads whole. Only the service role reaches
 * these tables; who may see or change what is decided by the callers (desk.ts, app/actions/analytics.ts).
 */
import type { Json } from "@/lib/supabase/database.types";
import { adminDb } from "@/lib/supabase/server";
import type { Profile } from "../templates";
import type {
  ActionRow,
  Activity,
  Benchmark,
  Campaign,
  Case,
  Catalog,
  CatalogIndicator,
  Edition,
  Group,
  LinkRow,
  Peer,
  Review,
  Snapshot,
  ValueRow,
} from "../types";

const PAGE = 1000;

/** Every row a query returns, a page at a time. `make` builds the query afresh for each page. */
export async function all<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const json = <T>(v: Json | null | undefined, fallback: T): T => (v === null || v === undefined ? fallback : (v as unknown as T));

/* ---------- Catalog ---------- */

type EditionRow = {
  id: string;
  ranking_slug: string;
  year: number;
  label: string;
  methodology: string;
  period: string;
  status: string;
  scale: number;
  aggregate: string;
  options: Json;
  sources: string[];
  notes: string;
  opens_on: string | null;
  closes_on: string | null;
  years: number[];
  updated_by: string;
  updated_at: string;
};

export const editionOf = (r: EditionRow): Edition => ({
  id: r.id,
  ranking: r.ranking_slug,
  year: r.year,
  label: r.label,
  methodology: r.methodology,
  period: r.period,
  status: r.status as Edition["status"],
  scale: Number(r.scale),
  aggregate: r.aggregate as Edition["aggregate"],
  options: json(r.options, {}),
  sources: r.sources ?? [],
  notes: r.notes,
  ...(r.opens_on && { opensOn: r.opens_on }),
  ...(r.closes_on && { closesOn: r.closes_on }),
  ...(r.years?.length && { years: r.years }),
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
});

export const editionRow = (e: Omit<Edition, "updatedAt" | "updatedBy">, by: string) => ({
  id: e.id,
  ranking_slug: e.ranking,
  year: e.year,
  label: e.label,
  methodology: e.methodology,
  period: e.period,
  status: e.status,
  scale: e.scale,
  aggregate: e.aggregate,
  options: e.options as unknown as Json,
  sources: e.sources,
  notes: e.notes,
  opens_on: e.opensOn ?? null,
  closes_on: e.closesOn ?? null,
  years: e.years ?? [],
  updated_by: by,
  updated_at: new Date().toISOString(),
});

type GroupRow = { edition_id: string; code: string; position: number; name: string; points: number | null; weight: number | null; mandatory: boolean };
const groupOf = (r: GroupRow): Group => ({ code: r.code, position: r.position, name: r.name, points: r.points === null ? null : Number(r.points), weight: r.weight === null ? null : Number(r.weight), mandatory: r.mandatory });

type IndicatorRow = {
  edition_id: string;
  code: string;
  position: number;
  group_code: string;
  parent_code: string | null;
  ref: string | null;
  name: string;
  guidance: string;
  unit: string | null;
  input: Json;
  score: Json | null;
  evidence: Json;
  owners: string[];
  owner_labels: string[];
  rollup: string;
  feeds: Json | null;
  tags: string[];
};

const indicatorOf = (r: IndicatorRow): CatalogIndicator => ({
  code: r.code,
  position: r.position,
  group: r.group_code,
  parent: r.parent_code,
  ref: r.ref,
  name: r.name,
  guidance: r.guidance,
  unit: r.unit,
  input: json(r.input, { type: "none" }),
  score: json(r.score, null),
  evidence: json(r.evidence, {}),
  owners: r.owners ?? [],
  ownerLabels: r.owner_labels ?? [],
  rollup: r.rollup as CatalogIndicator["rollup"],
  feeds: json(r.feeds, null),
  tags: r.tags ?? [],
});

export const indicatorRow = (edition: string, i: CatalogIndicator) => ({
  edition_id: edition,
  code: i.code,
  position: i.position,
  group_code: i.group,
  parent_code: i.parent,
  ref: i.ref,
  name: i.name,
  guidance: i.guidance,
  unit: i.unit,
  input: i.input as unknown as Json,
  score: (i.score ?? null) as unknown as Json,
  evidence: i.evidence as unknown as Json,
  owners: i.owners,
  owner_labels: i.ownerLabels,
  rollup: i.rollup,
  feeds: (i.feeds ?? null) as unknown as Json,
  tags: i.tags,
});

export const groupRow = (edition: string, g: Group) => ({ edition_id: edition, code: g.code, position: g.position, name: g.name, points: g.points, weight: g.weight, mandatory: g.mandatory });

export async function readEditions(): Promise<Edition[]> {
  const rows = await all((a, b) => adminDb().from("analytics_editions").select("*").order("ranking_slug").order("year", { ascending: false }).range(a, b));
  return rows.map((r) => editionOf(r as EditionRow));
}

/** Every edition's catalog, in one read of each table. */
export async function readCatalogs(): Promise<Catalog[]> {
  const [editions, groups, indicators] = await Promise.all([
    readEditions(),
    all((a, b) => adminDb().from("analytics_groups").select("*").order("edition_id").order("position").range(a, b)),
    all((a, b) => adminDb().from("analytics_indicators").select("*").order("edition_id").order("position").range(a, b)),
  ]);
  const gBy = new Map<string, Group[]>();
  for (const g of groups as GroupRow[]) gBy.set(g.edition_id, [...(gBy.get(g.edition_id) ?? []), groupOf(g)]);
  const iBy = new Map<string, CatalogIndicator[]>();
  for (const i of indicators as IndicatorRow[]) iBy.set(i.edition_id, [...(iBy.get(i.edition_id) ?? []), indicatorOf(i)]);
  return editions.map((edition) => ({ edition, groups: gBy.get(edition.id) ?? [], indicators: iBy.get(edition.id) ?? [] }));
}

/* ---------- Facts ---------- */

type ValueDbRow = {
  id: string;
  edition_id: string;
  indicator_code: string;
  unit_id: string;
  value: Json;
  note: string;
  source: string;
  source_ref: string | null;
  status: string;
  entered_by: string;
  entered_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export const valueOf = (r: ValueDbRow): ValueRow => ({
  id: r.id,
  edition: r.edition_id,
  code: r.indicator_code,
  unit: r.unit_id,
  value: json(r.value, {}),
  note: r.note,
  source: r.source as ValueRow["source"],
  ...(r.source_ref && { sourceRef: r.source_ref }),
  status: r.status as ValueRow["status"],
  by: r.entered_by,
  at: r.entered_at,
  ...(r.reviewed_by && { reviewedBy: r.reviewed_by }),
  ...(r.reviewed_at && { reviewedAt: r.reviewed_at }),
  ...(r.review_note && { reviewNote: r.review_note }),
});

type LinkDbRow = {
  id: string;
  edition_id: string;
  indicator_code: string;
  unit_id: string;
  evidence_id: string | null;
  url: string | null;
  label: string;
  year: number | null;
  relevance: string | null;
  public: boolean | null;
  self_contained: boolean | null;
  assessed_by: string | null;
  assessed_at: string | null;
  added_by: string;
  added_at: string;
};

export const linkOf = (r: LinkDbRow): LinkRow => ({
  id: r.id,
  edition: r.edition_id,
  code: r.indicator_code,
  unit: r.unit_id,
  ...(r.evidence_id && { evidenceId: r.evidence_id }),
  ...(r.url && { url: r.url }),
  label: r.label,
  ...(r.year !== null && { year: r.year }),
  ...(r.relevance && { relevance: r.relevance as LinkRow["relevance"] }),
  ...(r.public !== null && { public: r.public }),
  ...(r.self_contained !== null && { selfContained: r.self_contained }),
  ...(r.assessed_by && { assessedBy: r.assessed_by }),
  ...(r.assessed_at && { assessedAt: r.assessed_at }),
  by: r.added_by,
  at: r.added_at,
});

type ActivityRow = {
  id: string;
  unit_id: string | null;
  unit_label: string;
  kind: string;
  academic_year: string;
  title: string;
  proponent: string;
  community: string;
  proposal_ref: string | null;
  report_ref: string | null;
  reported: boolean;
  sdgs: number[];
  beneficiaries: number | null;
  partner: string;
  mou: string | null;
  starts_on: string | null;
  ends_on: string | null;
  tags: string[];
  source: string;
  source_ref: string | null;
  added_by: string;
  added_at: string;
};

export const activityOf = (r: ActivityRow): Activity => ({
  id: r.id,
  ...(r.unit_id && { unit: r.unit_id }),
  unitLabel: r.unit_label,
  kind: r.kind as Activity["kind"],
  year: r.academic_year,
  title: r.title,
  proponent: r.proponent,
  community: r.community,
  ...(r.proposal_ref && { proposalRef: r.proposal_ref }),
  ...(r.report_ref && { reportRef: r.report_ref }),
  reported: r.reported,
  sdgs: r.sdgs ?? [],
  ...(r.beneficiaries !== null && { beneficiaries: r.beneficiaries }),
  partner: r.partner,
  ...(r.mou && { mou: r.mou }),
  ...(r.starts_on && { startsOn: r.starts_on }),
  ...(r.ends_on && { endsOn: r.ends_on }),
  tags: r.tags ?? [],
  source: r.source as Activity["source"],
  ...(r.source_ref && { sourceRef: r.source_ref }),
  by: r.added_by,
  at: r.added_at,
});

type BenchmarkRow = { id: string; ranking_slug: string; year: number; peer_id: string; metric: string; value: number | null; label: string | null; source: string; note: string | null; entered_by: string; entered_at: string };
export const benchmarkOf = (r: BenchmarkRow): Benchmark => ({
  id: r.id,
  ranking: r.ranking_slug,
  year: r.year,
  peer: r.peer_id,
  metric: r.metric,
  ...(r.value !== null && { value: Number(r.value) }),
  ...(r.label && { label: r.label }),
  source: r.source as Benchmark["source"],
  ...(r.note && { note: r.note }),
  by: r.entered_by,
  at: r.entered_at,
});

type PeerRow = { id: string; name: string; country: string; band: string };
export const peerOf = (r: PeerRow): Peer => ({ id: r.id, name: r.name, country: r.country, band: r.band as Peer["band"] });

type CaseRow = { id: string; edition_id: string; category: string; title: string; unit_id: string | null; abstract: string; source: string; source_ref: string | null; checks: Json; added_by: string; added_at: string };
export const caseOf = (r: CaseRow): Case => ({
  id: r.id,
  edition: r.edition_id,
  category: r.category,
  title: r.title,
  ...(r.unit_id && { unit: r.unit_id }),
  abstract: r.abstract,
  source: r.source as Case["source"],
  ...(r.source_ref && { sourceRef: r.source_ref }),
  checks: json(r.checks, []),
  by: r.added_by,
  at: r.added_at,
});

type ReviewRow = { id: string; case_id: string; reviewer_id: string; scores: Json; total: number; note: string; at: string };
export const reviewOf = (r: ReviewRow): Review => ({ id: r.id, caseId: r.case_id, reviewer: r.reviewer_id, scores: json(r.scores, {}), total: Number(r.total), note: r.note, at: r.at });

export interface EditionFacts {
  values: ValueRow[];
  links: LinkRow[];
  cases: Case[];
  reviews: Review[];
}

/** Values, links, cases and reviews for some editions. */
export async function readEditionFacts(editions: string[]): Promise<EditionFacts> {
  if (!editions.length) return { values: [], links: [], cases: [], reviews: [] };
  const [values, links, cases] = await Promise.all([
    all((a, b) => adminDb().from("analytics_values").select("*").in("edition_id", editions).order("entered_at").range(a, b)),
    all((a, b) => adminDb().from("analytics_links").select("*").in("edition_id", editions).order("added_at").range(a, b)),
    all((a, b) => adminDb().from("analytics_cases").select("*").in("edition_id", editions).order("added_at").range(a, b)),
  ]);
  const caseIds = (cases as CaseRow[]).map((c) => c.id);
  const reviews = caseIds.length ? await all((a, b) => adminDb().from("analytics_reviews").select("*").in("case_id", caseIds).range(a, b)) : [];
  return {
    values: (values as ValueDbRow[]).map(valueOf),
    links: (links as LinkDbRow[]).map(linkOf),
    cases: (cases as CaseRow[]).map(caseOf),
    reviews: (reviews as ReviewRow[]).map(reviewOf),
  };
}

export async function readActivities(years?: string[]): Promise<Activity[]> {
  const rows = await all((a, b) => {
    let q = adminDb().from("analytics_activities").select("*");
    if (years?.length) q = q.in("academic_year", years);
    return q.order("academic_year", { ascending: false }).order("title").range(a, b);
  });
  return (rows as ActivityRow[]).map(activityOf);
}

export async function readBenchmarks(rankings?: string[]): Promise<{ benchmarks: Benchmark[]; peers: Peer[] }> {
  const [b, p] = await Promise.all([
    all((x, y) => {
      let q = adminDb().from("analytics_benchmarks").select("*");
      if (rankings?.length) q = q.in("ranking_slug", rankings);
      return q.order("year").range(x, y);
    }),
    all((x, y) => adminDb().from("analytics_peers").select("id, name, country, band").order("name").range(x, y)),
  ]);
  return { benchmarks: (b as BenchmarkRow[]).map(benchmarkOf), peers: (p as PeerRow[]).map(peerOf) };
}

/** The totals of the newest upload of each template profile (feeds read these). */
export async function readTemplateTotals(): Promise<Record<string, Record<string, number>>> {
  const rows = await all((a, b) => adminDb().from("analytics_imports").select("profile, totals, at").eq("kind", "template").order("at", { ascending: false }).range(a, b));
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows as { profile: string | null; totals: Json | null }[]) if (r.profile && !out[r.profile] && r.totals) out[r.profile] = json(r.totals, {});
  return out;
}

/* ---------- Requests, outputs, imports ---------- */

type CampaignRow = { id: string; code: string; edition_id: string; title: string; memo: string; message: string; due: string; status: string; remind_days: number; escalate_days: number; opened_by: string; opened_at: string; closed_at: string | null };
type CampaignUnitRow = { campaign_id: string; unit_id: string; codes: string[]; reminded_at: string | null; reminders: number; escalated_at: string | null; thanked_at: string | null };

export async function readCampaigns(): Promise<Campaign[]> {
  const [cs, us] = await Promise.all([
    all((a, b) => adminDb().from("analytics_campaigns").select("*").order("opened_at", { ascending: false }).range(a, b)),
    all((a, b) => adminDb().from("analytics_campaign_units").select("*").range(a, b)),
  ]);
  const byCampaign = new Map<string, CampaignUnitRow[]>();
  for (const u of us as CampaignUnitRow[]) byCampaign.set(u.campaign_id, [...(byCampaign.get(u.campaign_id) ?? []), u]);
  return (cs as CampaignRow[]).map((c) => ({
    id: c.id,
    code: c.code,
    edition: c.edition_id,
    title: c.title,
    memo: c.memo,
    message: c.message,
    due: c.due,
    status: c.status as Campaign["status"],
    remindDays: c.remind_days,
    escalateDays: c.escalate_days,
    by: c.opened_by,
    at: c.opened_at,
    ...(c.closed_at && { closedAt: c.closed_at }),
    units: (byCampaign.get(c.id) ?? []).map((u) => ({
      unit: u.unit_id,
      codes: u.codes ?? [],
      ...(u.reminded_at && { remindedAt: u.reminded_at }),
      reminders: u.reminders,
      ...(u.escalated_at && { escalatedAt: u.escalated_at }),
      ...(u.thanked_at && { thankedAt: u.thanked_at }),
    })),
  }));
}

type ActionDbRow = { id: string; edition_id: string; indicator_code: string | null; action: string; owner_unit: string | null; due: string | null; status: string; progress: number; note: string; updated_by: string; updated_at: string };
export async function readActions(editions?: string[]): Promise<ActionRow[]> {
  const rows = await all((a, b) => {
    let q = adminDb().from("analytics_actions").select("*");
    if (editions?.length) q = q.in("edition_id", editions);
    return q.order("updated_at", { ascending: false }).range(a, b);
  });
  return (rows as ActionDbRow[]).map((r) => ({
    id: r.id,
    edition: r.edition_id,
    ...(r.indicator_code && { code: r.indicator_code }),
    action: r.action,
    ...(r.owner_unit && { owner: r.owner_unit }),
    ...(r.due && { due: r.due }),
    status: r.status as ActionRow["status"],
    progress: r.progress,
    note: r.note,
    by: r.updated_by,
    at: r.updated_at,
  }));
}

type SnapshotRow = { id: string; edition_id: string; at: string; by: string; kind: string; summary: Json };
export async function readSnapshots(editions?: string[]): Promise<Snapshot[]> {
  const rows = await all((a, b) => {
    let q = adminDb().from("analytics_snapshots").select("*");
    if (editions?.length) q = q.in("edition_id", editions);
    return q.order("at", { ascending: false }).range(a, b);
  });
  return (rows as SnapshotRow[]).map((r) => ({ id: r.id, edition: r.edition_id, at: r.at, by: r.by, kind: r.kind as Snapshot["kind"], summary: json(r.summary, { readiness: 0, total: { secured: 0, claimed: 0, open: 0, max: 0 }, groups: [], counts: { indicators: 0, scored: 0, withValue: 0, validated: 0, links: 0, revisions: 0 } }) }));
}

type ProfileRow = { key: string; position: number; name: string; owner_unit: string | null; description: string; spec: Json; updated_at: string };
export async function readProfiles(): Promise<Profile[]> {
  const rows = await all((a, b) => adminDb().from("analytics_profiles").select("*").order("position").range(a, b));
  return (rows as ProfileRow[]).map((r) => {
    const spec = json<Partial<Profile>>(r.spec, {});
    return {
      key: r.key,
      name: r.name,
      ...(r.owner_unit && { owner: r.owner_unit }),
      description: r.description,
      kind: spec.kind === "pairs" ? "pairs" : "rows",
      headers: spec.headers ?? [],
      ...(spec.skip?.length && { skip: spec.skip }),
      measures: spec.measures ?? [],
      dimensions: spec.dimensions ?? [],
      minCell: spec.minCell ?? 5,
      ...(spec.pairs?.length && { pairs: spec.pairs }),
    };
  });
}

export async function readAliases(): Promise<Record<string, string>> {
  const rows = await all((a, b) => adminDb().from("analytics_aliases").select("alias, unit_id").range(a, b));
  return Object.fromEntries((rows as { alias: string; unit_id: string }[]).map((r) => [r.alias, r.unit_id]));
}

export interface ImportRow {
  id: string;
  kind: string;
  profile: string | null;
  fileName: string;
  sha256: string;
  bytes: number;
  rows: number;
  edition: string | null;
  unit: string | null;
  year: string | null;
  summary: Record<string, unknown>;
  totals: Record<string, number> | null;
  breakdowns: unknown[] | null;
  by: string;
  at: string;
}

export async function readImports(limit = 200): Promise<ImportRow[]> {
  const { data, error } = await adminDb().from("analytics_imports").select("*").order("at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    profile: r.profile,
    fileName: r.file_name,
    sha256: r.sha256,
    bytes: r.bytes,
    rows: r.rows,
    edition: r.edition_id,
    unit: r.unit_id,
    year: r.academic_year,
    summary: json(r.summary, {}),
    totals: json(r.totals, null),
    breakdowns: json(r.breakdowns, null),
    by: r.by,
    at: r.at,
  }));
}
