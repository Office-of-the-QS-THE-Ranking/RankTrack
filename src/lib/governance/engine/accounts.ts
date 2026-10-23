/*
 * Account lifecycle, role assignments and role definitions.
 */
import type { CommandResult, InviteInput } from "../commands";
import { domainAllowed, domainOf } from "../derive";
import { ancestors, beyond, descendants, grantCheck, grantsFor, impliedTier, mergedPermissions, normalize, rolePermissions, scopeLabel, union, within } from "../rbac";
import type { Account, PermissionSet, Role, Scope } from "../types";
import {
  accountById,
  actorFor,
  can,
  clean,
  cleanText,
  deny,
  invalid,
  isDay,
  isEmail,
  log,
  nextId,
  ok,
  roleById,
  unitById,
  type Ctx,
} from "./core";
import { addAssignment, createAccount, defaultScope, revokeSessions, unitName } from "./mutations";
import { openRequest, workflowOn } from "./requests";

const res = (a: Account) => ({ type: "Account", id: a.id, label: a.name });

const tierOfAccount = (ctx: Ctx, a: Account) => actorFor(ctx.state, a, ctx.now).tier;

/** An administrator may act on an account only inside their scope and never above their own tier. */
function guard(ctx: Ctx, a: Account, action: "edit" | "delete" | "create", what: string): CommandResult | null {
  if (!can(ctx, "accounts", action, { unitId: a.unitId })) return deny(ctx, what, "Account", res(a), `${a.name} is outside the accounts you administer.`);
  if (!ctx.actor.superAdmin && tierOfAccount(ctx, a) > ctx.actor.tier) return deny(ctx, what, "Account", res(a), `${a.name} holds a higher role than yours.`);
  return null;
}

const activeSupers = (ctx: Ctx) =>
  ctx.state.accounts.filter((a) => a.status === "Active" && a.assignments.some((x) => x.roleId === "super-admin" && (!x.expires || x.expires > ctx.day)));

function validateInvite(ctx: Ctx, input: InviteInput): string | null {
  const name = clean(input.name);
  const email = clean(input.email).toLowerCase();
  if (name.length < 3) return "Enter the person's full name.";
  if (!isEmail(email)) return "Enter a valid email address.";
  if (ctx.state.accounts.some((a) => a.email.toLowerCase() === email)) return `${email} already has an account.`;
  const unit = unitById(ctx, input.unitId);
  if (!unit) return "Choose the person's unit.";
  if (unit.status !== "Active") return `${unit.name} is archived; choose an active unit.`;
  const role = roleById(ctx, input.roleId);
  if (!role) return "Choose a role.";
  const sso = ctx.state.security.sso;
  if (input.external) {
    if (!sso.allowGuests) return "Guest accounts are switched off in Privacy and Security.";
    if (role.id !== "external") return "External collaborators can only hold the External Collaborator role.";
    if (!input.expires) return "External access needs an end date.";
  } else if (!domainAllowed(ctx.state, email)) {
    return `${domainOf(email) || "That domain"} is not an allowed sign-in domain (${sso.domains.join(", ")}). Invite them as an external collaborator instead.`;
  }
  if (input.expires && (!isDay(input.expires) || input.expires <= ctx.day)) return "The end date must be in the future.";
  return null;
}

export function invite(ctx: Ctx, input: InviteInput, quiet = false): CommandResult & { account?: Account } {
  const problem = validateInvite(ctx, input);
  if (problem) return invalid(problem);
  const unit = unitById(ctx, input.unitId)!;
  const role = roleById(ctx, input.roleId)!;
  const target = { type: "Account", id: input.email, label: clean(input.name) };
  if (!can(ctx, "accounts", "create", { unitId: unit.id })) return deny(ctx, "account.invite", "Account", target, `You cannot add accounts to ${unit.name}.`);
  // Outside collaborators are sponsored by the Office, not by individual units.
  if ((input.external || role.id === "external") && !can(ctx, "accounts", "manage"))
    return deny(ctx, "account.invite", "Account", target, "Only system administrators can invite guests.");
  const scope = input.scope ?? defaultScope(ctx, role.id, unit.id);
  if (!ctx.actor.superAdmin) {
    const check = grantCheck(ctx.actor.grants, role, ctx.state.roles, scope, ctx.state.units);
    if (!check.ok) return deny(ctx, "account.invite", "Access", target, check.reason);
  }
  const account = createAccount(ctx, { ...input, name: clean(input.name), email: clean(input.email), title: clean(input.title) || "Staff", scope });
  log(ctx, "account.invite", "Account", res(account), "Success", `${role.name} · ${scopeLabel(scope, ctx.state.units)}${input.expires ? ` · until ${input.expires}` : ""}`);
  if (!quiet) return ok(`Invitation sent to ${account.email}.`, { data: account.id });
  return { ok: true, message: "", account };
}

