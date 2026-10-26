/*
 * Approval workflows: opening requests, deciding them step by step, and applying the change once the
 * last step approves. Separation of duties: the requester never approves, and each step needs a
 * different approver.
 */
import { GUEST_DAYS } from "../access-requests";
import { ROLE, roleOf } from "../catalog";
import type { CommandResult } from "../commands";
import { addDays } from "../derive";
import { invitationUnitMatchesRole, roleUnitHint } from "../invitation";
import { canWith, grantCheck, grantsFor, has } from "../rbac";
import type { ApprovalRequest, RequestPayload, WorkflowKey } from "../types";
import { accountById, can, clean, cleanText, deny, invalid, isEmail, log, nextId, notify, ok, readUnitEmails, unitById, type Actor, type Ctx } from "./core";
import { addAssignment, addDataGrant, createAccount, createUnit, publishStory } from "./mutations";
import { validUnitEmblem } from "../unit-emblems";

export function workflowOn(ctx: Ctx, id: WorkflowKey) {
  return ctx.state.workflows.find((w) => w.id === id)?.enabled ?? false;
}

/**
 * Whether a change the actor makes must wait for approval: the workflow is on and enough other people
 * can decide every step. With too few administrators to share the steps, the change applies directly
 * instead of waiting for approvers who don't exist.
 */
export function needsApproval(ctx: Ctx, id: WorkflowKey) {
  const wf = ctx.state.workflows.find((w) => w.id === id);
  if (!wf?.enabled) return false;
  const approvers = ctx.state.accounts.filter(
    (a) => a.status === "Active" && (!wf.separation || a.id !== ctx.actor.id) && canWith(grantsFor(a, ctx.state.units, ctx.day), "workflows", "approve"),
  );
  return approvers.length >= wf.steps.length;
}

export function openRequest(ctx: Ctx, workflowId: WorkflowKey, payload: RequestPayload, title: string, justification: string): ApprovalRequest {
  const wf = ctx.state.workflows.find((w) => w.id === workflowId)!;
  const req: ApprovalRequest = {
    id: nextId(ctx, "request", "RQ-", 4),
    workflowId,
    title,
    requesterId: ctx.actor.id,
    requestedAt: ctx.iso,
    justification: cleanText(justification, 600),
    payload,
    status: "Pending",
    step: 0,
    decisions: [],
    due: addDays(ctx.day, wf.slaDays),
  };
  ctx.state.requests.unshift(req);
  log(ctx, "request.create", "Approval", { type: "Request", id: req.id, label: title }, "Success", `${wf.name} · step 1 of ${wf.steps.length}: ${wf.steps[0].name}`);
  notify(ctx, "office", "tpl-decision", { title, decision: "submitted for approval", approver: wf.steps[0].name }, "/admin/administration/workflows");
  return req;
}

/** Whether this actor may decide the request's current step, and why not. */
export function decisionBlock(ctx: Ctx, req: ApprovalRequest, actor: Actor = ctx.actor): string | null {
  if (req.status !== "Pending") return "This request is already closed.";
  const wf = ctx.state.workflows.find((w) => w.id === req.workflowId);
  if (!wf) return "Its workflow no longer exists.";
  const step = wf.steps[req.step];
  if (!step) return "The request has no open step.";
  if (wf.separation && req.requesterId === actor.id) return "You opened this request, so someone else must decide it.";
  if (req.decisions.some((d) => d.by === actor.id && d.decision === "Approved")) return "You approved an earlier step; another approver must take this one.";
  if (!actor.grants.some((g) => has(g.perms, "workflows", "approve"))) return "Only University-wide Administrators can approve requests.";
  return null;
}

/**
 * Make the requested change. Returns an error message if it can no longer be applied. `unitId` is the unit
 * the approver chose, for an account request that came without one.
 */
