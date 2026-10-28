import "server-only";

/*
 * Digital Forms for the pages that show them: a Workspace's forms (its own, and the Office's open ones beside
 * them in a unit's), a form as its responder link opens it, and the responses, which live in form_responses
 * outside the store. Who may run a form, and so read its responses, is decided here too.
 */
import type { FormItem, FormResponseItem, FormsDesk, FormUnit, ResponderForm, SentResponse } from "../hub-types";
import type { FormRecord, GovernanceState, OrgUnit } from "../types";
import type { Viewer } from "../viewer";
import { viewerCan } from "../viewer";
import { requestUnits } from "../directory";
import { SYSTEM_ACTOR } from "../seed";
import { readState } from "./store";
import { siteOrigin } from "./origin";
import { adminDb } from "@/lib/supabase/server";
import { UNIT_CATEGORY_LABELS } from "@/lib/unit-categories";
import { manilaDay } from "@/lib/forms/format";
import { emptyReview } from "@/lib/forms/review";
import type { Answers, ResponseStatus, ReviewState, UnitSection } from "@/lib/forms/types";

/** Runs the form: changes it and reads its responses. A unit's contributors, or for the Office's forms its editors. */
export const runsForm = (viewer: Viewer | null, f: Pick<FormRecord, "unitId">) => (f.unitId ? viewerCan(viewer, "evidence", "submit", { unitId: f.unitId }) : viewerCan(viewer, "knowledge", "edit"));

/** Whether a form takes responses today. */
export const takesResponses = (f: Pick<FormRecord, "status" | "closesOn">, now = new Date()) => f.status === "open" && (!f.closesOn || manilaDay(now) <= f.closesOn);

/** The units a unit question can name, by Directory section. */
export function formUnits(units: OrgUnit[]): FormUnit[] {
  const sectionOf = Object.fromEntries(Object.entries(UNIT_CATEGORY_LABELS).map(([k, v]) => [v, k])) as Record<string, UnitSection>;
  return requestUnits(units).flatMap((g) => g.units.map((u) => ({ id: u.id, name: u.name, section: sectionOf[g.label], ...(u.depth && { depth: u.depth }) })));
}

const unitName = (state: GovernanceState, id: string | undefined) => (id ? state.units.find((u) => u.id === id)?.name : undefined);

/** The academic unit over a department, for the Visual Identity's name hierarchy (unit in capitals, department under it). */
const ACADEMIC: OrgUnit["kind"][] = ["Faculty", "College", "Institute", "School"];
const academicParent = (state: GovernanceState, id: string | undefined) => {
  const parentId = id && state.units.find((u) => u.id === id)?.parentId;
  const parent = parentId ? state.units.find((u) => u.id === parentId) : undefined;
  return parent && ACADEMIC.includes(parent.kind) ? parent.name : undefined;
};

type Counts = { total: number; week: number; lastAt?: string; drafts: number };

/** How many responses each form has (team copies included), in the last week too, when the last came, and the copies not sent yet. Empty if the table can't be read. */
async function responseCounts(ids: string[]): Promise<Map<string, Counts>> {
  const out = new Map<string, Counts>();
  if (!ids.length) return out;
  const { data, error } = await adminDb().rpc("hub_form_counts", { p_form_ids: ids });
  if (error) console.error(`Form responses: ${error.message}`);
  for (const r of data ?? []) {
    out.set(r.form_id, { total: Number(r.total), week: Number(r.week), ...(r.last_at && { lastAt: new Date(r.last_at).toISOString() }), drafts: Number(r.drafts) });
  }
  return out;
}

/**
 * A Workspace's forms: the viewer's unit's own (or the program their role covers) with the Office's open forms
 * beside them, or with `office` the Office's own.
 */
