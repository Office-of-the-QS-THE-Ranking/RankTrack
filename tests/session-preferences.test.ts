import { describe, expect, it } from "vitest";
import { overviewBadges, overviewStats } from "@/lib/governance/account-overview";
import { ROLE } from "@/lib/governance/catalog";
import { endOtherSessions, endOwnSession, updateSessionPrefs } from "@/lib/governance/engine/profile";
import { idleLimit, sessionExpired, usedNote } from "@/lib/governance/session-limits";
import { world } from "./helpers";

const policy = { idleMinutes: 30, absoluteHours: 12, warnMinutes: 2 };

describe("session limits", () => {
  it("takes the shorter of the policy and the person's choice, never a longer one", () => {
    expect(idleLimit(policy, undefined)).toBe(30);
    expect(idleLimit(policy, { idleMinutes: 10 })).toBe(10);
    expect(idleLimit(policy, { idleMinutes: 120 })).toBe(30);
  });

  it("drops the idle limit for someone staying signed in", () => {
    expect(idleLimit(policy, { stay: true })).toBeNull();
  });

  it("still ends a staying session at the longest session", () => {
    const start = "2026-10-27T00:00:00.000Z";
    const s = { createdAt: start, lastSeen: start };
    expect(sessionExpired(policy, { stay: true }, s, Date.parse(start) + 11 * 3_600_000)).toBe(false);
    expect(sessionExpired(policy, { stay: true }, s, Date.parse(start) + 13 * 3_600_000)).toBe(true);
    expect(sessionExpired(policy, undefined, s, Date.parse(start) + 31 * 60_000)).toBe(true);
  });
});

describe("self-service session settings", () => {
  it("saves a shorter idle sign-out and refuses one past the policy", () => {
    const w = world();
    const own = w.person("Own User", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const max = w.state.security.session.idleMinutes;
    expect(updateSessionPrefs(w.ctxFor(own), { idleMinutes: 5, stay: false }).ok).toBe(true);
    expect(own.sessionPrefs).toEqual({ idleMinutes: 5 });
    expect(updateSessionPrefs(w.ctxFor(own), { idleMinutes: max + 5, stay: false }).ok).toBe(false);
    expect(updateSessionPrefs(w.ctxFor(own), { idleMinutes: max, stay: false }).ok).toBe(true);
    expect(own.sessionPrefs).toBeUndefined();
  });

  it("lets anyone choose to stay signed in", () => {
    const w = world();
    const own = w.person("Own User", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    expect(updateSessionPrefs(w.ctxFor(own), { idleMinutes: null, stay: true }).ok).toBe(true);
    expect(own.sessionPrefs).toEqual({ stay: true });
  });

  it("signs out only the person's other sessions", () => {
    const w = world();
    const own = w.person("Own User", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const other = w.person("Other User", "other@ust.edu.ph", ROLE.coordinator, w.sci.id);
    const at = new Date().toISOString();
    w.state.sessions.push(
      { id: "mine", accountId: own.id, createdAt: at, lastSeen: at, mfa: false, device: "Mac" },
      { id: "mine-2", accountId: own.id, createdAt: at, lastSeen: at, mfa: false, device: "Phone" },
      { id: "theirs", accountId: other.id, createdAt: at, lastSeen: at, mfa: false, device: "Mac" },
    );
    const ctx = w.ctxFor(own);
    expect(endOtherSessions(ctx, "mine").ok).toBe(true);
    expect(ctx.state.sessions.map((s) => s.id).sort()).toEqual(["mine", "theirs"]);
  });
});

describe("devices", () => {
  it("signs out one of the person's own sessions and refuses anyone else's", () => {
    const w = world();
    const own = w.person("Own User", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const other = w.person("Other User", "other@ust.edu.ph", ROLE.coordinator, w.sci.id);
    const at = new Date().toISOString();
    w.state.sessions.push(
      { id: "mine-2", accountId: own.id, createdAt: at, lastSeen: at, mfa: false, device: "Phone" },
      { id: "theirs", accountId: other.id, createdAt: at, lastSeen: at, mfa: false, device: "Mac" },
    );
    expect(endOwnSession(w.ctxFor(own), "theirs").ok).toBe(false);
    expect(endOwnSession(w.ctxFor(own), "mine-2").ok).toBe(true);
    expect(w.state.sessions.map((s) => s.id)).toEqual(["theirs"]);
  });
});

describe("account overview", () => {
  it("counts activity, averages recorded session lengths and climbs badge tiers", () => {
    const at = "2026-10-27T01:00:00.000Z";
    const events = [
      { at, action: "session.signin", detail: "Google Workspace · Mac" },
      ...Array.from({ length: 25 }, () => ({ at, action: "evidence.accept", detail: null })),
      { at, action: "post.publish", detail: null },
      { at, action: "session.signout", detail: `Signed out${usedNote(at, "2026-10-27T01:40:00.000Z")}` },
      { at: "2026-10-28T01:00:00.000Z", action: "session.timeout", detail: `Signed out automatically by the session policy${usedNote(at, "2026-10-27T01:20:00.000Z")}` },
    ];
    const s = overviewStats(events);
    expect(s).toMatchObject({ reviews: 25, published: 1, signIns: 1, daysActive: 1, avgMinutes: 30, totalMinutes: 60 });
    const badges = Object.fromEntries(overviewBadges(s).map((b) => [b.id, b]));
    expect(badges.reviewer).toMatchObject({ tier: "Gold", next: 100 });
    expect(badges.storyteller).toMatchObject({ tier: "Steel", next: 5 });
    expect(badges.contributor).toMatchObject({ tier: null, next: 1 });
  });
});
