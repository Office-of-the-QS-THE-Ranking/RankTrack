"use server";

/*
 * Team copies of a digital form (lib/forms/copies.ts): building one, saving its answers as people type, keeping each
 * open page up to date, sending it, and choosing who can open it. A copy is a row of form_responses in status
 * "draft" with a link of its own. One open to its link takes anyone who has it; a private one takes only its owner
 * and the people they add, signed in with Google (server/form-copies.ts formWho). Answers are cleaned by the form's
 * module rules as they're saved, so every page reads well-formed answers, and checked in full when the copy is sent,
 * as a response sent straight from a form's link is (actions/forms.ts).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { Sent } from "./forms";
import { checkAnswers, problemText, respondentOf } from "@/lib/forms/check";
import { COPY_LIMITS, COPY_TOKEN, copyEmail, type CopyAccess } from "@/lib/forms/copies";
import { manilaDay } from "@/lib/forms/format";
import { FORM_CODE, FORM_LIMITS } from "@/lib/forms/kinds";
import { noEmoji } from "@/lib/forms/letters";
import { fieldMap, moduleOf, type FormContext } from "@/lib/forms/modules";
import { readConsent } from "@/lib/forms/privacy";
import { emptyReview, standing } from "@/lib/forms/review";
import type { Answers, Signature } from "@/lib/forms/types";
import type { CopyPerson, CopyRequest, CopyStage, CopyView } from "@/lib/governance/hub-types";
import { COOKIE_OPTIONS, FORM_WHO_COOKIE } from "@/lib/governance/server/email-verify";
import { COPY_COLUMNS, admits, copyStages, editedOf, formWho, presenceOf, requestsOf, type CopyRow } from "@/lib/governance/server/form-copies";
import { formUnits, takesResponses } from "@/lib/governance/server/forms";
import { allow, clientKey } from "@/lib/governance/server/limits";
import { readState } from "@/lib/governance/server/store";
import { endSession } from "./session";
import type { Json } from "@/lib/supabase/database.types";
import { adminDb } from "@/lib/supabase/server";

type Why = "gone" | "denied" | "sent";
type Fail = { ok: false; message: string; why?: Why };

const CLOSED: Fail = { ok: false, message: "This form isn’t taking responses." };
const GONE: Fail = { ok: false, message: "This copy is no longer here.", why: "gone" };
const DENIED: Fail = { ok: false, message: "This copy is private. Sign in with an account its owner added.", why: "denied" };
const SENT: Fail = { ok: false, message: "This copy has been sent, so its answers can’t change.", why: "sent" };
const BUSY: Fail = { ok: false, message: "Too many changes in a short time. Wait a minute and try again." };
const UNREACHABLE: Fail = { ok: false, message: "The copy can’t be reached right now. Your changes stay here and are saved once it can." };

/** A form whose link builds copies, by that link's code. */
async function formFor(code: unknown) {
  if (typeof code !== "string" || !FORM_CODE.test(code)) return null;
  const state = await readState();
  const form = state.records.forms.find((f) => f.code === code && f.copies);
  return form ? { form, state } : null;
}

const isToken = (t: unknown): t is string => typeof t === "string" && COPY_TOKEN.test(t);

/** The page's own id, for who is here: random, made by the page. */
const deviceOf = (d: unknown) => (typeof d === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(d) ? d : null);

const versionOf = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : -1);

const labelOf = (v: unknown) =>
  typeof v === "string"
    ? noEmoji(v)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";

/** A copy's name, who can open it and who else is on it, from what a page sent; or what to fix. */
function readSharing(input: { label?: unknown; access?: unknown; members?: unknown }, owner: string): { label: string; access: CopyAccess; members: string[] } | string {
  const label = labelOf(input.label);
  if (!label) return "Name the copy, like the event it’s for.";
  if (label.length > COPY_LIMITS.label) return `Keep the name under ${COPY_LIMITS.label} characters.`;
  const access = input.access === "private" ? "private" : input.access === "link" ? "link" : null;
  if (!access) return "Choose who can open the copy.";
  const members: string[] = [];
  for (const raw of Array.isArray(input.members) ? input.members : []) {
    const email = copyEmail(raw);
    if (!email) return "Check the email addresses: each should look like name@ust.edu.ph.";
    if (email !== owner && !members.includes(email)) members.push(email);
  }
  if (members.length > COPY_LIMITS.members) return `Add up to ${COPY_LIMITS.members} people.`;
  return { label, access, members };
}