export async function formsDesk(viewer: Viewer, office = false): Promise<FormsDesk> {
  const state = await readState();
  const unitId = office ? null : (viewer.portal.programId ?? viewer.portal.unitId);
  const nameOf = (id: string) => (id === SYSTEM_ACTOR.id ? SYSTEM_ACTOR.name : (state.accounts.find((a) => a.id === id)?.name ?? "Former account"));
  const seesShared = viewerCan(viewer, "knowledge", "view") || viewerCan(viewer, "evidence", "view");
  const forms = state.records.forms.filter((f) =>
    unitId ? (f.unitId === unitId && viewerCan(viewer, "evidence", "view", { unitId })) || (!f.unitId && seesShared && f.status === "open") : !f.unitId,
  );
  const managed = forms.filter((f) => runsForm(viewer, f) && (unitId ? f.unitId === unitId : !f.unitId));
  const counts = await responseCounts(managed.map((f) => f.id));
  return {
    unitId,
    canWrite: unitId ? viewerCan(viewer, "evidence", "submit", { unitId }) : viewerCan(viewer, "knowledge", "edit"),
    origin: await siteOrigin(),
    forms: forms.map((f): FormItem => {
      const manage = managed.includes(f);
      const { review, ...questions } = f.schema;
      const issuer = unitName(state, f.issuerId);
      return {
        id: f.id,
        code: f.code,
        prefix: f.prefix,
        title: f.title,
        description: f.description,
        kind: f.kind,
        ...(f.reference && { reference: f.reference }),
        ...(issuer && { issuer: { id: f.issuerId!, name: issuer } }),
        status: f.status,
        ...(f.closesOn && { closesOn: f.closesOn }),
        copies: !!f.copies,
        shared: !f.unitId,
        manage,
        schema: manage && review ? { ...questions, review } : questions,
        ...(manage && { responses: counts.get(f.id) ?? { total: 0, week: 0, drafts: 0 } }),
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        updatedBy: nameOf(f.updatedBy),
      };
    }),
    units: formUnits(state.units),
    issuers: state.units.filter((u) => u.status === "Active" && u.kind !== "University").map((u) => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** A form as its responder link opens it, or null for no such form. Someone who runs it may preview a draft. */
export async function responderForm(code: string, viewer: Viewer | null): Promise<ResponderForm | null> {
  const state = await readState();
  const f = state.records.forms.find((x) => x.code === code);
  if (!f) return null;
  const { review, ...questions } = f.schema;
  return {
    code: f.code,
    prefix: f.prefix,
    title: f.title,
    description: f.description,
    kind: f.kind,
    ...(f.reference && { reference: f.reference }),
    ...(unitName(state, f.issuerId) && { issuer: unitName(state, f.issuerId) }),
    ...(academicParent(state, f.issuerId) && { issuerUnit: academicParent(state, f.issuerId) }),
    status: takesResponses(f) ? "open" : f.status === "draft" ? "draft" : "closed",
    ...(f.closesOn && { closesOn: f.closesOn }),
    schema: questions,
    stages: review?.stages ?? [],
    units: formUnits(state.units),
    preview: !takesResponses(f) && runsForm(viewer, f),
    copies: !!f.copies,
  };
}

type ResponseRow = {
  id: string;
  ref: string;
  answers: Answers;
  review: ReviewState | null;
  status: "draft" | ResponseStatus;
  respondent: { name?: string; email?: string } | null;
  submitted_at: string;
  updated_at: string;
  label: string | null;
  owner_name: string | null;
  owner_email: string | null;
};

const COLUMNS = "id, ref, answers, review, status, respondent, submitted_at, updated_at, label, owner_name, owner_email";

const toItem = (r: ResponseRow): FormResponseItem => ({
  id: r.id,
  ref: r.ref,
  answers: r.answers ?? {},
  review: { ...emptyReview(), ...(r.review ?? {}) },
  status: r.status,
  respondent: { name: r.respondent?.name ?? "", email: r.respondent?.email ?? "" },
  submittedAt: new Date(r.submitted_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
  ...(r.label && { copy: { label: r.label, owner: r.owner_name || r.owner_email || "" } }),
});

/** A form's sent responses, newest first, or with `copies` its team copies still being filled in too. */
export async function responsesOf(formId: string, copies = false): Promise<FormResponseItem[]> {
  let query = adminDb().from("form_responses").select(COLUMNS).eq("form_id", formId);
  if (!copies) query = query.neq("status", "draft");
  const { data, error } = await query.order("submitted_at", { ascending: false }).limit(5000);
  if (error) throw new Error(`Form responses: ${error.message}`);
  return ((data ?? []) as unknown as ResponseRow[]).map(toItem);
}

/** One sent response of a form, or null; a team copy can be reviewed once it's sent. */
export async function responseOf(formId: string, id: string): Promise<SentResponse | null> {
  const { data, error } = await adminDb().from("form_responses").select(COLUMNS).eq("form_id", formId).eq("id", id).neq("status", "draft").maybeSingle();
  if (error) throw new Error(`Form responses: ${error.message}`);
  return data ? (toItem(data as unknown as ResponseRow) as SentResponse) : null;
}

/** The form by id, if it's there. */
export async function formById(id: string) {
  return (await readState()).records.forms.find((f) => f.id === id) ?? null;
}

/** The form by its link's code, if it's there. */
export async function formByCode(code: string) {
  return (await readState()).records.forms.find((f) => f.code === code) ?? null;
}
