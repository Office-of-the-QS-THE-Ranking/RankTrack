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
  return "Same as the last edition";
}

/**
 * A published result that makes the reading guide concrete: a band that improved, for preference, with
 * the band it improved from. Nothing is returned until a ranking has published a band.
 */
export function bandExample(rankings: Ranking[]): { name: string; band: string; from: string; to: string; previous?: string } | null {
  const band = (r: Ranking) => r.current.match(/(\d[\d,]*)\s*[–-]\s*(\d[\d,]*)\s*$/);
  const r = rankings.find((x) => x.direction === "up" && band(x)) ?? rankings.find((x) => band(x));
  if (!r) return null;
  const m = band(r)!;
  return { name: r.name, band: `${m[1]}–${m[2]}`, from: m[1], to: m[2], previous: r.direction === "up" && r.previous ? r.previous : undefined };
}

/** "Education 501–600" → label "Education", figure "501–600"; "Baseline" stays whole. */
export function splitResult(current: string): { label?: string; value: string } {
  const m = current.match(/^(.*?)\s*(\d[\d–-]*\+?)$/);
  return m ? { label: m[1] || undefined, value: m[2] } : { value: current };
}
