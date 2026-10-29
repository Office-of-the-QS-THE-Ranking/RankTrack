"use server";

/*
 * Digital Forms' responses, kept in form_responses outside the governance store so a busy form never rewrites
 * it. Anyone with a form's responder link may send one: it's rate-limited and checked against the form's own
 * rules (lib/forms), the same ones the page ran. A survey assigned through the Student Portal keeps the Student
 * account that answered it, once. Reading responses, recording the review's sign-offs and office fields, removing
 * responses and exporting them each need their own right on the form (lib/forms/access.ts); each is audited. A
 * response is its own record, so sending one isn't.
 */
import type { FormRights } from "@/lib/forms/access";
import { FORM_CODE, FORM_LIMITS } from "@/lib/forms/kinds";
import { checkAnswers, problemText, respondentOf, type CheckContext } from "@/lib/forms/check";
import { responsesCsv } from "@/lib/forms/csv";
import { manilaDay } from "@/lib/forms/format";
import { hasEmoji, isName } from "@/lib/forms/letters";
import { readConsent } from "@/lib/forms/privacy";
import { decisionLabel, emptyReview, standing } from "@/lib/forms/review";
import type { Answers, ReviewState, Signature, StageDecision } from "@/lib/forms/types";
import { isSent, type FormResponseItem, type SentResponse } from "@/lib/governance/hub-types";
import { log } from "@/lib/governance/engine/core";
import { formById, formUnits, responseOf, responsesOf, rightsFor, takesResponses } from "@/lib/governance/server/forms";
import { allow, allowAccount, clientKey } from "@/lib/governance/server/limits";
import { run } from "@/lib/governance/server/run";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { assignedTo } from "@/lib/governance/server/student-portal";
import { filesForms } from "@/lib/forms/access";
import type { FormRecord } from "@/lib/governance/types";
import type { Json } from "@/lib/supabase/database.types";
import { adminDb } from "@/lib/supabase/server";

type Fail = { ok: false; message: string };

const ENDED: Fail = { ok: false, message: "Your session has ended. Sign in again to continue." };
const GONE: Fail = { ok: false, message: "That form is no longer here. Refresh and try again." };
const BUSY: Fail = { ok: false, message: "Too many changes in a short time. Wait a minute and try again." };
const CLOSED = "This form isn’t taking responses.";

/** Responses one network may send to one form in an hour, and all of them together. */
const SENDS = { perClientHour: 20, perFormHour: 600 };

const checkContext = async (): Promise<CheckContext> => ({ units: formUnits((await readState()).units) });

const said = problemText;

type Need = keyof Pick<FormRights, "read" | "review" | "clear" | "export">;

const REFUSED: Record<Need, string> = {
  read: "Your role can’t see this form’s responses.",
  review: "Your role can’t review this form’s responses.",
  clear: "Your role can’t remove this form’s responses.",
  export: "Your role can’t export this form’s responses.",
};

/** The form, if the signed-in viewer may do `need` with it. */
async function runFor(formId: unknown, need: Need): Promise<{ form: FormRecord; viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>> } | Fail> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  const form = typeof formId === "string" ? await formById(formId) : null;
  if (!form) return GONE;
  if (!rightsFor(viewer, form)[need]) return { ok: false, message: REFUSED[need] };
  return { form, viewer };
}

const audit = (viewerId: string, action: string, form: FormRecord, id: string, detail: string, category: "Data" | "Export" = "Data") =>
  run(viewerId, (ctx) => {
    log(ctx, action, category, { type: "Form response", id, label: `${form.title} · ${id}` }, "Success", detail);
    return { ok: true, message: "" };
  });

/* ---------- Responding ---------- */

export type Sent = { ok: true; ref: string; at: string } | { ok: false; message: string; section?: string; field?: string };

