import "server-only";

/*
 * Runs one command as one person: housekeeping first, then the command, then its side effects, then the
 * audit entries are sealed and everything commits together. A refused command commits nothing but its
 * refusal, which stays in the audit trail.
 */
import type { Command, CommandResult } from "../commands";
import { actorFor, execute, GUEST, housekeeping, makeCtx, SYSTEM, type Actor, type Ctx } from "../engine";
import { log, nextId } from "../engine/core";
import { addDays } from "../derive";
import type { GovernanceState } from "../types";
import { deletePointFile, restoreInto, seal, seedInto, transact, verifyChain, verifyPoint, writePoint } from "./store";

type Body = (ctx: Ctx) => CommandResult;

function effects(ctx: Ctx, result: CommandResult): CommandResult {
  let out = result;
  for (const fx of ctx.effects) {
    const s = ctx.state;
    switch (fx.kind) {
      case "snapshot": {
        const point = s.backup.points.find((p) => p.id === fx.pointId);
        if (!point) break;
        const { checksum, sizeMB } = writePoint(s, fx.pointId);
        point.checksum = `${checksum.slice(0, 4)}…${checksum.slice(-4)}`;
        point.sizeMB = sizeMB;
        point.verifiedAt = ctx.iso;
        break;
      }
      case "verify-point": {
        const test = s.backup.tests.find((t) => t.id === fx.testId);
        const point = s.backup.points.find((p) => p.id === fx.pointId);
        const r = verifyPoint(fx.pointId);
        if (test) {
          test.result = r.ok ? "Passed" : "Failed";
          test.notes = r.ok
            ? `Restored to an isolated copy and checked: checksum valid, ${r.accounts} accounts and ${r.units} units readable.`
            : r.reason;
        }
        if (point && r.ok) point.verifiedAt = ctx.iso;
        out = { ...out, ok: true, message: r.ok ? `Restoration test passed for ${fx.pointId}.` : `Restoration test failed: ${r.reason}` };
        break;
      }
      case "restore": {
        const r = restoreInto(s, fx.pointId);
        if (!r.ok) return { ok: false, message: `Restore failed: ${r.reason}` };
        log(ctx, "backup.restore", "Backup", { type: "Recovery point", id: fx.pointId, label: "Restore" }, "Success", "Governance store restored; audit trail and sessions carried on");
        out = { ...out, message: `The Hub was restored from ${fx.pointId}.` };
        break;
      }
      case "delete-point": {
        s.backup.points = s.backup.points.filter((p) => p.id !== fx.pointId);
        deletePointFile(fx.pointId);
        log(ctx, "backup.delete", "Backup", { type: "Recovery point", id: fx.pointId, label: "Recovery point" }, "Success", "Deleted after a second technical approval");
        break;
      }
      case "verify-audit": {
        const v = verifyChain(s);
        out = {
          ok: true,
          message: v.ok ? `Audit log intact: ${v.entries.toLocaleString("en-PH")} entries verified.` : `Audit log altered at entry ${v.brokenAt}: ${v.reason}`,
          data: v,
        };
        break;
      }
      case "reset":
        seedInto(s);
        break;
    }
  }
  return out;
}

/**
 * Scheduled backups of the governance store. A change made more than the recovery point objective
 * after the last recovery point triggers one, so at most that much work can ever be lost; a full
 * backup is taken when the last one is a day old.
 */
function scheduledBackup(state: GovernanceState, now: Date) {
  const done = state.backup.points.filter((p) => p.status === "Completed").sort((a, b) => b.at.localeCompare(a.at));
  const last = done[0];
  if (last && now.getTime() - Date.parse(last.at) < state.backup.objectives.rpoMinutes * 60_000) return;
  const lastFull = done.find((p) => p.kind === "Full");
  const kind = !lastFull || now.getTime() - Date.parse(lastFull.at) > 24 * 3_600_000 ? "Full" : "Incremental";
  const ctx = makeCtx(state, SYSTEM, now);
  const id = nextId(ctx, "point", "RP-", 4);
  state.backup.points.unshift({
    id,
    at: ctx.iso,
    kind,
    sizeMB: 0,
    location: kind === "Full" && state.backup.schedule.offsite ? "Off-site copy" : "Primary region",
    status: "Completed",
    checksum: "pending",
    file: `${id}.json`,
    expiresAt: addDays(ctx.day, state.backup.schedule.retentionDays),
  });
  const { checksum, sizeMB } = writePoint(state, id);
  const point = state.backup.points[0];
  point.checksum = `${checksum.slice(0, 4)}…${checksum.slice(-4)}`;
  point.sizeMB = sizeMB;
  log(ctx, "backup.run", "Backup", { type: "Recovery point", id, label: `Scheduled ${kind.toLowerCase()} backup` }, "Success", "Taken automatically to keep the recovery point objective");
  seal(state, ctx.drafts);
}

function commitWith(draft: GovernanceState, current: GovernanceState, actorOf: (s: GovernanceState) => Actor, body: Body) {
  const now = new Date();
  const hk = makeCtx(draft, SYSTEM, now);
  housekeeping(hk);
  seal(draft, hk.drafts);
  const checkpoint = structuredClone(draft);
  const ctx = makeCtx(draft, actorOf(draft), now);
  let result = body(ctx);
  if (result.ok) result = effects(ctx, result);
  if (result.ok) {
    seal(draft, ctx.drafts);
    if (ctx.drafts.some((d) => d.category !== "Session" && d.category !== "Backup")) scheduledBackup(draft, now);
    return { commit: draft, result };
  }
  // Keep the refusal on record; drop everything else the command touched.
  seal(checkpoint, ctx.drafts.filter((d) => d.outcome !== "Success"));
  void current;
  return { commit: checkpoint, result };
}

/** Run a command as an account (or as a guest for access requests). */
export function run(accountId: string | null, cmd: Command | Body): Promise<CommandResult> {
  return transact((draft, current) =>
    commitWith(
      draft,
      current,
      (s) => {
        const acc = accountId ? s.accounts.find((a) => a.id === accountId) : undefined;
        return acc ? actorFor(s, acc) : GUEST;
      },
      typeof cmd === "function" ? cmd : (ctx) => execute(ctx, cmd),
    ),
  );
}

/** Run a body as the system itself (sign-in bookkeeping, automatic suspensions). */
export function runSystem(body: Body): Promise<CommandResult> {
  return transact((draft, current) => commitWith(draft, current, () => SYSTEM, body));
}
