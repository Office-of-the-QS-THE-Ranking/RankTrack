import "server-only";

/*
 * Anonymous view counts for public posts, kept in Supabase's hub_post_views table rather than the governance
 * store, so a visit is one atomic increment instead of a rewrite of the whole store. A visitor (a hashed address
 * and browser) counts once per post every half hour, and one address at most VIEWS_PER_HOUR times an hour.
 */
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { adminDb } from "@/lib/supabase/server";
import { dayAt, type ViewDay } from "../post-analytics";
import { allow, clientKey } from "./limits";

const REVISIT_SECONDS = 1800;
const VIEWS_PER_HOUR = 120;

export async function countView(slug: string, now = new Date()) {
  const client = await clientKey();
  if (!(await allow(`views:${client}`, 3600, VIEWS_PER_HOUR))) return false;
  const browser = (await headers()).get("user-agent") ?? "";
  const visitor = createHash("sha256").update(`${client}|${browser}`).digest("base64url").slice(0, 22);
  const { data, error } = await adminDb().rpc("hub_count_post_view", { p_slug: slug, p_day: dayAt(now), p_visitor: visitor, p_window_seconds: REVISIT_SECONDS });
  if (error) console.error(`Post views ${slug}: ${error.message}`);
  return data === true;
}

/** Counted views per post, for the given slugs. Empty when the table can't be read (the failure is logged). */
export async function countedViews(slugs: string[]): Promise<Map<string, ViewDay[]>> {
  const out = new Map<string, ViewDay[]>();
  if (!slugs.length) return out;
  const { data, error } = await adminDb().from("hub_post_views").select("slug, day, views, last_viewed_at").in("slug", slugs);
  if (error) console.error(`Post views: ${error.message}`);
  for (const row of data ?? []) {
    const list = out.get(row.slug) ?? [];
    list.push({ day: row.day, views: row.views, at: new Date(row.last_viewed_at).toISOString() });
    out.set(row.slug, list);
  }
  return out;
}