function apply(ctx: Ctx, req: ApprovalRequest, unitId?: string): string | null {
  const p = req.payload;
  switch (p.kind) {
    case "account-access": {
      if (ctx.state.accounts.some((a) => a.email.toLowerCase() === p.email.toLowerCase())) return `${p.email} already has an account.`;
      const unit = p.unitId || unitId || "";
      if (!unit) return "Choose the unit this account belongs to.";
      if (unitById(ctx, unit)?.status !== "Active") return "The requested unit is no longer active.";
      if (!invitationUnitMatchesRole(unitById(ctx, unit)!, p.roleId)) return roleUnitHint(p.roleId);
      if (p.external && !ctx.state.security.sso.allowGuests) return "Guest sign-in is switched off in Privacy and Security. Turn it on to approve accounts from outside the University.";
      const expires = p.external ? addDays(ctx.day, GUEST_DAYS) : undefined;
      // the request keeps the unit it was approved for
      p.unitId = unit;
      const acc = createAccount(ctx, { name: p.name, email: p.email, title: p.title, unitId: unit, roleId: p.roleId, external: p.external, expires }, `Approved request ${req.id}`);
      log(ctx, "account.invite", "Account", { type: "Account", id: acc.id, label: acc.name }, "Success", `Through ${req.id} · ${roleOf(p.roleId)?.name}${expires ? ` · until ${expires}` : ""}`);
      return null;
    }
    case "privilege-escalation": {
      const acc = accountById(ctx, p.accountId);
      const role = roleOf(p.roleId);
      if (!acc || !role) return "The account or role no longer exists.";
      if (acc.status !== "Active" && acc.status !== "Pending Invitation") return `${acc.name} is ${acc.status.toLowerCase()}.`;
      if (acc.external && role.id !== ROLE.external) return "External partners can only hold the External role.";
      const check = grantCheck(ctx.actor.grants, role, p.scope, ctx.state.units);
      if (!check.ok) return check.reason;
      const a = addAssignment(ctx, acc, role.id, p.scope, p.expires, `Approved request ${req.id}`);
      log(ctx, "assignment.add", "Access", { type: "Account", id: acc.id, label: acc.name }, "Success", `${role.name}${a.expires ? ` until ${a.expires}` : ""} · through ${req.id}`);
      return null;
    }
    case "org-unit": {
      const parent = unitById(ctx, p.parentId);
      if (!parent || parent.status !== "Active") return "The parent unit is no longer active.";
      if (ctx.state.units.some((u) => u.code.toUpperCase() === p.code.toUpperCase())) return `Code ${p.code} is already taken.`;
      if (p.emblem !== undefined && !validUnitEmblem(p.emblem)) return "Upload the logo again.";
      const emails = readUnitEmails(p.emails);
      if (typeof emails === "string") return emails;
      const u = createUnit(ctx, { name: p.name, code: p.code, kind: p.kind2, parentId: p.parentId, emails, ...(p.emblem && { emblem: p.emblem }) });
      log(ctx, "unit.create", "Directory", { type: "Unit", id: u.id, label: u.name }, "Success", `Under ${parent.name} · through ${req.id}`);
      return null;
    }
    case "data-access": {
      const acc = accountById(ctx, p.accountId);
      const ds = ctx.state.datasets.find((d) => d.id === p.datasetId);
      if (!acc || !ds) return "The account or dataset no longer exists.";
      addDataGrant(ctx, acc, { datasetId: ds.id, access: p.access, until: p.until, requestId: req.id });
      log(ctx, "access.grant", "Access", { type: "Dataset", id: ds.id, label: ds.name }, "Success", `${p.access} for ${acc.name} until ${p.until} · through ${req.id}`);
      return null;
    }
    case "publication": {
      if (p.target === "story") {
        const proposal = ctx.state.records.proposals.find((x) => x.slug === p.id);
        publishStory(ctx, p.id, p.title, proposal?.unitSlug ?? (p.id === "flood-resilience" ? "engineering" : undefined));
      } else {
        ctx.state.records.publishedReports.unshift({ id: p.id, title: p.title, at: ctx.iso, by: ctx.actor.id });
        log(ctx, "report.publish", "Approval", { type: "Report", id: p.id, label: p.title }, "Success", "Approved for release outside the Office");
      }
      return null;
    }
    case "destructive": {
      const point = ctx.state.backup.points.find((x) => x.id === p.snapshotId);
      if (!point) return "The recovery point no longer exists.";
      if (p.operation === "restore") {
        if (!point.file) return "This recovery point holds no Hub data to restore.";
        ctx.effects.push({ kind: "restore", pointId: point.id });
      } else {
        ctx.effects.push({ kind: "delete-point", pointId: point.id });
      }
      return null;
    }
  }
}

