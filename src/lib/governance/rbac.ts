/*
 * Permission evaluation. Pure functions shared by the server (the authority) and the client (which only
 * uses them to decide what to show). A role decides what a user can do; the scope of each assignment
 * decides which records they can reach.
 */
import { MODULES, roleOf } from "./catalog";
import type { Account, Action, Assignment, BodyKey, ModuleKey, OrgUnit, PermissionSet, Role, RoleId, Scope } from "./types";

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

/* ---------- Permissions ---------- */

const valid = (m: ModuleKey, a: Action) => MODULES.find((x) => x.key === m)?.actions.includes(a) ?? false;

export function union(...sets: PermissionSet[]): PermissionSet {
  const out: PermissionSet = {};
  for (const set of sets) {
    for (const [m, acts] of Object.entries(set) as [ModuleKey, Action[]][]) {
      if (!acts?.length) continue;
      const cur = new Set(out[m] ?? []);
      acts.forEach((a) => valid(m, a) && cur.add(a));
      if (cur.size) out[m] = [...cur];
    }
  }
  return normalize(out);
}

/** Keep module and action order stable so permission sets compare and render predictably. */
export function normalize(set: PermissionSet): PermissionSet {
  const out: PermissionSet = {};
  for (const mod of MODULES) {
    const acts = set[mod.key];
    if (acts?.length) out[mod.key] = mod.actions.filter((a) => acts.includes(a));
  }
  return out;
}

export const rolePermissions = (roleId: string): PermissionSet => roleOf(roleId)?.permissions ?? {};

export const has = (set: PermissionSet, m: ModuleKey, a: Action) => (set[m] ?? []).includes(a);

/** Permissions in `inner` that `outer` does not hold. */
export function beyond(inner: PermissionSet, outer: PermissionSet): { module: ModuleKey; action: Action }[] {
  return (Object.entries(inner) as [ModuleKey, Action[]][]).flatMap(([m, acts]) =>
    acts.filter((a) => !has(outer, m, a)).map((a) => ({ module: m, action: a })),
  );
}

/* ---------- Organizational tree ---------- */

export function childrenOf(units: OrgUnit[], id: string | null) {
  return units.filter((u) => u.parentId === id);
}

/** The unit and every unit beneath it. */
export function descendants(units: OrgUnit[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of units) if (c.parentId === out[i]) out.push(c.id);
  return out;
}

/** From the unit up to the University, nearest first. */
export function ancestors(units: OrgUnit[], id: string): OrgUnit[] {
  const out: OrgUnit[] = [];
  let cur = units.find((u) => u.id === id);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    out.push(cur);
    cur = cur.parentId ? units.find((u) => u.id === cur!.parentId) : undefined;
  }
  return out;
}

export const unitPath = (units: OrgUnit[], id: string) =>
  ancestors(units, id)
    .reverse()
    .slice(1)
    .map((u) => u.name)
    .join(" › ");

/* ---------- Assignments and scope ---------- */

export const isExpired = (a: Assignment, day: string) => !!a.expires && a.expires <= day;

export function activeAssignments(account: Account, day: string): Assignment[] {
  return account.assignments.filter((a) => !isExpired(a, day));
}

export const UNIVERSITY: Scope = { units: "all", rankingBodies: "all", years: "all", datasets: "all" };

export const unitScope = (unitId: string): Scope => ({ units: [unitId], rankingBodies: "all", years: "all", datasets: "all" });

export function scopeLabel(scope: Scope, units: OrgUnit[], datasetNames: Record<string, string> = {}): string {
  const parts: string[] = [];
  parts.push(scope.units === "all" ? "University-wide" : scope.units.map((id) => units.find((u) => u.id === id)?.name ?? id).join(", "));
  if (scope.rankingBodies !== "all") parts.push(scope.rankingBodies.join(" + "));
  if (scope.years !== "all") parts.push(`cycle ${scope.years.join(", ")}`);
  if (scope.datasets !== "all") parts.push(scope.datasets.map((d) => datasetNames[d] ?? d).join(", "));
  return parts.join(" · ");
}

/** What a request touches. Axes left out are not checked. */
export interface Target {
  unitId?: string;
  bodies?: BodyKey[];
  year?: string;
  datasetId?: string;
}

