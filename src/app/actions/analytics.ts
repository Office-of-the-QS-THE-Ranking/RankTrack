"use server";

/*
 * The analytics engine's changes (docs/analytics-engine.md). Values and evidence links come from two places: the
 * Office enters the University's own figures (rankings: edit), and a unit's Coordinator sends the unit's (data: submit
 * within the unit), never one for the other. The Office validates or returns units' values (data: approve), assesses
 * evidence, records published results and benchmarks, reviews WURI cases, and runs request campaigns (rankings:
 * manage). Every change is checked against the edition's catalog, kept in the value's history, and audited.
 */
import { evidenceList } from "@/lib/governance/records";
import { readState } from "@/lib/governance/server/store";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { summarize } from "@/lib/analytics/brief";
import { cleanUrl } from "@/lib/analytics/links";
import { rubricTotal } from "@/lib/analytics/rules";
import { ACTIVITY_KINDS, PEER_BANDS, PLAN_STATUSES, UNIVERSITY, type ActivityKind, type Catalog, type Relevance, type ValueStatus } from "@/lib/analytics/types";
import { unitStandings } from "@/lib/analytics/units";
import { readValue, enterable, VALUE_LIMITS } from "@/lib/analytics/values";
import { readCampaigns } from "@/lib/analytics/server/db";
import { catalogOf, reportFor } from "@/lib/analytics/server/load";
import { allowed, audit, fail, isViewer, refresh, type Result } from "@/lib/analytics/server/guard";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: unknown): s is string => typeof s === "string" && DAY.test(s) && !Number.isNaN(Date.parse(s));
const text = (s: unknown, max: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, max) : "");
const longText = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const id = (s: unknown) => (typeof s === "string" && /^[0-9a-f-]{36}$/.test(s) ? s : null);

const label = (c: Catalog, code: string) => {
  const i = c.indicators.find((x) => x.code === code);
  return i ? `${i.ref ?? i.code} ${i.name}` : code;
};

/** Whether an edition takes this change: archived ones never; closed ones only from someone who manages methodologies. */
function writable(c: Catalog, viewer: Viewer): string | null {
  if (c.edition.status === "Archived") return "This edition is archived. Reopen it on the Methodology page first.";
  if (c.edition.status === "Closed" && !viewerCan(viewer, "rankings", "manage")) return "This edition is closed.";
  return null;
}

async function unitName(unit: string) {
  if (unit === UNIVERSITY) return "University";
  return (await readState()).units.find((u) => u.id === unit)?.name ?? unit;
}

async function unitExists(unit: string) {
  return (await readState()).units.some((u) => u.id === unit && u.status === "Active" && u.kind !== "University");
}

async function history(valueId: string, by: string, action: string, value: unknown, status: string, note = "") {
  const { error } = await adminDb().from("analytics_value_history").insert({ value_id: valueId, by, action, value: value as Json, status, note: note.slice(0, 2000) });
  if (error) console.error(`Analytics history: ${error.message}`);
}

/** Who may write a value for `unit`: the Office for the University's own figure, the unit's Coordinator for the unit's. */
const rightFor = (unit: string): ["rankings", "edit"] | ["data", "submit"] => (unit === UNIVERSITY ? ["rankings", "edit"] : ["data", "submit"]);

/* ---------- Values ---------- */

export async function saveValue(input: { edition: string; code: string; unit?: string; value: unknown; note?: string; draft?: boolean; notApplicable?: boolean }): Promise<Result> {
  const unit = typeof input?.unit === "string" ? input.unit : UNIVERSITY;
  const viewer = await allowed(rightFor(unit), unit || undefined);
  if (!isViewer(viewer)) return viewer;
  const catalog = await catalogOf(String(input.edition));
  if (!catalog) return fail("That edition is no longer here. Reload the page.");
  const closed = writable(catalog, viewer);
  if (closed) return fail(closed);
  const ind = catalog.indicators.find((i) => i.code === input.code);
  if (!ind || !enterable(ind)) return fail("That indicator doesn’t take a value.");
  if (unit !== UNIVERSITY && !(await unitExists(unit))) return fail("That unit isn’t in the Directory.");
  const note = longText(input.note, VALUE_LIMITS.note);
  let value: object;
  let status: ValueStatus;
  if (input.notApplicable) {
    value = {};
    status = "Not applicable";
  } else {
    const v = readValue(ind, input.value);
    if (typeof v === "string") return fail(v);
    value = v;
    status = input.draft ? "Draft" : "For review";
  }
  const db = adminDb();
  const { data: before } = await db.from("analytics_values").select("id, status, value").eq("edition_id", catalog.edition.id).eq("indicator_code", ind.code).eq("unit_id", unit).maybeSingle();
  const { data, error } = await db
    .from("analytics_values")
    .upsert(
      { edition_id: catalog.edition.id, indicator_code: ind.code, unit_id: unit, value: value as Json, note, source: unit === UNIVERSITY ? "manual" : "portal", status, entered_by: viewer.id, entered_at: new Date().toISOString(), reviewed_by: null, reviewed_at: null, review_note: null },
      { onConflict: "edition_id,indicator_code,unit_id" },
    )
    .select("id")
    .single();
  if (error || !data) return fail("The value couldn’t be saved. Try again in a moment.");
  await history(data.id, viewer.id, input.notApplicable ? "not-applicable" : before ? "changed" : "entered", value, status, note);
  const who = await unitName(unit);
  const notices =
    unit !== UNIVERSITY && status === "For review"
      ? [{ to: "office", template: "tpl-data-sent", vars: { unit: who, indicator: label(catalog, ind.code), ranking: catalog.edition.label }, href: `/admin/rankings/${catalog.edition.ranking}?edition=${catalog.edition.id}&code=${encodeURIComponent(ind.code)}#indicators` }]
      : [];
  await audit(viewer, "analytics.value", { type: "Indicator value", id: `${catalog.edition.id}:${ind.code}:${unit || "university"}`, label: `${label(catalog, ind.code)} · ${who}` }, `${status}${before ? ` (was ${before.status})` : ""}`, notices);
  if (unit !== UNIVERSITY && status === "For review") await thankIfDone(viewer, catalog, unit);
  refresh();
  return { ok: true, message: status === "Draft" ? "Draft saved." : status === "Not applicable" ? "Marked not applicable." : unit === UNIVERSITY ? "Saved." : "Sent to the Office." };
}

