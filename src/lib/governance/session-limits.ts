/*
 * How long a session may sit idle for one person: the security policy's limit, or the shorter one they
 * chose, or none when they chose to stay signed in. The longest session (absolute hours) is never theirs to change.
 */
import type { Account, SecurityPolicy } from "./types";

/** Idle minutes before sign-out, or null for no idle sign-out. */
export function idleLimit(policy: SecurityPolicy["session"], prefs: Account["sessionPrefs"]): number | null {
  if (prefs?.stay) return null;
  return prefs?.idleMinutes ? Math.min(prefs.idleMinutes, policy.idleMinutes) : policy.idleMinutes;
}

/** Whether a session is past its idle or absolute limit at `now` (ms). */
export function sessionExpired(policy: SecurityPolicy["session"], prefs: Account["sessionPrefs"], s: { lastSeen: string; createdAt: string }, now: number) {
  const idle = idleLimit(policy, prefs);
  return (idle !== null && now - Date.parse(s.lastSeen) > idle * 60_000) || now - Date.parse(s.createdAt) > policy.absoluteHours * 3_600_000;
}

/** How long a session was in use, written into its sign-out entry ("· 42 min in use") so the Overview can average it. */
export const usedNote = (createdAt: string, until: string) => ` · ${Math.max(0, Math.round((Date.parse(until) - Date.parse(createdAt)) / 60_000))} min in use`;
export const USED = / · (\d+) min in use$/;

/** Idle sign-out choices offered to people: the common steps up to the policy's limit, and the limit itself. */
export function idleChoices(policyMinutes: number) {
  return [...new Set([5, 10, 15, 30, 60, 120, 240].filter((m) => m < policyMinutes).concat(policyMinutes))];
}
