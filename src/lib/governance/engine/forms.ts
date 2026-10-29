/*
 * Digital Forms: the Office's, a unit's, and a Student's own (lib/forms/access.ts says who may do what). A form
 * starts as a draft, opens to take responses, and closes; it never goes back to draft, so only a draft (which has
 * never taken a response) can be deleted, and its questions and kind change only while it's a draft. Evaluation
 * and Registration Forms are fixed once published. The Office publishes its proposals, terminal reports and
 * surveys to the Student Portal (and a unit its surveys, to its own Students). Every change is authorized and
 * audited. Responses are written outside the store (app/actions/forms.ts).
 */
import { ROLE } from "../catalog";
import type { Command, CommandResult } from "../commands";
import { descendants } from "../rbac";
import type { FormRecord } from "../types";
import { HOLDER_KINDS, buildsCopies, creatable, formRights, holderOf, isLocked, PORTAL_KINDS, type FormHolder } from "@/lib/forms/access";
import { FORM_LIMITS, formKindLabel, isFormKind } from "@/lib/forms/kinds";
import { hasEmoji } from "@/lib/forms/letters";
import { readSchema } from "@/lib/forms/schema";
import { deny, invalid, log, nextId, ok, unitById, type Ctx } from "./core";

const res = (f: { id: string; title: string }) => ({ type: "Digital form", id: f.id, label: f.title });

const rightsOf = (ctx: Ctx, f: FormRecord) => formRights(ctx.actor.grants, ctx.actor.id, f);

const GONE = "That form is no longer here. Refresh and try again.";
const FIXED = "This form is published, so it can’t change. Duplicate it to make another.";

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

/** The unit a Student's forms are kept under: the one their role is held in. */
const studentUnit = (ctx: Ctx) => ctx.actor.grants.find((g) => g.roleId === ROLE.student && g.scopeUnits !== "all")?.scopeUnits;

/** Where a new form goes, or why it can't be made there. */
function placeNew(ctx: Ctx, cmd: Extract<Command, { type: "form.save" }>): { holder: FormHolder; unitId?: string; ownerId?: string; label: string } | string {
  if (cmd.own === true) {
    const scope = studentUnit(ctx);
    if (!scope || scope === "all" || !scope[0]) return "Only a Student’s role keeps forms of its own.";
    return { holder: "student", unitId: scope[0], ownerId: ctx.actor.id, label: ctx.actor.name };
  }
  if (typeof cmd.unitId === "string" && cmd.unitId) {
    const unit = unitById(ctx, cmd.unitId);
    if (!unit) return "That unit no longer exists.";
    return { holder: "unit", unitId: unit.id, label: unit.name };
  }
  return { holder: "office", label: "Office of QS/THE Rankings" };
}

