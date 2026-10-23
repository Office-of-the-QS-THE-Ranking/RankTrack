/*
 * Approval workflows: opening requests, deciding them step by step, and applying the change once the
 * last step approves. Separation of duties: the requester never approves, and each step needs a
 * different approver.
 */
import type { CommandResult } from "../commands";
import { addDays } from "../derive";
import { grantCheck, has } from "../rbac";
import type { ApprovalRequest, RequestPayload, WorkflowKey } from "../types";
import { accountById, can, cleanText, deny, invalid, log, nextId, notify, ok, roleById, unitById, type Actor, type Ctx } from "./core";
import { addAssignment, addDataGrant, createAccount, createUnit, publishStory } from "./mutations";

export function workflowOn(ctx: Ctx, id: WorkflowKey) {
  return ctx.state.workflows.find((w) => w.id === id)?.enabled ?? false;
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
  if (!actor.superAdmin) {
    if (!actor.grants.some((g) => has(g.perms, "workflows", "approve"))) return "Your role cannot approve requests.";
    if (!actor.grants.some((g) => step.approverRoles.includes(g.roleId))) return `This step needs: ${step.approverRoles.map((r) => roleById(ctx, r)?.name ?? r).join(" or ")}.`;
  }
  if (req.workflowId === "destructive" && !actor.technical) return "Only a technical administrator can approve a destructive operation.";
  return null;
}