export function decide(ctx: Ctx, id: string, decision: "Approved" | "Rejected", note?: string, unitId?: string): CommandResult {
  const req = ctx.state.requests.find((r) => r.id === id);
  if (!req) return invalid("That request no longer exists.");
  const res = { type: "Request", id: req.id, label: req.title };
  const block = decisionBlock(ctx, req);
  if (block) return deny(ctx, decision === "Approved" ? "request.approve" : "request.reject", "Approval", res, block);
  const wf = ctx.state.workflows.find((w) => w.id === req.workflowId)!;
  const text = cleanText(note, 600) || undefined;
  if (decision === "Rejected") {
    if (!text) return invalid("Say why the request is rejected; the requester sees your note.");
    req.decisions.push({ step: req.step, by: ctx.actor.id, at: ctx.iso, decision, note: text });
    req.status = "Rejected";
    req.completedAt = ctx.iso;
    returnPost(ctx, req);
    log(ctx, "request.reject", "Approval", res, "Success", text);
    notify(ctx, req.requesterId, "tpl-decision", { title: req.title, decision: "rejected", approver: ctx.actor.name }, "/admin/administration/workflows");
    return ok("Request rejected.");
  }
  const last = req.step >= wf.steps.length - 1;
  if (!last) {
    req.decisions.push({ step: req.step, by: ctx.actor.id, at: ctx.iso, decision, note: text });
    req.step += 1;
    log(ctx, "request.approve", "Approval", res, "Success", `Step ${req.step} of ${wf.steps.length}; next: ${wf.steps[req.step].name}`);
    return ok(`Approved. Next: ${wf.steps[req.step].name}.`);
  }
  const problem = apply(ctx, req, unitId);
  if (problem) return invalid(`Could not apply ${req.id}: ${problem}`);
  req.decisions.push({ step: req.step, by: ctx.actor.id, at: ctx.iso, decision, note: text });
  req.status = "Approved";
  req.step = wf.steps.length;
  req.completedAt = ctx.iso;
  log(ctx, "request.approve", "Approval", res, "Success", "Final approval; change applied");
  notify(ctx, req.requesterId, "tpl-decision", { title: req.title, decision: "approved", approver: ctx.actor.name }, "/admin/administration/workflows");
  return ok("Approved and applied.");
}

/** An approver takes the request up; the requester's tracker moves from the queue to under review. */
export function review(ctx: Ctx, id: string): CommandResult {
  const req = ctx.state.requests.find((r) => r.id === id);
  if (!req) return invalid("That request no longer exists.");
  if (req.reviewing) return ok("Already under review.");
  const res = { type: "Request", id: req.id, label: req.title };
  const block = decisionBlock(ctx, req);
  if (block) return deny(ctx, "request.review", "Approval", res, block);
  req.reviewing = { by: ctx.actor.id, at: ctx.iso };
  log(ctx, "request.review", "Approval", res, "Success", "Marked under review");
  return ok("Marked under review.");
}