async function rowOf(formId: string, token: string): Promise<CopyRow | null> {
  const { data, error } = await adminDb().from("form_responses").select(COPY_COLUMNS).eq("form_id", formId).eq("token", token).maybeSingle();
  if (error) throw new Error(`Form copy: ${error.message}`);
  return (data as unknown as CopyRow | null) ?? null;
}

/* ---------- Building ---------- */

/** A new copy of a form, owned by the person signed in with Google: its reference and link. */
export async function buildFormCopy(input: { code: string; label: string; access: CopyAccess; members?: string[] }): Promise<{ ok: true; token: string; ref: string; message: string } | Fail> {
  const found = await formFor(input?.code);
  if (!found || !takesResponses(found.form)) return CLOSED;
  const { form } = found;
  const who = await formWho();
  if (!who) return { ok: false, message: "Sign in with Google first, so the copy is yours." };
  const sharing = readSharing(input, who.email);
  if (typeof sharing === "string") return { ok: false, message: sharing };

  // Anyone may build a copy, so cap what one network and one person can start.
  const client = await clientKey();
  if (!(await allow(`form-copy:${form.id}:${client}`, 3600, 20, true, false))) return { ok: false, message: "Too many copies were started from your network. Try again in an hour." };
  if (!(await allow(`form-copy:${form.id}:${who.email}`, 86_400, 40, true, false))) return { ok: false, message: "You’ve started many copies today. Open one you have, or try again tomorrow." };

  const token = randomBytes(16).toString("base64url");
  const { data, error } = await adminDb().rpc("hub_form_copy_create", {
    p_form_id: form.id,
    p_prefix: form.prefix,
    p_token: token,
    p_label: sharing.label,
    p_access: sharing.access,
    p_owner_email: who.email,
    p_owner_name: who.name.slice(0, 120),
    p_members: sharing.members,
    p_client: client,
  });
  const row = data?.[0];
  if (error || !row) {
    console.error(`Form ${form.id} copy: ${error ? error.message : "no row"}`);
    return { ok: false, message: "The copy couldn’t be built. Try again in a moment." };
  }
  return { ok: true, token, ref: row.ref, message: `Copy ${row.ref} is ready. Share its link with your team.` };
}

/* ---------- Saving ---------- */

export type CopySaved = { ok: true; version: number; kept: Answers; answers?: Answers } | Fail;

/**
 * Save one page's changed answers: `set` replaces those answers, `unset` clears them, the rest stay as others left
 * them. `known` is the version the page last saw: if someone saved since, the whole answers come back.
 */
export async function saveFormCopy(input: { code: string; token: string; known: number; set?: unknown; unset?: unknown }): Promise<CopySaved> {
  const found = await formFor(input?.code);
  if (!found || !isToken(input.token)) return GONE;
  const { form, state } = found;
  // Typing saves about once a second; this is far above that.
  if (!(await allow(`form-copy-save:${input.token}:${await clientKey()}`, 600, 1200))) return BUSY;
  const who = await formWho();

  const fields = fieldMap(form.schema.sections);
  const ctx: FormContext = { units: formUnits(state.units), answers: {}, fields, draft: true };
  const given = input.set && typeof input.set === "object" && !Array.isArray(input.set) ? (input.set as Record<string, unknown>) : {};
  const kept: Answers = {};
  const unset = new Set(Array.isArray(input.unset) ? input.unset.filter((k): k is string => typeof k === "string" && fields.has(k)) : []);
  for (const [k, raw] of Object.entries(given)) {
    const spec = fields.get(k);
    if (!spec || spec.type === "note") continue;
    const value = moduleOf(spec).clean(spec, raw, ctx);
    if (value === undefined) unset.add(k);
    else kept[k] = value;
  }
  if (JSON.stringify(kept).length > FORM_LIMITS.answers) return { ok: false, message: "That’s too much to save at once. Shorten the longest answers." };

  const { data, error } = await adminDb().rpc("hub_form_copy_save", {
    p_form_id: form.id,
    p_token: input.token,
    p_email: who?.email ?? "",
    p_known: versionOf(input.known),
    p_set: kept as unknown as Json,
    p_unset: [...unset],
    p_by: who?.name ?? "",
    p_max: FORM_LIMITS.answers,
  });
  if (error || !data) {
    console.error(`Form copy save: ${error?.message ?? "no result"}`);
    return UNREACHABLE;
  }
  const r = data as { error?: string; version?: number; answers?: Answers };
  if (r.error === "gone") return GONE;
  if (r.error === "denied") return DENIED;
  if (r.error === "sent") return SENT;
  if (r.error) return { ok: false, message: "This copy is too large to save. Shorten the longest answers." };
  return { ok: true, version: r.version ?? 0, kept, ...(r.answers && { answers: r.answers }) };
}