/** Make the requested change. Returns an error message if it can no longer be applied. */
function apply(ctx: Ctx, req: ApprovalRequest): string | null {
  const p = req.payload;
  switch (p.kind) {
    case "account-access": {
      if (ctx.state.accounts.some((a) => a.email.toLowerCase() === p.email.toLowerCase())) return `${p.email} already has an account.`;
      if (unitById(ctx, p.unitId)?.status !== "Active") return "The requested unit is no longer active.";
      const acc = createAccount(ctx, { name: p.name, email: p.email, title: p.title, unitId: p.unitId, roleId: p.roleId }, `Approved request ${req.id}`);
      log(ctx, "account.invite", "Account", { type: "Account", id: acc.id, label: acc.name }, "Success", `Through ${req.id} · ${roleById(ctx, p.roleId)?.name}`);
      return null;
    }
    case "privilege-escalation": {
      const acc = accountById(ctx, p.accountId);
      const role = roleById(ctx, p.roleId);
      if (!acc || !role) return "The account or role no longer exists.";
      if (acc.status !== "Active" && acc.status !== "Pending Invitation") return `${acc.name} is ${acc.status.toLowerCase()}.`;
      if (!ctx.actor.superAdmin) {
        const check = grantCheck(ctx.actor.grants, role, ctx.state.roles, p.scope, ctx.state.units);
        if (!check.ok) return check.reason;
      }
      const a = addAssignment(ctx, acc, role.id, p.scope, p.expires, `Approved request ${req.id}`);
      log(ctx, "assignment.add", "Access", { type: "Account", id: acc.id, label: acc.name }, "Success", `${role.name}${a.expires ? ` until ${a.expires}` : ""} · through ${req.id}`);
      return null;
    }
    case "org-unit": {
      const parent = unitById(ctx, p.parentId);
      if (!parent || parent.status !== "Active") return "The parent unit is no longer active.";
      if (ctx.state.units.some((u) => u.code.toUpperCase() === p.code.toUpperCase())) return `Code ${p.code} is already taken.`;
      const u = createUnit(ctx, { name: p.name, code: p.code, kind: p.kind2, parentId: p.parentId });
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

export function decide(ctx: Ctx, id: string, decision: "Approved" | "Rejected", note?: string): CommandResult {
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
  const problem = apply(ctx, req);
  if (problem) return invalid(`Could not apply ${req.id}: ${problem}`);
  req.decisions.push({ step: req.step, by: ctx.actor.id, at: ctx.iso, decision, note: text });
  req.status = "Approved";
  req.step = wf.steps.length;
  req.completedAt = ctx.iso;
  log(ctx, "request.approve", "Approval", res, "Success", "Final approval; change applied");
  notify(ctx, req.requesterId, "tpl-decision", { title: req.title, decision: "approved", approver: ctx.actor.name }, "/admin/administration/workflows");
  return ok("Approved and applied.");
}

export function cancel(ctx: Ctx, id: string): CommandResult {
  const req = ctx.state.requests.find((r) => r.id === id);
  if (!req) return invalid("That request no longer exists.");
  if (req.status !== "Pending") return invalid("Only pending requests can be withdrawn.");
  const res = { type: "Request", id: req.id, label: req.title };
  if (req.requesterId !== ctx.actor.id && !can(ctx, "workflows", "manage")) return deny(ctx, "request.cancel", "Approval", res, "Only the requester or a workflow manager can withdraw a request.");
  req.status = "Cancelled";
  req.completedAt = ctx.iso;
  log(ctx, "request.cancel", "Approval", res);
  return ok("Request withdrawn.");
}

/** A request opened directly (from the console or a workspace), validated by kind. */
export function create(ctx: Ctx, workflowId: WorkflowKey, payload: RequestPayload, justification: string, title?: string): CommandResult {
  const wf = ctx.state.workflows.find((w) => w.id === workflowId);
  if (!wf) return invalid("Unknown workflow.");
  if (!wf.enabled) return invalid(`${wf.name} is switched off; make the change directly instead.`);
  if (payload.kind !== workflowId) return invalid("The request does not match its workflow.");
  if (cleanText(justification).length < 10) return invalid("Give a justification of at least a sentence; approvers read it first.");
  let label = title ?? wf.name;
  switch (payload.kind) {
    case "privilege-escalation": {
      const acc = accountById(ctx, payload.accountId);
      const role = roleById(ctx, payload.roleId);
      if (!acc || !role) return invalid("Choose an account and a role.");
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
      if (ctx.state.accounts.some((a) => a.email.toLowerCase() === payload.email.toLowerCase())) return invalid(`${payload.email} already has an account.`);
      if (["super-admin", "system-admin"].includes(payload.roleId)) return invalid("Request administrator roles as “A role for someone”.");
      label = title ?? `Account for ${payload.name}`;
      break;
    }
    case "org-unit": {
      if (!can(ctx, "directory", "create", { unitId: payload.parentId })) return deny(ctx, "request.create", "Approval", { type: "Unit", id: payload.parentId, label: payload.name }, "You cannot add units here.");
      label = title ?? `New unit: ${payload.name}`;
      break;
    }
    case "publication":
      if (!can(ctx, "stories", "submit") && !can(ctx, "reports", "create")) return invalid("Your role cannot request publication.");
      label = title ?? `Publish ${payload.target}: ${payload.title}`;
      break;
    case "destructive":
      if (!ctx.actor.technical || !can(ctx, "backup", "manage")) return invalid("Only technical administrators can request destructive backup operations.");
      break;
  }
  const req = openRequest(ctx, workflowId, payload, label, justification);
  return ok("Sent for approval.", { requestId: req.id });
}

export function updateWorkflow(
  ctx: Ctx,
  id: WorkflowKey,
  patch: { enabled?: boolean; slaDays?: number; separation?: boolean; steps?: { name: string; approverRoles: string[] }[] },
): CommandResult {
  const wf = ctx.state.workflows.find((w) => w.id === id);
  if (!wf) return invalid("Unknown workflow.");
  const res = { type: "Workflow", id: wf.id, label: wf.name };
  if (!can(ctx, "workflows", "manage")) return deny(ctx, "workflow.update", "Configuration", res, "Your role cannot change approval workflows.");
  if (id === "destructive" && (patch.enabled === false || patch.separation === false))
    return invalid("Destructive backup operations always need a second technical administrator.");
  const changes: string[] = [];
  if (patch.enabled !== undefined && patch.enabled !== wf.enabled) {
    wf.enabled = patch.enabled;
    changes.push(patch.enabled ? "switched on" : "switched off");
  }
  if (patch.slaDays !== undefined) {
    const n = Math.round(patch.slaDays);
    if (n < 1 || n > 30) return invalid("Response time must be between 1 and 30 days.");
    if (n !== wf.slaDays) changes.push(`response time ${wf.slaDays} → ${n} days`);
    wf.slaDays = n;
  }
  if (patch.separation !== undefined && patch.separation !== wf.separation) {
    wf.separation = patch.separation;
    changes.push(patch.separation ? "separation of duties on" : "separation of duties off");
  }
  if (patch.steps) {
    if (!patch.steps.length) return invalid("A workflow needs at least one approval step.");
    for (const s of patch.steps) {
      if (!s.name.trim()) return invalid("Name every step.");
      if (!s.approverRoles.length || s.approverRoles.some((r) => !roleById(ctx, r))) return invalid(`Choose at least one approver role for “${s.name}”.`);
    }
    wf.steps = patch.steps.map((s) => ({ name: s.name.trim(), approverRoles: s.approverRoles }));
    changes.push(`${wf.steps.length} approval ${wf.steps.length === 1 ? "step" : "steps"}`);
  }
  if (!changes.length) return ok("No changes.");
  log(ctx, "workflow.update", "Configuration", res, "Success", changes.join("; "));
  return ok(`${wf.name}: ${changes.join("; ")}.`);
}