export function saveForm(ctx: Ctx, cmd: Extract<Command, { type: "form.save" }>): CommandResult {
  const form = cmd.id === undefined ? undefined : ctx.state.records.forms.find((f) => f.id === cmd.id);
  if (cmd.id !== undefined && !form) return invalid(GONE);

  let holder: FormHolder;
  let unitId: string | undefined;
  let ownerId: string | undefined;
  if (form) {
    const rights = rightsOf(ctx, form);
    if (!rights.edit) {
      if (isLocked(form) && formRights(ctx.actor.grants, ctx.actor.id, { ...form, status: "draft" }).edit) return invalid(FIXED);
      return deny(ctx, "form.save", "Data", res(form), "Your role cannot change this form.");
    }
    ({ unitId, ownerId } = form);
    holder = holderOf(form);
  } else {
    const place = placeNew(ctx, cmd);
    if (typeof place === "string") return invalid(place);
    ({ holder, unitId, ownerId } = place);
    if (!creatable(ctx.actor.grants, holder, unitId).length) {
      const why = holder === "office" ? "Your role cannot make the Office’s forms." : holder === "unit" ? "Your role cannot make this unit’s forms." : "Your role cannot make forms of its own.";
      return deny(ctx, "form.save", "Data", { type: "Digital Forms", id: unitId ?? "office", label: place.label }, why);
    }
  }

  const title = clean(cmd.title, FORM_LIMITS.title);
  if (!title) return invalid("Give the form a title.");
  if (title.length > FORM_LIMITS.title) return invalid(`Keep the title under ${FORM_LIMITS.title} characters.`);
  const description = clean(cmd.description, FORM_LIMITS.description);
  if (description.length > FORM_LIMITS.description) return invalid(`Keep the description under ${FORM_LIMITS.description} characters.`);
  if (!isFormKind(cmd.kind)) return invalid("Choose what kind of form it is.");
  if (!HOLDER_KINDS[holder].includes(cmd.kind)) return invalid(holder === "student" ? "Students make Evaluation Forms and Registration Forms." : `${formKindLabel(cmd.kind)}s come from the Office.`);
  if (form && cmd.kind !== form.kind && form.status !== "draft") return invalid("A form’s kind changes only while it’s a draft.");
  const reference = clean(cmd.reference, FORM_LIMITS.reference);
  if (reference.length > FORM_LIMITS.reference) return invalid(`Keep the form number under ${FORM_LIMITS.reference} characters.`);
  if ([title, description, reference].some(hasEmoji)) return invalid("Take the emoji out of the form’s title, description and number.");
  const issuerId = typeof cmd.issuerId === "string" && cmd.issuerId ? cmd.issuerId : undefined;
  if (issuerId && !unitById(ctx, issuerId)) return invalid("Choose the issuing office from the list.");
  // A unit's or a Student's form names its own unit (or one within it) as the issuer, never another office.
  if (issuerId && unitId && !descendants(ctx.state.units, unitId).includes(issuerId) && issuerId !== form?.issuerId) return invalid("Name your own unit as the issuer.");
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
  // A Student's form has no sign-offs or office fields: nobody signs off on their own evaluation or registration.
  if (holder === "student" && schema.review) {
    const { review: _review, ...rest } = schema;
    void _review;
    schema = rest;
  }

  // Proposals and Terminal Reports are filled in as team copies; no other kind is. Only those and surveys stay on the Student Portal.
  const copies = buildsCopies(cmd.kind);
  const students = !!form?.students && PORTAL_KINDS.includes(cmd.kind);
  const fields = { title, description, kind: cmd.kind, prefix, schema, ...(reference && { reference }), ...(issuerId && { issuerId }), ...(closesOn && { closesOn }), ...(copies && { copies }), ...(students && { students }) };
  if (form) {
    const changes: string[] = (["title", "description", "kind", "reference", "issuerId", "closesOn", "prefix"] as const).filter((k) => (form[k] ?? "") !== ((fields as Partial<FormRecord>)[k] ?? ""));
    if (cmd.schema !== undefined && JSON.stringify(form.schema) !== JSON.stringify(schema)) changes.push("questions");
    if (!changes.length) return ok("No changes.");
    if (!students && form.students) changes.push("off the Student Portal");
    for (const k of ["reference", "issuerId", "closesOn", "copies", "students"] as const) if (!(k in fields)) delete form[k];
    Object.assign(form, fields, { updatedAt: ctx.iso, updatedBy: ctx.actor.id });
    log(ctx, "form.save", "Data", res(form), "Success", `Changed ${changes.join(", ")}`);
    return ok("Form saved.");
  }
  const made: FormRecord = {
    id: nextId(ctx, "form", "FM-", 4),
    ...(unitId && { unitId }),
    ...(ownerId && { ownerId }),
    code: newCode(ctx),
    status: "draft",
    ...fields,
    createdBy: ctx.actor.id,
    createdAt: ctx.iso,
    updatedAt: ctx.iso,
    updatedBy: ctx.actor.id,
  };
  ctx.state.records.forms.unshift(made);
  log(ctx, "form.save", "Data", res(made), "Success", `Created · ${formKindLabel(made.kind)}${holder === "student" ? " · a Student’s own" : ""}${made.copies ? " · team copies" : ""} · draft`);
  return ok("Form created.", { data: { id: made.id } });
}