export function cancel(ctx: Ctx, id: string): CommandResult {
  const req = ctx.state.requests.find((r) => r.id === id);
  if (!req) return invalid("That request no longer exists.");
  if (req.status !== "Pending") return invalid("Only pending requests can be withdrawn.");
  const res = { type: "Request", id: req.id, label: req.title };
  if (req.requesterId !== ctx.actor.id && !can(ctx, "workflows", "manage")) return deny(ctx, "request.cancel", "Approval", res, "Only the requester or a workflow manager can withdraw a request.");
  req.status = "Cancelled";
  req.completedAt = ctx.iso;
  returnPost(ctx, req);
  log(ctx, "request.cancel", "Approval", res);
  return ok("Request withdrawn.");
}

/** A post waiting on a publication request goes back to where it was when the request closes unapproved. */
function returnPost(ctx: Ctx, req: ApprovalRequest) {
  const p = req.payload;
  if (p.kind !== "publication" || p.target !== "story") return;
  const post = ctx.state.records.posts.find((x) => x.slug === p.id);
  if (post?.status === "In review") post.status = post.publishedAt ? "Unpublished" : "Draft";
}

/** A request opened directly (from the console or a workspace), validated by kind. */
export function create(ctx: Ctx, workflowId: WorkflowKey, payload: RequestPayload, justification: string, title?: string): CommandResult {
  const wf = ctx.state.workflows.find((w) => w.id === workflowId);
  if (!wf) return invalid("Unknown workflow.");
  if (!wf.enabled) return invalid(`${wf.name} is switched off; make the change directly instead.`);
  if (payload.kind !== workflowId) return invalid("The request does not match its workflow.");
  if (cleanText(justification).length < 10) return invalid("Give a justification of at least a sentence; approvers read it first.");
  let label = title ?? wf.name;
  let unitEmails: string[] | undefined;
  switch (payload.kind) {
    case "privilege-escalation": {
      const acc = accountById(ctx, payload.accountId);
      const role = roleOf(payload.roleId);
      if (!acc || !role) return invalid("Choose an account and a role.");
      if (acc.external && role.id !== ROLE.external) return invalid("External partners can only hold the External role.");
      if (acc.id !== ctx.actor.id && !can(ctx, "accounts", "edit", { unitId: acc.unitId }))
        return deny(ctx, "request.create", "Approval", { type: "Account", id: acc.id, label: acc.name }, "You can only request roles for yourself or accounts you administer.");
      label = title ?? `${role.name} for ${acc.name}`;
      break;
    }
    case "data-access": {
      const acc = accountById(ctx, payload.accountId);
      const ds = ctx.state.datasets.find((d) => d.id === payload.datasetId);
      if (!acc || !ds) return invalid("Choose a dataset.");
      if (acc.id !== ctx.actor.id && !can(ctx, "governance", "edit")) return invalid("You can only request data access for yourself.");
      if (payload.until <= ctx.day) return invalid("Access must end on a future date.");
      if (payload.until > addDays(ctx.day, 90)) return invalid("Temporary access can last at most 90 days.");
      if (ds.classification === "Restricted" && payload.access === "Export") return invalid(`${ds.name} is Restricted and can never be exported.`);
      label = title ?? `${payload.access} access to ${ds.name} for ${acc.name}`;
      break;
    }
    case "account-access": {
      if (typeof payload.email !== "string" || !isEmail(payload.email.trim().toLowerCase())) return invalid("Enter the person's email address.");
      if (typeof payload.name !== "string" || clean(payload.name).length < 2) return invalid("Enter the person's name.");
      if (ctx.state.accounts.some((a) => a.email.toLowerCase() === payload.email.trim().toLowerCase())) return invalid(`${payload.email} already has an account.`);
      if (payload.external ? payload.roleId !== ROLE.external : payload.roleId !== ROLE.coordinator && payload.roleId !== ROLE.student)
        return invalid("Request an Administrator role as “A role for someone”.");
      // The unit, if one is named, must be one the requester could add accounts to.
      if (payload.unitId && !can(ctx, "accounts", "create", { unitId: payload.unitId }))
        return deny(ctx, "request.create", "Approval", { type: "Unit", id: payload.unitId, label: payload.name }, "You can only request accounts in units you administer.");
      payload.email = payload.email.trim().toLowerCase();
      payload.name = clean(payload.name);
      payload.title = clean(typeof payload.title === "string" ? payload.title : "", 160);
      payload.external = payload.external === true ? true : undefined;
      label = title ?? `Account for ${payload.name}`;
      break;
    }
    case "org-unit": {
      if (!can(ctx, "directory", "create", { unitId: payload.parentId })) return deny(ctx, "request.create", "Approval", { type: "Unit", id: payload.parentId, label: payload.name }, "You cannot add units here.");
      if (payload.emblem !== undefined && !validUnitEmblem(payload.emblem)) return invalid("Upload the logo again.");
      const emails = readUnitEmails(payload.emails);
      if (typeof emails === "string") return invalid(emails);
      unitEmails = emails;
      label = title ?? `New unit: ${payload.name}`;
      break;
    }
    case "publication":
      if (!can(ctx, "stories", "submit") && !can(ctx, "reports", "create")) return invalid("Your role cannot request publication.");
      label = title ?? `Publish ${payload.target}: ${payload.title}`;
      break;
    case "destructive":
      if (!can(ctx, "backup", "manage")) return invalid("Only University-wide Administrators can request destructive backup operations.");
      break;
  }
  const normalizedPayload = payload.kind === "org-unit" ? { ...payload, emails: unitEmails } : payload;
  const req = openRequest(ctx, workflowId, normalizedPayload, label, justification);
  return ok("Sent for approval.", { requestId: req.id });
}

