import "server-only";

/*
 * The Student Portal (user, 2026-10-29): what a Student, the Secretary of a student organization, commission or
 * council, sees. The proposals and terminal reports the Office published there, to build copies of, and the copies
 * they built (only those: a copy another Secretary added them to opens through its link, never in their portal); the
 * surveys assigned to them (the Office's, and their unit's) and whether they answered each; and the figures their
 * dashboard leads with. Their own Evaluation and Registration Forms come from formsDesk (server/forms.ts). Copies and
 * responses are rows of form_responses, kept by the account that built or sent them (account_id), or for copies built
 * before that, by its email.
 */
import type { Assignment, CopyDesk, PortalForm, StudentCopy } from "../hub-types";
import type { FormRecord } from "../types";
import type { Viewer } from "../viewer";
import { formUnits, holderName, studentUnit, takesResponses } from "./forms";
import { siteOrigin } from "./origin";
import { readState } from "./store";
import { adminDb } from "@/lib/supabase/server";
import { COPY_KINDS, reaches } from "@/lib/forms/access";
import type { CopyAccess } from "@/lib/forms/copies";
import type { Answers, FormKind, ResponseStatus } from "@/lib/forms/types";
import { formProgress, type CheckContext } from "@/lib/forms/check";

const questionsIn = (f: FormRecord) => f.schema.sections.reduce((n, s) => n + s.fields.filter((x) => x.type !== "note").length, 0);

/** The Office's forms of a kind that Students may build copies of now: published to the Student Portal and taking responses. */
export function copyForms(forms: FormRecord[], kind: FormKind): FormRecord[] {
  return forms.filter((f) => f.kind === kind && COPY_KINDS.includes(kind) && !f.unitId && !f.ownerId && f.copies && f.students && takesResponses(f));
}

const portalForm = (f: FormRecord, issuer?: string): PortalForm => ({
  id: f.id,
  createdAt: f.createdAt,
  code: f.code,
  title: f.title,
  description: f.description,
  kind: f.kind,
  ...(f.reference && { reference: f.reference }),
  ...(issuer && { issuer }),
  ...(f.closesOn && { closesOn: f.closesOn }),
  prefix: f.prefix,
  steps: f.schema.sections.length,
  questions: questionsIn(f),
});

type CopyRow = {
  token: string;
  ref: string;
  label: string;
  access: CopyAccess;
  status: "draft" | ResponseStatus;
  answers: Answers | null;
  form_id: string;
  owner_email: string;
  account_id: string | null;
  edited: { by?: string | null; at?: string } | null;
  created_at: string;
  submitted_at: string;
};

const COPY_COLUMNS = "token, ref, label, access, status, answers, form_id, owner_email, account_id, edited, created_at, submitted_at";

/**
 * The copies of these forms the Student built and manages (by their account, or by their email before accounts were kept).
 * Being added to another Secretary's copy makes them an editor of that copy through its link, not its manager: it
 * never lists here (user, 2026-10-29).
 */
async function copiesFor(viewer: Viewer, forms: FormRecord[], ctx: CheckContext): Promise<StudentCopy[]> {
  if (!forms.length) return [];
  const ids = forms.map((f) => f.id);
  const email = viewer.email.toLowerCase();
  const copies = () => adminDb().from("form_responses").select(COPY_COLUMNS).in("form_id", ids).not("token", "is", null);
  const lists = await Promise.all([
    copies().eq("account_id", viewer.id).order("created_at", { ascending: false }).limit(200),
    copies().eq("owner_email", email).order("created_at", { ascending: false }).limit(200),
  ]);
  for (const r of lists) if (r.error) console.error(`Student copies: ${r.error.message}`);
  const byId = new Map(forms.map((f) => [f.id, f]));
  const seen = new Set<string>();
  return (lists.flatMap((r) => r.data ?? []) as unknown as CopyRow[])
    .filter((r) => r.token && !seen.has(r.token) && seen.add(r.token))
    .map((r): StudentCopy => {
      const f = byId.get(r.form_id)!;
      const at = new Date(r.edited?.at ?? r.created_at).toISOString();
      return {
        token: r.token,
        ref: r.ref,
        label: r.label,
        access: r.access,
        status: r.status,
        progress: r.status === "draft" ? formProgress(f.schema, r.answers, ctx) : 100,
        form: { code: f.code, title: f.title, kind: f.kind },
        edited: { by: r.edited?.by?.trim() || "", at },
        createdAt: new Date(r.created_at).toISOString(),
        ...(r.status !== "draft" && { sentAt: new Date(r.submitted_at).toISOString() }),
      };
    })
    .sort((a, b) => b.edited.at.localeCompare(a.edited.at));
}

