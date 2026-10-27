import { describe, expect, it } from "vitest";
import { overviewActivity } from "@/lib/governance/account-overview";

describe("profile activity calendar", () => {
  it("groups actions at Manila midnight and excludes automatic timeouts", () => {
    const days = overviewActivity([
      { at: "2026-10-26T15:59:59Z", action: "session.signin" },
      { at: "2026-10-26T16:00:00Z", action: "evidence.submit" },
      { at: "2026-10-27T01:00:00Z", action: "post.publish" },
      { at: "2026-10-27T02:00:00Z", action: "session.timeout" },
    ], new Date("2026-10-27T05:00:00Z"));
    expect(days).toHaveLength(365);
    expect(days.at(-2)).toEqual({ date: "2026-10-26", count: 1 });
    expect(days.at(-1)).toEqual({ date: "2026-10-27", count: 2 });
  });

  it("fills inactive days and limits the display to the rolling year", () => {
    const days = overviewActivity([
      { at: "2025-10-27T04:00:00Z", action: "session.signin" },
      { at: "2025-10-28T04:00:00Z", action: "session.signin" },
      { at: "2026-10-28T04:00:00Z", action: "session.signin" },
    ], new Date("2026-10-27T05:00:00Z"));
    expect(days[0]).toEqual({ date: "2025-10-28", count: 1 });
    expect(days.at(-1)).toEqual({ date: "2026-10-27", count: 0 });
    expect(days.reduce((total, day) => total + day.count, 0)).toBe(1);
  });

  it("keeps leap day in chronological order", () => {
    const days = overviewActivity([], new Date("2024-03-01T00:00:00Z"));
    expect(days.slice(-3).map((day) => day.date)).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
    expect(days.every((day) => day.count === 0)).toBe(true);
  });
});
