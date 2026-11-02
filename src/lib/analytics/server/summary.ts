import "server-only";

/*
 * Each ranking's active edition in brief (readiness, its headline figure, what is still to go, the fixes worth
 * most), for the pages that show rankings everywhere else: the ranking pages, the dashboard, the cards. Kept for a
 * minute so those pages stay fast; any analytics change forgets it at once.
 */
import type { RankingAnalytics } from "../desk-types";
import { computeEdition } from "../engine";
import { activeEditions, bundleFor } from "./load";

const TTL_MS = 60_000;
type Entry = { at: number; data: Promise<Map<string, RankingAnalytics>>; value?: Map<string, RankingAnalytics> };
const g = globalThis as typeof globalThis & { __analyticsSummary?: Entry; __analyticsSummaryLast?: Map<string, RankingAnalytics> };

async function build(): Promise<Map<string, RankingAnalytics>> {
  const out = new Map<string, RankingAnalytics>();
  for (const [ranking, cat] of await activeEditions()) {
    const bundle = await bundleFor(cat.edition.id);
    if (!bundle) continue;
    const r = computeEdition(bundle);
    const reports = Object.values(r.indicators);
    out.set(ranking, {
      edition: cat.edition.id,
      label: cat.edition.label,
      kind: r.total.kind,
      claimed: r.total.claimed,
      secured: r.total.secured,
      max: r.total.max,
      readiness: r.readiness,
      toGo: reports.filter((x) => x.state !== "Validated" && x.state !== "Not applicable").length,
      forReview: reports.filter((x) => x.state === "For review").length,
      states: {
        validated: reports.filter((x) => x.state === "Validated").length,
        forReview: reports.filter((x) => x.state === "For review").length,
        revisions: reports.filter((x) => x.state === "Needs revision").length,
        notStarted: reports.filter((x) => x.state === "Not started").length,
      },
      fixes: r.fixes.slice(0, 3).map((f) => ({ code: f.code, title: f.title, gain: f.gain })),
    });
  }
  return out;
}

/** Every ranking's active edition in brief, by ranking slug. Never throws: a failed read leaves the pages as they were. */
export function rankingSummaries(): Promise<Map<string, RankingAnalytics>> {
  const hit = g.__analyticsSummary;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const entry: Entry = { at: Date.now(), data: Promise.resolve(new Map()) };
  entry.data = build()
    .then((m) => {
      entry.value = m;
      g.__analyticsSummaryLast = m;
      return m;
    })
    .catch((e) => {
      console.error("Analytics summaries:", e);
      if (g.__analyticsSummary === entry) g.__analyticsSummary = undefined;
      return g.__analyticsSummaryLast ?? new Map<string, RankingAnalytics>();
    });
  g.__analyticsSummary = entry;
  return entry.data;
}

/**
 * The summaries as they stand, without waiting: the latest computed copy (even if a minute old), with a fresh one
 * started in the background when it has expired. For pages that mustn't wait, like the public website's.
 */
export function summariesNow(): Map<string, RankingAnalytics> {
  const hit = g.__analyticsSummary;
  if (!hit || Date.now() - hit.at >= TTL_MS) void rankingSummaries();
  return g.__analyticsSummary?.value ?? g.__analyticsSummaryLast ?? new Map();
}

/** Fresh summaries if they're ready within `ms`, else the latest copy: for the ranking pages, which show them. */
export async function freshSummaries(ms = 4000): Promise<Map<string, RankingAnalytics>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Map<string, RankingAnalytics>>((resolve) => {
    timer = setTimeout(() => resolve(summariesNow()), ms);
  });
  try {
    return await Promise.race([rankingSummaries(), late]);
  } finally {
    clearTimeout(timer);
  }
}

export function forgetSummaries() {
  g.__analyticsSummary = undefined;
}
