"use server";

import { headers } from "next/headers";
import { canCountPostView, countPostView, postAnalytics } from "@/lib/governance/post-analytics";
import type { PostAnalyticsData } from "@/lib/governance/hub-types";
import { getViewer } from "@/lib/governance/server/session";
import { readState, transact } from "@/lib/governance/server/store";
import { viewerCan } from "@/lib/governance/viewer";

/** A visible public article, counted anonymously. Prefetches and server rendering never call this. */
export async function recordPostView(slug: string): Promise<boolean> {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) return false;
  if (/bot|crawler|spider|headless|preview/i.test((await headers()).get("user-agent") ?? "")) return false;
  if (!canCountPostView(await readState(), slug)) return false;
  return transact((state) => ({ commit: state, result: countPostView(state, slug) }));
}

/** Audience counts are available only to people allowed to manage/view posts. */
export async function getPostAnalytics(slug: string): Promise<PostAnalyticsData | null> {
  const viewer = await getViewer();
  if (!viewer || !viewerCan(viewer, "posts", "view") || typeof slug !== "string" || slug.length > 120) return null;
  return postAnalytics(await readState(), slug);
}
