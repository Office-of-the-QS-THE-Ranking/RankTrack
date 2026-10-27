"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { endOtherSessions, endOwnSession, updateNotificationPrefs, updateProfile, updateSessionPrefs } from "@/lib/governance/engine/profile";
import { allowAccount } from "@/lib/governance/server/limits";
import { overviewActivity, overviewBadges, overviewStats, type ActivityDay, type Badge, type OverviewStats } from "@/lib/governance/account-overview";
import { log } from "@/lib/governance/engine/core";
import { auditOfActor, latestOfActor } from "@/lib/governance/server/db/audit";
import { run, runSystem } from "@/lib/governance/server/run";
import { usedNote } from "@/lib/governance/session-limits";
import { clearSessionCookie, getViewer, persistSessionCookie, sessionIdOf, staySeconds } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";

export async function saveProfile(input: { name: string; title: string }) {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    if (!(await allowAccount(viewer.id, "command"))) return { ok: false, message: "Too many changes in a short time. Wait a minute and try again." };
    const result = await run(viewer.id, (ctx) => updateProfile(ctx, input));
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (error) {
    console.error("Profile save failed", error);
    return { ok: false, message: "Your profile could not be saved. Try again in a moment." };
  }
}

/** Settings: a shorter idle sign-out, or staying signed in (which also keeps the cookie past closing the browser). */
export async function saveSessionPrefs(input: { idleMinutes: number | null; stay: boolean }) {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    if (!(await allowAccount(viewer.id, "command"))) return { ok: false, message: "Too many changes in a short time. Wait a minute and try again." };
    const result = await run(viewer.id, (ctx) => updateSessionPrefs(ctx, input));
    if (result.ok) {
      const { session } = (await readState()).security;
      persistSessionCookie(await cookies(), input.stay ? staySeconds(session.absoluteHours, viewer.session.startedAt) : null);
      revalidatePath("/", "layout");
    }
    return result;
  } catch (error) {
    console.error("Session settings save failed", error);
    return { ok: false, message: "Your session settings could not be saved. Try again in a moment." };
  }
}

/** Notifications: email on or off, and which kinds reach this person in the Hub and by email. */
export async function saveNotificationPrefs(input: { email: boolean; off: string[] }) {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    if (!(await allowAccount(viewer.id, "command"))) return { ok: false, message: "Too many changes in a short time. Wait a minute and try again." };
    const result = await run(viewer.id, (ctx) => updateNotificationPrefs(ctx, input));
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (error) {
    console.error("Notification settings save failed", error);
    return { ok: false, message: "Your notification settings could not be saved. Try again in a moment." };
  }
}

/** Settings: end every other session of this account. */
export async function signOutOtherDevices() {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    if (!(await allowAccount(viewer.id, "command"))) return { ok: false, message: "Too many changes in a short time. Wait a minute and try again." };
    return await run(viewer.id, (ctx) => endOtherSessions(ctx, viewer.session.id));
  } catch (error) {
    console.error("Sign out of other devices failed", error);
    return { ok: false, message: "Other devices could not be signed out. Try again in a moment." };
  }
}

/**
 * Settings: clear this browser's Hub cookies, including the sign-in, and end this session. The page clears
 * its own storage before calling this.
 */
export async function clearCookiesAndSignOut() {
  const jar = await cookies();
  const id = sessionIdOf(jar);
  if (id) {
    await runSystem((ctx) => {
      const sess = ctx.state.sessions.find((s) => s.id === id);
      const a = sess && ctx.state.accounts.find((x) => x.id === sess.accountId);
      ctx.state.sessions = ctx.state.sessions.filter((s) => s.id !== id);
      if (a && sess) log(ctx, "session.signout", "Session", { type: "Account", id: a.id, label: a.name }, "Success", `Cleared cookies and signed out${usedNote(sess.createdAt, ctx.iso)}`, { ...ctx.actor, id: a.id, name: a.name, role: "Signed in" });
      return { ok: true, message: "Signed out" };
    }).catch(() => null);
  }
  for (const c of jar.getAll()) jar.delete(c.name);
  clearSessionCookie(jar);
  redirect("/signin?ended=cleared");
}

/** Overview: this person's activity and badges, counted from the audit trail. */
export async function loadOverview(): Promise<{ ok: true; stats: OverviewStats; badges: Badge[]; activity: ActivityDay[]; memberSince: string; lastLogin?: string } | { ok: false; message: string }> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    const [events, state] = await Promise.all([auditOfActor(viewer.id), readState()]);
    const account = state.accounts.find((a) => a.id === viewer.id);
    const stats = overviewStats(events);
    return { ok: true, stats, badges: overviewBadges(stats), activity: overviewActivity(events), memberSince: account?.createdAt ?? viewer.session.startedAt, lastLogin: account?.lastLogin };
  } catch (error) {
    console.error("Overview failed", error);
    return { ok: false, message: "Your overview could not be loaded. Try again in a moment." };
  }
}

