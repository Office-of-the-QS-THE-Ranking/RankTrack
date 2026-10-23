/*
 * The primitive changes, without permission checks. Handlers check first and then call these; approved
 * requests call them on behalf of the approvers who authorized the change.
 */
import { UNIVERSITY, unitScope } from "../rbac";
import type { Account, Assignment, DataGrant, OrgKind, OrgUnit, Scope } from "../types";
import { log, nextId, notify, roleById, unitById, type Ctx } from "./core";

export function defaultScope(ctx: Ctx, roleId: string, unitId: string): Scope {
  const role = roleById(ctx, roleId);
  return role?.scopeKind === "university" ? UNIVERSITY : unitScope(unitId);
}

export function createAccount(
  ctx: Ctx,
  input: { name: string; email: string; title: string; unitId: string; roleId: string; scope?: Scope; expires?: string; external?: boolean },
  note?: string,
): Account {
  const id = nextId(ctx, "account", "ACC-");
  const assignment: Assignment = {
    id: nextId(ctx, "assignment", "AS-"),
    roleId: input.roleId,
    scope: input.scope ?? defaultScope(ctx, input.roleId, input.unitId),
    grantedBy: ctx.actor.id,
    grantedAt: ctx.iso,
    expires: input.expires || undefined,
    note,
  };
  const account: Account = {
    id,
    name: input.name,
    email: input.email.toLowerCase(),
    title: input.title,
    unitId: input.unitId,
    status: "Pending Invitation",
    assignments: [assignment],
    createdAt: ctx.iso,
    invitedAt: ctx.iso,
    identity: input.external ? "Sponsored guest" : "Google Workspace",
    external: input.external || undefined,
    mfa: { enrolled: false },
    transfers: [],
  };
  ctx.state.accounts.push(account);
  return account;
}

export function addAssignment(ctx: Ctx, account: Account, roleId: string, scope: Scope, expires?: string, note?: string): Assignment {
  const a: Assignment = { id: nextId(ctx, "assignment", "AS-"), roleId, scope, grantedBy: ctx.actor.id, grantedAt: ctx.iso, expires: expires || undefined, note };
  account.assignments.push(a);
  return a;
}

export function revokeSessions(ctx: Ctx, accountId: string) {
  const before = ctx.state.sessions.length;
  ctx.state.sessions = ctx.state.sessions.filter((s) => s.accountId !== accountId);
  return before - ctx.state.sessions.length;
}

export function createUnit(ctx: Ctx, input: { name: string; code: string; kind: OrgKind; parentId: string }): OrgUnit {
  const base = input.code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unit";
  let id = base;
  for (let i = 2; ctx.state.units.some((u) => u.id === id); i++) id = `${base}-${i}`;
  const unit: OrgUnit = {
    id,
    code: input.code.toUpperCase(),
    name: input.name,
    kind: input.kind,
    parentId: input.parentId,
    status: "Active",
    adminIds: [],
    established: ctx.day,
    history: [{ at: ctx.iso, by: ctx.actor.id, change: "Created" }],
  };
  ctx.state.units.push(unit);
  return unit;
}

export function publishStory(ctx: Ctx, slug: string, title: string, unitSlug?: string) {
  ctx.state.records.stories[slug] = "Published";
  log(ctx, "story.publish", "Approval", { type: "Story", id: slug, label: title }, "Success", "Now on the public Impact and Innovation page");
  if (unitSlug) notify(ctx, `unit:${unitSlug}`, "tpl-published", { title }, "/impact");
}

export function addDataGrant(ctx: Ctx, account: Account, grant: DataGrant) {
  account.dataGrants = [...(account.dataGrants ?? []).filter((g) => !(g.datasetId === grant.datasetId && g.access === grant.access)), grant];
}

export const unitName = (ctx: Ctx, id: string) => unitById(ctx, id)?.name ?? id;