/* ---------- Keeping a page up to date ---------- */

export type CopyPulse =
  | {
      ok: true;
      version: number;
      status: CopyView["status"];
      label: string;
      access: CopyAccess;
      edited?: { by: string; at: string };
      here: CopyPerson[];
      live: string;
      /** When the answers moved past the version the page knew, or the copy was sent. */
      answers?: Answers;
      sent?: { ref: string; at: string; stages: CopyStage[] };
    }
  | Fail;

/** What changed in a copy since the version a page knew, and who else has it open; the page is noted as here. */
export async function pullFormCopy(input: { code: string; token: string; known: number; device?: string }): Promise<CopyPulse> {
  const found = await formFor(input?.code);
  if (!found || !isToken(input.token)) return GONE;
  const { form } = found;
  const who = await formWho();
  const { data, error } = await adminDb().rpc("hub_form_copy_pulse", {
    p_form_id: form.id,
    p_token: input.token,
    p_email: who?.email ?? "",
    p_known: versionOf(input.known),
    p_who: deviceOf(input.device) ?? "",
    p_name: who?.name ?? "",
  });
  if (error || !data) {
    console.error(`Form copy pulse: ${error?.message ?? "no result"}`);
    return UNREACHABLE;
  }
  const r = data as { error?: string; version: number; status: CopyView["status"]; label: string; access: CopyAccess; edited: CopyRow["edited"]; here: CopyRow["presence"]; live: string; answers?: Answers; ref?: string; submittedAt?: string; review?: CopyRow["review"] };
  if (r.error === "gone") return GONE;
  if (r.error === "denied") return DENIED;
  const edited = editedOf(r.edited);
  return {
    ok: true,
    version: r.version,
    status: r.status,
    label: r.label,
    access: r.access,
    ...(edited && { edited }),
    here: presenceOf(r.here),
    live: r.live,
    ...(r.answers && { answers: r.answers }),
    ...(r.status !== "draft" && r.ref && r.submittedAt && { sent: { ref: r.ref, at: new Date(r.submittedAt).toISOString(), stages: copyStages(form, r.answers ?? {}, r.review ?? null) } }),
  };
}

/* ---------- Sending ---------- */

/** Responses one network may send to one form in an hour, and all of them together (as actions/forms.ts). */
const SENDS = { perClientHour: 20, perFormHour: 600 };