export function updateWorkflow(
  ctx: Ctx,
  id: WorkflowKey,
  patch: { enabled?: boolean; slaDays?: number; separation?: boolean; steps?: { name: string }[] },
): CommandResult {
  const wf = ctx.state.workflows.find((w) => w.id === id);
  if (!wf) return invalid("Unknown workflow.");
  const res = { type: "Workflow", id: wf.id, label: wf.name };
  if (!can(ctx, "workflows", "manage")) return deny(ctx, "workflow.update", "Configuration", res, "Your role cannot change approval workflows.");
  if (id === "destructive" && (patch.enabled === false || patch.separation === false))
    return invalid("Destructive backup operations always need a second University-wide Administrator.");
  const changes: string[] = [];
  if (patch.enabled !== undefined && patch.enabled !== wf.enabled) {
    wf.enabled = patch.enabled;
    changes.push(patch.enabled ? "switched on" : "switched off");
  }
  if (patch.slaDays !== undefined) {
    const n = Math.round(Number(patch.slaDays));
    if (!(n >= 1 && n <= 30)) return invalid("Response time must be between 1 and 30 days.");
    if (n !== wf.slaDays) changes.push(`response time ${wf.slaDays} → ${n} days`);
    wf.slaDays = n;
  }
  if (patch.separation !== undefined && patch.separation !== wf.separation) {
    wf.separation = patch.separation;
    changes.push(patch.separation ? "separation of duties on" : "separation of duties off");
  }
  if (patch.steps) {
    if (!patch.steps.length) return invalid("A workflow needs at least one approval step.");
    if (!Array.isArray(patch.steps) || patch.steps.length > 5) return invalid("A workflow has at most five approval steps.");
    if (patch.steps.some((s) => typeof s?.name !== "string" || !s.name.trim())) return invalid("Name every step.");
    wf.steps = patch.steps.map((s) => ({ name: clean(s.name, 80) }));
    changes.push(`${wf.steps.length} approval ${wf.steps.length === 1 ? "step" : "steps"}`);
  }
  if (!changes.length) return ok("No changes.");
  log(ctx, "workflow.update", "Configuration", res, "Success", changes.join("; "));
  return ok(`${wf.name}: ${changes.join("; ")}.`);
}
