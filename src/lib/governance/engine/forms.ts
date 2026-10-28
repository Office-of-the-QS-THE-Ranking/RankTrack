/*
 * Digital Forms: a unit's own forms and the Office's, which every unit sees. They're written by the same people
 * as the Workspace beside them (a unit's contributors, or for the Office the Knowledge Center's editors). A form
 * starts as a draft, opens to take responses, and closes; it never goes back to draft, so only a draft (which
 * has never taken a response) can be deleted. Its questions change only while it's a draft. Every change is
 * authorized and audited. Responses are written outside the store (app/actions/forms.ts).
 */
import type { Command, CommandResult } from "../commands";
import type { FormRecord } from "../types";
import { FORM_LIMITS, formKindLabel, isFormKind } from "@/lib/forms/kinds";
import { hasEmoji } from "@/lib/forms/letters";
import { readSchema } from "@/lib/forms/schema";
import { can, deny, invalid, log, nextId, ok, unitById, type Ctx } from "./core";

const res = (f: { id: string; title: string }) => ({ type: "Digital form", id: f.id, label: f.title });

/** Who may change a form: the unit's contributors, or for the Office's forms the Knowledge Center's editors. */
const writes = (ctx: Ctx, unitId: string | undefined) => (unitId ? can(ctx, "evidence", "submit", { unitId }) : can(ctx, "knowledge", "edit"));

const GONE = "That form is no longer here. Refresh and try again.";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: string) => DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "");

/** A responder link code no form has: eight letters and digits that can't be misread. */
function newCode(ctx: Ctx) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const code = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
    if (!ctx.state.records.forms.some((f) => f.code === code)) return code;
  }
}

/** A reference prefix from a title's first letters: Community Development Project Proposal → CDPP. */
const prefixOf = (title: string) =>
  title
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase())
    .join("")
    .slice(0, 4) || "R";

export function saveForm(ctx: Ctx, cmd: Extract<Command, { type: "form.save" }>): CommandResult {
  const form = cmd.id === undefined ? undefined : ctx.state.records.forms.find((f) => f.id === cmd.id);
  if (cmd.id !== undefined && !form) return invalid(GONE);
  const unitId = form ? form.unitId : typeof cmd.unitId === "string" && cmd.unitId ? cmd.unitId : undefined;
  if (!form && unitId && !unitById(ctx, unitId)) return invalid("That unit no longer exists.");
  const target = form ? res(form) : { type: "Digital Forms", id: unitId ?? "office", label: unitId ? (unitById(ctx, unitId)?.name ?? unitId) : "Office of QS/THE Rankings" };
  if (!writes(ctx, unitId)) return deny(ctx, "form.save", "Data", target, unitId ? "Your role cannot change this unit’s forms." : "Your role cannot change the Office’s forms.");

  const title = clean(cmd.title, FORM_LIMITS.title);
  if (!title) return invalid("Give the form a title.");
  if (title.length > FORM_LIMITS.title) return invalid(`Keep the title under ${FORM_LIMITS.title} characters.`);
  const description = clean(cmd.description, FORM_LIMITS.description);
  if (description.length > FORM_LIMITS.description) return invalid(`Keep the description under ${FORM_LIMITS.description} characters.`);
  if (!isFormKind(cmd.kind)) return invalid("Choose what kind of form it is.");
  const reference = clean(cmd.reference, FORM_LIMITS.reference);
  if (reference.length > FORM_LIMITS.reference) return invalid(`Keep the form number under ${FORM_LIMITS.reference} characters.`);
  if ([title, description, reference].some(hasEmoji)) return invalid("Take the emoji out of the form’s title, description and number.");
  const issuerId = typeof cmd.issuerId === "string" && cmd.issuerId ? cmd.issuerId : undefined;
  if (issuerId && !unitById(ctx, issuerId)) return invalid("Choose the issuing office from the list.");
  const closesOn = typeof cmd.closesOn === "string" ? cmd.closesOn : "";
  if (closesOn && !validDay(closesOn)) return invalid("Choose the day the form closes.");
  const prefix = cmd.prefix === undefined ? (form?.prefix ?? prefixOf(title)) : typeof cmd.prefix === "string" ? cmd.prefix.trim().toUpperCase() : "";
  if (!new RegExp(`^[A-Z]{1,${FORM_LIMITS.prefix}}$`).test(prefix)) return invalid(`Use 1 to ${FORM_LIMITS.prefix} letters for the reference prefix.`);

  let schema = form?.schema;
  if (cmd.schema !== undefined) {
    if (form && form.status !== "draft") return invalid("Questions change only while a form is a draft. Duplicate it to change them.");
    const read = readSchema(cmd.schema);
    if (typeof read === "string") return invalid(read);
    schema = read;
  }
  if (!schema) return invalid("Add the form’s questions.");

  // Team copies: the form's link builds a copy with its own reference and link for a team to fill in together.
  const copies = cmd.copies === undefined ? !!form?.copies : cmd.copies === true;
  const fields = { title, description, kind: cmd.kind, prefix, schema, ...(reference && { reference }), ...(issuerId && { issuerId }), ...(closesOn && { closesOn }), ...(copies && { copies }) };
  if (form) {
    const changes: string[] = (["title", "description", "kind", "reference", "issuerId", "closesOn", "prefix"] as const).filter((k) => (form[k] ?? "") !== ((fields as Partial<FormRecord>)[k] ?? ""));
    if (copies !== !!form.copies) changes.push(copies ? "team copies on" : "team copies off");
    if (cmd.schema !== undefined && JSON.stringify(form.schema) !== JSON.stringify(schema)) changes.push("questions");
    if (!changes.length) return ok("No changes.");
    for (const k of ["reference", "issuerId", "closesOn", "copies"] as const) if (!(k in fields)) delete form[k];
    Object.assign(form, fields, { updatedAt: ctx.iso, updatedBy: ctx.actor.id });
    log(ctx, "form.save", "Data", res(form), "Success", `Changed ${changes.join(", ")}`);
    return ok("Form saved.");
  }
  const made: FormRecord = {
    id: nextId(ctx, "form", "FM-", 4),
    ...(unitId && { unitId }),
    code: newCode(ctx),
    status: "draft",
    ...fields,
    createdBy: ctx.actor.id,
    createdAt: ctx.iso,
    updatedAt: ctx.iso,
    updatedBy: ctx.actor.id,
  };
  ctx.state.records.forms.unshift(made);
  log(ctx, "form.save", "Data", res(made), "Success", `Created · ${formKindLabel(made.kind)}${made.copies ? " · team copies" : ""} · draft`);
  return ok("Form created.", { data: { id: made.id } });
}

