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
import { activeAssignments, today } from "../rbac";
import type { Account, GovernanceState, Session } from "../types";
import { sessionExpired } from "../session-limits";
import type { Viewer } from "../viewer";
import { buildViewer } from "../viewer-build";
import { readState, touch } from "./store";

export { buildViewer } from "../viewer-build";

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
  jar.delete({ name: SESSION_COOKIE, ...SESSION_COOKIE_OPTIONS });
  if (LEGACY_COOKIE !== SESSION_COOKIE) jar.delete({ name: LEGACY_COOKIE, ...SESSION_COOKIE_OPTIONS, secure: false });
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