/** Once a unit has sent everything an open campaign asked of it, thank it (once). */
async function thankIfDone(viewer: Viewer, catalog: Catalog, unit: string) {
  const db = adminDb();
  for (const c of (await readCampaigns()).filter((x) => x.edition === catalog.edition.id && x.status === "Open")) {
    const u = c.units.find((x) => x.unit === unit);
    if (!u || u.thankedAt) continue;
    const [{ data: vals }, { data: links }] = await Promise.all([
      db.from("analytics_values").select("indicator_code, status").eq("edition_id", c.edition).eq("unit_id", unit).in("indicator_code", u.codes),
      db.from("analytics_links").select("indicator_code").eq("edition_id", c.edition).eq("unit_id", unit).in("indicator_code", u.codes),
    ]);
    const sent = new Set([...(vals ?? []).filter((v) => v.status !== "Draft").map((v) => v.indicator_code), ...(links ?? []).map((l) => l.indicator_code)]);
    if (!u.codes.every((code) => sent.has(code))) continue;
    await db.from("analytics_campaign_units").update({ thanked_at: new Date().toISOString() }).eq("campaign_id", c.id).eq("unit_id", unit);
    await audit(viewer, "analytics.campaign.thanks", { type: "Data request", id: c.code, label: c.title }, `${await unitName(unit)} sent all ${u.codes.length} items`, [
      { to: `unit:${unit}`, template: "tpl-data-thanks", vars: { unit: await unitName(unit), ranking: catalog.edition.label }, href: "/portal/requests" },
    ]);
  }
}

export async function reviewValue(input: { id: string; decision: "validate" | "return" | "reopen" | "na"; note?: string }): Promise<Result> {
  const viewer = await allowed(["data", "approve"]);
  if (!isViewer(viewer)) return viewer;
  const valueId = id(input?.id);
  if (!valueId) return fail("That value is no longer here. Reload the page.");
  const db = adminDb();
  const { data: row } = await db.from("analytics_values").select("*").eq("id", valueId).maybeSingle();
  if (!row) return fail("That value is no longer here. Reload the page.");
  const catalog = await catalogOf(row.edition_id);
  if (!catalog) return fail("That edition is no longer here.");
  const closed = writable(catalog, viewer);
  if (closed) return fail(closed);
  const note = longText(input.note, VALUE_LIMITS.note);
  if (input.decision === "return" && !note) return fail("Say what needs changing.");
  const status: ValueStatus = input.decision === "validate" ? "Validated" : input.decision === "return" ? "Needs revision" : input.decision === "na" ? "Not applicable" : "For review";
  const { error } = await db
    .from("analytics_values")
    .update({ status, reviewed_by: viewer.id, reviewed_at: new Date().toISOString(), review_note: note || null })
    .eq("id", valueId);
  if (error) return fail("The decision couldn’t be saved. Try again in a moment.");
  const action = input.decision === "validate" ? "validated" : input.decision === "return" ? "returned" : input.decision === "na" ? "not-applicable" : "reopened";
  await history(valueId, viewer.id, action, row.value, status, note);
  const who = await unitName(row.unit_id);
  const notices =
    input.decision === "return" && row.unit_id !== UNIVERSITY
      ? [{ to: `unit:${row.unit_id}`, template: "tpl-data-returned", vars: { indicator: label(catalog, row.indicator_code), ranking: catalog.edition.label, comment: note }, href: "/portal/requests" }]
      : [];
  await audit(viewer, `analytics.value.${input.decision}`, { type: "Indicator value", id: `${row.edition_id}:${row.indicator_code}:${row.unit_id || "university"}`, label: `${label(catalog, row.indicator_code)} · ${who}` }, `${status}${row.entered_by === viewer.id ? " (own entry)" : ""}${note ? `: ${note}` : ""}`, notices);
  refresh();
  return { ok: true, message: input.decision === "validate" ? "Validated." : input.decision === "return" ? "Returned to the unit." : input.decision === "na" ? "Marked not applicable." : "Reopened." };
}

