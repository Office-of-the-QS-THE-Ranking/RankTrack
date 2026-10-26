import type { HubUnit } from "./hub-types";

export interface UnitStanding {
  unit: HubUnit;
  completion: number;
  rank: number | null;
}

/** Rank one category before search so filtering never changes a unit's position. */
export function buildUnitLeaderboard(units: HubUnit[]): UnitStanding[] {
  const rows = units.filter((unit) => unit.status === "Active").map((unit) => ({
    unit,
    completion: unit.assigned > 0 ? Math.min(100, Math.max(0, Math.round(unit.completed / unit.assigned * 100))) : 0,
    rank: null as number | null,
  })).sort((a, b) => b.unit.validated - a.unit.validated || b.unit.rankingsServed - a.unit.rankingsServed || b.completion - a.completion || a.unit.name.localeCompare(b.unit.name));
  rows.forEach((row, index) => {
    if (row.unit.validated <= 0) return;
    const previous = rows[index - 1];
    const tied = previous && previous.unit.validated === row.unit.validated && previous.unit.rankingsServed === row.unit.rankingsServed && previous.completion === row.completion;
    row.rank = tied ? previous.rank : index + 1;
  });
  return rows;
}
