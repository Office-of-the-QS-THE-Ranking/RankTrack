import "server-only";

import { hub } from "@/lib/governance/server/hub";
import { catalogs } from "./load";

/** Where an old Analytics address for an edition lives now: a tab of its ranking's page, or the Rankings overview. */
export async function editionHref(tab: "indicators" | "methodology", edition: string | undefined, extra: Record<string, string | undefined> = {}) {
  const found = (await catalogs()).find((c) => c.edition.id === edition);
  const ranking = found?.edition.ranking;
  if (!ranking || !(await hub()).ranking(ranking)) return "/admin/rankings";
  const query = new URLSearchParams({ edition: found.edition.id });
  for (const [k, v] of Object.entries(extra)) if (v) query.set(k, v);
  return `/admin/rankings/${ranking}?${query}#${tab}`;
}