/** The Project Proposals or Terminal Reports page: the forms to build a copy of, and the copies built. */
export async function copyDesk(viewer: Viewer, kind: FormKind): Promise<CopyDesk> {
  const state = await readState();
  const ofKind = state.records.forms.filter((f) => f.kind === kind && !f.unitId && !f.ownerId && f.copies);
  const issuer = (f: FormRecord) => (f.issuerId ? state.units.find((u) => u.id === f.issuerId)?.name : undefined);
  return {
    kind,
    forms: copyForms(state.records.forms, kind).map((f) => portalForm(f, issuer(f))),
    // Copies of a form that has since closed or left the Student Portal stay listed: they're still the Student's.
    copies: await copiesFor(viewer, ofKind, { units: formUnits(state.units) }),
    origin: await siteOrigin(),
  };
}

/** Where a Student is placed: the unit their role is held in. */
const homeOf = (viewer: Viewer) => [studentUnit(viewer)];

/** The surveys assigned to a Student (published to the Student Portal by the Office or their unit), newest first, and which they answered. */
export async function assignmentsOf(viewer: Viewer): Promise<Assignment[]> {
  const state = await readState();
  const home = homeOf(viewer);
  const surveys = state.records.forms.filter((f) => f.kind === "survey" && f.students && f.status !== "draft" && reaches(state.units, f, home));
  if (!surveys.length) return [];
  const { data, error } = await adminDb()
    .from("form_responses")
    .select("form_id, ref, submitted_at")
    .in("form_id", surveys.map((f) => f.id))
    .eq("account_id", viewer.id)
    .neq("status", "draft")
    .order("submitted_at", { ascending: false });
  if (error) console.error(`Assignments: ${error.message}`);
  const answered = new Map<string, { ref: string; at: string }>();
  for (const r of data ?? []) if (!answered.has(r.form_id)) answered.set(r.form_id, { ref: r.ref, at: new Date(r.submitted_at).toISOString() });
  return surveys
    .map((f): Assignment => ({
      id: f.id,
      code: f.code,
      title: f.title,
      description: f.description,
      from: holderName(state, f),
      ...(f.closesOn && { closesOn: f.closesOn }),
      open: takesResponses(f),
      questions: questionsIn(f),
      ...(answered.has(f.id) && { answered: answered.get(f.id) }),
    }))
    // Closed and unanswered is history, not work: those leave the list.
    .filter((a) => a.open || a.answered);
}

/** Whether a survey is assigned to this Student: published to the Student Portal by the Office or their unit. */
export async function assignedTo(viewer: Viewer, form: FormRecord) {
  const state = await readState();
  return form.kind === "survey" && !!form.students && reaches(state.units, form, homeOf(viewer));
}

/** What the Student's dashboard leads with. */
export async function studentOverview(viewer: Viewer) {
  const state = await readState();
  const [proposals, reports, assignments] = await Promise.all([copyDesk(viewer, "proposal"), copyDesk(viewer, "terminal-report"), assignmentsOf(viewer)]);
  const own = state.records.forms.filter((f) => f.ownerId === viewer.id);
  return {
    proposals,
    reports,
    assignments,
    forms: own.map((f) => ({ id: f.id, kind: f.kind, title: f.title, status: f.status, updatedAt: f.updatedAt })),
    organization: state.accounts.find((a) => a.id === viewer.id)?.profile?.organization,
  };
}

export type StudentOverview = Awaited<ReturnType<typeof studentOverview>>;