/** One response through a form's responder link. `trap` is a field people never see; anything in it is a bot. */
export async function submitFormResponse(input: { code: string; answers: unknown; consent?: unknown; trap?: string }): Promise<Sent> {
  const code = typeof input?.code === "string" ? input.code : "";
  if (!FORM_CODE.test(code)) return { ok: false, message: CLOSED };
  if (typeof input.trap === "string" && input.trap) return { ok: false, message: "That response couldn’t be sent." };
  // Step 0: no response is taken without both statements of the current data privacy notice.
  const consent = readConsent(input.consent);
  if (!consent) return { ok: false, message: "Agree to the data privacy notice first. It may have changed since you began.", section: "privacy" };
  let size: number;
  try {
    size = JSON.stringify(input.answers ?? null).length;
  } catch {
    return { ok: false, message: "That response couldn’t be read. Reload the page and try again." };
  }
  if (size > FORM_LIMITS.answers) return { ok: false, message: "That response is too large to send. Shorten the longest answers." };
  const state = await readState();
  const form = state.records.forms.find((f) => f.code === code);
  if (!form || !takesResponses(form)) return { ok: false, message: CLOSED };
  // A form with team copies is answered through a copy, built from the Student Portal (actions/form-copies.ts).
  if (form.copies) return { ok: false, message: "This form is filled in as a copy from the Student Portal." };
  // A survey assigned through the Student Portal keeps the Student who answered it, and takes one answer from each.
  const viewer = await getViewer();
  const student = viewer && filesForms(viewer.grants) && (await assignedTo(viewer, form)) ? viewer : null;
  if (student) {
    const { data: before, error: seen } = await adminDb().from("form_responses").select("ref").eq("form_id", form.id).eq("account_id", student.id).neq("status", "draft").limit(1);
    if (seen) {
      console.error(`Form ${form.id}: ${seen.message}`);
      return { ok: false, message: "Your response couldn’t be saved. Try again in a moment." };
    }
    if (before?.length) return { ok: false, message: `You already answered this survey (${before[0].ref}).` };
  }

  // Anyone may respond, so cap what one network, and everyone together, can send to a form. If the counter can't
  // be reached, nothing is sent.
  const client = await clientKey();
  const mine = `form:${form.id}:${client}`;
  const all = `form:${form.id}`;
  if (!(await allow(mine, 3600, SENDS.perClientHour, false, false))) return { ok: false, message: "Too many responses were sent from your network. Try again in an hour." };
  if (!(await allow(all, 3600, SENDS.perFormHour, false, false))) return { ok: false, message: "This form is receiving many responses right now. Try again in a few minutes." };

  const { answers, problems } = checkAnswers(form.schema.sections, input.answers, { units: formUnits(state.units) });
  if (problems.length) return { ok: false, message: said(form.schema, problems[0]), section: problems[0].section, field: problems[0].field };
  // Signatures are dated the day they arrive, whatever the browser said.
  const today = manilaDay();
  for (const s of form.schema.sections)
    for (const f of s.fields) if (f.type === "signature" && Array.isArray(answers[f.id])) answers[f.id] = (answers[f.id] as Signature[]).map((x) => ({ ...x, on: x.name ? today : "" }));

  if (!(await allow(mine, 3600, SENDS.perClientHour, true, false)) || !(await allow(all, 3600, SENDS.perFormHour, true, false))) return { ok: false, message: "Too many responses at once. Try again in a few minutes." };
  const { data, error } = await adminDb().rpc("hub_form_submit", {
    p_form_id: form.id,
    p_prefix: form.prefix,
    p_answers: answers as unknown as Json,
    p_respondent: respondentOf(form.schema, answers),
    p_status: standing(form.schema, answers, emptyReview()).status,
    p_client: client,
    p_consent: consent as unknown as Json,
    ...(student && { p_account: student.id }),
  });
  const row = data?.[0];
  if (error || !row) {
    console.error(`Form ${form.id}: ${error ? error.message : "no row"}`);
    return { ok: false, message: "Your response couldn’t be saved. Try again in a moment." };
  }
  return { ok: true, ref: row.ref, at: new Date(row.submitted_at).toISOString() };
}

/* ---------- Running a form ---------- */

