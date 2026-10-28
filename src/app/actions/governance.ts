"use server";

/*
 * The one door for changes: every command is re-authorized on the server as the signed-in account,
 * applied, audited, and then every page that depends on governance is re-rendered.
 */
import { revalidatePath } from "next/cache";
import { checkCommand } from "@/lib/governance/command-guard";
import type { Command, CommandResult } from "@/lib/governance/commands";
import type { ConsoleData } from "@/lib/governance/console-types";
import { DOC_LIMITS, documentPath } from "@/lib/governance/documents";
import { log } from "@/lib/governance/engine/core";
import { evidencePath } from "@/lib/governance/evidence-files";
import { canWith } from "@/lib/governance/rbac";
import { consoleData } from "@/lib/governance/server/console";
import { auditBySeq } from "@/lib/governance/server/db/audit";
import { allowAccount } from "@/lib/governance/server/limits";
import { run } from "@/lib/governance/server/run";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { adminDb } from "@/lib/supabase/server";
import { statObject } from "@/lib/r2";
import { workspacePath } from "@/lib/governance/workspace";

const ENDED: CommandResult = { ok: false, message: "Your session has ended. Sign in again to continue." };
const BUSY: CommandResult = { ok: false, message: "Too many changes in a short time. Wait a minute and try again." };

/** Most rows an audit export holds; narrow the filters for more. */
const EXPORT_MAX = 10_000;

/**
 * Files named by evidence.submit, evidence.respond, document.save and workspace.add must be uploads that exist,
 * within the upload limit; their sizes come from storage, not from what the browser said.
 */
async function checkAttachments(cmd: Command): Promise<string | null> {
  if (cmd.type === "role.permissions") {
    const { error } = await adminDb().from("system_settings" as never).select("role_permissions").limit(0);
    if (error) return "Permission editing is temporarily unavailable. Apply the role permissions database migration and try again.";
  }
  if (cmd.type === "workspace.add") {
    if (!Array.isArray(cmd.files)) return "Add the files again.";
    const { maxFileMB } = (await readState()).config.uploads;
    for (const f of cmd.files) {
      const path = f && typeof f.src === "string" ? workspacePath(f.src) : null;
      const stat = path ? await statObject("private", path).catch(() => null) : null;
      if (!stat) return `${typeof f?.name === "string" ? f.name : "A file"} didn’t finish uploading. Add it again.`;
      if (stat.size > maxFileMB * 1_048_576) return `${f.name} is larger than ${maxFileMB} MB.`;
      f.bytes = stat.size;
    }
    return null;
  }
  if (cmd.type === "document.save") {
    // Older deployments must not report success while Postgres ignores the new optional column.
    if (cmd.kind === "report" && cmd.input?.coverTone) {
      const { error } = await adminDb().from("documents" as never).select("cover_tone").limit(0);
      if (error) return "Cover colors are temporarily unavailable. Choose Automatic and save again.";
    }
    const f = cmd.input?.file;
    if (!f) return null;
    const path = typeof f === "object" && typeof f.src === "string" ? documentPath(f.src) : null;
    if (!path) return "The PDF didn’t finish uploading. Remove it and add it again.";
    const stat = await statObject("private", path).catch(() => null);
    if (!stat) return "The PDF didn’t finish uploading. Remove it and add it again.";
    if (stat.size > DOC_LIMITS.fileMb * 1_048_576) return `The PDF is larger than ${DOC_LIMITS.fileMb} MB.`;
    f.sizeMB = Math.round((stat.size / 1_048_576) * 10) / 10;
    return null;
  }
  const files =
    cmd.type === "evidence.submit" ? cmd.input?.files : cmd.type === "evidence.respond" && cmd.file && typeof cmd.file === "object" ? [cmd.file] : null;
  if (!files) return null;
  if (!Array.isArray(files)) return "Attach the files again.";
  const { maxFileMB } = (await readState()).config.uploads;
  for (const f of files) {
    const path = f && typeof f.src === "string" ? evidencePath(f.src) : null;
    if (!path) return "A file didn’t finish uploading. Remove it and attach it again.";
    const stat = await statObject("private", path).catch(() => null);
    if (!stat) return `${f.name} didn’t finish uploading. Remove it and attach it again.`;
    if (stat.size > maxFileMB * 1_048_576) return `${f.name} is larger than ${maxFileMB} MB.`;
    f.sizeMB = Math.round((stat.size / 1_048_576) * 10) / 10;
  }
  return null;
}

/** Check, authorize and run one command as the signed-in account. */
async function execute(raw: unknown): Promise<{ viewerId: string | null; result: CommandResult }> {
  const viewer = await getViewer();
  if (!viewer) return { viewerId: null, result: ENDED };
  const checked = checkCommand(raw);
  if (!checked.ok) return { viewerId: viewer.id, result: { ok: false, message: checked.message } };
  if (!(await allowAccount(viewer.id, "command"))) return { viewerId: viewer.id, result: BUSY };
  const problem = await checkAttachments(checked.cmd);
  if (problem) return { viewerId: viewer.id, result: { ok: false, message: problem } };
  const result = await run(viewer.id, checked.cmd);
  // Governance shapes the workspaces and the public website, so every page re-renders from the new state. A
  // refused command changed nothing anyone sees.
  if (result.ok) revalidatePath("/", "layout");
  return { viewerId: viewer.id, result };
}

export async function govern(cmd: Command): Promise<CommandResult> {
  return (await execute(cmd)).result;
}

/** The Administration console's data, filtered to what the viewer may see. */
export async function loadConsole(): Promise<ConsoleData | null> {
  const viewer = await getViewer();
  if (!viewer || !viewer.admin.length) return null;
  return consoleData(viewer);
}

/** Run a console command and return the refreshed console in the same round trip. */
export async function governConsole(cmd: Command): Promise<{ result: CommandResult; data: ConsoleData | null }> {
  const { viewerId, result } = await execute(cmd);
  if (!viewerId) return { result, data: null };
  const after = await getViewer();
  return { result, data: after && after.admin.length ? await consoleData(after) : null };
}

/** Export audit entries as CSV. The export is itself audited as a sensitive export. */
export async function exportAudit(seqs: number[], filters: string): Promise<CommandResult & { csv?: string }> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  const allowed = canWith(viewer.grants, "audit", "export");
  if (allowed && !(await allowAccount(viewer.id, "export"))) return BUSY;
  // Only whole numbers, each once: they name rows of the audit trail.
  const wanted = [...new Set((Array.isArray(seqs) ? seqs : []).filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (wanted.length > EXPORT_MAX) return { ok: false, message: `Export at most ${EXPORT_MAX.toLocaleString("en-PH")} entries at a time. Narrow the filters.` };
  const rows = allowed ? await auditBySeq(wanted) : [];
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
  // A cell a spreadsheet would read as a formula (= + - @, or a leading tab or return) is prefixed with ' so it stays text.
  const esc = (v: string | number) => {
    const text = typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const head = ["Seq", "Time (UTC)", "Actor", "Role", "Action", "Category", "Resource type", "Resource", "Outcome", "Detail", "Previous hash", "Hash"];
  const csv = [head, ...rows.map((e) => [e.seq, e.at, e.actorName, e.actorRole, e.action, e.category, e.resource.type, `${e.resource.label} (${e.resource.id})`, e.outcome, e.detail ?? "", e.prev, e.hash])]
    .map((r) => r.map(esc).join(","))
    .join("\n");
  return { ...result, csv };
}
