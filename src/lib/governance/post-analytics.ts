import { datasetPublic, featureOn } from "./derive";
import { storyList } from "./records";
import type { PostAnalyticsData } from "./hub-types";
import type { GovernanceState } from "./types";

const DAY = 86_400_000;
const MANILA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const dayAt = (now: Date) => MANILA_DAY.format(now);
const previousDay = (day: string, ago: number) => new Date(Date.parse(`${day}T12:00:00Z`) - ago * DAY).toISOString().slice(0, 10);

/** Match the public website's visibility checks, including legacy stories and unit proposals. */
export function canCountPostView(state: GovernanceState, slug: string): boolean {
  return featureOn(state, "public-impact") && datasetPublic(state, "DS-STORIES")
    && storyList(state).some((story) => story.slug === slug && story.state === "Published");
}

/** Called inside a store transaction so simultaneous visits cannot overwrite one another. */
export function countPostView(state: GovernanceState, slug: string, now = new Date()): boolean {
  if (!canCountPostView(state, slug)) return false;
  const day = dayAt(now);
  const metric = state.records.postViews[slug] ??= { total: 0, daily: {} };
  metric.total++;
  metric.daily[day] = (metric.daily[day] ?? 0) + 1;
  metric.lastViewedAt = now.toISOString();
  const oldest = previousDay(day, 89);
  for (const date of Object.keys(metric.daily)) if (date < oldest) delete metric.daily[date];
  return true;
}

export function postAnalytics(state: GovernanceState, slug: string, now = new Date()): PostAnalyticsData {
  const day = dayAt(now);
  const metric = state.records.postViews[slug];
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
