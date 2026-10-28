import "server-only";

/*
 * Team copies of a digital form (lib/forms/copies.ts) for the pages that show them: who the browser is on a form's
 * pages, a copy as its link opens it (or that it's private to someone else), and the copies a person started or
 * was added to. Copies are rows of form_responses in status "draft" until they're sent; the actions that build,
 * save, send and share them are in app/actions/form-copies.ts.
 */
import { cookies } from "next/headers";
import type { CopyPerson, CopyRequest, CopyStage, CopySummary, CopyView, FormWho } from "../hub-types";
import type { FormRecord } from "../types";
import { FORM_WHO_COOKIE, formWhoOf } from "./email-verify";
import { getViewer } from "./session";
import { profileAvatar, type CopyAccess } from "@/lib/forms/copies";
import { decisionLabel, emptyReview, standing } from "@/lib/forms/review";
import type { Answers, ResponseStatus, ReviewState } from "@/lib/forms/types";
import { adminDb } from "@/lib/supabase/server";
import { mayLookUp, peopleByEmail } from "./people-directory";
import { readState } from "./store";

/** Who a form's pages know this browser to be: Google sign-in from a form first, then the Hub's own session. */
export async function formWho(): Promise<FormWho | null> {
  const proof = formWhoOf((await cookies()).get(FORM_WHO_COOKIE)?.value);
  if (proof) return { ...proof, name: proof.name || proof.email, via: "google" };
  const viewer = await getViewer();
  return viewer ? { email: viewer.email.toLowerCase(), name: viewer.name, avatar: viewer.avatar, via: "hub" } : null;
}

export type CopyRow = {
  id: string;
  ref: string;
  token: string;
  label: string;
  access: CopyAccess;
  owner_email: string;
  owner_name: string | null;
  members: string[];
  version: number;
  answers: Answers;
  status: "draft" | ResponseStatus;
  review: ReviewState | null;
  edited: { by?: string | null; at?: string } | null;
  presence: Record<string, { name?: string | null; at?: string }> | null;
  submitted_at: string;
  created_at: string;
  live: string;
  access_requests: { email?: string; name?: string; avatar?: string; at?: string }[] | null;
};

export const COPY_COLUMNS = "id, ref, token, label, access, owner_email, owner_name, members, version, answers, status, review, edited, presence, submitted_at, created_at, live, access_requests";

/** The requests to open a private copy that read well, oldest first. */
export const requestsOf = (list: CopyRow["access_requests"]): CopyRequest[] =>
  (Array.isArray(list) ? list : [])
    .filter((q) => typeof q?.email === "string")
    .map((q) => {
      const avatar = profileAvatar(q.avatar);
      return { email: q.email!, name: q.name?.trim() || q.email!, ...(avatar && { avatar }), at: new Date(q.at ?? 0).toISOString() };
    });


/** Whether `email` may open the copy: anyone with the link, or for a private copy its owner and the people they added. */
export const admits = (row: Pick<CopyRow, "access" | "owner_email" | "members">, email: string | undefined) =>
  row.access === "link" || (!!email && (email === row.owner_email || row.members.includes(email)));

/** A name for someone in a copy: their Google name, or "Guest". */
export const personName = (name: string | null | undefined) => name?.trim() || "Guest";

/** The pages that had a copy open in the last 45 seconds. */
export function presenceOf(presence: CopyRow["presence"], now = Date.now()): CopyPerson[] {
  return Object.entries(presence ?? {})
    .filter(([, p]) => p?.at && now - Date.parse(p.at) < 45_000)
    .map(([id, p]) => ({ id, name: personName(p.name) }));
}

/** The last change to a copy, if it says who. */
export const editedOf = (edited: CopyRow["edited"]) => (edited?.at ? { by: personName(edited.by), at: new Date(edited.at).toISOString() } : undefined);