/* ---------- Evidence links ---------- */

export async function addLink(input: { edition: string; code: string; unit?: string; url?: string; evidenceId?: string; label?: string; year?: number; public?: boolean }): Promise<Result> {
  const unit = typeof input?.unit === "string" ? input.unit : UNIVERSITY;
  const viewer = await allowed(unit === UNIVERSITY ? ["rankings", "edit"] : ["evidence", "submit"], unit || undefined);
  if (!isViewer(viewer)) return viewer;
  const catalog = await catalogOf(String(input.edition));
  if (!catalog) return fail("That edition is no longer here. Reload the page.");
  const closed = writable(catalog, viewer);
  if (closed) return fail(closed);
  const ind = catalog.indicators.find((i) => i.code === input.code);
  if (!ind) return fail("That indicator is no longer here.");
  const url = input.url ? cleanUrl(input.url) : null;
  if (input.url && !url) return fail("Enter a web address that starts with https://.");
  let evidenceId: string | null = null;
  if (input.evidenceId) {
    const rec = evidenceList(await readState()).find((e) => e.id === input.evidenceId);
    if (!rec) return fail("That evidence record is no longer here.");
    if (unit !== UNIVERSITY && rec.unitSlug !== unit && rec.programId !== unit) return fail("Link your unit’s own evidence.");
    evidenceId = rec.id;
  }
  if (!url && !evidenceId) return fail("Add a link or choose an evidence record.");
  const year = typeof input.year === "number" && Number.isInteger(input.year) && input.year >= 1900 && input.year <= 2100 ? input.year : null;
  const { error } = await adminDb()
    .from("analytics_links")
    .insert({
      edition_id: catalog.edition.id,
      indicator_code: ind.code,
      unit_id: unit,
      url,
      evidence_id: evidenceId,
      label: text(input.label, 300),
      year,
      public: typeof input.public === "boolean" ? input.public : null,
      added_by: viewer.id,
    });
  if (error) return fail(/duplicate/i.test(error.message) ? "That evidence is already linked here." : "The link couldn’t be saved. Try again in a moment.");
  await audit(viewer, "analytics.link", { type: "Evidence link", id: `${catalog.edition.id}:${ind.code}`, label: label(catalog, ind.code) }, `${url ?? evidenceId}${unit ? ` · ${await unitName(unit)}` : ""}`);
  if (unit !== UNIVERSITY) await thankIfDone(viewer, catalog, unit);
  refresh();
  return { ok: true, message: "Evidence linked." };
}

export async function assessLink(input: { id: string; relevance?: Relevance | null; public?: boolean | null; selfContained?: boolean | null }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const linkId = id(input?.id);
  if (!linkId) return fail("That link is no longer here.");
  const relevance = input.relevance === null ? null : (["specific", "general", "not relevant"] as const).find((r) => r === input.relevance);
  if (input.relevance !== undefined && input.relevance !== null && !relevance) return fail("Choose specific, general or not relevant.");
  const db = adminDb();
  const { data: row } = await db.from("analytics_links").select("edition_id, indicator_code, url, evidence_id").eq("id", linkId).maybeSingle();
  if (!row) return fail("That link is no longer here.");
  const patch = {
    ...(input.relevance !== undefined && { relevance: relevance ?? null }),
    ...(input.public !== undefined && { public: input.public }),
    ...(input.selfContained !== undefined && { self_contained: input.selfContained }),
    assessed_by: viewer.id,
    assessed_at: new Date().toISOString(),
  };
  const { error } = await db.from("analytics_links").update(patch).eq("id", linkId);
  if (error) return fail("The assessment couldn’t be saved.");
  const catalog = await catalogOf(row.edition_id);
  await audit(viewer, "analytics.link.assess", { type: "Evidence link", id: linkId, label: catalog ? label(catalog, row.indicator_code) : row.indicator_code }, JSON.stringify({ relevance: patch.relevance, public: patch.public, selfContained: patch.self_contained }));
  refresh();
  return { ok: true, message: "Assessment saved." };
}

export async function removeLink(input: { id: string }): Promise<Result> {
  const linkId = id(input?.id);
  if (!linkId) return fail("That link is no longer here.");
  const { data: row } = await adminDb().from("analytics_links").select("edition_id, indicator_code, unit_id, url, evidence_id").eq("id", linkId).maybeSingle();
  if (!row) return fail("That link is no longer here.");
  const viewer = await allowed(row.unit_id === UNIVERSITY ? ["rankings", "edit"] : ["evidence", "submit"], row.unit_id || undefined);
  if (!isViewer(viewer)) {
    // The Office may also take a unit's link off the indicator.
    const office = await allowed(["rankings", "edit"]);
    if (!isViewer(office)) return viewer;
    return removeAs(office, linkId, row);
  }
  return removeAs(viewer, linkId, row);
}

