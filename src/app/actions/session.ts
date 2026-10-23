"use server";

/*
 * Sign-in through the University's Google Workspace (simulated in this prototype by an account
 * chooser), the second factor, sign-out, the activity heartbeat and access requests. Every attempt,
 * successful or not, is audited.
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { domainAllowed, mfaRequired, workspacesOf } from "@/lib/governance/derive";
import { log } from "@/lib/governance/engine/core";
import { raiseAlert } from "@/lib/governance/engine";
import { openRequest } from "@/lib/governance/engine/requests";
import { activeAssignments, grantsFor, today } from "@/lib/governance/rbac";
import { run, runSystem } from "@/lib/governance/server/run";
import { ACTING_COOKIE, SESSION_COOKIE, checkSession, getViewer } from "@/lib/governance/server/session";
import { readState, sha256, touch } from "@/lib/governance/server/store";
import type { Account, GovernanceState } from "@/lib/governance/types";

export type SignInResult =
  | { ok: false; message: string }
  | { ok: true; mfa: { challengeId: string; name: string; email: string; method: string; enrolled: boolean; demoCode: string } };

const safeNext = (next: string | undefined) => (next && /^\/(admin|portal)(\/|$|\?)/.test(next) ? next : undefined);

/** The code an authenticator app would show for this challenge. The prototype displays it on screen. */
const demoCode = (challengeId: string) => String(parseInt(sha256(`totp:${challengeId}`).slice(0, 8), 16) % 1_000_000).padStart(6, "0");

async function device() {
  const ua = (await headers()).get("user-agent") ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return `${browser} on ${os}`;
}

const res = (a: Account) => ({ type: "Account", id: a.id, label: a.name });

function landing(state: GovernanceState, a: Account, next?: string) {
  const ws = workspacesOf(grantsFor(a, state.roles, state.units, today()));
  if (next?.startsWith("/admin") && ws.includes("office")) return next;
  if (next?.startsWith("/portal") && ws.includes("portal")) return next;
  return ws.includes("office") ? "/admin" : "/portal";
}

/**
 * The real way in: hand off to Google Workspace's OAuth consent, whose callback resolves the account and
 * continues with startSignIn. Not connected yet; the demo (DemoSignIn) stands in until it is.
 */
export async function startGoogleSignIn(next?: string): Promise<{ ok: false; message: string }> {
  void safeNext(next);
  return { ok: false, message: "Google sign-in isn’t connected yet. Use the portal demo for now." };
}

/** Step one: the account comes back from Google Workspace (or the demo's chooser). */
export async function startSignIn(accountId: string, next?: string): Promise<SignInResult> {
  const dev = await device();
  let sessionId = null as string | null;
  let mfa = null as SignInResult | null;
  const result = await runSystem((ctx) => {
    const s = ctx.state;
    const a = s.accounts.find((x) => x.id === accountId);
    if (!a) return { ok: false, message: "That account is not registered in the Hub. Ask your unit coordinator for an invitation, or request access." };
    const fail = (why: string) => {
      log(ctx, "session.signin", "Session", res(a), "Failed", why, { ...ctx.actor, id: a.id, name: a.name, role: "Signing in" });
      return { ok: true, message: why, data: "fail" };
    };
    if (a.status === "Suspended") return fail(`This account is suspended. ${a.statusReason ?? ""}`.trim());
    if (a.status === "Deactivated") return fail("This account is deactivated.");
    if (!a.external && !domainAllowed(s, a.email)) return fail(`Sign-in is limited to ${s.security.sso.domains.join(", ")} accounts.`);
    if (a.external && !s.security.sso.allowGuests) return fail("Sponsored guest sign-in is switched off.");
    const grants = grantsFor(a, s.roles, s.units, ctx.day);
    if (!activeAssignments(a, ctx.day).length || !workspacesOf(grants).length) return fail("This account has no active role. Its access may have expired.");
    if (mfaRequired(s, grants)) {
      const id = randomBytes(12).toString("base64url");
      s.challenges.push({ id, accountId: a.id, createdAt: ctx.iso, next: next ?? "", attempts: 0 });
      mfa = { ok: true, mfa: { challengeId: id, name: a.name, email: a.email, method: a.mfa.method ?? "Authenticator app", enrolled: a.mfa.enrolled, demoCode: demoCode(id) } };
      return { ok: true, message: "Second factor required" };
    }
    sessionId = openSession(ctx.state, a, false, dev, ctx.iso);
    log(ctx, "session.signin", "Session", res(a), "Success", `Google Workspace · ${dev}`, { ...ctx.actor, id: a.id, name: a.name, role: grants[0]?.roleName ?? "" });
    activate(ctx, a);
    return { ok: true, message: "Signed in" };
  });
  if (result.data === "fail") return { ok: false, message: result.message };
  if (!result.ok) return { ok: false, message: result.message };
  if (mfa) return mfa;
  if (sessionId) {
    await setSession(sessionId);
    const s = readState();
    redirect(landing(s, s.accounts.find((a) => a.id === accountId)!, safeNext(next)));
  }
  return { ok: false, message: "Sign-in did not complete. Try again." };
}