/** Where a sent copy's sign-offs stand, as its link shows them: decided, next, still to come; a return's or decline's note. */
export function copyStages(form: Pick<FormRecord, "schema">, answers: Answers, review: ReviewState | null): CopyStage[] {
  const r = { ...emptyReview(), ...(review ?? {}) };
  const { stages, next } = standing(form.schema, answers, r);
  return stages.map((s): CopyStage => {
    const rec = r.stages[s.id];
    if (!rec) return { verb: s.verb, role: s.role, state: next?.id === s.id ? "next" : "waiting" };
    return { verb: decisionLabel(s, rec), role: s.role, state: rec.decision === "approved" ? "done" : rec.decision, on: rec.on, ...(rec.decision !== "approved" && rec.note && { note: rec.note }) };
  });
}

/**
 * A copy of `form` by its link, as its page opens it; null for none. When it's private and `who` isn't on it:
 * "denied", or "requested" once they've asked its owner to let them in (still in draft, so it can be asked).
 */
export async function copyOf(form: FormRecord, token: string, who: FormWho | null): Promise<CopyView | "denied" | "requested" | null> {
  const { data, error } = await adminDb().from("form_responses").select(COPY_COLUMNS).eq("form_id", form.id).eq("token", token).maybeSingle();
  if (error) throw new Error(`Form copy: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as CopyRow;
  if (!admits(row, who?.email)) return who && requestsOf(row.access_requests).some((q) => q.email === who.email) ? "requested" : "denied";
  const mine = !!who && who.email === row.owner_email;
  const edited = editedOf(row.edited);
  const requests = mine ? requestsOf(row.access_requests) : [];
  // Full names and photos for the Share sheet, from Hub accounts and the owner's University directory.
  const state = mine && (row.members.length || requests.length) ? await readState() : null;
  const faces = state ? await peopleByEmail(state, [...row.members, ...requests.map((q) => q.email)], mayLookUp(state, who) ? who!.email : undefined) : {};
  return {
    token: row.token,
    ref: row.ref,
    label: row.label,
    access: row.access,
    owner: row.owner_name || row.owner_email,
    mine,
    ...(mine && { members: row.members, requests: requests.map((q) => (q.avatar || !faces[q.email]?.photo ? q : { ...q, avatar: faces[q.email]!.photo })), faces }),
    version: row.version,
    answers: row.answers ?? {},
    status: row.status,
    ...(edited && { edited }),
    here: presenceOf(row.presence),
    live: row.live,
    ...(row.status !== "draft" && { sent: { at: new Date(row.submitted_at).toISOString(), stages: copyStages(form, row.answers ?? {}, row.review) } }),
  };
}

const SUMMARY = "token, ref, label, access, status, owner_email, edited, created_at";

/** The copies of `form` that `who` started or was added to, last edited first. Empty if they can't be read. */
export async function copiesOf(form: FormRecord, who: FormWho | null): Promise<CopySummary[]> {
  if (!who) return [];
  const db = adminDb();
  const [own, shared] = await Promise.all([
    db.from("form_responses").select(SUMMARY).eq("form_id", form.id).eq("owner_email", who.email).order("created_at", { ascending: false }).limit(40),
    db.from("form_responses").select(SUMMARY).eq("form_id", form.id).not("token", "is", null).contains("members", [who.email]).order("created_at", { ascending: false }).limit(40),
  ]);
  for (const r of [own, shared]) if (r.error) console.error(`Form copies: ${r.error.message}`);
  const seen = new Set<string>();
  const rows = [...(own.data ?? []), ...(shared.data ?? [])] as unknown as Pick<CopyRow, "token" | "ref" | "label" | "access" | "status" | "owner_email" | "edited" | "created_at">[];
  return rows
    .filter((r) => r.token && !seen.has(r.token) && seen.add(r.token))
    .map((r) => ({
      token: r.token,
      ref: r.ref,
      label: r.label,
      access: r.access,
      status: r.status,
      mine: r.owner_email === who.email,
      editedAt: new Date(r.edited?.at ?? r.created_at).toISOString(),
    }))
    .sort((a, b) => b.editedAt.localeCompare(a.editedAt));
}