/** Bulk provisioning from a CSV or XLSX sheet: each row is checked like a single invitation. */
export function importRows(ctx: Ctx, rows: { name: string; email: string; title: string; unit: string; role: string }[], file: string): CommandResult {
  if (!can(ctx, "accounts", "create")) return deny(ctx, "account.import", "Account", { type: "Import", id: file, label: file }, "Your role cannot add accounts.");
  if (!rows.length) return invalid("The file has no rows to import.");
  if (rows.length > 500) return invalid("Import at most 500 rows at a time.");
  const invited: string[] = [];
  const skipped: { row: number; why: string }[] = [];
  rows.forEach((r, i) => {
    const unit = ctx.state.units.find((u) => u.code.toLowerCase() === r.unit.trim().toLowerCase() || u.id === r.unit.trim().toLowerCase() || u.name.toLowerCase() === r.unit.trim().toLowerCase());
    const role = ctx.state.roles.find((x) => x.name.toLowerCase() === r.role.trim().toLowerCase() || x.id === r.role.trim().toLowerCase());
    if (!unit) return skipped.push({ row: i + 2, why: `Unknown unit “${r.unit}”` });
    if (!role) return skipped.push({ row: i + 2, why: `Unknown role “${r.role}”` });
    const out = invite(ctx, { name: r.name, email: r.email, title: r.title, unitId: unit.id, roleId: role.id }, true);
    if (out.ok && out.account) invited.push(out.account.name);
    else skipped.push({ row: i + 2, why: out.message });
  });
  const id = nextId(ctx, "import", "IMP-");
  log(
    ctx,
    "account.import",
    "Account",
    { type: "Import", id, label: file },
    invited.length ? "Success" : "Failed",
    `${invited.length} invited${skipped.length ? ` · ${skipped.length} skipped` : ""}`,
  );
  return { ok: invited.length > 0, message: invited.length ? `${invited.length} ${invited.length === 1 ? "invitation" : "invitations"} sent.` : "No rows could be imported.", data: { invited, skipped } };
}

export function update(ctx: Ctx, id: string, patch: { name?: string; title?: string }): CommandResult {
  const a = accountById(ctx, id);
  if (!a) return invalid("That account no longer exists.");
  const blocked = guard(ctx, a, "edit", "account.update");
  if (blocked) return blocked;
  const changes: string[] = [];
  if (patch.name !== undefined && clean(patch.name) !== a.name) {
    if (clean(patch.name).length < 3) return invalid("Enter the full name.");
    changes.push(`name “${a.name}” → “${clean(patch.name)}”`);
    a.name = clean(patch.name);
  }
  if (patch.title !== undefined && clean(patch.title) !== a.title) {
    changes.push(`title “${a.title}” → “${clean(patch.title)}”`);
    a.title = clean(patch.title);
  }
  if (!changes.length) return ok("No changes.");
  log(ctx, "account.update", "Account", res(a), "Success", changes.join("; "));
  return ok("Account updated.");
}

