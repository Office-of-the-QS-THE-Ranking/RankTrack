/*
 * The account window's Overview: one person's activity counted from the audit trail, and the badges it
 * earns. Badges climb Steel, Gold and Onyx, the medal tiers of the unit profile's honours.
 */
import { USED } from "./session-limits";

export interface OverviewStats {
  reviews: number;
  submissions: number;
  published: number;
  proposals: number;
  decisions: number;
  signIns: number;
  daysActive: number;
  /** Average minutes per session, from sessions whose length was recorded; null before any was. */
  avgMinutes: number | null;
  /** Total minutes recorded in use. */
  totalMinutes: number;
  firstActive?: string;
  lastActive?: string;
}

export type Tier = "Steel" | "Gold" | "Onyx";

export interface Badge {
  id: string;
  name: string;
  /** What earning it took, in a few words. */
  how: string;
  /** The tier reached, or null while still locked. */
  tier: Tier | null;
  value: number;
  /** The next tier's threshold, or null at the top. */
  next: number | null;
}

const COUNTS: Record<string, keyof Pick<OverviewStats, "reviews" | "submissions" | "published" | "proposals" | "decisions" | "signIns">> = {
  "evidence.accept": "reviews",
  "evidence.revise": "reviews",
  "evidence.submit": "submissions",
  "data.submit": "submissions",
  "post.publish": "published",
  "story.publish": "published",
  "report.publish": "published",
  "story.propose": "proposals",
  "request.approve": "decisions",
  "session.signin": "signIns",
};

/** Manila day of an instant, for counting active days. */
const day = (iso: string) => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10);

export interface ActivityDay {
  date: string;
  count: number;
}

/** A rolling year of recorded actions, grouped by Manila calendar day. */
export function overviewActivity(events: { at: string; action: string }[], now = new Date()): ActivityDay[] {
  const today = day(now.toISOString());
  const end = Date.parse(`${today}T00:00:00Z`);
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.action === "session.timeout") continue;
    const date = day(event.at);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from({ length: 365 }, (_, index) => {
    const date = new Date(end - (364 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, count: counts.get(date) ?? 0 };
  });
}

export function overviewStats(events: { at: string; action: string; detail: string | null }[]): OverviewStats {
  const s: OverviewStats = { reviews: 0, submissions: 0, published: 0, proposals: 0, decisions: 0, signIns: 0, daysActive: 0, avgMinutes: null, totalMinutes: 0 };
  const days = new Set<string>();
  const used: number[] = [];
  for (const e of events) {
    const key = COUNTS[e.action];
    if (key) s[key] += 1;
    if (e.action === "session.signout" || e.action === "session.timeout") {
      const m = e.detail?.match(USED);
      if (m) used.push(Number(m[1]));
    }
    if (e.action !== "session.timeout") days.add(day(e.at));
  }
  s.daysActive = days.size;
  s.totalMinutes = used.reduce((a, b) => a + b, 0);
  s.avgMinutes = used.length ? Math.round(s.totalMinutes / used.length) : null;
  s.firstActive = events[0]?.at;
  s.lastActive = events.at(-1)?.at;
  return s;
}

const LADDERS: { id: string; name: string; how: (n: number) => string; of: (s: OverviewStats) => number; steps: [number, number, number] }[] = [
  { id: "reviewer", name: "Reviewer", how: (n) => `Review ${n} evidence ${n === 1 ? "file" : "files"}`, of: (s) => s.reviews, steps: [1, 25, 100] },
  { id: "contributor", name: "Contributor", how: (n) => `Submit ${n} ${n === 1 ? "item" : "items"} of evidence or data`, of: (s) => s.submissions, steps: [1, 10, 50] },
  { id: "storyteller", name: "Storyteller", how: (n) => `Publish ${n} ${n === 1 ? "post or report" : "posts or reports"}`, of: (s) => s.published, steps: [1, 5, 20] },
  { id: "proposer", name: "Proposer", how: (n) => `Propose ${n} impact ${n === 1 ? "story" : "stories"}`, of: (s) => s.proposals, steps: [1, 5, 15] },
  { id: "approver", name: "Approver", how: (n) => `Decide ${n} approval ${n === 1 ? "step" : "steps"}`, of: (s) => s.decisions, steps: [1, 25, 100] },
  { id: "regular", name: "Regular", how: (n) => `Be active on ${n} ${n === 1 ? "day" : "days"}`, of: (s) => s.daysActive, steps: [5, 30, 100] },
];

const TIERS: Tier[] = ["Steel", "Gold", "Onyx"];

export function overviewBadges(s: OverviewStats): Badge[] {
  return LADDERS.map((l) => {
    const value = l.of(s);
    const reached = l.steps.filter((t) => value >= t).length;
    const next = reached < 3 ? l.steps[reached] : null;
    return { id: l.id, name: l.name, how: l.how(next ?? l.steps[2]), tier: reached ? TIERS[reached - 1] : null, value, next };
  });
}
