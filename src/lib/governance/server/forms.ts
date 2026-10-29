import "server-only";

/*
 * Digital Forms for the pages that show them: the Office's forms (with every unit's and Student's published form
 * beside them, whose responses reach the Office), a unit's (with the Office's open forms beside them), a Student's
 * own of one kind, a form as its responder link opens it, and the responses, which live in form_responses outside
 * the store. Who may do what with a form is lib/forms/access.ts; the actions enforce the same rights.
 */
import type { FormItem, FormResponseItem, FormsDesk, FormUnit, ResponderForm, SentResponse } from "../hub-types";
import type { FormRecord, GovernanceState, OrgUnit } from "../types";
import type { Viewer } from "../viewer";
import { viewerCan } from "../viewer";
import { requestUnits } from "../directory";
import { descendants } from "../rbac";
import { SYSTEM_ACTOR } from "../seed";
import { readState } from "./store";
import { siteOrigin } from "./origin";
import { adminDb } from "@/lib/supabase/server";
import { UNIT_CATEGORY_LABELS } from "@/lib/unit-categories";
import { COPY_KINDS, NO_RIGHTS, creatable, formRights, holderOf, isLocked, type FormHolder, type FormRights } from "@/lib/forms/access";
import { manilaDay } from "@/lib/forms/format";
import { emptyReview } from "@/lib/forms/review";
import type { Answers, FormKind, ResponseStatus, ReviewState, UnitSection } from "@/lib/forms/types";

/** What the viewer may do with a form (their active role). */
export const rightsFor = (viewer: Viewer | null, f: FormRecord): FormRights => (viewer ? formRights(viewer.grants, viewer.id, f) : NO_RIGHTS);

/** Whether a form takes responses today. */
export const takesResponses = (f: Pick<FormRecord, "status" | "closesOn">, now = new Date()) => f.status === "open" && (!f.closesOn || manilaDay(now) <= f.closesOn);

/** The units a unit question can name, by Directory section. */
export function formUnits(units: OrgUnit[]): FormUnit[] {
  const sectionOf = Object.fromEntries(Object.entries(UNIT_CATEGORY_LABELS).map(([k, v]) => [v, k])) as Record<string, UnitSection>;
  return requestUnits(units).flatMap((g) => g.units.map((u) => ({ id: u.id, name: u.name, section: sectionOf[g.label], ...(u.depth && { depth: u.depth }) })));
}

const unitName = (state: GovernanceState, id: string | undefined) => (id ? state.units.find((u) => u.id === id)?.name : undefined);

export const OFFICE_NAME = "Office of the QS/THE Rankings";

/** Who holds a form, by name: the Office, the unit, or the Student's organization (their own name when they gave none). */
export function holderName(state: GovernanceState, f: Pick<FormRecord, "unitId" | "ownerId">) {
  const holder = holderOf(f);
  if (holder === "office") return OFFICE_NAME;
  if (holder === "unit") return unitName(state, f.unitId) ?? "A unit";
  const owner = state.accounts.find((a) => a.id === f.ownerId);
  return owner?.profile?.organization || owner?.name || "A student organization";
}

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

/** Where a desk's forms come from: the Office's page, a unit's Workspace, or a Student's page of one kind. */
export type DeskOf = "office" | "unit" | { own: FormKind };

/** The units a holder may name as a form's issuer: any office for the Office's forms, else its own unit and those within it. */
function issuersFor(state: GovernanceState, unitId: string | null) {
  const within = unitId ? new Set(descendants(state.units, unitId)) : null;
  return state.units
    .filter((u) => u.status === "Active" && u.kind !== "University" && (!within || within.has(u.id)))
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A Student's unit: the one their role is held in. */
export const studentUnit = (viewer: Viewer) => viewer.grants.find((g) => g.roleId === "student" && g.scopeUnits !== "all")?.scopeUnits[0] ?? viewer.portal.unitId;

/**
 * A page's Digital Forms. The Office's: its own, then every unit's and Student's form once out of draft. A unit's:
 * its own with the Office's open forms beside them (not the proposals and terminal reports Students copy from the
 * Student Portal). A Student's: their own forms of one kind.
 */
export async function formsDesk(viewer: Viewer, where: DeskOf): Promise<FormsDesk> {
  const state = await readState();
  const nameOf = (id: string) => (id === SYSTEM_ACTOR.id ? SYSTEM_ACTOR.name : (state.accounts.find((a) => a.id === id)?.name ?? "Former account"));
  const holder: FormHolder = where === "office" ? "office" : where === "unit" ? "unit" : "student";
  const unitId = where === "unit" ? (viewer.portal.programId ?? viewer.portal.unitId) : holder === "student" ? studentUnit(viewer) : null;
  const seesShared = viewerCan(viewer, "knowledge", "view") || viewerCan(viewer, "evidence", "view");
  const rights = new Map(state.records.forms.map((f) => [f.id, rightsFor(viewer, f)]));
  const forms = state.records.forms.filter((f) => {
    const may = rights.get(f.id)!;
    const held = holderOf(f);
    if (where === "office") return held === "office" ? may.read || may.edit : f.status !== "draft" && may.read;
    if (where === "unit") return (held === "unit" && f.unitId === unitId && may.read) || (held === "office" && seesShared && f.status === "open" && !COPY_KINDS.includes(f.kind));
    return f.ownerId === viewer.id && f.kind === where.own;
  });
  const counts = await responseCounts(forms.filter((f) => rights.get(f.id)!.read).map((f) => f.id));
  const create = creatable(viewer.grants, holder, unitId ?? undefined).filter((k) => typeof where === "string" || k === where.own);
  return {
    holder,
    unitId: holder === "unit" ? unitId : null,
    create,
    origin: await siteOrigin(),
    forms: forms.map((f): FormItem => {
      const may = rights.get(f.id)!;
      const { review, ...questions } = f.schema;
      const issuer = unitName(state, f.issuerId);
      const held = holderOf(f);
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
        students: !!f.students,
        holder: { kind: held, name: holderName(state, f) },
        shared: where === "unit" && held === "office",
        locked: isLocked(f),
        may,
        schema: (may.review || may.edit) && review ? { ...questions, review } : questions,
        ...(may.read && { responses: counts.get(f.id) ?? { total: 0, week: 0, drafts: 0 } }),
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        updatedBy: nameOf(f.updatedBy),
      };
    }),
    units: formUnits(state.units),
    issuers: issuersFor(state, holder === "office" ? null : unitId),
  };
}

/** A form as its responder link opens it, or null for no such form. Someone who runs or reads it may preview it before it takes responses. */
export async function responderForm(code: string, viewer: Viewer | null): Promise<ResponderForm | null> {
  const state = await readState();
  const f = state.records.forms.find((x) => x.code === code);
  if (!f) return null;
  const { review, ...questions } = f.schema;
  const may = rightsFor(viewer, f);
  const held = holderOf(f);
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
    preview: (may.read || may.edit) && !takesResponses(f),
    copies: !!f.copies,
    ...(held !== "office" && { maker: { kind: held, name: holderName(state, f) } }),
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
