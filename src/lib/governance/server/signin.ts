import "server-only";

/*
 * The second half of sign-in, after Google (through Supabase Auth) has said who someone is: the Hub decides
 * whether that person may come in, under the same checks as every request (an account from an approved access
 * request or the Administration console, account status, allowed domains, active roles), opens a Hub session and audits the attempt either way. Only the OAuth callback calls it;
 * it is deliberately not a Server Function, which a browser could call with any address.
 */
import { randomBytes } from "node:crypto";
import { HUB_OFFICE, ROLE } from "../catalog";
import { domainAllowed, workspacesOf } from "../derive";
import { raiseAlert } from "../engine";
import { log, type Ctx } from "../engine/core";
import { addAssignment, createAccount } from "../engine/mutations";
import { actingGrants, activeAssignments, grantsFor, runsHub, today, UNIVERSITY } from "../rbac";
import type { Account, GovernanceState } from "../types";
import { runSystem } from "./run";
import { readState } from "./store";
import { knownDevice } from "./db/audit";
import { sessionKey } from "./session";

/** Why sign-in was refused; /signin words each one (SignInFlow). */
export type Refusal = "not-registered" | "pending" | "suspended" | "deactivated" | "domain" | "guests" | "no-role";

const res = (a: Account) => ({ type: "Account", id: a.id, label: a.name });

/** Only the workspaces are places to come back to after signing in. */
export const safeNext = (next: string | undefined) => (next && /^\/(admin|portal)(\/|$|\?)/.test(next) ? next : undefined);

/** "Chrome on macOS", for the audit trail and the new-device check. */
export function deviceOf(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return `${browser} on ${os}`;
}

/** Where someone lands: the page they asked for if their active role's workspaces include it, else that role's workspace. */
export function landing(state: GovernanceState, a: Account, next?: string) {
  const ws = workspacesOf(actingGrants(a, state.units, today()));
  if (next?.startsWith("/admin") && ws.includes("office")) return next;
  if (next?.startsWith("/portal") && ws.includes("portal")) return next;
  return ws.includes("office") ? "/admin" : "/portal";
}

/**
 * The first Administrator of the Rankings Office (HUB_BOOTSTRAP_ADMIN) is created, or restored, at their Google
 * sign-in while no active Administrator runs the Hub University-wide: on a new Hub, and as the way back in if
 * every one is lost.
 */
let bootstrapWarned = false;

function bootstrapAdmin(ctx: Ctx, email: string, name: string) {
  const owner = process.env.HUB_BOOTSTRAP_ADMIN?.trim().toLowerCase();
  if (!owner || email !== owner) return;
  const s = ctx.state;
  const active = s.accounts.some((a) => a.status === "Active" && activeAssignments(a, ctx.day).some(runsHub));
  if (active) {
    // Whoever controls that mailbox can take the Hub back whenever no administrator is left; once real ones exist,
    // the variable should go.
    if (!bootstrapWarned && process.env.NODE_ENV === "production") {
      bootstrapWarned = true;
      console.warn("HUB_BOOTSTRAP_ADMIN is still set though an active Administrator runs the Hub. Remove it from the production environment.");
    }
    return;
  }
  const existing = s.accounts.find((a) => a.email.toLowerCase() === email);
  if (existing) {
    existing.status = "Active";
    existing.statusReason = undefined;
    existing.statusChangedAt = ctx.iso;
    // Active too, so the way back in lands in the Office workspace whatever role they had switched to.
    existing.activeAssignment = (activeAssignments(existing, ctx.day).find(runsHub) ?? addAssignment(ctx, existing, ROLE.admin, UNIVERSITY)).id;
    log(ctx, "account.bootstrap", "Account", res(existing), "Success", "Administrator restored: no one ran the Hub");
    return;
  }
  const a = createAccount(ctx, { name: name || email, email, title: "Administrator", unitId: HUB_OFFICE, roleId: ROLE.admin, scope: UNIVERSITY });
  log(ctx, "account.bootstrap", "Account", res(a), "Success", "First Administrator, created at first sign-in");
}

/** Only Google's own photo host, over HTTPS, at a size that stays sharp on high-density screens. */
function googlePhoto(url: string | undefined) {
  try {
    const u = new URL(url ?? "");
    if (u.protocol !== "https:" || !/(^|\.)googleusercontent\.com$/.test(u.hostname)) return undefined;
    return u.href.replace(/=s\d+-c$/, "=s192-c");
  } catch {
    return undefined;
  }
}