export function setStatus(ctx: Ctx, id: string, status: "Active" | "Suspended" | "Deactivated", reason: string): CommandResult {
  const a = accountById(ctx, id);
  if (!a) return invalid("That account no longer exists.");
  if (a.id === ctx.actor.id) return deny(ctx, "account.status", "Account", res(a), "You cannot change the status of your own account.");
  // Cancelling an invitation needs the right to invite; deactivating a working account needs the right to delete.
  const blocked = guard(ctx, a, status === "Deactivated" ? (a.status === "Pending Invitation" ? "create" : "delete") : "edit", "account.status");
  if (blocked) return blocked;
  const why = cleanText(reason, 300);
  if (status !== "Active" && why.length < 5) return invalid("Give a reason; it is shown to other administrators and kept in the audit log.");
  if (status !== "Active" && a.assignments.some((x) => x.roleId === "super-admin") && activeSupers(ctx).length <= 1)
    return invalid("This is the last active Super Administrator. Assign another before suspending this account.");
  if (a.status === status) return ok(`${a.name} is already ${status.toLowerCase()}.`);
  if (a.status === "Pending Invitation" && status === "Active") return invalid("Pending accounts become active when the person first signs in.");
  const from = a.status;
  a.status = status;
  a.statusReason = status === "Active" ? undefined : why;
  a.statusChangedAt = ctx.iso;
  let revoked = 0;
  if (status !== "Active") revoked = revokeSessions(ctx, a.id);
  if (status === "Active") a.keptActive = { at: ctx.iso, by: ctx.actor.id };
  const verb = status === "Active" ? "reactivate" : status === "Suspended" ? "suspend" : from === "Pending Invitation" ? "cancel-invitation" : "deactivate";
  log(ctx, `account.${verb}`, "Account", res(a), "Success", [why, revoked ? `${revoked} active ${revoked === 1 ? "session" : "sessions"} ended` : ""].filter(Boolean).join(" · "));
  return ok(
    status === "Active"
      ? `${a.name} is active again.`
      : status === "Suspended"
        ? `${a.name} suspended.`
        : from === "Pending Invitation"
          ? `Invitation to ${a.name} cancelled.`
          : `${a.name} deactivated.`,
  );
}

export function resend(ctx: Ctx, id: string): CommandResult {
  const a = accountById(ctx, id);
  if (!a) return invalid("That account no longer exists.");
  if (a.status !== "Pending Invitation") return invalid("Only pending invitations can be re-sent.");
  const blocked = guard(ctx, a, "create", "account.resend");
  if (blocked) return blocked;
  a.invitedAt = ctx.iso;
  log(ctx, "account.resend", "Account", res(a), "Success", a.email);
  return ok(`Invitation re-sent to ${a.email}.`);
}

export function revoke(ctx: Ctx, id: string): CommandResult {
  const a = accountById(ctx, id);
  if (!a) return invalid("That account no longer exists.");
  const blocked = guard(ctx, a, "edit", "session.revoke");
  if (blocked) return blocked;
  const n = revokeSessions(ctx, a.id);
  log(ctx, "session.revoke", "Session", res(a), "Success", `${n} ${n === 1 ? "session" : "sessions"} ended`);
  return ok(n ? `${a.name} signed out of ${n} ${n === 1 ? "session" : "sessions"}.` : `${a.name} wasn't signed in.`);
}

export function reauth(ctx: Ctx, id: string): CommandResult {
  const a = accountById(ctx, id);
  if (!a) return invalid("That account no longer exists.");
  const blocked = guard(ctx, a, "edit", "session.reauth");
  if (blocked) return blocked;
  a.reauthAfter = ctx.iso;
  log(ctx, "session.reauth", "Session", res(a), "Success", "Must sign in again, with a second factor where the policy requires one");
  return ok(`${a.name} must sign in again.`);
}

export function transfer(ctx: Ctx, id: string, toUnitId: string, moveScope: boolean): CommandResult {
  const a = accountById(ctx, id);
  const to = unitById(ctx, toUnitId);
  if (!a || !to) return invalid("Choose an account and a destination unit.");
  if (to.status !== "Active") return invalid(`${to.name} is archived.`);
  if (a.unitId === to.id) return invalid(`${a.name} already belongs to ${to.name}.`);
  const blocked = guard(ctx, a, "edit", "account.transfer");
  if (blocked) return blocked;
  if (!can(ctx, "accounts", "edit", { unitId: to.id })) return deny(ctx, "account.transfer", "Account", res(a), `${to.name} is outside the units you administer.`);
  const from = a.unitId;
  const fromTree = descendants(ctx.state.units, from);
  a.unitId = to.id;
  a.transfers.push({ from, to: to.id, at: ctx.iso, by: ctx.actor.id });
  let moved = 0;
  if (moveScope)
    for (const asg of a.assignments) {
      if (asg.scope.units === "all") continue;
      const next = asg.scope.units.map((u) => (fromTree.includes(u) ? to.id : u));
      if (next.join() !== asg.scope.units.join()) moved++;
      asg.scope = { ...asg.scope, units: [...new Set(next)] };
    }
  // A person who leaves a unit stops being one of its designated administrators.
  for (const u of ctx.state.units) if (u.adminIds.includes(a.id) && fromTree.includes(u.id)) u.adminIds = u.adminIds.filter((x) => x !== a.id);
  log(ctx, "account.transfer", "Account", res(a), "Success", `${unitName(ctx, from)} → ${to.name}${moved ? ` · ${moved} role ${moved === 1 ? "scope" : "scopes"} moved` : ""} · earlier submissions stay with ${unitName(ctx, from)}`);
  return ok(`${a.name} moved to ${to.name}.${moveScope ? "" : " Check their roles."}`);
}

