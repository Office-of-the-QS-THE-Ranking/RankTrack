import "server-only";

/*
 * What every analytics action shares: who is asking and whether their role allows it, a rate limit, the audit entry
 * (sealed into the governance store's hash-chained trail, with any notices to units posted in the same commit), and
 * re-rendering the pages that show analytics once something changed.
 */
import { revalidatePath } from "next/cache";
import { log, notify, type Ctx } from "@/lib/governance/engine/core";
import { allowAccount } from "@/lib/governance/server/limits";
import { run } from "@/lib/governance/server/run";
import { getViewer } from "@/lib/governance/server/session";
import type { Action, AuditCategory, ModuleKey } from "@/lib/governance/types";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { forgetSummaries } from "./summary";

export type Result<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; message: string };

export const ENDED = { ok: false, message: "Your session has ended. Sign in again to continue." } as const;
export const BUSY = { ok: false, message: "Too many changes in a short time. Wait a minute and try again." } as const;
export const fail = (message: string) => ({ ok: false as const, message });

/** The signed-in viewer, if their role allows `need` (within `unitId` when given). */
export async function allowed(need: [ModuleKey, Action], unitId?: string, kind: "command" | "upload" | "export" = "command"): Promise<Viewer | Result> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  if (!viewerCan(viewer, need[0], need[1], unitId ? { unitId } : {})) return fail("Your role can’t do that here.");
  if (!(await allowAccount(viewer.id, kind))) return BUSY;
  return viewer;
}

export const isViewer = (v: Viewer | Result): v is Viewer => "grants" in v;

/** Record what was done in the audit trail, and post any notices with it. */
export async function audit(
  viewer: Viewer,
  action: string,
  resource: { type: string; id: string; label: string },
  detail: string,
  notices: { to: string; template: string; vars: Record<string, string | number>; href: string }[] = [],
  category: AuditCategory = "Data",
) {
  await run(viewer.id, (ctx: Ctx) => {
    log(ctx, action, category, resource, "Success", detail.slice(0, 600));
    for (const n of notices) notify(ctx, n.to, n.template, n.vars, n.href);
    return { ok: true, message: "" };
  });
}

/** Analytics feed the rankings pages, the dashboard and the portal: re-render them all. */
export function refresh() {
  forgetSummaries();
  revalidatePath("/", "layout");
}