/** Draft → open → closed ↔ open. A form never goes back to draft. */
export function setFormStatus(ctx: Ctx, cmd: Extract<Command, { type: "form.status" }>): CommandResult {
  const form = ctx.state.records.forms.find((f) => f.id === cmd.id);
  if (!form) return invalid(GONE);
  if (!writes(ctx, form.unitId)) return deny(ctx, "form.status", "Data", res(form), "Your role cannot change this form.");
  if (cmd.status !== "open" && cmd.status !== "closed") return invalid(cmd.status === "draft" ? "A form that has opened can’t go back to draft. Duplicate it instead." : "Choose open or closed.");
  if (cmd.status === form.status) return ok("No changes.");
  if (form.status === "draft" && cmd.status === "closed") return invalid("Open the form before closing it.");
  if (cmd.status === "open" && !form.schema.sections.some((s) => s.fields.some((f) => f.type !== "note"))) return invalid("Add a question before opening the form.");
  log(ctx, "form.status", "Data", res(form), "Success", `${form.status} → ${cmd.status}`);
  Object.assign(form, { status: cmd.status, updatedAt: ctx.iso, updatedBy: ctx.actor.id });
  return ok(cmd.status === "open" ? "Taking responses." : "Responses closed.");
}

/** A draft copy: same questions, a new link, no responses. */
export function duplicateForm(ctx: Ctx, cmd: Extract<Command, { type: "form.duplicate" }>): CommandResult {
  const form = ctx.state.records.forms.find((f) => f.id === cmd.id);
  if (!form) return invalid(GONE);
  if (!writes(ctx, form.unitId)) return deny(ctx, "form.duplicate", "Data", res(form), "Your role cannot copy this form.");
  const { closesOn: _closes, ...rest } = form;
  void _closes;
  const copy: FormRecord = {
    ...structuredClone(rest),
    id: nextId(ctx, "form", "FM-", 4),
    code: newCode(ctx),
    title: `Copy of ${form.title}`.slice(0, FORM_LIMITS.title),
    status: "draft",
    createdBy: ctx.actor.id,
    createdAt: ctx.iso,
    updatedAt: ctx.iso,
    updatedBy: ctx.actor.id,
  };
  ctx.state.records.forms.unshift(copy);
  log(ctx, "form.duplicate", "Data", res(copy), "Success", `Copied from ${form.id}`);
  return ok("Copy made as a draft.", { data: { id: copy.id } });
}

export function deleteForm(ctx: Ctx, cmd: Extract<Command, { type: "form.delete" }>): CommandResult {
  const form = ctx.state.records.forms.find((f) => f.id === cmd.id);
  if (!form) return invalid(GONE);
  if (!writes(ctx, form.unitId)) return deny(ctx, "form.delete", "Data", res(form), "Your role cannot delete this form.");
  if (form.status !== "draft") return invalid("Only a draft can be deleted. Close the form to stop its responses.");
  ctx.state.records.forms = ctx.state.records.forms.filter((f) => f !== form);
  log(ctx, "form.delete", "Data", res(form), "Success", "Draft deleted");
  return ok("Draft deleted.");
}
