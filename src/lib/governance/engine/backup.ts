/*
 * Backup and disaster recovery. Anyone with view rights sees status; only University Administrators run
 * backups and tests, and restoring or deleting a recovery point needs a second University Administrator.
 */
import type { CommandResult } from "../commands";
import { addDays } from "../derive";
import { can, cleanText, deny, invalid, log, nextId, ok, type Ctx } from "./core";
import { openRequest } from "./requests";

const TARGET = (id: string, label: string) => ({ type: "Recovery point", id, label });

function manager(ctx: Ctx, action: string, id: string, label: string): CommandResult | null {
  if (!can(ctx, "backup", "manage")) return deny(ctx, action, "Backup", TARGET(id, label), "Only University Administrators can run backup operations.");
  return null;
}

export function runBackup(ctx: Ctx): CommandResult {
  const block = manager(ctx, "backup.run", "new", "Manual backup");
  if (block) return block;
  const id = nextId(ctx, "point", "RP-", 4);
  ctx.state.backup.points.unshift({
    id,
    at: ctx.iso,
    kind: "Manual",
    sizeMB: 0,
    location: "Primary region",
    status: "Completed",
    checksum: "pending",
    file: `backups/${id}.json.gz`,
    expiresAt: addDays(ctx.day, ctx.state.backup.schedule.retentionDays),
  });
  ctx.effects.push({ kind: "snapshot", pointId: id });
  log(ctx, "backup.run", "Backup", TARGET(id, "Manual backup"), "Success", "Governance store, configuration and records; the audit log is kept separately");
  return ok(`Recovery point ${id} created.`, { data: id });
}

export function testRestore(ctx: Ctx, pointId: string): CommandResult {
  const p = ctx.state.backup.points.find((x) => x.id === pointId);
  if (!p) return invalid("That recovery point no longer exists.");
  const block = manager(ctx, "backup.test", p.id, `${p.kind} backup`);
  if (block) return block;
  if (p.status !== "Completed") return invalid("Failed backups cannot be restored; pick a completed recovery point.");
  const id = `RT-${nextId(ctx, "test", "", 3)}`;
  if (p.file) {
    ctx.state.backup.tests.unshift({ id, at: ctx.iso, pointId: p.id, result: "Passed", minutes: 1, by: ctx.actor.id, notes: "Checking…" });
    ctx.effects.push({ kind: "verify-point", pointId: p.id, testId: id });
  } else {
    ctx.state.backup.tests.unshift({ id, at: ctx.iso, pointId: p.id, result: "Passed", minutes: 0, by: ctx.actor.id, notes: "Catalogue check only: this sample recovery point is held by the database platform, not the Hub." });
    p.verifiedAt = ctx.iso;
  }
  log(ctx, "backup.test", "Backup", TARGET(p.id, `${p.kind} backup`), "Success", "Restoration test to an isolated copy");
  return ok(`Restore test of ${p.id} recorded.`, { data: id });
}

export function schedule(ctx: Ctx, patch: { retentionDays?: number; monthlyMonths?: number; offsite?: boolean }): CommandResult {
  const block = manager(ctx, "backup.schedule", "schedule", "Retention settings");
  if (block) return block;
  const s = ctx.state.backup.schedule;
  const changes: string[] = [];
  if (patch.retentionDays !== undefined && patch.retentionDays !== s.retentionDays) {
    if (patch.retentionDays < 7 || patch.retentionDays > 365) return invalid("Keep daily recovery points 7 to 365 days.");
    changes.push(`daily retention ${s.retentionDays} → ${patch.retentionDays} days`);
    s.retentionDays = Math.round(patch.retentionDays);
  }
  if (patch.monthlyMonths !== undefined && patch.monthlyMonths !== s.monthlyMonths) {
    if (patch.monthlyMonths < 1 || patch.monthlyMonths > 120) return invalid("Keep monthly copies 1 to 120 months.");
    changes.push(`monthly copies ${s.monthlyMonths} → ${patch.monthlyMonths} months`);
    s.monthlyMonths = Math.round(patch.monthlyMonths);
  }
  if (patch.offsite !== undefined && patch.offsite !== s.offsite) {
    changes.push(patch.offsite ? "off-site copy on" : "off-site copy off");
    s.offsite = patch.offsite;
  }
  if (!changes.length) return ok("No changes.");
  log(ctx, "backup.schedule", "Backup", TARGET("schedule", "Retention settings"), "Success", changes.join("; "));
  return ok(`Saved: ${changes.join("; ")}.`);
}

/** Restoring or deleting never happens directly: it opens a request for a second University Administrator. */
export function requestDestructive(ctx: Ctx, operation: "restore" | "delete", pointId: string, justification: string): CommandResult {
  const p = ctx.state.backup.points.find((x) => x.id === pointId);
  if (!p) return invalid("That recovery point no longer exists.");
  const block = manager(ctx, `backup.${operation}`, p.id, `${p.kind} backup`);
  if (block) return block;
  if (operation === "restore" && !p.file) return invalid("This point can't be restored here. Choose one marked Restorable.");
  if (operation === "restore" && p.status !== "Completed") return invalid("Failed backups cannot be restored.");
  if (cleanText(justification).length < 10) return invalid("Explain why; the second administrator reads this before approving.");
  if (ctx.state.requests.some((r) => r.status === "Pending" && r.payload.kind === "destructive" && r.payload.snapshotId === p.id))
    return invalid(`A request for ${p.id} is already waiting for approval.`);
  const req = openRequest(ctx, "destructive", { kind: "destructive", operation, snapshotId: p.id }, `${operation === "restore" ? "Restore the Hub from" : "Delete"} recovery point ${p.id}`, justification);
  return ok("Sent for approval. A second University Administrator must approve.", { requestId: req.id });
}