async function removeAs(viewer: Viewer, linkId: string, row: { edition_id: string; indicator_code: string; url: string | null; evidence_id: string | null }): Promise<Result> {
  const { error } = await adminDb().from("analytics_links").delete().eq("id", linkId);
  if (error) return fail("The link couldn’t be removed.");
  const catalog = await catalogOf(row.edition_id);
  await audit(viewer, "analytics.link.remove", { type: "Evidence link", id: linkId, label: catalog ? label(catalog, row.indicator_code) : row.indicator_code }, row.url ?? row.evidence_id ?? "");
  refresh();
  return { ok: true, message: "Link removed." };
}

/* ---------- Activities ---------- */

export interface ActivityInput {
  id?: string;
  unit?: string;
  unitLabel?: string;
  kind: ActivityKind;
  year: string;
  title: string;
  proponent?: string;
  community?: string;
  proposalRef?: string;
  reportRef?: string;
  reported?: boolean;
  sdgs?: number[];
  beneficiaries?: number | null;
  partner?: string;
  mou?: string;
  startsOn?: string;
  endsOn?: string;
  tags?: string[];
}

export async function saveActivity(input: ActivityInput): Promise<Result> {
  const unit = typeof input?.unit === "string" && input.unit ? input.unit : null;
  // The Office keeps the register for every unit; a Coordinator adds their own unit's activities.
  const office = await allowed(["rankings", "edit"]);
  const viewer = isViewer(office) ? office : unit ? await allowed(["data", "submit"], unit) : office;
  if (!isViewer(viewer)) return viewer;
  const asOffice = isViewer(office);
  if (!ACTIVITY_KINDS.includes(input.kind)) return fail("Choose the kind of activity.");
  if (typeof input.year !== "string" || !/^(\d{4})-(\d{4})$/.test(input.year) || Number(input.year.slice(5)) !== Number(input.year.slice(0, 4)) + 1) return fail("Choose an academic year, like 2025-2026.");
  const title = text(input.title, 300);
  if (!title) return fail("Give the activity’s title.");
  if (unit && !(await unitExists(unit))) return fail("That unit isn’t in the Directory.");
  if (!unit && !text(input.unitLabel, 120)) return fail("Choose the unit.");
  if (input.startsOn && !isDay(input.startsOn)) return fail("Choose when it started.");
  if (input.endsOn && !isDay(input.endsOn)) return fail("Choose when it ended.");
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) return fail("It can’t end before it starts.");
  const sdgs = [...new Set((input.sdgs ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 17))].sort((a, b) => a - b);
  const mou = input.mou ? cleanUrl(input.mou) : null;
  if (input.mou && !mou) return fail("Enter the MOU’s link, starting with https://.");
  const row = {
    unit_id: unit,
    unit_label: text(input.unitLabel, 120),
    kind: input.kind,
    academic_year: input.year,
    title,
    proponent: text(input.proponent, 200),
    community: text(input.community, 400),
    proposal_ref: text(input.proposalRef, 300) || null,
    report_ref: text(input.reportRef, 300) || null,
    reported: input.reported === true || !!text(input.reportRef, 300),
    sdgs,
    beneficiaries: typeof input.beneficiaries === "number" && Number.isInteger(input.beneficiaries) && input.beneficiaries >= 0 ? input.beneficiaries : null,
    partner: text(input.partner, 300),
    mou,
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
    tags: [...new Set((input.tags ?? []).map((t) => text(t, 40).toLowerCase()).filter(Boolean))].slice(0, 12),
    updated_at: new Date().toISOString(),
  };
  const db = adminDb();
  const existing = id(input.id);
  if (existing) {
    const { data: before } = await db.from("analytics_activities").select("unit_id").eq("id", existing).maybeSingle();
    if (!before) return fail("That activity is no longer here.");
    if (!asOffice && before.unit_id !== unit) return fail("You can change only your unit’s activities.");
    const { error } = await db.from("analytics_activities").update(row).eq("id", existing);
    if (error) return fail(/duplicate/i.test(error.message) ? "That activity is already in the register." : "The activity couldn’t be saved.");
  } else {
    const { error } = await db.from("analytics_activities").insert({ ...row, source: asOffice ? "manual" : "portal", added_by: viewer.id });
    if (error) return fail(/duplicate/i.test(error.message) ? "That activity is already in the register." : "The activity couldn’t be saved.");
  }
  await audit(viewer, "analytics.activity", { type: "Activity", id: existing ?? title, label: title }, `${input.kind} · ${input.year}${unit ? ` · ${await unitName(unit)}` : ""}`);
  refresh();
  return { ok: true, message: existing ? "Activity updated." : "Activity added." };
}