export function keep(ctx: Ctx, id: string): CommandResult {
  const a = accountById(ctx, id);
  if (!a) return invalid("That account no longer exists.");
  const blocked = guard(ctx, a, "edit", "account.keep");
  if (blocked) return blocked;
  a.keptActive = { at: ctx.iso, by: ctx.actor.id };
  log(ctx, "account.review", "Account", res(a), "Success", "Inactivity flag cleared: kept active");
  return ok(`${a.name} kept active.`);
}

function validScope(ctx: Ctx, scope: Scope): string | null {
  if (scope.units !== "all") {
    if (!scope.units.length) return "Choose at least one unit, or University-wide.";
    if (scope.units.some((u) => !unitById(ctx, u))) return "One of the units no longer exists.";
  }
  if (scope.datasets !== "all" && scope.datasets.some((d) => !ctx.state.datasets.some((x) => x.id === d))) return "One of the datasets no longer exists.";
  if (scope.years !== "all" && scope.years.some((y) => !ctx.state.config.cycles.some((c) => c.id === y))) return "One of the reporting cycles no longer exists.";
  return null;
}

export function addRole(ctx: Ctx, accountId: string, roleId: string, scope: Scope, expires?: string, note?: string): CommandResult {
  const a = accountById(ctx, accountId);
  const role = roleById(ctx, roleId);
  if (!a || !role) return invalid("Choose a role.");
  if (a.status === "Deactivated") return invalid(`${a.name} is deactivated. Reactivate the account first.`);
  const blocked = guard(ctx, a, "edit", "assignment.add");
  if (blocked) return blocked;
  const scopeProblem = validScope(ctx, scope);
  if (scopeProblem) return invalid(scopeProblem);
  if (expires && (!isDay(expires) || expires <= ctx.day)) return invalid("Temporary access must end on a future date.");
  if (a.external && role.id !== "external") return invalid("External collaborators can only hold the External Collaborator role.");
  if (role.id === "external" && !expires) return invalid("External access needs an end date.");
  if (a.assignments.some((x) => x.roleId === role.id && JSON.stringify(x.scope) === JSON.stringify(scope) && (!x.expires || x.expires > ctx.day)))
    return invalid(`${a.name} already holds ${role.name} with this scope.`);
  if (!ctx.actor.superAdmin) {
    const check = grantCheck(ctx.actor.grants, role, ctx.state.roles, scope, ctx.state.units);
    if (!check.ok) return deny(ctx, "assignment.add", "Access", res(a), check.reason);
  }
  const label = `${role.name} · ${scopeLabel(scope, ctx.state.units)}${expires ? ` · until ${expires}` : ""}`;
  // Raising an existing account above the tier it already holds goes through privilege escalation.
  const current = tierOfAccount(ctx, a);
  if (a.status !== "Pending Invitation" && role.tier > current && workflowOn(ctx, "privilege-escalation") && !ctx.actor.superAdmin) {
    const req = openRequest(ctx, "privilege-escalation", { kind: "privilege-escalation", accountId: a.id, roleId: role.id, scope, expires }, `${role.name} for ${a.name}`, cleanText(note, 300) || `Requested by ${ctx.actor.name}`);
    return ok(`This raises ${a.name}'s access, so it was sent for approval.`, { requestId: req.id });
  }
  addAssignment(ctx, a, role.id, scope, expires, cleanText(note, 300) || undefined);
  log(ctx, "assignment.add", "Access", res(a), "Success", label);
  return ok(`${role.name} added.`);
}

export function removeRole(ctx: Ctx, accountId: string, assignmentId: string): CommandResult {
  const a = accountById(ctx, accountId);
  const asg = a?.assignments.find((x) => x.id === assignmentId);
  if (!a || !asg) return invalid("That role assignment no longer exists.");
  if (a.id === ctx.actor.id) return deny(ctx, "assignment.remove", "Access", res(a), "Ask another administrator to change your own roles.");
  const blocked = guard(ctx, a, "edit", "assignment.remove");
  if (blocked) return blocked;
  const role = roleById(ctx, asg.roleId);
  if (role && !ctx.actor.superAdmin && role.tier > ctx.actor.tier) return deny(ctx, "assignment.remove", "Access", res(a), `${role.name} sits above your own role.`);
  if (asg.roleId === "super-admin" && activeSupers(ctx).filter((x) => x.id !== a.id).length < 1) return invalid("This is the last Super Administrator assignment.");
  a.assignments = a.assignments.filter((x) => x.id !== assignmentId);
  log(ctx, "assignment.remove", "Access", res(a), "Success", `${role?.name ?? asg.roleId} · ${scopeLabel(asg.scope, ctx.state.units)}`);
  return ok(`${role?.name ?? "Role"} removed from ${a.name}.`);
}

