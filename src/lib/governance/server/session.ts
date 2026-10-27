import "server-only";

/*
 * Sessions: the cookie names a server-side session; every request re-checks it against the store, so
 * suspending an account, revoking its sessions, requiring re-authentication or changing the timeout
 * policy takes effect on the person's very next request.
 */
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { cache } from "react";
import { ADMIN_MODULES, roleOf } from "../catalog";
import { flagOn, portalScope, workspacesOf } from "../derive";
import { actingGrants, activeAssignments, canWith, initials, mergedPermissions, scopeLabel, today } from "../rbac";
import type { Account, GovernanceState, Session } from "../types";
import { idleLimit, sessionExpired } from "../session-limits";
import type { Viewer } from "../viewer";
import { readState, touch } from "./store";

const SECURE = process.env.NODE_ENV === "production";

/**
 * The cookie holding the session token. In production it is a __Host- cookie: sent only over HTTPS, only to
 * this exact host, for the whole site, so no subdomain can set or read it. The plain name is still read so
 * sign-ins from before the change carry on.
 */
export const SESSION_COOKIE = SECURE ? "__Host-hub_session" : "hub_session";
const LEGACY_COOKIE = "hub_session";
export const SESSION_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/", secure: SECURE } as const;

/** "Keep me signed in" from the sign-in screen, held through the trip to Google and read once at /auth/callback. */
export const STAY_COOKIE = SECURE ? "__Host-hub_stay" : "hub_stay";
export const STAY_COOKIE_OPTIONS = { ...SESSION_COOKIE_OPTIONS, maxAge: 600 } as const;

/** The store keeps only the SHA-256 of a session token: reading the database or the console yields no working session. */
export const sessionKey = (token: string) => createHash("sha256").update(token).digest("hex");

type Jar = Awaited<ReturnType<typeof cookies>>;

/** The store's id for the session this request's cookie carries, or null. */
export function sessionIdOf(jar: Jar): string | null {
  const token = jar.get(SESSION_COOKIE)?.value ?? jar.get(LEGACY_COOKIE)?.value;
  return token ? sessionKey(token) : null;
}

/**
 * Keep the session cookie past closing the browser (until the longest session ends), or make it a browser
 * session cookie again. The token itself doesn't change.
 */
export function persistSessionCookie(jar: Jar, seconds: number | null) {
  const token = jar.get(SESSION_COOKIE)?.value ?? jar.get(LEGACY_COOKIE)?.value;
  if (!token) return;
  jar.set(SESSION_COOKIE, token, seconds && seconds > 0 ? { ...SESSION_COOKIE_OPTIONS, maxAge: Math.floor(seconds) } : SESSION_COOKIE_OPTIONS);
}

/** How long a staying-signed-in cookie should last for a session started at `createdAt`. */
export const staySeconds = (absoluteHours: number, createdAt: string, now = Date.now()) => absoluteHours * 3600 - (now - Date.parse(createdAt)) / 1000;

export function clearSessionCookie(jar: Jar) {
  jar.delete(SESSION_COOKIE);
  if (LEGACY_COOKIE !== SESSION_COOKIE) jar.delete(LEGACY_COOKIE);
}

export type SessionProblem = "ended" | "expired" | "suspended" | "reauth";

export function checkSession(state: GovernanceState, id: string, now = new Date()): { session: Session; account: Account } | { problem: SessionProblem } {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return { problem: "ended" };
  const account = state.accounts.find((a) => a.id === session.accountId);
  if (sessionExpired(state.security.session, account?.sessionPrefs, session, now.getTime())) return { problem: "expired" };
  if (!account || account.status !== "Active") return { problem: "suspended" };
  if (account.reauthAfter && account.reauthAfter > session.createdAt) return { problem: "reauth" };
  if (!activeAssignments(account, today(now)).length) return { problem: "suspended" };
  return { session, account };
}

export function buildViewer(state: GovernanceState, account: Account, session: Session, now = new Date()): Viewer {
  const day = today(now);
  // Everything below follows the role they are acting in; the others are only listed, to switch to.
  const grants = actingGrants(account, state.units, day);
  const acting = grants[0];
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
      assignmentId: a.id,
      id: a.roleId,
      name: roleOf(a.roleId)?.name ?? a.roleId,
      scope: scopeLabel(a.scope, state.units, Object.fromEntries(state.datasets.map((d) => [d.id, d.name]))),
      expires: a.expires,
      active: a.id === acting?.assignmentId,
    })),
    roleName: acting?.roleName ?? "No role",
    grants,
    perms: mergedPermissions(grants),
    workspaces: workspacesOf(grants),
    portal: {
      unitId: portalUnit,
      unitName: unitName(portalUnit),
      programId,
      programName: programId ? unitName(programId) : undefined,
    },
    // The Administration console opens on the sections the viewer may see; only University-wide Administrators have any.
    admin: ADMIN_MODULES.filter((m) => canWith(grants, m, "view")),
    flags: state.config.flags.filter((f) => flagOn(state, f.id, account)).map((f) => f.id),
    features: Object.fromEntries(state.config.features.map((f) => [f.id, f.enabled])),
    dataGrants: (account.dataGrants ?? []).filter((g) => g.until > day),
    session: {
      id: session.id,
      startedAt: session.createdAt,
      ...state.security.session,
      // What applies to this person: 0 when they stay signed in. The policy's own limit stays as policyIdleMinutes.
      idleMinutes: idleLimit(state.security.session, account.sessionPrefs) ?? 0,
      policyIdleMinutes: state.security.session.idleMinutes,
      prefIdleMinutes: account.sessionPrefs?.idleMinutes,
      stay: !!account.sessionPrefs?.stay,
      mfa: session.mfa,
    },
    notify: { email: !!account.notifyPrefs?.email, off: account.notifyPrefs?.off ?? [] },
  };
}

/** The signed-in viewer for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const id = sessionIdOf(await cookies());
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
  const id = sessionIdOf(await cookies());
  if (!id) return null;
  const check = checkSession(await readState(), id);
  return "problem" in check ? check.problem : null;
});

export async function getAccount(viewer: Viewer) {
  return (await readState()).accounts.find((a) => a.id === viewer.id) ?? null;
}