export async function deleteActivity(input: { id: string }): Promise<Result> {
  const activityId = id(input?.id);
  if (!activityId) return fail("That activity is no longer here.");
  const db = adminDb();
  const { data: row } = await db.from("analytics_activities").select("unit_id, title").eq("id", activityId).maybeSingle();
  if (!row) return fail("That activity is no longer here.");
  const office = await allowed(["rankings", "edit"]);
  const viewer = isViewer(office) ? office : row.unit_id ? await allowed(["data", "submit"], row.unit_id) : office;
  if (!isViewer(viewer)) return viewer;
  const { error } = await db.from("analytics_activities").delete().eq("id", activityId);
  if (error) return fail("The activity couldn’t be removed.");
  await audit(viewer, "analytics.activity.delete", { type: "Activity", id: activityId, label: row.title }, "Removed from the register");
  refresh();
  return { ok: true, message: "Activity removed." };
}

/* ---------- WURI cases and reviews ---------- */

export async function saveCase(input: { id?: string; edition: string; category: string; title: string; unit?: string; abstract?: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const catalog = await catalogOf(String(input?.edition));
  if (!catalog) return fail("That edition is no longer here.");
  const closed = writable(catalog, viewer);
  if (closed) return fail(closed);
  if (!catalog.indicators.some((i) => i.code === input.category && i.input.type === "cases")) return fail("Choose a category.");
  const title = text(input.title, 300);
  if (!title) return fail("Give the programme’s name.");
  const unit = input.unit && (await unitExists(input.unit)) ? input.unit : null;
  const row = { edition_id: catalog.edition.id, category: input.category, title, unit_id: unit, abstract: longText(input.abstract, 4000) };
  const db = adminDb();
  const existing = id(input.id);
  const { error } = existing ? await db.from("analytics_cases").update(row).eq("id", existing) : await db.from("analytics_cases").insert({ ...row, source: "manual", added_by: viewer.id });
  if (error) return fail("The case couldn’t be saved.");
  await audit(viewer, "analytics.case", { type: "WURI case", id: existing ?? title, label: title }, `${input.category} · ${catalog.edition.label}`);
  refresh();
  return { ok: true, message: existing ? "Case updated." : "Case added." };
}

export async function deleteCase(input: { id: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const caseId = id(input?.id);
  if (!caseId) return fail("That case is no longer here.");
  const { data: row } = await adminDb().from("analytics_cases").select("title").eq("id", caseId).maybeSingle();
  if (!row) return fail("That case is no longer here.");
  const { error } = await adminDb().from("analytics_cases").delete().eq("id", caseId);
  if (error) return fail("The case couldn’t be removed.");
  await audit(viewer, "analytics.case.delete", { type: "WURI case", id: caseId, label: row.title }, "Removed with its reviews");
  refresh();
  return { ok: true, message: "Case removed." };
}

/** A reviewer's scores for a case on its category's rubric; one review per reviewer, replaced when they score again. */
export async function reviewCase(input: { caseId: string; scores: Record<string, unknown>; note?: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const caseId = id(input?.caseId);
  if (!caseId) return fail("That case is no longer here.");
  const db = adminDb();
  const { data: row } = await db.from("analytics_cases").select("edition_id, category, title").eq("id", caseId).maybeSingle();
  if (!row) return fail("That case is no longer here.");
  const catalog = await catalogOf(row.edition_id);
  const rule = catalog?.indicators.find((i) => i.code === row.category)?.score;
  if (!rule || rule.kind !== "rubric") return fail("That category has no rubric.");
  const { scores, total } = rubricTotal(rule, input.scores && typeof input.scores === "object" ? input.scores : {});
  const { error } = await db.from("analytics_reviews").upsert({ case_id: caseId, reviewer_id: viewer.id, scores, total, note: longText(input.note, 2000), at: new Date().toISOString() }, { onConflict: "case_id,reviewer_id" });
  if (error) return fail("The review couldn’t be saved.");
  await audit(viewer, "analytics.case.review", { type: "WURI case", id: caseId, label: row.title }, `${total} of ${rule.criteria.reduce((s, c) => s + c.max, 0)}`);
  refresh();
  return { ok: true, message: `Scored ${total}.` };
}

/* ---------- Request campaigns ---------- */

export interface CampaignInput {
  edition: string;
  title: string;
  memo?: string;
  message?: string;
  due: string;
  remindDays?: number;
  escalateDays?: number;
  units: { unit: string; codes: string[] }[];
}

export async function createCampaign(input: CampaignInput): Promise<Result<{ id: string }>> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const catalog = await catalogOf(String(input?.edition));
  if (!catalog) return fail("That edition is no longer here.");
  if (catalog.edition.status !== "Active" && catalog.edition.status !== "Draft") return fail("Request data only for an active edition.");
  const title = text(input.title, 160);
  if (!title) return fail("Give the request a title.");
  if (!isDay(input.due)) return fail("Choose the due date.");
  if (input.due < new Date().toISOString().slice(0, 10)) return fail("Choose a due date from today on.");
  const state = await readState();
  const codes = new Set(catalog.indicators.filter((i) => i.input.type !== "none" && i.input.type !== "result").map((i) => i.code));
  const units = (Array.isArray(input.units) ? input.units : [])
    .map((u) => ({ unit: typeof u?.unit === "string" ? u.unit : "", codes: [...new Set((Array.isArray(u?.codes) ? u.codes : []).filter((c): c is string => typeof c === "string" && codes.has(c)))] }))
    .filter((u) => u.codes.length && state.units.some((x) => x.id === u.unit && x.status === "Active" && x.kind !== "University"));
  if (!units.length) return fail("Choose at least one unit and what to ask it for.");
  if (units.length > 200) return fail("Ask at most 200 units in one request.");
  const remindDays = Math.max(1, Math.min(60, Math.round(Number(input.remindDays) || 7)));
  const escalateDays = Math.max(0, Math.min(60, Math.round(Number(input.escalateDays ?? 3))));
  const db = adminDb();
  const { data: last } = await db.from("analytics_campaigns").select("code").order("code", { ascending: false }).limit(1);
  const n = last?.[0] ? Number(last[0].code.slice(4)) + 1 : 1;
  const code = `REQ-${String(n).padStart(3, "0")}`;
  const { data, error } = await db
    .from("analytics_campaigns")
    .insert({ code, edition_id: catalog.edition.id, title, memo: text(input.memo, 120), message: longText(input.message, 4000), due: input.due, remind_days: remindDays, escalate_days: escalateDays, opened_by: viewer.id })
    .select("id")
    .single();
  if (error || !data) return fail("The request couldn’t be created. Try again in a moment.");
  const { error: unitsError } = await db.from("analytics_campaign_units").insert(units.map((u) => ({ campaign_id: data.id, unit_id: u.unit, codes: u.codes })));
  if (unitsError) {
    await db.from("analytics_campaigns").delete().eq("id", data.id);
    return fail("The request couldn’t be created. Try again in a moment.");
  }
  await audit(
    viewer,
    "analytics.campaign",
    { type: "Data request", id: code, label: title },
    `${catalog.edition.label} · ${units.length} units · due ${input.due}`,
    units.map((u) => ({ to: `unit:${u.unit}`, template: "tpl-data-request", vars: { ranking: catalog.edition.label, count: u.codes.length, due: input.due }, href: "/portal/requests" })),
  );
  refresh();
  return { ok: true, message: `${code} sent to ${units.length} ${units.length === 1 ? "unit" : "units"}.`, data: { id: data.id } };
}

export async function updateCampaign(input: { id: string; due?: string; message?: string; status?: "Open" | "Closed"; remindDays?: number; escalateDays?: number; add?: { unit: string; codes: string[] }[]; drop?: string[] }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const campaignId = id(input?.id);
  const campaign = (await readCampaigns()).find((c) => c.id === campaignId);
  if (!campaign) return fail("That request is no longer here.");
  const patch: { due?: string; message?: string; remind_days?: number; escalate_days?: number; status?: "Open" | "Closed"; closed_at?: string | null } = {};
  if (input.due !== undefined) {
    if (!isDay(input.due)) return fail("Choose the due date.");
    patch.due = input.due;
  }
  if (input.message !== undefined) patch.message = longText(input.message, 4000);
  if (input.remindDays !== undefined) patch.remind_days = Math.max(1, Math.min(60, Math.round(Number(input.remindDays) || 7)));
  if (input.escalateDays !== undefined) patch.escalate_days = Math.max(0, Math.min(60, Math.round(Number(input.escalateDays) || 0)));
  if (input.status === "Open" || input.status === "Closed") {
    patch.status = input.status;
    patch.closed_at = input.status === "Closed" ? new Date().toISOString() : null;
  }
  const db = adminDb();
  if (Object.keys(patch).length) {
    const { error } = await db.from("analytics_campaigns").update(patch).eq("id", campaign.id);
    if (error) return fail("The request couldn’t be updated.");
  }
  const catalog = await catalogOf(campaign.edition);
  const notices: Parameters<typeof audit>[4] = [];
  if (input.add?.length && catalog) {
    const state = await readState();
    const codes = new Set(catalog.indicators.map((i) => i.code));
    for (const a of input.add) {
      const list = [...new Set((a.codes ?? []).filter((c) => codes.has(c)))];
      if (!list.length || !state.units.some((u) => u.id === a.unit && u.status === "Active")) continue;
      const existing = campaign.units.find((u) => u.unit === a.unit);
      const merged = [...new Set([...(existing?.codes ?? []), ...list])];
      await db.from("analytics_campaign_units").upsert({ campaign_id: campaign.id, unit_id: a.unit, codes: merged }, { onConflict: "campaign_id,unit_id" });
      if (!existing) notices.push({ to: `unit:${a.unit}`, template: "tpl-data-request", vars: { ranking: catalog.edition.label, count: merged.length, due: patch.due ?? campaign.due }, href: "/portal/requests" });
    }
  }
  if (input.drop?.length) await db.from("analytics_campaign_units").delete().eq("campaign_id", campaign.id).in("unit_id", input.drop);
  await audit(viewer, "analytics.campaign.update", { type: "Data request", id: campaign.code, label: campaign.title }, JSON.stringify({ ...patch, add: input.add?.map((a) => a.unit), drop: input.drop }).slice(0, 600), notices);
  refresh();
  return { ok: true, message: input.status === "Closed" ? "Request closed." : input.status === "Open" ? "Request reopened." : "Request updated." };
}

/** Remind units that still owe items (all of them, or the ones named). */
export async function remindCampaign(input: { id: string; units?: string[] }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const campaign = (await readCampaigns()).find((c) => c.id === id(input?.id));
  if (!campaign || campaign.status !== "Open") return fail("That request isn’t open.");
  const r = await reportFor(campaign.edition);
  if (!r) return fail("That edition is no longer here.");
  const standings = unitStandings(campaign, r.bundle.facts, r.report, new Date().toISOString().slice(0, 10)).filter((s) => s.submitted < s.requested && (!input.units?.length || input.units.includes(s.unit)));
  if (!standings.length) return { ok: true, message: "Every unit has sent everything." };
  const now = new Date().toISOString();
  const db = adminDb();
  for (const s of standings) {
    const u = campaign.units.find((x) => x.unit === s.unit)!;
    await db.from("analytics_campaign_units").update({ reminded_at: now, reminders: u.reminders + 1 }).eq("campaign_id", campaign.id).eq("unit_id", s.unit);
  }
  await audit(
    viewer,
    "analytics.campaign.remind",
    { type: "Data request", id: campaign.code, label: campaign.title },
    `${standings.length} units reminded`,
    standings.map((s) => ({ to: `unit:${s.unit}`, template: "tpl-data-reminder", vars: { ranking: r.bundle.catalog.edition.label, open: s.requested - s.submitted, count: s.requested, due: campaign.due }, href: "/portal/requests" })),
  );
  refresh();
  return { ok: true, message: `${standings.length} ${standings.length === 1 ? "unit" : "units"} reminded.` };
}

export async function deleteCampaign(input: { id: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const campaign = (await readCampaigns()).find((c) => c.id === id(input?.id));
  if (!campaign) return fail("That request is no longer here.");
  const { error } = await adminDb().from("analytics_campaigns").delete().eq("id", campaign.id);
  if (error) return fail("The request couldn’t be removed.");
  await audit(viewer, "analytics.campaign.delete", { type: "Data request", id: campaign.code, label: campaign.title }, "Removed; values and links already sent stay");
  refresh();
  return { ok: true, message: `${campaign.code} removed.` };
}

/* ---------- Action items and snapshots ---------- */

export async function saveAction(input: { id?: string; edition: string; code?: string; action: string; owner?: string; due?: string; status: string; progress?: number; note?: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const catalog = await catalogOf(String(input?.edition));
  if (!catalog) return fail("That edition is no longer here.");
  const action = text(input.action, 300);
  if (!action) return fail("Say what will be done.");
  if (!PLAN_STATUSES.includes(input.status as (typeof PLAN_STATUSES)[number])) return fail("Choose a status.");
  if (input.due && !isDay(input.due)) return fail("Choose the due date.");
  const code = input.code && catalog.indicators.some((i) => i.code === input.code) ? input.code : null;
  const owner = input.owner && (await unitExists(input.owner)) ? input.owner : null;
  const progress = input.status === "Complete" ? 100 : Math.max(0, Math.min(100, Math.round(Number(input.progress) || 0)));
  const row = { edition_id: catalog.edition.id, indicator_code: code, action, owner_unit: owner, due: input.due || null, status: input.status, progress, note: longText(input.note, 2000), updated_by: viewer.id, updated_at: new Date().toISOString() };
  const db = adminDb();
  const existing = id(input.id);
  const { error } = existing ? await db.from("analytics_actions").update(row).eq("id", existing) : await db.from("analytics_actions").insert(row);
  if (error) return fail("The action couldn’t be saved.");
  await audit(viewer, "analytics.action", { type: "Action item", id: existing ?? action, label: action }, `${input.status} · ${progress}%`);
  refresh();
  return { ok: true, message: existing ? "Action updated." : "Action added." };
}

export async function deleteAction(input: { id: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const actionId = id(input?.id);
  if (!actionId) return fail("That action is no longer here.");
  const { data: row } = await adminDb().from("analytics_actions").select("action").eq("id", actionId).maybeSingle();
  if (!row) return fail("That action is no longer here.");
  await adminDb().from("analytics_actions").delete().eq("id", actionId);
  await audit(viewer, "analytics.action.delete", { type: "Action item", id: actionId, label: row.action }, "Removed");
  refresh();
  return { ok: true, message: "Action removed." };
}

/** Keep where an edition stands now, to show movement later (the quarterly review compares against these). */
export async function takeSnapshot(input: { edition: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const r = await reportFor(String(input?.edition));
  if (!r) return fail("That edition is no longer here.");
  const { error } = await adminDb().from("analytics_snapshots").insert({ edition_id: r.bundle.catalog.edition.id, by: viewer.id, kind: "manual", summary: summarize(r.report) as unknown as Json });
  if (error) return fail("The snapshot couldn’t be saved.");
  await audit(viewer, "analytics.snapshot", { type: "Snapshot", id: r.bundle.catalog.edition.id, label: r.bundle.catalog.edition.label }, `Readiness ${r.report.readiness}% · claimed ${r.report.total.claimed}`);
  refresh();
  return { ok: true, message: "Snapshot saved." };
}

/* ---------- Peers and benchmarks ---------- */

export async function savePeer(input: { id?: string; name: string; country?: string; band: string }): Promise<Result<{ id: string }>> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const name = text(input?.name, 200);
  if (!name) return fail("Give the institution’s name.");
  const band = PEER_BANDS.find((b) => b === input.band);
  if (!band) return fail("Choose a peer band.");
  const row = { name, country: text(input.country, 80), band };
  const db = adminDb();
  const existing = typeof input.id === "string" && input.id ? input.id : null;
  const { data, error } = existing ? await db.from("analytics_peers").update(row).eq("id", existing).select("id").single() : await db.from("analytics_peers").insert({ ...row, added_by: viewer.id }).select("id").single();
  if (error || !data) return fail(/duplicate/i.test(error?.message ?? "") ? "That institution is already a peer." : "The peer couldn’t be saved.");
  await audit(viewer, "analytics.peer", { type: "Peer", id: data.id, label: name }, `${band}${row.country ? ` · ${row.country}` : ""}`);
  refresh();
  return { ok: true, message: existing ? "Peer updated." : "Peer added.", data: { id: data.id } };
}

export async function deletePeer(input: { id: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const peerId = typeof input?.id === "string" ? input.id : "";
  const { data: row } = await adminDb().from("analytics_peers").select("name").eq("id", peerId).maybeSingle();
  if (!row) return fail("That peer is no longer here.");
  await adminDb().from("analytics_benchmarks").delete().eq("peer_id", peerId);
  await adminDb().from("analytics_peers").delete().eq("id", peerId);
  await audit(viewer, "analytics.peer.delete", { type: "Peer", id: peerId, label: row.name }, "Removed with its figures");
  refresh();
  return { ok: true, message: "Peer removed." };
}

/** A published figure: the University's own (peer "") or a peer's, by ranking, year and metric. */
export async function saveBenchmark(input: { ranking: string; year: number; peer?: string; metric: string; value?: number | null; label?: string; note?: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const ranking = typeof input?.ranking === "string" ? input.ranking : "";
  const { data: framework } = await adminDb().from("ranking_frameworks").select("slug").eq("slug", ranking).maybeSingle();
  if (!framework) return fail("Choose a ranking.");
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("Choose a year.");
  const metric = text(input.metric, 120);
  if (!metric) return fail("Choose what the figure measures.");
  const peer = typeof input.peer === "string" ? input.peer : "";
  if (peer) {
    const { data: p } = await adminDb().from("analytics_peers").select("id").eq("id", peer).maybeSingle();
    if (!p) return fail("That peer is no longer here.");
  }
  const value = typeof input.value === "number" && Number.isFinite(input.value) ? input.value : null;
  const rank = text(input.label, 40) || null;
  if (value === null && !rank) return fail("Enter a score or a rank.");
  const { error } = await adminDb()
    .from("analytics_benchmarks")
    .upsert({ ranking_slug: ranking, year, peer_id: peer, metric, value, label: rank, source: "manual", note: text(input.note, 300) || null, entered_by: viewer.id, entered_at: new Date().toISOString() }, { onConflict: "ranking_slug,year,peer_id,metric" });
  if (error) return fail("The figure couldn’t be saved.");
  await audit(viewer, "analytics.benchmark", { type: "Benchmark", id: `${ranking}:${year}:${peer || "own"}:${metric}`, label: `${ranking} ${year} ${metric}` }, `${value ?? ""}${rank ? ` ${rank}` : ""}`);
  refresh();
  return { ok: true, message: "Figure saved." };
}

export async function deleteBenchmark(input: { id: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const benchId = id(input?.id);
  if (!benchId) return fail("That figure is no longer here.");
  const { data: row } = await adminDb().from("analytics_benchmarks").select("ranking_slug, year, metric").eq("id", benchId).maybeSingle();
  if (!row) return fail("That figure is no longer here.");
  await adminDb().from("analytics_benchmarks").delete().eq("id", benchId);
  await audit(viewer, "analytics.benchmark.delete", { type: "Benchmark", id: benchId, label: `${row.ranking_slug} ${row.year} ${row.metric}` }, "Removed");
  refresh();
  return { ok: true, message: "Figure removed." };
}
