import "server-only";

/*
 * Sessions: the cookie names a server-side session; every request re-checks it against the store, so
 * suspending an account, revoking its sessions, requiring re-authentication or changing the timeout
 * policy takes effect on the person's very next request.
 */
import { cookies } from "next/headers";
import { after } from "next/server";
import { cache } from "react";
import { ADMIN_MODULES, roleOf } from "../catalog";
import { flagOn, portalScope, workspacesOf } from "../derive";
import { activeAssignments, canWith, grantsFor, initials, mergedPermissions, scopeLabel, today, topGrant } from "../rbac";
import type { Account, GovernanceState, Session } from "../types";
import type { Viewer } from "../viewer";
import { readState, touch } from "./store";

export const SESSION_COOKIE = "hub_session";

export type SessionProblem = "ended" | "expired" | "suspended" | "reauth";

export function checkSession(state: GovernanceState, id: string, now = new Date()): { session: Session; account: Account } | { problem: SessionProblem } {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return { problem: "ended" };
  const { idleMinutes, absoluteHours } = state.security.session;
  const t = now.getTime();
  if (t - Date.parse(session.lastSeen) > idleMinutes * 60_000 || t - Date.parse(session.createdAt) > absoluteHours * 3_600_000) return { problem: "expired" };
  const account = state.accounts.find((a) => a.id === session.accountId);
  if (!account || account.status !== "Active") return { problem: "suspended" };
  if (account.reauthAfter && account.reauthAfter > session.createdAt) return { problem: "reauth" };
  if (!activeAssignments(account, today(now)).length) return { problem: "suspended" };
  return { session, account };
}

export function buildViewer(state: GovernanceState, account: Account, session: Session, now = new Date()): Viewer {
  const day = today(now);
  const grants = grantsFor(account, state.units, day);
  const unitName = (id: string) => state.units.find((u) => u.id === id)?.name ?? id;
  const portal = portalScope(account, grants, state.units);
  const portalUnit = portal.unitId;
  // A coordinator scoped below their faculty works on the faculty's page but files against their own unit.
  const narrow = portal.reach !== "all" && !portal.reach.includes(portalUnit) ? grants.find((g) => g.scopeUnits !== "all")?.scopeUnits : undefined;
  const programId = narrow && narrow !== "all" ? narrow[0] : undefined;
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    title: account.title,
    initials: initials(account.name),
    avatar: account.avatar,
    external: !!account.external,
    unitId: account.unitId,
    unitName: unitName(account.unitId),
    roles: activeAssignments(account, day).map((a) => ({
      id: a.roleId,
      name: roleOf(a.roleId)?.name ?? a.roleId,
      scope: scopeLabel(a.scope, state.units, Object.fromEntries(state.datasets.map((d) => [d.id, d.name]))),
      expires: a.expires,
    })),
    roleName: topGrant(grants)?.roleName ?? "No role",
    grants,
    perms: mergedPermissions(grants),
    workspaces: workspacesOf(grants),
    portal: {
      unitId: portalUnit,
      unitName: unitName(portalUnit),
      programId,
      programName: programId ? unitName(programId) : undefined,
    },
    // The Administration console opens on the sections the viewer may see; only University Administrators have any.
    admin: ADMIN_MODULES.filter((m) => canWith(grants, m, "view")),
    flags: state.config.flags.filter((f) => flagOn(state, f.id, account)).map((f) => f.id),
    features: Object.fromEntries(state.config.features.map((f) => [f.id, f.enabled])),
    dataGrants: (account.dataGrants ?? []).filter((g) => g.until > day),
    session: { id: session.id, startedAt: session.createdAt, ...state.security.session, mfa: session.mfa },
  };
}

/** The signed-in viewer for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const now = new Date();
  const state = await readState();
  const check = checkSession(state, id, now);
  if ("problem" in check) return null;
  after(() => touch(id, now.toISOString()));
  return buildViewer(state, check.account, check.session, now);
});

/** Why the current cookie no longer works, for the sign-in page. */
export const getSessionProblem = cache(async (): Promise<SessionProblem | null> => {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const check = checkSession(await readState(), id);
  return "problem" in check ? check.problem : null;
});

export async function getAccount(viewer: Viewer) {
  return (await readState()).accounts.find((a) => a.id === viewer.id) ?? null;
}