function openSession(s: GovernanceState, a: Account, mfa: boolean, device: string, at: string) {
  const id = randomBytes(24).toString("base64url");
  s.sessions.push({ id, accountId: a.id, createdAt: at, lastSeen: at, mfa, device });
  a.lastLogin = at;
  return id;
}

function activate(ctx: Parameters<Parameters<typeof runSystem>[0]>[0], a: Account) {
  if (a.status !== "Pending Invitation") return;
  a.status = "Active";
  a.statusChangedAt = ctx.iso;
  log(ctx, "account.activate", "Account", res(a), "Success", "Invitation accepted at first sign-in");
}

async function setSession(id: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
}

/** Step two: the six-digit code. Repeated failures lock the account under the lockout policy. */
export async function verifySecondFactor(challengeId: string, code: string): Promise<{ ok: false; message: string; locked?: boolean }> {
  const dev = await device();
  let sessionId = null as string | null;
  let dest = "/admin";
  const result = await runSystem((ctx) => {
    const s = ctx.state;
    const ch = s.challenges.find((c) => c.id === challengeId);
    if (!ch) return { ok: false, message: "This sign-in expired. Start again." };
    const a = s.accounts.find((x) => x.id === ch.accountId);
    if (!a || a.status === "Suspended" || a.status === "Deactivated") return { ok: false, message: "This account can no longer sign in." };
    const as = { ...ctx.actor, id: a.id, name: a.name, role: "Signing in" };
    if (code.replace(/\s/g, "") !== demoCode(ch.id)) {
      ch.attempts += 1;
      s.failures.push({ email: a.email, at: ctx.iso });
      const recent = s.failures.filter((f) => f.email === a.email).length;
      log(ctx, "session.signin", "Session", res(a), "Failed", `Wrong second factor · ${dev} · ${recent} of ${s.security.lockout.attempts}`, as);
      if (recent >= s.security.lockout.attempts) {
        a.status = "Suspended";
        a.statusReason = `${recent} failed sign-ins within ${s.security.lockout.windowMinutes} minutes. Suspended automatically by the lockout policy, pending review.`;
        a.statusChangedAt = ctx.iso;
        s.sessions = s.sessions.filter((x) => x.accountId !== a.id);
        s.challenges = s.challenges.filter((c) => c.accountId !== a.id);
        log(ctx, "account.suspend", "Account", res(a), "Success", `Lockout policy: ${recent} failures in ${s.security.lockout.windowMinutes} minutes`);
        raiseAlert(ctx, "Repeated failed sign-ins", "High", `${recent} failed sign-ins for ${a.name} from ${dev}. Account suspended by the lockout policy.`, a.id);
        return { ok: true, message: "locked", data: "locked" };
      }
      return { ok: true, message: `That code is not right. ${s.security.lockout.attempts - recent} ${s.security.lockout.attempts - recent === 1 ? "attempt" : "attempts"} left before the account locks.`, data: "wrong" };
    }
    s.challenges = s.challenges.filter((c) => c.id !== ch.id);
    s.failures = s.failures.filter((f) => f.email !== a.email);
    const first = !a.mfa.enrolled;
    if (first) a.mfa = { enrolled: true, method: "Authenticator app" };
    const known = s.audit.some((e) => e.actorId === a.id && e.action === "session.signin" && e.outcome === "Success" && (e.detail ?? "").includes(dev));
    sessionId = openSession(s, a, true, dev, ctx.iso);
    const top = grantsFor(a, s.roles, s.units, ctx.day).sort((x, y) => y.tier - x.tier)[0];
    log(ctx, "session.signin", "Session", res(a), "Success", `Google Workspace · second factor verified${first ? " (enrolled now)" : ""} · ${dev}`, { ...as, role: top?.roleName ?? "No role" });
    if (!known && a.external) raiseAlert(ctx, "Suspicious sign-in", "Medium", `External collaborator ${a.name} signed in from a new device (${dev}).`, a.id);
    activate(ctx, a);
    dest = landing(s, a, safeNext(ch.next));
    return { ok: true, message: "Signed in" };
  });
  if (result.data === "locked") return { ok: false, locked: true, message: "Too many wrong codes. The account is now suspended; an administrator must review it before it can sign in again." };
  if (result.data === "wrong" || !result.ok) return { ok: false, message: result.message };
  if (sessionId) {
    await setSession(sessionId);
    redirect(dest);
  }
  return { ok: false, message: "Sign-in did not complete. Try again." };
}