/** Send a copy: its answers as saved are checked in full, and it becomes a received response under its reference. */
export async function submitFormCopy(input: { code: string; token: string; consent?: unknown; trap?: string }): Promise<Sent> {
  const found = await formFor(input?.code);
  if (!found || !isToken(input.token)) return { ok: false, message: GONE.message };
  const { form, state } = found;
  if (!takesResponses(form)) return { ok: false, message: CLOSED.message };
  if (typeof input.trap === "string" && input.trap) return { ok: false, message: "That copy couldn’t be sent." };
  // Step 0: nothing is sent without both statements of the current data privacy notice.
  const consent = readConsent(input.consent);
  if (!consent) return { ok: false, message: "Agree to the data privacy notice first. It may have changed since you began.", section: "privacy" };
  const who = await formWho();
  let row: CopyRow | null;
  try {
    row = await rowOf(form.id, input.token);
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Your copy couldn’t be sent. Try again in a moment." };
  }
  if (!row) return { ok: false, message: GONE.message };
  if (!admits(row, who?.email)) return { ok: false, message: DENIED.message };
  if (row.status !== "draft") return { ok: false, message: "This copy was already sent." };

  const client = await clientKey();
  const mine = `form:${form.id}:${client}`;
  const all = `form:${form.id}`;
  if (!(await allow(mine, 3600, SENDS.perClientHour, false, false))) return { ok: false, message: "Too many responses were sent from your network. Try again in an hour." };
  if (!(await allow(all, 3600, SENDS.perFormHour, false, false))) return { ok: false, message: "This form is receiving many responses right now. Try again in a few minutes." };

  const { answers, problems } = checkAnswers(form.schema.sections, row.answers ?? {}, { units: formUnits(state.units) });
  if (problems.length) return { ok: false, message: problemText(form.schema, problems[0]), section: problems[0].section, field: problems[0].field };
  // Signatures are dated the day they arrive.
  const today = manilaDay();
  for (const s of form.schema.sections)
    for (const f of s.fields) if (f.type === "signature" && Array.isArray(answers[f.id])) answers[f.id] = (answers[f.id] as Signature[]).map((x) => ({ ...x, on: x.name ? today : "" }));

  if (!(await allow(mine, 3600, SENDS.perClientHour, true, false)) || !(await allow(all, 3600, SENDS.perFormHour, true, false))) return { ok: false, message: "Too many responses at once. Try again in a few minutes." };
  const at = new Date().toISOString();
  // Only over the version that was checked: an answer changed meanwhile is checked again first.
  const { data, error } = await adminDb()
    .from("form_responses")
    .update({
      answers: answers as unknown as Json,
      status: standing(form.schema, answers, emptyReview()).status,
      respondent: respondentOf(form.schema, answers),
      privacy_consent: consent as unknown as Json,
      submitted_at: at,
      updated_at: at,
      version: row.version + 1,
      edited: { by: who?.name ?? null, at },
      presence: {},
    })
    .eq("id", row.id)
    .eq("token", input.token)
    .eq("status", "draft")
    .eq("version", row.version)
    .select("ref");
  if (error) {
    console.error(`Form ${form.id} copy send: ${error.message}`);
    return { ok: false, message: "Your copy couldn’t be sent. Try again in a moment." };
  }
  if (!data?.length) return { ok: false, message: "Someone on your team changed this copy just now. Check the latest answers, then send it again." };
  return { ok: true, ref: row.ref, at };
}

/* ---------- Sharing ---------- */

/** Replace a compromised link, including its live channel, without changing the copy's answers or reference. */
export async function regenerateFormCopyLink(input: { code: string; token: string }): Promise<{ ok: true; message: string; token: string } | Fail> {
  const found = await formFor(input?.code);
  if (!found || !isToken(input.token)) return GONE;
  const who = await formWho();
  if (!who) return { ok: false, message: "Sign in as the person who started this copy to replace its link." };
  if (!(await allow(`form-copy-link:${who.email}`, 600, 20))) return BUSY;
  const token = randomBytes(16).toString("base64url");
  // Ownership and the old token are checked in the update itself: concurrent replacements cannot both win.
  const { data, error } = await adminDb()
    .from("form_responses")
    .update({ token, live: randomUUID(), presence: {} })
    .eq("form_id", found.form.id)
    .eq("token", input.token)
    .eq("owner_email", who.email)
    .select("token");
  if (error) {
    console.error(`Form copy link: ${error.message}`);
    return { ok: false, message: "The link couldn’t be replaced. Try again in a moment." };
  }
  if (!data?.length) return { ok: false, message: "Only the owner of the current link can replace it. Reload and try again." };
  return { ok: true, token, message: "New link and QR code generated. The previous link and QR code no longer work." };
}

/** The copy's name, and who can open it: for the person who started it. */
export async function setFormCopySharing(input: { code: string; token: string; label: string; access: CopyAccess; members?: string[] }): Promise<{ ok: true; message: string; label: string; access: CopyAccess; members: string[] } | Fail> {
  const found = await formFor(input?.code);
  if (!found || !isToken(input.token)) return GONE;
  const who = await formWho();
  if (!who) return { ok: false, message: "Sign in with Google as the person who started this copy." };
  let row: CopyRow | null;
  try {
    row = await rowOf(found.form.id, input.token);
  } catch (e) {
    console.error(e);
    return UNREACHABLE;
  }
  if (!row) return GONE;
  if (row.owner_email !== who.email) return { ok: false, message: "Only the person who started this copy can change who can open it." };
  const sharing = readSharing(input, who.email);
  if (typeof sharing === "string") return { ok: false, message: sharing };
  if (!(await allow(`form-copy-share:${who.email}`, 600, 60))) return BUSY;
  // New sharing, new live channel: someone taken off is left on one no page uses any more.
  const reshared = sharing.access !== row.access || sharing.members.join() !== row.members.join();
  const { error } = await adminDb()
    .from("form_responses")
    .update({
      label: sharing.label,
      access: sharing.access,
      members: sharing.members,
      // Someone added by hand no longer waits on their request.
      access_requests: (row.access_requests ?? []).filter((q) => !q?.email || !sharing.members.includes(q.email)) as unknown as Json,
      ...(reshared && { live: randomUUID() }),
    })
    .eq("id", row.id);
  if (error) {
    console.error(`Form copy sharing: ${error.message}`);
    return { ok: false, message: "Sharing couldn’t be saved. Try again in a moment." };
  }
  return { ok: true, message: sharing.access === "private" ? "Saved. Only the people you added can open this copy." : "Saved. Anyone with the link can open this copy.", ...sharing };
}