/* ---------- Roles ---------- */

function roleProblem(ctx: Ctx, draft: Pick<Role, "name" | "inherits" | "permissions" | "exceptions" | "tier">, id?: string): string | null {
  const name = clean(draft.name, 60);
  if (name.length < 3) return "Name the role.";
  if (ctx.state.roles.some((r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase())) return `A role called ${name} already exists.`;
  if (draft.inherits) {
    if (!roleById(ctx, draft.inherits)) return "The parent role no longer exists.";
    if (id) {
      // No inheritance loops.
      let cur: string | undefined = draft.inherits;
      const seen = new Set([id]);
      while (cur) {
        if (seen.has(cur)) return "A role cannot inherit from itself, directly or through another role.";
        seen.add(cur);
        cur = roleById(ctx, cur)?.inherits;
      }
    }
  }
  if (draft.tier < 1 || draft.tier > 99) return "Tier must be between 1 and 99.";
  return null;
}

/** A new or edited custom role sits at the tier its permissions imply, never above its author's. */
function tierFor(ctx: Ctx, perms: PermissionSet) {
  return Math.min(impliedTier(perms, ctx.state.roles), ctx.actor.superAdmin ? 99 : Math.max(1, ctx.actor.tier));
}

function effectiveOf(ctx: Ctx, draft: Pick<Role, "inherits" | "permissions" | "exceptions">): PermissionSet {
  const inherited = draft.inherits ? rolePermissions(draft.inherits, ctx.state.roles) : {};
  const merged = union(inherited, draft.permissions);
  const out: PermissionSet = {};
  for (const [m, acts] of Object.entries(merged) as [keyof PermissionSet, NonNullable<PermissionSet[keyof PermissionSet]>][]) {
    const left = acts.filter((x) => !(draft.exceptions?.[m] ?? []).includes(x));
    if (left.length) out[m] = left;
  }
  return normalize(out);
}

export function createRole(
  ctx: Ctx,
  input: { name: string; description: string; inherits?: string; permissions: PermissionSet; exceptions?: PermissionSet; scopeKind: Role["scopeKind"]; tier?: number },
): CommandResult {
  const target = { type: "Role", id: "new", label: clean(input.name, 60) };
  if (!can(ctx, "roles", "create")) return deny(ctx, "role.create", "Access", target, "Your role cannot create roles.");
  const perms = effectiveOf(ctx, input);
  const tier = input.tier ?? tierFor(ctx, perms);
  const problem = roleProblem(ctx, { ...input, tier });
  if (problem) return invalid(problem);
  if (!ctx.actor.superAdmin) {
    const extra = beyond(perms, mergedPermissions(ctx.actor.grants));
    if (extra.length) return deny(ctx, "role.create", "Access", target, `A new role can't include permissions you don't have (${extra.slice(0, 3).map((e) => `${e.module} ${e.action}`).join(", ")}).`);
    if (tier > ctx.actor.tier) return deny(ctx, "role.create", "Access", target, "A new role can't sit above your own.");
  }
  const base = clean(input.name, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let id = base || `role-${nextId(ctx, "role", "", 2)}`;
  for (let i = 2; roleById(ctx, id); i++) id = `${base}-${i}`;
  const role: Role = {
    id,
    name: clean(input.name, 60),
    description: cleanText(input.description, 300),
    system: false,
    tier: Math.round(tier),
    inherits: input.inherits || undefined,
    permissions: normalize(input.permissions),
    exceptions: input.exceptions && Object.keys(input.exceptions).length ? normalize(input.exceptions) : undefined,
    scopeKind: input.scopeKind,
    createdAt: ctx.iso,
    createdBy: ctx.actor.id,
  };
  ctx.state.roles.push(role);
  log(ctx, "role.create", "Access", { type: "Role", id: role.id, label: role.name }, "Success", `${Object.values(perms).reduce((n, x) => n + (x?.length ?? 0), 0)} permissions${role.inherits ? ` · inherits ${roleById(ctx, role.inherits)?.name}` : ""}`);
  return ok(`${role.name} created.`, { data: role.id });
}

export function updateRole(
  ctx: Ctx,
  id: string,
  patch: { name?: string; description?: string; inherits?: string | null; permissions?: PermissionSet; exceptions?: PermissionSet; tier?: number },
): CommandResult {
  const role = roleById(ctx, id);
  if (!role) return invalid("That role no longer exists.");
  const target = { type: "Role", id: role.id, label: role.name };
  if (!can(ctx, "roles", "edit")) return deny(ctx, "role.update", "Access", target, "Your role cannot edit roles.");
  if (role.system) return invalid("Built-in roles are fixed by the governance policy. Duplicate it to make a custom version.");
  const shape = {
    name: patch.name ?? role.name,
    inherits: patch.inherits === null ? undefined : patch.inherits ?? role.inherits,
    permissions: patch.permissions ?? role.permissions,
    exceptions: patch.exceptions ?? role.exceptions,
  };
  const before = effectiveOf(ctx, role);
  const after = effectiveOf(ctx, shape);
  // The tier follows the permissions unless one is given explicitly.
  const draft = { ...shape, tier: patch.tier ?? (patch.permissions || patch.exceptions || patch.inherits !== undefined ? tierFor(ctx, after) : role.tier) };
  const problem = roleProblem(ctx, draft, role.id);
  if (problem) return invalid(problem);
  if (!ctx.actor.superAdmin) {
    const extra = beyond(after, mergedPermissions(ctx.actor.grants));
    if (extra.length) return deny(ctx, "role.update", "Access", target, `You cannot add permissions you don't hold (${extra.slice(0, 3).map((e) => `${e.module} ${e.action}`).join(", ")}).`);
    if (role.tier > ctx.actor.tier) return deny(ctx, "role.update", "Access", target, "This role sits above your own.");
    if (draft.tier > ctx.actor.tier) return deny(ctx, "role.update", "Access", target, "A role can't sit above your own.");
  }
  const added = beyond(after, before).length;
  const removed = beyond(before, after).length;
  role.name = clean(draft.name, 60);
  role.description = patch.description !== undefined ? cleanText(patch.description, 300) : role.description;
  role.inherits = draft.inherits || undefined;
  role.permissions = normalize(draft.permissions);
  role.exceptions = draft.exceptions && Object.keys(draft.exceptions).length ? normalize(draft.exceptions) : undefined;
  role.tier = Math.round(draft.tier);
  const members = ctx.state.accounts.filter((a) => a.assignments.some((x) => x.roleId === role.id)).length;
  log(ctx, "role.update", "Access", { type: "Role", id: role.id, label: role.name }, "Success", `${added} added, ${removed} removed · applies to ${members} ${members === 1 ? "account" : "accounts"}${within(after, before) ? "" : " · broadened"}`);
  return ok(`${role.name} saved.`);
}

export function deleteRole(ctx: Ctx, id: string): CommandResult {
  const role = roleById(ctx, id);
  if (!role) return invalid("That role no longer exists.");
  const target = { type: "Role", id: role.id, label: role.name };
  if (!can(ctx, "roles", "delete")) return deny(ctx, "role.delete", "Access", target, "Your role cannot delete roles.");
  if (role.system) return invalid("Built-in roles cannot be deleted.");
  const members = ctx.state.accounts.filter((a) => a.assignments.some((x) => x.roleId === role.id));
  if (members.length) return invalid(`${members.length} ${members.length === 1 ? "account holds" : "accounts hold"} this role. Remove it from them first.`);
  const children = ctx.state.roles.filter((r) => r.inherits === role.id);
  if (children.length) return invalid(`${children.map((c) => c.name).join(", ")} inherit${children.length === 1 ? "s" : ""} from this role.`);
  ctx.state.roles = ctx.state.roles.filter((r) => r.id !== role.id);
  log(ctx, "role.delete", "Access", target);
  return ok(`${role.name} deleted.`);
}

/** Recompute grants after a change, for callers that need the new picture in the same transaction. */
export const grantsOf = (ctx: Ctx, a: Account) => grantsFor(a, ctx.state.roles, ctx.state.units, ctx.day);

export const lineage = (ctx: Ctx, unitId: string) => ancestors(ctx.state.units, unitId).map((u) => u.id);
