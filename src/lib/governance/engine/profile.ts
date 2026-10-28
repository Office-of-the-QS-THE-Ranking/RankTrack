import type { Ctx } from "./core";
import { usedNote } from "../session-limits";
import { invalid, log, ok } from "./core";
import { validPrefKey } from "../notification-prefs";
import { roleOf } from "../catalog";
import { activeAssignments, actingGrants, scopeLabel } from "../rbac";

/** Self-service changes never accept an account ID or access-related fields. */
export function updateProfile(ctx: Ctx, input: unknown) {
  const account = ctx.actor.account;
  if (!account || account.status !== "Active") return invalid("Your session has ended. Sign in again to continue.");
  if (!input || typeof input !== "object") return invalid("Enter your profile details.");
  const { name, title } = input as Record<string, unknown>;
  if (typeof name !== "string" || typeof title !== "string") return invalid("Enter your name and position.");
  const fullName = name.trim().replace(/\s+/g, " ");
  const position = title.trim().replace(/\s+/g, " ");
  if (fullName.length < 3 || fullName.length > 160) return invalid("Enter a full name between 3 and 160 characters.");
  if (position.length > 160) return invalid("Keep your position within 160 characters.");
  if (account.name === fullName && account.title === position) return ok("Your profile is already up to date.");
  account.name = fullName;
  account.title = position;
  log(ctx, "profile.update", "Account", { type: "Account", id: account.id, label: fullName }, "Success", "Updated own name and position");
  return ok("Your profile has been updated.");
}

/** The person's own session choices: a shorter idle sign-out than the policy, or staying signed in. */
export function updateSessionPrefs(ctx: Ctx, input: unknown) {
  const account = ctx.actor.account;
  if (!account || account.status !== "Active") return invalid("Your session has ended. Sign in again to continue.");
  if (!input || typeof input !== "object") return invalid("Choose your session settings.");
  const { idleMinutes, stay } = input as Record<string, unknown>;
  const policy = ctx.state.security.session;
  if (typeof stay !== "boolean") return invalid("Choose whether to stay signed in.");
  if (idleMinutes !== null && (typeof idleMinutes !== "number" || !Number.isInteger(idleMinutes) || idleMinutes < 5 || idleMinutes > policy.idleMinutes))
    return invalid(`Choose an idle sign-out between 5 and ${policy.idleMinutes} minutes.`);
  // the policy's own limit is the default, so it isn't stored as a choice
  const minutes = typeof idleMinutes === "number" && idleMinutes < policy.idleMinutes ? idleMinutes : undefined;
  const before = account.sessionPrefs ?? {};
  if (before.idleMinutes === minutes && !!before.stay === stay) return ok("Your session settings are already up to date.");
  account.sessionPrefs = minutes || stay ? { ...(minutes ? { idleMinutes: minutes } : {}), ...(stay ? { stay: true } : {}) } : undefined;
  const detail = stay ? "Stay signed in" : `Sign out after ${minutes ?? policy.idleMinutes} min idle`;
  log(ctx, "session.preferences", "Session", { type: "Account", id: account.id, label: account.name }, "Success", detail);
  return ok("Your session settings have been saved.");
}

/** The person's own notification choices: email on or off, and which kinds reach them on each channel. */
export function updateNotificationPrefs(ctx: Ctx, input: unknown) {
  const account = ctx.actor.account;
  if (!account || account.status !== "Active") return invalid("Your session has ended. Sign in again to continue.");
  if (!input || typeof input !== "object") return invalid("Choose your notification settings.");
  const { email, off } = input as Record<string, unknown>;
  if (typeof email !== "boolean") return invalid("Choose whether to receive email notifications.");
  if (!Array.isArray(off) || !off.every(validPrefKey)) return invalid("Choose which notifications to receive.");
  const next = [...new Set(off)].sort();
  const before = account.notifyPrefs ?? {};
  if (!!before.email === email && (before.off ?? []).join() === next.join()) return ok("Your notification settings are already up to date.");
  account.notifyPrefs = email || next.length ? { ...(email ? { email: true } : {}), ...(next.length ? { off: next } : {}) } : undefined;
  log(ctx, "notify.preferences", "Account", { type: "Account", id: account.id, label: account.name }, "Success", `Email ${email ? "on" : "off"}${next.length ? ` · ${next.length} switched off` : ""}`);
  return ok("Your notification settings have been saved.");
}

/** Sign the person out everywhere except the session they are using. */
export function endOtherSessions(ctx: Ctx, keepId: string) {
  const account = ctx.actor.account;
  if (!account || account.status !== "Active") return invalid("Your session has ended. Sign in again to continue.");
  const others = ctx.state.sessions.filter((s) => s.accountId === account.id && s.id !== keepId);
  if (!others.length) return ok("You are not signed in anywhere else.");
  ctx.state.sessions = ctx.state.sessions.filter((s) => !others.includes(s));
  for (const s of others) log(ctx, "session.signout", "Session", { type: "Account", id: account.id, label: account.name }, "Success", `Signed out from another device · ${s.device}${usedNote(s.createdAt, s.lastSeen)}`);
  log(ctx, "session.signout-others", "Session", { type: "Account", id: account.id, label: account.name }, "Success", `Signed out of ${others.length} other ${others.length === 1 ? "device" : "devices"}`);
  return ok(others.length === 1 ? "Signed out of 1 other device." : `Signed out of ${others.length} other devices.`);
}

/** Sign the person out of one of their own sessions, never someone else's. */
export function endOwnSession(ctx: Ctx, id: string) {
  const account = ctx.actor.account;
  if (!account || account.status !== "Active") return invalid("Your session has ended. Sign in again to continue.");
  const s = ctx.state.sessions.find((x) => x.id === id && x.accountId === account.id);
  if (!s) return invalid("That device is already signed out.");
  ctx.state.sessions = ctx.state.sessions.filter((x) => x !== s);
  log(ctx, "session.signout", "Session", { type: "Account", id: account.id, label: account.name }, "Success", `Signed out from another device · ${s.device}${usedNote(s.createdAt, s.lastSeen)}`);
  return ok(`Signed out of ${s.device || "that device"}.`);
}

/** Act in another of the person's own roles. Only one counts at a time, so this changes what they can do at once. */
export function switchRole(ctx: Ctx, assignmentId: unknown) {
  const account = ctx.actor.account;
  if (!account || account.status !== "Active") return invalid("Your session has ended. Sign in again to continue.");
  const to = activeAssignments(account, ctx.day).find((a) => a.id === assignmentId);
  if (!to) return invalid("That role is no longer yours. Reload to see your current roles.");
  const role = roleOf(to.roleId);
  const label = `${role?.name ?? to.roleId} · ${scopeLabel(to.scope, ctx.state.units)}`;
  if (actingGrants(account, ctx.state.units, ctx.day, ctx.state.config.rolePermissions)[0]?.assignmentId === to.id) return ok(`You are already acting as ${label}.`);
  const from = ctx.actor.role;
  account.activeAssignment = to.id;
  log(ctx, "role.switch", "Access", { type: "Account", id: account.id, label: account.name }, "Success", `${from} → ${label}`);
  return ok(`You are now acting as ${label}.`);
}
