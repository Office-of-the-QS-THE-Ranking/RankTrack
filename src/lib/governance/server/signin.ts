import "server-only";

/*
 * The second half of sign-in, after Google (through Supabase Auth) has said who someone is: the Hub decides
 * whether that person may come in, under the same checks as every request (account status, allowed domains,
 * active roles), opens a Hub session and audits the attempt either way. Only the OAuth callback calls it;
 * it is deliberately not a Server Function, which a browser could call with any address.
 */
import { randomBytes } from "node:crypto";
import { ROLE } from "../catalog";
import { domainAllowed, workspacesOf } from "../derive";
import { raiseAlert } from "../engine";
import { log, type Ctx } from "../engine/core";
import { addAssignment, createAccount } from "../engine/mutations";
import { activeAssignments, grantsFor, today, topGrant, UNIVERSITY } from "../rbac";
import type { Account, GovernanceState } from "../types";
import { applyProfile, readProfile } from "./dev-access";
import { runSystem } from "./run";
import { readState } from "./store";

/** Why sign-in was refused; /signin words each one (SignInFlow). */
export type Refusal = "not-registered" | "suspended" | "deactivated" | "domain" | "guests" | "no-role";

const res = (a: Account) => ({ type: "Account", id: a.id, label: a.name });

/** Only the workspaces are places to come back to after signing in. */
export const safeNext = (next: string | undefined) => (next && /^\/(admin|portal)(\/|$|\?)/.test(next) ? next : undefined);

/** "Chrome on macOS", for the audit trail and the new-device check. */
export function deviceOf(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return `${browser} on ${os}`;
}

/** Where someone lands: the page they asked for if their workspaces include it, else their own workspace. */
export function landing(state: GovernanceState, a: Account, next?: string) {
  const ws = workspacesOf(grantsFor(a, state.units, today()));
  if (next?.startsWith("/admin") && ws.includes("office")) return next;
  if (next?.startsWith("/portal") && ws.includes("portal")) return next;
  return ws.includes("office") ? "/admin" : "/portal";
}

/**
 * The first University Administrator (HUB_BOOTSTRAP_ADMIN) is created, or restored, at their Google sign-in
 * while the Hub has no active University Administrator: on a new Hub, and as the way back in if every one is lost.
 */
function bootstrapAdmin(ctx: Ctx, email: string, name: string) {
  const owner = process.env.HUB_BOOTSTRAP_ADMIN?.trim().toLowerCase();
  if (!owner || email !== owner) return;
  const s = ctx.state;
  const active = s.accounts.some((a) => a.status === "Active" && activeAssignments(a, ctx.day).some((x) => x.roleId === ROLE.admin));
  if (active) return;
  const existing = s.accounts.find((a) => a.email.toLowerCase() === email);
  if (existing) {
    existing.status = "Active";
    existing.statusReason = undefined;
    existing.statusChangedAt = ctx.iso;
    if (!activeAssignments(existing, ctx.day).some((x) => x.roleId === ROLE.admin)) addAssignment(ctx, existing, ROLE.admin, UNIVERSITY);
    log(ctx, "account.bootstrap", "Account", res(existing), "Success", "University Administrator restored: the Hub had none active");
    return;
  }
  const a = createAccount(ctx, { name: name || email, email, title: "University Administrator", unitId: "rankings-office", roleId: ROLE.admin, scope: UNIVERSITY });
  log(ctx, "account.bootstrap", "Account", res(a), "Success", "First University Administrator, created at first sign-in");
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
export async function completeSignIn(input: { email: string; name?: string; avatar?: string; device: string; next?: string }): Promise<{ ok: true; sessionId: string; dest: string } | { ok: false; why: Refusal }> {
  const email = input.email.trim().toLowerCase();
  const name = (input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const avatar = googlePhoto(input.avatar);
  let sessionId = "";
  let accountId = "";
  let refusal = null as Refusal | null;
  const dev = await readProfile();
  await runSystem((ctx) => {
    // A transaction may run again on newer state; only its last run's outcome counts.
    sessionId = accountId = "";
    refusal = null;
    const s = ctx.state;
    bootstrapAdmin(ctx, email, name);
    applyProfile(ctx, dev, email, name);
    const a = s.accounts.find((x) => x.email.toLowerCase() === email);
    const signingIn = (who: Account) => ({ ...ctx.actor, id: who.id, name: who.name, role: "Signing in" });
    if (!a) {
      refusal = "not-registered";
      log(ctx, "session.signin", "Session", { type: "Account", id: email, label: name || email }, "Failed", `No account for ${email} · ${input.device}`);
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

    const known = s.audit.some((e) => e.actorId === a.id && e.action === "session.signin" && e.outcome === "Success" && (e.detail ?? "").includes(input.device));
    sessionId = randomBytes(24).toString("base64url");
    accountId = a.id;
    s.sessions.push({ id: sessionId, accountId: a.id, createdAt: ctx.iso, lastSeen: ctx.iso, mfa: false, device: input.device });
    a.lastLogin = ctx.iso;
    a.firstLogin ??= ctx.iso;
    a.avatar = avatar;
    if (a.status === "Pending Invitation") {
      a.status = "Active";
      a.statusChangedAt = ctx.iso;
      log(ctx, "account.activate", "Account", res(a), "Success", "Invitation accepted at first sign-in");
    }
    log(ctx, "session.signin", "Session", res(a), "Success", `Google Workspace · ${input.device}`, { ...signingIn(a), role: topGrant(grants)?.roleName ?? "No role" });
    if (!known && a.external) raiseAlert(ctx, "Suspicious sign-in", "Medium", `External collaborator ${a.name} signed in from a new device (${input.device}).`, a.id);
    return { ok: true, message: "Signed in" };
  });
  if (refusal) return { ok: false, why: refusal };
  const state = await readState();
  const account = state.accounts.find((a) => a.id === accountId);
  if (!sessionId || !account) return { ok: false, why: "not-registered" };
  return { ok: true, sessionId, dest: landing(state, account, input.next) };
}
