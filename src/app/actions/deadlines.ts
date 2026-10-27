"use server";

/* Check now: the daily deadline check, run at once for someone who may change ranking deadlines. */
import { revalidatePath } from "next/cache";
import type { CommandResult } from "@/lib/governance/commands";
import { canWith } from "@/lib/governance/rbac";
import { checkAs } from "@/lib/governance/server/deadline-check";
import { allow } from "@/lib/governance/server/limits";
import { getViewer } from "@/lib/governance/server/session";

/** Checks one person may start in ten minutes: each reads every ranking body's website. */
const PER_TEN_MINUTES = 3;

export async function checkDeadlinesNow(): Promise<CommandResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  if (!canWith(viewer.grants, "config", "edit")) return { ok: false, message: "Your role cannot run the deadline check." };
  if (!(await allow(`account:deadline-check:${viewer.id}`, 600, PER_TEN_MINUTES))) return { ok: false, message: "Checked a moment ago. Try again in a few minutes." };
  const result = await checkAs(viewer.id);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
