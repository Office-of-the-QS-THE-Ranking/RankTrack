/*
 * Wording helpers used only by the public website (src/components/site). Its pictures, copy, ranking bodies and
 * contribution stages are reference data in Supabase (lib/reference.ts).
 */
import type { Ranking } from "./data";

export type { Photo } from "./reference";

/** How a result moved between the last two editions, in words. */
export function movement(r: Ranking): string {
  if (r.direction === "up") return `Up from ${r.previous}`;
  if (r.direction === "down") return `Down from ${r.previous}`;
  if (r.direction === "new") return "Baseline year, building a first ranked entry";
  if (r.direction === "none") return "No result recorded yet";
  return `Held from the previous edition`;
}

/** "Education 501–600" → label "Education", figure "501–600"; "Baseline" stays whole. */
export function splitResult(current: string): { label?: string; value: string } {
  const m = current.match(/^(.*?)\s*(\d[\d–-]*\+?)$/);
  return m ? { label: m[1] || undefined, value: m[2] } : { value: current };
}