/** Open a Hub session for someone Google has identified, or say why not. */
export async function completeSignIn(input: {
  email: string;
  name?: string;
  avatar?: string;
  device: string;
  next?: string;
  /** Google's hosted-domain claim: the Google Workspace the account belongs to, absent for personal Google accounts. */
  hd?: string;
  /** "Keep me signed in" as ticked on the sign-in screen; it becomes the account's choice. Absent: unchanged. */
  stay?: boolean;
}): Promise<{ ok: true; token: string; dest: string; staySeconds?: number } | { ok: false; why: Refusal }> {
  const email = input.email.trim().toLowerCase();
  let token = "";
  const name = (input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const avatar = googlePhoto(input.avatar);
  let sessionId = "";
  let accountId = "";
  let refusal = null as Refusal | null;
  // Whether this device signed in to the account before: the whole audit trail, not only the day the model holds.
  const existing = (await readState()).accounts.find((x) => x.email.toLowerCase() === email);
  const seenDevice = existing ? await knownDevice(existing.id, input.device) : false;
  await runSystem((ctx) => {
    // A transaction may run again on newer state; only its last run's outcome counts.
    sessionId = accountId = token = "";
    refusal = null;
    const s = ctx.state;
    // An address on a University domain counts only from the University's Google Workspace, not from a personal
    // Google account someone registered with that address.
    const domains = s.security.sso.domains.map((d) => d.toLowerCase());
    const hd = input.hd?.toLowerCase();
    if (domains.includes(email.split("@")[1] ?? "") && !(hd && domains.includes(hd))) {
      refusal = "domain";
      log(ctx, "session.signin", "Session", { type: "Account", id: email, label: name || email }, "Failed", `Not a ${domains.join(", ")} Google Workspace account · ${input.device}`);
      return { ok: true, message: "Refused" };
    }
    bootstrapAdmin(ctx, email, name);
    const a = s.accounts.find((x) => x.email.toLowerCase() === email);
    const signingIn = (who: Account) => ({ ...ctx.actor, id: who.id, name: who.name, role: "Signing in" });
    if (!a) {
      // A UST address alone is no way in: everyone needs an approved access request (or an account the Office created).
      const waiting = s.requests.find((r) => r.status === "Pending" && r.payload.kind === "account-access" && r.payload.email.toLowerCase() === email);
      refusal = waiting ? "pending" : "not-registered";
      log(ctx, "session.signin", "Session", { type: "Account", id: email, label: name || email }, "Failed", `${waiting ? `Access request ${waiting.id} not yet approved` : `No account for ${email}`} · ${input.device}`);
      return { ok: true, message: "Refused" };
    }
    const fail = (why: Refusal, detail: string) => {
      refusal = why;
      log(ctx, "session.signin", "Session", res(a), "Failed", `${detail} · ${input.device}`, signingIn(a));
      return { ok: true, message: "Refused" };
    };
    if (a.status === "Suspended") return fail("suspended", `Suspended: ${a.statusReason ?? "no reason recorded"}`);
    if (a.status === "Deactivated") return fail("deactivated", "Deactivated");
    if (!a.external && !domainAllowed(s, a.email)) return fail("domain", `Outside ${s.security.sso.domains.join(", ")}`);
    if (a.external && !s.security.sso.allowGuests) return fail("guests", "Sponsored guest sign-in is switched off");
    const grants = grantsFor(a, s.units, ctx.day);
    if (!activeAssignments(a, ctx.day).length || !workspacesOf(grants).length) return fail("no-role", "No active role");

    const known = a.id === existing?.id && seenDevice;
    token = randomBytes(32).toString("base64url");
    sessionId = sessionKey(token);
    accountId = a.id;
    s.sessions.push({ id: sessionId, accountId: a.id, createdAt: ctx.iso, lastSeen: ctx.iso, mfa: false, device: input.device });
    a.lastLogin = ctx.iso;
    a.firstLogin ??= ctx.iso;
    a.avatar = avatar;
    if (input.stay !== undefined && !!a.sessionPrefs?.stay !== input.stay) {
      const { idleMinutes } = a.sessionPrefs ?? {};
      a.sessionPrefs = input.stay || idleMinutes ? { ...(idleMinutes ? { idleMinutes } : {}), ...(input.stay ? { stay: true } : {}) } : undefined;
    }
    if (a.status === "Pending Invitation") {
      a.status = "Active";
      a.statusChangedAt = ctx.iso;
      log(ctx, "account.activate", "Account", res(a), "Success", "Invitation accepted at first sign-in");
    }
    log(ctx, "session.signin", "Session", res(a), "Success", `Google Workspace · ${input.device}${a.sessionPrefs?.stay ? " · stays signed in" : ""}`, { ...signingIn(a), role: actingGrants(a, s.units, ctx.day)[0]?.roleName ?? "No role" });
    if (!known && a.external) raiseAlert(ctx, "Suspicious sign-in", "Medium", `External partner ${a.name} signed in from a new device (${input.device}).`, a.id);
    return { ok: true, message: "Signed in" };
  });
  if (refusal) return { ok: false, why: refusal };
  const state = await readState();
  const account = state.accounts.find((a) => a.id === accountId);
  if (!sessionId || !account) return { ok: false, why: "not-registered" };
  // someone who chose to stay signed in keeps the cookie past closing the browser, until the longest session ends
  const stay = account.sessionPrefs?.stay;
  return { ok: true, token, dest: landing(state, account, input.next), ...(stay ? { staySeconds: state.security.session.absoluteHours * 3600 } : {}) };
}