/** An assignment flattened for checking: its role's permissions and its scope with unit trees expanded. */
export interface Grant {
  assignmentId: string;
  roleId: RoleId;
  roleName: string;
  perms: PermissionSet;
  units: "all" | string[];
  scopeUnits: "all" | string[];
  bodies: "all" | BodyKey[];
  years: "all" | string[];
  datasets: "all" | string[];
  expires?: string;
  tier: number;
}

export function grantsFor(account: Account, units: OrgUnit[], day: string): Grant[] {
  return activeAssignments(account, day).flatMap((a) => {
    const role = roleOf(a.roleId);
    if (!role) return [];
    const reach = a.scope.units === "all" ? "all" : [...new Set(a.scope.units.flatMap((id) => descendants(units, id)))];
    return [
      {
        assignmentId: a.id,
        roleId: role.id,
        roleName: role.name,
        perms: role.permissions,
        units: reach,
        scopeUnits: a.scope.units,
        bodies: a.scope.rankingBodies,
        years: a.scope.years,
        datasets: a.scope.datasets,
        expires: a.expires,
        tier: role.tier,
      },
    ];
  });
}

export function matches(g: Grant, t: Target): boolean {
  if (t.unitId && g.units !== "all" && !g.units.includes(t.unitId)) return false;
  if (t.bodies?.length && g.bodies !== "all" && !t.bodies.some((b) => (g.bodies as BodyKey[]).includes(b))) return false;
  if (t.year && g.years !== "all" && !g.years.includes(t.year)) return false;
  if (t.datasetId && g.datasets !== "all" && !g.datasets.includes(t.datasetId)) return false;
  return true;
}

/** Can someone holding these grants do this, on this target? */
export function canWith(grants: Grant[], m: ModuleKey, a: Action, t: Target = {}): boolean {
  return grants.some((g) => has(g.perms, m, a) && matches(g, t));
}

/** Union of permissions across grants, ignoring scope. */
export const mergedPermissions = (grants: Grant[]) => union(...grants.map((g) => g.perms));

/** Units a set of grants reaches for one permission ("all" when any grant is University-wide). */
export function reach(grants: Grant[], m: ModuleKey, a: Action): "all" | string[] {
  const hits = grants.filter((g) => has(g.perms, m, a));
  if (hits.some((g) => g.units === "all")) return "all";
  return [...new Set(hits.flatMap((g) => g.units as string[]))];
}

/** The highest-ranked role among the grants, for labels. */
export const topGrant = (grants: Grant[]) => grants.reduce<Grant | undefined>((top, g) => (!top || g.tier > top.tier ? g : top), undefined);

export const topTier = (grants: Grant[]) => topGrant(grants)?.tier ?? 0;

/**
 * Nobody can grant more than they hold: the role's permissions must sit inside the actor's own, and the
 * scope must sit inside what the actor administers.
 */
export function grantCheck(actor: Grant[], role: Role, scope: Scope, units: OrgUnit[]): { ok: true } | { ok: false; reason: string } {
  const extra = beyond(role.permissions, mergedPermissions(actor));
  if (extra.length)
    return { ok: false, reason: `You can't assign ${role.name}: it includes permissions you don't hold (${extra.slice(0, 3).map((e) => `${e.module} ${e.action}`).join(", ")}${extra.length > 3 ? "…" : ""}).` };
  const admin = reach(actor, "accounts", "edit");
  if (admin !== "all") {
    if (scope.units === "all") return { ok: false, reason: "You can only assign roles within the units you administer." };
    const outside = scope.units.filter((u) => !admin.includes(u));
    if (outside.length) return { ok: false, reason: `${units.find((u) => u.id === outside[0])?.name ?? outside[0]} is outside the units you administer.` };
  }
  return { ok: true };
}

/** Initials for an avatar: first name and surname, skipping honorifics and keeping "Dela Cruz" whole. */
export function initials(name: string) {
  const words = name
    .replace(/^(Engr|Dr|Ms|Mr|Mrs|Ar|Prof|Atty|Rev|Fr)\.?\s+/i, "")
    .split(/[\s.]+/)
    .filter((w) => /^[A-Za-z]/.test(w));
  if (!words.length) return "?";
  const particle = words.length > 2 && /^(de|del|dela|delos|san|sta|santa|van|von)$/i.test(words[words.length - 2]);
  const last = particle ? words[words.length - 2] : words[words.length - 1];
  return (words[0][0] + (words.length > 1 ? last[0] : "")).toUpperCase();
}
