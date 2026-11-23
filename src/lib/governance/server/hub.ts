import "server-only";

/*
 * The governed view of the Hub's data for server components: the reference data (Supabase, see reference.ts) and the
 * governance store, passed through the pure projection in ../hub-build.ts. The public website only receives what is
 * classified Public and switched on.
 */
import { cache } from "react";
import { evidenceSubmissionTimes } from "./db/audit";
import { build, clientHubFrom, type Hub } from "../hub-build";
import type { HubData } from "../hub-types";
import type { Viewer } from "../viewer";
import { readState } from "./store";
import { reference } from "./reference";
import { summariesNow } from "@/lib/analytics/server/summary";

export type { Hub } from "../hub-build";

/** Governed data for this request. */
export const hub = cache(async (): Promise<Hub> => {
  const [state, ref] = await Promise.all([readState(), reference()]);
  // Never waits on the analytics engine: pages that need its latest figures await rankingSummaries() first.
  return build(state, ref, summariesNow());
});

/** What a workspace's client components receive, filtered to what the viewer may reach. */
export async function clientHub(viewer: Viewer, variant: "office" | "unit"): Promise<HubData> {
  const h = await hub();
  const hd = clientHubFrom(h, viewer, variant);
  // The office sees each submission's exact time, from the audit trail.
  if (variant !== "office") return hd;
  const times = await evidenceSubmissionTimes(hd.evidence.map((e) => e.id));
  return { ...hd, evidence: hd.evidence.map((e) => (times[e.id] ? { ...e, submittedAt: times[e.id] } : e)) };
}
