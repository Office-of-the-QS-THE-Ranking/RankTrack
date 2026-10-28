/*
 * Account lifecycle and role assignments. The roles themselves are fixed (catalog.ts).
 */
import { HUB_OFFICE, ROLE, roleOf } from "../catalog";
import { invitationUnitMatchesRole, roleUnitHint } from "../invitation";
import type { CommandResult, InviteInput } from "../commands";
import { descendants, grantCheck, grantsFor, runsHub, scopeLabel, topTier } from "../rbac";
import { personTitle, placePerson, readPerson, type Person } from "../person-details";
import type { Account, OrgUnit, RoleId, Scope } from "../types";
import {
  accountById,
  can,
  clean,
  cleanText,
  deny,
  invalid,
  isDay,
  log,
  ok,
  unitById,
  type Ctx,
} from "./core";
import { addAssignment, createAccount, defaultScope, revokeSessions, unitName } from "./mutations";
import { needsApproval, openRequest } from "./requests";

const res = (a: Account) => ({ type: "Account", id: a.id, label: a.name });

/** An administrator may act on an account only inside the units they administer. */
function guard(ctx: Ctx, a: Account, action: "edit" | "delete" | "create", what: string): CommandResult | null {
  if (!can(ctx, "accounts", action, { unitId: a.unitId })) return deny(ctx, what, "Account", res(a), `${a.name} is outside the accounts you administer.`);
  return null;
}

/** Whether the account runs the Hub: an Administrator held University-wide. */
const holdsAdmin = (ctx: Ctx, a: Account) => a.assignments.some((x) => runsHub(x) && (!x.expires || x.expires > ctx.day));

const activeAdmins = (ctx: Ctx) => ctx.state.accounts.filter((a) => a.status === "Active" && holdsAdmin(ctx, a));

/**
 * Who is invited and where, checked as an access request is (person-details.ts): a Thomasian joins the unit
 * they were placed in with the role chosen, anyone else is an External guest of the Office until the end date.
 */
function readInvite(ctx: Ctx, input: InviteInput): { person: Person; unit: OrgUnit; roleId: RoleId; external: boolean } | string {
  const person = readPerson(input, "other");
  if (typeof person === "string") return person;
  if (ctx.state.accounts.some((a) => a.email.toLowerCase() === person.email)) return `${person.email} already has an account.`;
  const placed = placePerson(person, { domains: ctx.state.security.sso.domains, units: ctx.state.units, voice: "other" });
  if (typeof placed === "string") return placed;
  const external = !person.thomasian;
  const unit = external ? unitById(ctx, HUB_OFFICE) : placed.unit;
  if (!unit || unit.status !== "Active") return external ? "External partners are guests of the Office, which isn't an active unit in the Directory." : "Choose an active unit.";
  const roleId = person.roleId ?? ROLE.external;
  if (!invitationUnitMatchesRole(unit, roleId)) return roleUnitHint(roleId);
  if (external) {
    if (!ctx.state.security.sso.allowGuests) return "Guest accounts are switched off in Privacy and Security.";
    if (!input.expires) return "External access needs an end date.";
  }
  if (input.expires && (!isDay(input.expires) || input.expires <= ctx.day)) return "The end date must be in the future.";
  return { person, unit, roleId, external };
}

export function invite(ctx: Ctx, input: InviteInput): CommandResult {
  const read = readInvite(ctx, input);
  if (typeof read === "string") return invalid(read);
  const { person, unit, external } = read;
  const role = roleOf(read.roleId, ctx.state.config.rolePermissions)!;
  const target = { type: "Account", id: person.email, label: person.name };
  if (!can(ctx, "accounts", "create", { unitId: unit.id })) return deny(ctx, "account.invite", "Account", target, `You cannot add accounts to ${unit.name}.`);
  // Outside collaborators are sponsored by the Office, not by individual units.
  if (external && !can(ctx, "accounts", "manage")) return deny(ctx, "account.invite", "Account", target, "Only University-wide Administrators can invite guests.");
  const scope = input.scope ?? defaultScope(role.id, unit.id);
  const check = grantCheck(ctx.actor.grants, role, scope, ctx.state.units);
  if (!check.ok) return deny(ctx, "account.invite", "Access", target, check.reason);
  const account = createAccount(ctx, {
    name: person.name,
    email: person.email,
    title: personTitle(person),
    unitId: unit.id,
    roleId: role.id,
    scope,
    expires: input.expires || undefined,
    external,
    profile: person.profile,
  });
  log(ctx, "account.invite", "Account", res(account), "Success", `${role.name} · ${scopeLabel(scope, ctx.state.units)}${input.expires ? ` · until ${input.expires}` : ""}`);
  return ok(`Invitation sent to ${account.email}.`, { data: account.id });
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
  if (status !== "Active" && holdsAdmin(ctx, a) && activeAdmins(ctx).filter((x) => x.id !== a.id).length < 1)
    return invalid("This is the last active University-wide Administrator. Make someone else one before suspending this account.");
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
  const role = roleOf(roleId, ctx.state.config.rolePermissions);
  if (!a || !role) return invalid("Choose a role.");
  if (a.status === "Deactivated") return invalid(`${a.name} is deactivated. Reactivate the account first.`);
  const blocked = guard(ctx, a, "edit", "assignment.add");
  if (blocked) return blocked;
  const scopeProblem = validScope(ctx, scope);
  if (scopeProblem) return invalid(scopeProblem);
  if (expires && (!isDay(expires) || expires <= ctx.day)) return invalid("Temporary access must end on a future date.");
  if (a.external && role.id !== ROLE.external) return invalid("External partners can only hold the External role.");
  if (role.id === ROLE.external && !expires) return invalid("External access needs an end date.");
  if (a.assignments.some((x) => x.roleId === role.id && JSON.stringify(x.scope) === JSON.stringify(scope) && (!x.expires || x.expires > ctx.day)))
    return invalid(`${a.name} already holds ${role.name} with this scope.`);
  const check = grantCheck(ctx.actor.grants, role, scope, ctx.state.units);
  if (!check.ok) return deny(ctx, "assignment.add", "Access", res(a), check.reason);
  const label = `${role.name} · ${scopeLabel(scope, ctx.state.units)}${expires ? ` · until ${expires}` : ""}`;
  // Raising an existing account above the role it already holds goes through privilege escalation.
  if (a.status !== "Pending Invitation" && role.tier > topTier(grantsOf(ctx, a)) && needsApproval(ctx, "privilege-escalation")) {
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
  const role = roleOf(asg.roleId, ctx.state.config.rolePermissions);
  const lastAdmin = runsHub(asg) && a.assignments.filter((x) => runsHub(x) && (!x.expires || x.expires > ctx.day)).length === 1;
  if (lastAdmin && a.status === "Active" && activeAdmins(ctx).filter((x) => x.id !== a.id).length < 1) return invalid("This is the last active University-wide Administrator.");
  a.assignments = a.assignments.filter((x) => x.id !== assignmentId);
  if (a.activeAssignment === assignmentId) a.activeAssignment = undefined;
  log(ctx, "assignment.remove", "Access", res(a), "Success", `${role?.name ?? asg.roleId} · ${scopeLabel(asg.scope, ctx.state.units)}`);
  return ok(`${role?.name ?? "Role"} removed from ${a.name}.`);
}

/** Recompute grants after a change, for callers that need the new picture in the same transaction. */
export const grantsOf = (ctx: Ctx, a: Account) => grantsFor(a, ctx.state.units, ctx.day, ctx.state.config.rolePermissions);