export interface DeviceRow {
  id: string;
  device: string;
  startedAt: string;
  lastSeen: string;
  current: boolean;
  mfa: boolean;
}

/** Devices: every session of this account that is still open. */
export async function loadDevices(): Promise<{ ok: true; devices: DeviceRow[] } | { ok: false; message: string }> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    const state = await readState();
    const devices = state.sessions
      .filter((s) => s.accountId === viewer.id)
      .map((s) => ({ id: s.id, device: s.device, startedAt: s.createdAt, lastSeen: s.lastSeen, current: s.id === viewer.session.id, mfa: s.mfa }))
      .sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeen.localeCompare(a.lastSeen));
    return { ok: true, devices };
  } catch (error) {
    console.error("Devices failed", error);
    return { ok: false, message: "Your devices could not be loaded. Try again in a moment." };
  }
}

/** Devices: sign out one other session of this account. */
export async function signOutDevice(id: string) {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    if (typeof id !== "string" || id === viewer.session.id) return { ok: false, message: "Use Sign out to end the session on this device." };
    if (!(await allowAccount(viewer.id, "command"))) return { ok: false, message: "Too many changes in a short time. Wait a minute and try again." };
    return await run(viewer.id, (ctx) => endOwnSession(ctx, id));
  } catch (error) {
    console.error("Device sign-out failed", error);
    return { ok: false, message: "That device could not be signed out. Try again in a moment." };
  }
}

export interface LogRow {
  seq: number;
  at: string;
  action: string;
  label: string;
  detail?: string;
  outcome: "Success" | "Denied" | "Failed";
}

/** Logs: this person's latest entries in the audit trail. */
export async function loadLogs(): Promise<{ ok: true; logs: LogRow[] } | { ok: false; message: string }> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    const events = await latestOfActor(viewer.id, 100);
    return { ok: true, logs: events.map((e) => ({ seq: e.seq, at: e.at, action: e.action, label: e.resource.label, detail: e.detail, outcome: e.outcome })) };
  } catch (error) {
    console.error("Logs failed", error);
    return { ok: false, message: "Your activity log could not be loaded. Try again in a moment." };
  }
}

export interface PrivacyInfo {
  officer: string;
  email: string;
  noticeUpdated: string;
}

/** Data and privacy: who to ask about personal data. */
export async function loadPrivacy(): Promise<({ ok: true } & PrivacyInfo) | { ok: false; message: string }> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    const { privacy } = (await readState()).security;
    return { ok: true, officer: privacy.officer, email: privacy.email, noticeUpdated: privacy.noticeUpdated };
  } catch (error) {
    console.error("Privacy failed", error);
    return { ok: false, message: "Your privacy details could not be loaded. Try again in a moment." };
  }
}


/**
 * Data and privacy: everything the Hub keeps about this person, as one JSON file (the right of access).
 * The download itself is audited.
 */
export async function exportMyData(): Promise<{ ok: true; file: string; name: string } | { ok: false; message: string }> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
    if (!(await allowAccount(viewer.id, "command"))) return { ok: false, message: "Too many changes in a short time. Wait a minute and try again." };
    const [state, activity] = await Promise.all([readState(), latestOfActor(viewer.id, 5000)]);
    const a = state.accounts.find((x) => x.id === viewer.id);
    if (!a) return { ok: false, message: "Your account could not be found." };
    const unitName = (id: string) => state.units.find((u) => u.id === id)?.name ?? id;
    const data = {
      exportedAt: new Date().toISOString(),
      account: {
        name: a.name,
        email: a.email,
        title: a.title,
        unit: unitName(a.unitId),
        status: a.status,
        identity: a.identity,
        createdAt: a.createdAt,
        firstLogin: a.firstLogin,
        lastLogin: a.lastLogin,
        photo: a.avatar,
        sessionPreferences: a.sessionPrefs ?? {},
      },
      roles: viewer.roles,
      sessions: state.sessions.filter((x) => x.accountId === a.id).map((x) => ({ device: x.device, startedAt: x.createdAt, lastSeen: x.lastSeen, twoStep: x.mfa })),
      notifications: state.notices.filter((n) => n.to === a.id).map((n) => ({ at: n.at, text: n.text, read: n.readBy.includes(a.id) })),
      activity: activity.map((e) => ({ at: e.at, action: e.action, item: e.resource.label, outcome: e.outcome, detail: e.detail })),
    };
    await run(viewer.id, (ctx) => {
      log(ctx, "privacy.export", "Export", { type: "Account", id: a.id, label: a.name }, "Success", "Downloaded own data from the account window");
      return { ok: true, message: "Exported" };
    });
    return { ok: true, file: JSON.stringify(data, null, 2), name: `hub-data-${new Date().toISOString().slice(0, 10)}.json` };
  } catch (error) {
    console.error("Data export failed", error);
    return { ok: false, message: "Your data could not be prepared. Try again in a moment." };
  }
}