/* ---------- Asking for access ---------- */

/** Ask the owner of a private copy to let the account signed in with Google open it. */
export async function requestFormCopyAccess(input: { code: string; token: string }): Promise<{ ok: true; message: string } | Fail> {
  const found = await formFor(input?.code);
  if (!found || !isToken(input.token)) return GONE;
  const who = await formWho();
  if (!who) return { ok: false, message: "Sign in with Google first, so the owner knows who is asking." };
  if (!(await allow(`form-copy-ask:${who.email}`, 3600, 20)) || !(await allow(`form-copy-ask:${input.token}:${await clientKey()}`, 3600, 10))) return BUSY;
  const { data, error } = await adminDb().rpc("hub_form_copy_request", { p_form_id: found.form.id, p_token: input.token, p_email: who.email, p_name: who.name.slice(0, 120), p_avatar: who.avatar ?? "" });
  if (error || !data) {
    console.error(`Form copy request: ${error?.message ?? "no result"}`);
    return { ok: false, message: "Your request couldn’t be sent. Try again in a moment." };
  }
  if (data === "gone") return GONE;
  if (data === "sent") return SENT;
  if (data === "open" || data === "member") return { ok: true, message: "You can open this copy now. Reload the page." };
  if (data === "asked") return { ok: true, message: "You’ve already asked. The owner will let you in from the copy’s Share sheet." };
  if (data === "full") return { ok: false, message: "This copy can’t take more requests. Ask the person who started it to add you." };
  return { ok: true, message: "Request sent. You can open the copy once its owner lets you in." };
}

/** Let someone who asked open a private copy, or turn them down: for the person who started it. */
export async function answerFormCopyRequest(input: { code: string; token: string; email: string; allow: boolean }): Promise<{ ok: true; message: string; members?: string[]; requests: CopyRequest[] } | Fail> {
  const found = await formFor(input?.code);
  if (!found || !isToken(input.token)) return GONE;
  const email = copyEmail(input.email);
  if (!email) return { ok: false, message: "That request couldn’t be found. Reload and try again." };
  const who = await formWho();
  if (!who) return { ok: false, message: "Sign in with Google as the person who started this copy." };
  if (!(await allow(`form-copy-share:${who.email}`, 600, 60))) return BUSY;
  const { data, error } = await adminDb().rpc("hub_form_copy_answer", { p_form_id: found.form.id, p_token: input.token, p_owner: who.email, p_email: email, p_allow: input.allow === true });
  if (error || !data) {
    console.error(`Form copy answer: ${error?.message ?? "no result"}`);
    return { ok: false, message: "Your answer couldn’t be saved. Try again in a moment." };
  }
  if (data === "gone") return GONE;
  if (data === "owner") return { ok: false, message: "Only the person who started this copy can let people in." };
  if (data === "full") return { ok: false, message: `A copy takes up to ${COPY_LIMITS.members} people. Remove someone first.` };
  let row: CopyRow | null = null;
  try {
    row = await rowOf(found.form.id, input.token);
  } catch (e) {
    console.error(e);
  }
  const requests = requestsOf(row?.access_requests ?? []);
  if (data === "none") return { ok: true, message: "That request was already answered.", requests, ...(row && { members: row.members }) };
  return { ok: true, message: input.allow ? `${email} can open this copy now.` : `Request from ${email} declined.`, requests, ...(row && { members: row.members }) };
}

/** Sign out on a form's page: forget the form's Google sign-in and end the Hub session, if any, so no one is signed in. */
export async function signOutOfForm(): Promise<{ ok: true }> {
  (await cookies()).set(FORM_WHO_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  await endSession();
  return { ok: true };
}
