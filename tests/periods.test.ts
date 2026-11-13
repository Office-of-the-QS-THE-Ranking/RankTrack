import { describe, expect, it } from "vitest";
import { academicYear, calendarYears, parsePeriod, periodLabel } from "@/lib/periods";

describe("academic year and term", () => {
  it("place each term in its calendar year", () => {
    expect(calendarYears("2025–2026", "First term")).toEqual([2025]);
    expect(calendarYears("2025–2026", "Second term")).toEqual([2026]);
    expect(calendarYears("2025–2026", "Special term")).toEqual([2026]);
    expect(calendarYears("2025–2026", "Whole year")).toEqual([2025, 2026]);
  });

  it("read a saved label back", () => {
    expect(parsePeriod(periodLabel("2024–2025", "First term"))).toEqual({ academicYear: "2024–2025", term: "First term", calendarYears: [2024] });
  });

  it("still read periods saved before terms", () => {
    expect(parsePeriod("Calendar year 2025").calendarYears).toEqual([2025]);
  });

  it("accept only consecutive years", () => {
    expect(academicYear("2025-2026")).toBe("2025–2026");
    expect(academicYear("2025–2027")).toBeNull();
  });
});