export async function loadFormResponses(formId: string): Promise<{ ok: true; responses: FormResponseItem[] } | Fail> {
  const who = await runFor(formId, "read");
  if ("ok" in who) return who;
  try {
    return { ok: true, responses: await responsesOf(who.form.id, true) };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Responses can’t be loaded right now. Try again in a moment." };
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ReviewInput = {
  formId: string;
  id: string;
  /** Record a sign-off, or with `clear` undo the latest one. */
  stage?: { id: string; decision?: StageDecision; name?: string; on?: string; note?: string; clear?: boolean };
  /** The office's own fields, as a whole. */
  fields?: unknown;
};

/** Record a response's next sign-off (or undo the latest), or its office fields. */
export async function reviewFormResponse(input: ReviewInput): Promise<{ ok: true; message: string; response: FormResponseItem } | Fail> {
  const who = await runFor(input?.formId, "review");
  if ("ok" in who) return who;
  const { form, viewer } = who;
  if (!(await allowAccount(viewer.id, "command"))) return BUSY;
  const current = typeof input.id === "string" ? await responseOf(form.id, input.id).catch(() => null) : null;
  if (!current) return { ok: false, message: "That response is no longer here. Refresh and try again." };
  const review: ReviewState = structuredClone(current.review);
  const changes: string[] = [];
  let message = "Saved.";

  if (input.stage) {
    const { stages, next } = standing(form.schema, current.answers, review);
    const spec = stages.find((s) => s.id === input.stage!.id);
    if (!spec) return { ok: false, message: "That sign-off doesn’t apply to this response." };
    if (input.stage.clear) {
      // Later sign-offs rest on earlier ones, so only the latest can be undone.
      if (stages.filter((s) => review.stages[s.id]).at(-1)?.id !== spec.id) return { ok: false, message: "Undo the later sign-offs first." };
      changes.push(`Undid ${decisionLabel(spec, review.stages[spec.id]).toLowerCase()} by ${spec.role}`);
      delete review.stages[spec.id];
      message = "Sign-off undone.";
    } else {
      if (next?.id !== spec.id) return { ok: false, message: next ? `Record ${next.role.toLowerCase()}’s sign-off first.` : "This response’s review is finished." };
      const decision = input.stage.decision;
      if (decision !== "approved" && decision !== "returned" && decision !== "declined") return { ok: false, message: "Choose a decision." };
      const name = typeof input.stage.name === "string" ? input.stage.name.replace(/\s+/g, " ").trim().toLocaleUpperCase("en-PH") : "";
      if (!name || name.length > 80) return { ok: false, message: `Enter the ${spec.role.toLowerCase()}’s name.` };
      if (!isName(name)) return { ok: false, message: "Use letters only for the name, like JUAN DELA CRUZ." };
      const on = typeof input.stage.on === "string" && DAY.test(input.stage.on) ? input.stage.on : "";
      if (!on || on > manilaDay()) return { ok: false, message: "Choose the day of the decision, today or earlier." };
      const note = typeof input.stage.note === "string" ? input.stage.note.trim().slice(0, 601) : "";
      if (note.length > 600) return { ok: false, message: "Keep the note under 600 characters." };
      if (hasEmoji(note)) return { ok: false, message: "Take the emoji out of the note." };
      if (decision !== "approved" && !note) return { ok: false, message: "Say why, in a note." };
      review.stages[spec.id] = { decision, name, on, ...(note && { note }), by: viewer.name, at: new Date().toISOString() };
      const verb = decisionLabel(spec, review.stages[spec.id]);
      changes.push(`${verb} by ${spec.role}: ${name}`);
      message = `${verb}.`;
    }
  }

  if (input.fields !== undefined) {
    const office = form.schema.review?.fields ?? [];
    const { answers, problems } = checkAnswers([{ id: "review", title: "Office", fields: office }], input.fields, await checkContext(), current.answers, form.schema.sections.flatMap((s) => s.fields));
    if (problems.length) return { ok: false, message: said(form.schema, problems[0]) };
    if (JSON.stringify(answers) !== JSON.stringify(review.fields)) {
      review.fields = answers as Answers;
      changes.push("Office fields");
    }
  }

  if (!changes.length) return { ok: true, message: "No changes.", response: current };
  const status = standing(form.schema, current.answers, review).status;
  const at = new Date().toISOString();
  // Only over the version that was read: two reviewers saving at once don't overwrite each other.
  const { data, error } = await adminDb()
    .from("form_responses")
    .update({ review: review as unknown as Json, status, updated_at: at })
    .eq("id", current.id)
    .eq("updated_at", current.updatedAt)
    .select("id");
  if (error) {
    console.error(error);
    return { ok: false, message: "The review couldn’t be saved. Try again in a moment." };
  }
  if (!data?.length) return { ok: false, message: "Someone else just changed this response. Reopen it and try again." };
  await audit(viewer.id, "form.review", form, current.ref, changes.join(" · "));
  return { ok: true, message, response: { ...current, review, status, updatedAt: at } };
}

/** Remove responses for good: test runs, duplicates. */
export async function deleteFormResponses(input: { formId: string; ids: string[] }): Promise<{ ok: true; message: string } | Fail> {
  const who = await runFor(input?.formId, "clear");
  if ("ok" in who) return who;
  const { form, viewer } = who;
  if (!(await allowAccount(viewer.id, "command"))) return BUSY;
  const ids = Array.isArray(input.ids) ? [...new Set(input.ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)))].slice(0, 200) : [];
  if (!ids.length) return { ok: false, message: "Choose at least one response." };
  const { data, error } = await adminDb().from("form_responses").delete().eq("form_id", form.id).in("id", ids).neq("status", "draft").select("ref");
  if (error) {
    console.error(error);
    return { ok: false, message: "Responses couldn’t be removed. Try again in a moment." };
  }
  const refs = (data ?? []).map((r) => r.ref);
  if (!refs.length) return { ok: false, message: "Those responses are no longer here." };
  await audit(viewer.id, "form.response.delete", form, refs.join(", "), `Removed ${refs.length === 1 ? "1 response" : `${refs.length} responses`}`);
  return { ok: true, message: refs.length === 1 ? "Response removed." : `${refs.length} responses removed.` };
}

/** Every response as a CSV file. */
export async function exportFormResponses(formId: string): Promise<{ ok: true; csv: string; name: string } | Fail> {
  const who = await runFor(formId, "export");
  if ("ok" in who) return who;
  const { form, viewer } = who;
  if (!(await allowAccount(viewer.id, "export"))) return BUSY;
  let responses: SentResponse[];
  try {
    responses = (await responsesOf(form.id)).filter(isSent);
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Responses can’t be exported right now. Try again in a moment." };
  }
  const csv = responsesCsv(form.schema, [...responses].reverse(), await checkContext());
  await audit(viewer.id, "form.export", form, form.id, `${responses.length === 1 ? "1 response" : `${responses.length} responses`} exported as CSV`, "Export");
  return { ok: true, csv, name: `${form.prefix.toLowerCase()}-responses-${manilaDay()}.csv` };
}
