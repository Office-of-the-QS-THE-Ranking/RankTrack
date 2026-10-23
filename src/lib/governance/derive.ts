/*
 * Derived facts about the governance state that the server, the console and the workspaces all need.
 * Pure functions: no I/O.
 */
import { RANKINGS, UNITS as PARTICIPATION } from "@/lib/data";
import { BODY_OF_FAMILY, bodyOfMapping } from "./catalog";
import { ancestors, canWith, descendants, has, type Grant } from "./rbac";
import type { Account, BodyKey, Dataset, GovernanceState, OrgUnit, SecretKey } from "./types";

export const DAY_MS = 86_400_000;

export const daysSince = (iso: string, now: Date) => Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);

export function addDays(isoDay: string, n: number) {
  const d = new Date(isoDay + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- Accounts ---------- */

/** The moment the inactivity clock last restarted: a sign-in, an invitation, or an administrator's "keep active". */
export function lastActivity(a: Account): string {
  return [a.lastLogin, a.keptActive?.at, a.createdAt].filter(Boolean).sort().at(-1)!;
}

export function isInactive(a: Account, days: number, now: Date) {
  return a.status === "Active" && daysSince(lastActivity(a), now) > days;
}

export const tierOf = (grants: Grant[]) => grants.reduce((n, g) => Math.max(n, g.tier), 0);

/** Which workspaces a set of grants opens. */
export function workspacesOf(grants: Grant[]): ("office" | "portal")[] {
  const out: ("office" | "portal")[] = [];
  if (canWith(grants, "dashboard", "view")) out.push("office");
  const contributes = grants.some((g) => has(g.perms, "evidence", "submit") || has(g.perms, "data", "submit") || has(g.perms, "stories", "create"));
  const guestOnly = grants.length > 0 && !out.length && grants.every((g) => has(g.perms, "knowledge", "view"));
  if (contributes || guestOnly) out.push("portal");
  return out;
}

const PARTICIPATING = new Set(PARTICIPATION.map((u) => u.slug));

/** The nearest unit at or above `unitId` that takes part in rankings reporting (has a participation record). */
export function participatingUnit(units: OrgUnit[], unitId: string): string | undefined {
  return ancestors(units, unitId).find((u) => PARTICIPATING.has(u.id))?.id;
}

/** The unit the contributor workspace opens on, and the units its records may come from. */
export function portalScope(account: Account, grants: Grant[], units: OrgUnit[]): { unitId: string; reach: "all" | string[] } {
  const contributing = grants.filter((g) => has(g.perms, "evidence", "view") || has(g.perms, "data", "view") || has(g.perms, "stories", "create"));
  const scoped = contributing.find((g) => g.scopeUnits !== "all");
  if (scoped && scoped.scopeUnits !== "all") {
    const home = scoped.scopeUnits[0];
    const reach = [...new Set(contributing.flatMap((g) => (g.units === "all" ? [] : g.units)))];
    return { unitId: participatingUnit(units, home) ?? home, reach: contributing.some((g) => g.units === "all") ? "all" : reach };
  }
  return { unitId: participatingUnit(units, account.unitId) ?? account.unitId, reach: contributing.length ? "all" : [account.unitId] };
}

export function mfaRequired(state: GovernanceState, grants: Grant[]) {
  const { mode, roles } = state.security.mfa;
  if (mode === "Everyone") return true;
  if (mode === "Off") return false;
  return grants.some((g) => roles.includes(g.roleId));
}

export function domainOf(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function domainAllowed(state: GovernanceState, email: string) {
  return state.security.sso.domains.map((d) => d.toLowerCase()).includes(domainOf(email));
}

/* ---------- Configuration ---------- */

export function flagOn(state: GovernanceState, flagId: string, account: Account | null): boolean {
  const flag = state.config.flags.find((f) => f.id === flagId);
  if (!flag || flag.mode === "Off" || !account) return flag?.mode === "Everyone";
  if (flag.mode === "Everyone") return true;
  if (flag.accounts.includes(account.id)) return true;
  const lineage = ancestors(state.units, account.unitId).map((u) => u.id);
  const scoped = account.assignments.flatMap((a) => (a.scope.units === "all" ? [] : a.scope.units));
  return flag.units.some((u) => lineage.includes(u) || scoped.some((s) => s === u || ancestors(state.units, s).some((x) => x.id === u)));
}

export const featureOn = (state: GovernanceState, id: string) => state.config.features.find((f) => f.id === id)?.enabled ?? true;

export const bodyOfRanking = (slug: string): BodyKey | undefined => {
  const r = RANKINGS.find((x) => x.slug === slug);
  return r ? BODY_OF_FAMILY[r.family] : undefined;
};

export function bodyEnabled(state: GovernanceState, key: string | undefined) {
  return !!key && (state.config.bodies.find((b) => b.key === key)?.enabled ?? false);
}

/** Tracked in the workspaces: the ranking and its body are both switched on. */
export function rankingActive(state: GovernanceState, slug: string) {
  const c = state.config.rankings.find((r) => r.slug === slug);
  return !!c?.enabled && bodyEnabled(state, bodyOfRanking(slug));
}

/** Shown on the public website: active, marked public, and results are a Public dataset. */
export function rankingPublic(state: GovernanceState, slug: string) {
  const c = state.config.rankings.find((r) => r.slug === slug);
  return rankingActive(state, slug) && !!c?.public && datasetPublic(state, "DS-RESULTS");
}

export const datasetOf = (state: GovernanceState, id: string): Dataset | undefined => state.datasets.find((d) => d.id === id);

export const datasetPublic = (state: GovernanceState, id: string) => datasetOf(state, id)?.classification === "Public";

export function mappingActive(state: GovernanceState, mapping: string) {
  const body = bodyOfMapping(mapping);
  return !body || bodyEnabled(state, body);
}

export const evidenceBodies = (mappedTo: string[]) => [...new Set(mappedTo.map(bodyOfMapping).filter((b): b is BodyKey => !!b))];

/* ---------- Directory ---------- */

/** A unit plus every archived unit merged into it, so merged history rolls up to the unit that absorbed it. */
export function mergedFamily(units: OrgUnit[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const u of units) if (u.mergedInto === out[i] && !out.includes(u.id)) out.push(u.id);
  return out;
}

/** Every unit whose records count for `id`: its subtree and anything merged into it. */
export function recordReach(units: OrgUnit[], id: string): string[] {
  return [...new Set(mergedFamily(units, id).flatMap((u) => descendants(units, u)))];
}

/* ---------- Security ---------- */

export const keyDue = (k: SecretKey) => addDays(k.rotated, k.rotationDays);

export const keyOverdue = (k: SecretKey, day: string) => keyDue(k) <= day;
