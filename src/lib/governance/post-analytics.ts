import { datasetPublic, featureOn } from "./derive";
import { storyList } from "./records";
import type { PostAnalyticsData } from "./hub-types";
import type { GovernanceState } from "./types";

const DAY = 86_400_000;
const MANILA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
export const dayAt = (now: Date) => MANILA_DAY.format(now);
const previousDay = (day: string, ago: number) => new Date(Date.parse(`${day}T12:00:00Z`) - ago * DAY).toISOString().slice(0, 10);

/** Match the public website's visibility checks, including legacy stories and unit proposals. */
export function canCountPostView(state: GovernanceState, slug: string): boolean {
  return featureOn(state, "public-publications") && datasetPublic(state, "DS-STORIES")
    && storyList(state).some((story) => story.slug === slug && story.state === "Published");
}

/** A post's views per Manila day, as the hub_post_views table holds them. */
export type ViewDay = { day: string; views: number; at: string };

/** Views are counted in their own table, hub_post_views (server/post-views.ts). */
function viewsOf(counted: ViewDay[]) {
  const daily: Record<string, number> = {};
  let total = 0;
  let lastViewedAt: string | undefined;
  for (const row of counted) {
    daily[row.day] = (daily[row.day] ?? 0) + row.views;
    total += row.views;
    if (!lastViewedAt || row.at > lastViewedAt) lastViewedAt = row.at;
  }
  return counted.length ? { total, daily, lastViewedAt } : undefined;
}

export function postAnalytics(state: GovernanceState, slug: string, counted: ViewDay[] = [], now = new Date()): PostAnalyticsData {
  const day = dayAt(now);
  const metric = viewsOf(counted);
  const sum = (days: number) => Object.entries(metric?.daily ?? {}).reduce((total, [date, count]) => total + (date >= previousDay(day, days - 1) && date <= day ? count : 0), 0);
  return {
    totalViews: metric?.total ?? 0,
    last7Days: sum(7),
    last30Days: sum(30),
    daily: Array.from({ length: 14 }, (_, index) => {
      const date = previousDay(day, 13 - index);
      return { date, views: metric?.daily[date] ?? 0 };
    }),
    trackingSince: state.records.postViewsStartedAt,
    lastViewedAt: metric?.lastViewedAt,
  };
}