/** Draft → open → closed ↔ open. A form never goes back to draft; opening an Evaluation or Registration Form publishes it for good. */
export function setFormStatus(ctx: Ctx, cmd: Extract<Command, { type: "form.status" }>): CommandResult {
  const form = ctx.state.records.forms.find((f) => f.id === cmd.id);
  if (!form) return invalid(GONE);
  if (!rightsOf(ctx, form).status) return deny(ctx, "form.status", "Data", res(form), "Your role cannot change this form.");
  if (cmd.status !== "open" && cmd.status !== "closed") return invalid(cmd.status === "draft" ? "A form that has opened can’t go back to draft. Duplicate it instead." : "Choose open or closed.");
  if (cmd.status === form.status) return ok("No changes.");
  if (form.status === "draft" && cmd.status === "closed") return invalid("Open the form before closing it.");
  if (cmd.status === "open" && !form.schema.sections.some((s) => s.fields.some((f) => f.type !== "note"))) return invalid("Add a question before opening the form.");
  const publishing = form.status === "draft" && isLocked({ kind: form.kind, status: "open" });
  log(ctx, "form.status", "Data", res(form), "Success", `${form.status} → ${cmd.status}${publishing ? " · published, fixed" : ""}`);
  Object.assign(form, { status: cmd.status, updatedAt: ctx.iso, updatedBy: ctx.actor.id });
  return ok(publishing ? "Published. Its responses now reach the Office." : cmd.status === "open" ? "Taking responses." : "Responses closed.");
}

/** Publish a form to the Student Portal, or take it off: copies to build for a proposal or terminal report, an assignment for a survey. */
export function setFormPortal(ctx: Ctx, cmd: Extract<Command, { type: "form.portal" }>): CommandResult {
  const form = ctx.state.records.forms.find((f) => f.id === cmd.id);
  if (!form) return invalid(GONE);
  if (!PORTAL_KINDS.includes(form.kind)) return invalid("Only proposals, terminal reports and surveys go to the Student Portal.");
  if (!rightsOf(ctx, form).portal) return deny(ctx, "form.portal", "Data", res(form), "Your role cannot publish this form to the Student Portal.");
  const on = cmd.on === true;
  if (on === !!form.students) return ok("No changes.");
  if (on) form.students = true;
  else delete form.students;
  Object.assign(form, { updatedAt: ctx.iso, updatedBy: ctx.actor.id });
  log(ctx, "form.portal", "Data", res(form), "Success", on ? "Published to the Student Portal" : "Taken off the Student Portal");
  if (!on) return ok("Taken off the Student Portal.");
  return ok(form.status === "open" ? "Published to the Student Portal." : "Published to the Student Portal. Students see it once it takes responses.");
}

/** A draft copy: same questions and holder, a new link, no responses, not on the Student Portal. */
export function duplicateForm(ctx: Ctx, cmd: Extract<Command, { type: "form.duplicate" }>): CommandResult {
  const form = ctx.state.records.forms.find((f) => f.id === cmd.id);
  if (!form) return invalid(GONE);
  if (!rightsOf(ctx, form).duplicate) return deny(ctx, "form.duplicate", "Data", res(form), "Your role cannot copy this form.");
  const { closesOn: _closes, students: _students, ...rest } = form;
  void _closes;
  void _students;
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
  if (form.status !== "draft") {
    if (!rightsOf(ctx, { ...form, status: "draft" }).remove) return deny(ctx, "form.delete", "Data", res(form), "Your role cannot delete this form.");
    return invalid(isLocked(form) ? FIXED : "Only a draft can be deleted. Close the form to stop its responses.");
  }
  if (!rightsOf(ctx, form).remove) return deny(ctx, "form.delete", "Data", res(form), "Your role cannot delete this form.");
  ctx.state.records.forms = ctx.state.records.forms.filter((f) => f !== form);
  log(ctx, "form.delete", "Data", res(form), "Success", "Draft deleted");
  return ok("Draft deleted.");
}