export async function signOut() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) {
    await runSystem((ctx) => {
      const sess = ctx.state.sessions.find((x) => x.id === id);
      const a = sess && ctx.state.accounts.find((x) => x.id === sess.accountId);
      ctx.state.sessions = ctx.state.sessions.filter((x) => x.id !== id);
      if (a) log(ctx, "session.signout", "Session", res(a), "Success", "Signed out", { ...ctx.actor, id: a.id, name: a.name, role: "Signed in" });
      return { ok: true, message: "Signed out" };
    });
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(ACTING_COOKIE);
  redirect("/signin?ended=signed-out");
}

/** The idle timer's ping while someone is working. Returns how the session stands. */
export async function heartbeat(active: boolean): Promise<{ ok: boolean; problem?: string; idleMinutes?: number; warnMinutes?: number }> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return { ok: false, problem: "ended" };
  const state = readState();
  const check = checkSession(state, id);
  if ("problem" in check) return { ok: false, problem: check.problem };
  if (active) touch(id, new Date().toISOString());
  return { ok: true, idleMinutes: state.security.session.idleMinutes, warnMinutes: state.security.session.warnMinutes };
}

/** University-wide contributors choose which unit the contributor workspace acts for. */
export async function actFor(unitId: string) {
  const viewer = await getViewer();
  if (!viewer || !viewer.portal.canSwitch || !viewer.portal.units.some((u) => u.id === unitId)) return;
  (await cookies()).set(ACTING_COOKIE, unitId, { httpOnly: true, sameSite: "lax", path: "/" });
  await run(viewer.id, (ctx) => {
    log(ctx, "portal.act-for", "Access", { type: "Unit", id: unitId, label: ctx.state.units.find((u) => u.id === unitId)?.name ?? unitId }, "Success", "Contributor workspace switched to act for this unit");
    return { ok: true, message: "" };
  });
  revalidatePath("/portal", "layout");
}

/** Someone without an account asks for one; it enters the account access workflow. */
export async function requestAccess(input: { name: string; email: string; unitId: string; title: string; justification: string }): Promise<{ ok: boolean; message: string }> {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 120);
  const email = input.email.trim().toLowerCase();
  if (name.length < 3) return { ok: false, message: "Enter your full name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, message: "Enter your UST email address." };
  if (input.justification.trim().length < 10) return { ok: false, message: "Say what you need access for." };
  const state = readState();
  if (!domainAllowed(state, email)) return { ok: false, message: `Requests are accepted from ${state.security.sso.domains.join(", ")} addresses. External collaborators are invited by the Office.` };
  if (state.accounts.some((a) => a.email === email)) return { ok: false, message: "That email already has an account. Sign in, or ask your coordinator if it is suspended." };
  if (state.requests.some((r) => r.status === "Pending" && r.payload.kind === "account-access" && r.payload.email === email)) return { ok: false, message: "A request for this email is already waiting for approval." };
  const unit = state.units.find((u) => u.id === input.unitId && u.status === "Active");
  if (!unit) return { ok: false, message: "Choose your unit." };
  const out = await run(null, (ctx) => {
    const req = openRequest(ctx, "account-access", { kind: "account-access", name, email, unitId: unit.id, roleId: "contributor", title: input.title.trim().slice(0, 120) || "Staff" }, `Account for ${name}, ${unit.name}`, input.justification);
    return { ok: true, message: req.id };
  });
  revalidatePath("/", "layout");
  return out.ok ? { ok: true, message: `Request ${out.message} is with the system administrators. You will receive an invitation by email once it is approved.` } : { ok: false, message: out.message };
}
