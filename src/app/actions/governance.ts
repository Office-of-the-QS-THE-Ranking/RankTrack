"use server";

/*
 * The one door for changes: every command is re-authorized on the server as the signed-in account,
 * applied, audited, and then every page that depends on governance is re-rendered.
 */
import { revalidatePath } from "next/cache";
import type { Command, CommandResult } from "@/lib/governance/commands";
import type { ConsoleData } from "@/lib/governance/console-types";
import { log } from "@/lib/governance/engine/core";
import { canWith } from "@/lib/governance/rbac";
import { consoleData } from "@/lib/governance/server/console";
import { run } from "@/lib/governance/server/run";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";

const ENDED: CommandResult = { ok: false, message: "Your session has ended. Sign in again to continue." };

export async function govern(cmd: Command): Promise<CommandResult> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  const result = await run(viewer.id, cmd);
  // Governance shapes the workspaces and the public website, so every page re-renders from the new state.
  revalidatePath("/", "layout");
  return result;
}

/** The Administration console's data, filtered to what the viewer may see. */
export async function loadConsole(): Promise<ConsoleData | null> {
  const viewer = await getViewer();
  if (!viewer || !viewer.admin.length) return null;
  return consoleData(viewer);
}

/** Run a console command and return the refreshed console in the same round trip. */
export async function governConsole(cmd: Command): Promise<{ result: CommandResult; data: ConsoleData | null }> {
  const viewer = await getViewer();
  if (!viewer) return { result: ENDED, data: null };
  const result = await run(viewer.id, cmd);
  revalidatePath("/", "layout");
  const after = await getViewer();
  return { result, data: after && after.admin.length ? await consoleData(after) : null };
}

/** Export audit entries as CSV. The export is itself audited as a sensitive export. */
export async function exportAudit(seqs: number[], filters: string): Promise<CommandResult & { csv?: string }> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  const allowed = canWith(viewer.grants, "audit", "export");
  const wanted = new Set(seqs);
  const rows = (await readState()).audit.filter((e) => wanted.has(e.seq));
  const result = await run(viewer.id, (ctx) => {
    const target = { type: "Audit log", id: "audit", label: `Audit log export, ${rows.length} entries` };
    if (!allowed) {
      log(ctx, "audit.export", "Export", target, "Denied", "Role cannot export audit logs");
      return { ok: false, message: "Your role cannot export the audit log." };
    }
    log(ctx, "audit.export", "Export", target, "Success", `CSV · ${filters || "no filters"} · Restricted`);
    return { ok: true, message: `${rows.length} entries exported. The export itself is now in the log.` };
  });
  if (!result.ok) return result;
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["Seq", "Time (UTC)", "Actor", "Role", "Action", "Category", "Resource type", "Resource", "Outcome", "Detail", "Previous hash", "Hash"];
  const csv = [head, ...rows.map((e) => [e.seq, e.at, e.actorName, e.actorRole, e.action, e.category, e.resource.type, `${e.resource.label} (${e.resource.id})`, e.outcome, e.detail ?? "", e.prev, e.hash])]
    .map((r) => r.map(esc).join(","))
    .join("\n");
  revalidatePath("/", "layout");
  return { ...result, csv };
}
