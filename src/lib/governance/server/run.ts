import "server-only";

/*
 * Runs one command as one person: housekeeping first, then the command, then its side effects, then the
 * audit entries are sealed and everything commits together. A refused command commits nothing but its
 * refusal, which stays in the audit trail.
 */
import type { Command, CommandResult } from "../commands";
import type { Reference } from "@/lib/reference";
import { actorFor, execute, GUEST, housekeeping, makeCtx, SYSTEM, type Actor, type Ctx } from "../engine";
import { log, nextId } from "../engine/core";
import { addDays } from "../derive";
import { evidencePath } from "../evidence-files";
import { mediaPath } from "../posts";
import { canWith } from "../rbac";
import { emblemPath } from "../unit-emblems";
import type { GovernanceState } from "../types";
import { anchorAudit } from "./db/audit";
import { adminShortcut } from "./dev-access";
import { mediaInUse } from "./media";
import { reference } from "./reference";
import { deletePoint, dropPendingAfter, pendingMark, readState, releaseMediaLater, restoreInto, seal, transact, verifyChain, verifyPoint, writePoint } from "./store";

type Body = (ctx: Ctx) => CommandResult;
type Verified = Awaited<ReturnType<typeof verifyChain>>;

async function effects(ctx: Ctx, result: CommandResult, verified?: Verified): Promise<CommandResult> {
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
        const r = await verifyPoint(fx.pointId);
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
        const r = await restoreInto(s, fx.pointId);
        if (!r.ok) return { ok: false, message: `Restore failed: ${r.reason}` };
        log(ctx, "backup.restore", "Backup", { type: "Recovery point", id: fx.pointId, label: "Restore" }, "Success", "Governance store restored; audit trail and sessions carried on");
        out = { ...out, message: `The Hub was restored from ${fx.pointId}.` };
        break;
      }
      case "delete-point": {
        s.backup.points = s.backup.points.filter((p) => p.id !== fx.pointId);
        deletePoint(fx.pointId);
        log(ctx, "backup.delete", "Backup", { type: "Recovery point", id: fx.pointId, label: "Recovery point" }, "Success", "Deleted after a second administrator approved");
        break;
      }
      case "delete-media": {
        // Only uploads, and only those no post, unit or evidence item still shows.
        const used = mediaInUse(s);
        const paths = fx.srcs.filter((src) => !used.has(src)).flatMap((src) => mediaPath(src) ?? emblemPath(src) ?? evidencePath(src) ?? []);
        if (paths.length) releaseMediaLater(paths);
        break;
      }
      case "verify-audit": {
        // Walked before the transaction (see run): a long walk must not hold up, or be retried by, other changes.
        const v = verified;
        if (!v) return { ok: false, message: "The audit log could not be checked. Try again." };
        out = {
          ok: true,
          message: v.ok ? `Audit log intact: ${v.entries.toLocaleString("en-PH")} entries verified.` : `Audit log altered at entry ${v.brokenAt}: ${v.reason}`,
          data: v,
        };
        break;
      }
    }
  }
  return out;
}

/**
 * Scheduled backups of the governance store. A change made more than the recovery point objective
 * after the last recovery point triggers one, so at most that much work can ever be lost; a full
 * backup is taken when the last one is a day old.
 */
function scheduledBackup(state: GovernanceState, ref: Reference, now: Date) {
  const done = state.backup.points.filter((p) => p.status === "Completed").sort((a, b) => b.at.localeCompare(a.at));
  const last = done[0];
  if (last && now.getTime() - Date.parse(last.at) < state.backup.objectives.rpoMinutes * 60_000) return;
  const lastFull = done.find((p) => p.kind === "Full");
  const kind = !lastFull || now.getTime() - Date.parse(lastFull.at) > 24 * 3_600_000 ? "Full" : "Incremental";
  const ctx = makeCtx(state, SYSTEM, ref, now);
  const id = nextId(ctx, "point", "RP-", 4);
  state.backup.points.unshift({
    id,
    at: ctx.iso,
    kind,
    sizeMB: 0,
    location: kind === "Full" && state.backup.schedule.offsite ? "Off-site copy" : "Primary region",
    status: "Completed",
    checksum: "pending",
    file: `backups/${id}.json.gz`,
    expiresAt: addDays(ctx.day, state.backup.schedule.retentionDays),
  });
  const { checksum, sizeMB } = writePoint(state, id);
  const point = state.backup.points[0];
  point.checksum = `${checksum.slice(0, 4)}…${checksum.slice(-4)}`;
  point.sizeMB = sizeMB;
  log(ctx, "backup.run", "Backup", { type: "Recovery point", id, label: `Scheduled ${kind.toLowerCase()} backup` }, "Success", "Taken automatically to keep the recovery point objective");
  seal(state, ctx.drafts);
}

/** Recovery points past their retention leave the catalogue and the database. */
function expirePoints(ctx: Ctx) {
  const s = ctx.state;
  for (const p of s.backup.points.filter((x) => x.expiresAt < ctx.day)) {
    deletePoint(p.id);
    log(ctx, "backup.expire", "Backup", { type: "Recovery point", id: p.id, label: `${p.kind} backup` }, "Success", "Removed at the end of its retention period");
  }
  s.backup.points = s.backup.points.filter((x) => x.expiresAt >= ctx.day);
}

/** Expire what policy says has expired, as the system, on `state`. Running it twice queues each file removal once (applyPending). */
function upkeep(state: GovernanceState, ref: Reference, now: Date) {
  const hk = makeCtx(state, SYSTEM, ref, now);
  housekeeping(hk);
  expirePoints(hk);
  seal(state, hk.drafts);
}

/** A command that throws (malformed input, most often) is refused like any other, not a server error. */
function safely(body: Body, ctx: Ctx): CommandResult {
  try {
    const r = body(ctx);
    return r && typeof r.ok === "boolean" ? r : { ok: false, message: "That request isn't one the Hub recognises." };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "That request was incomplete or malformed. Reload the page and try again." };
  }
}

async function commitWith(draft: GovernanceState, current: GovernanceState, actorOf: (s: GovernanceState) => Actor, body: Body, verified?: Verified) {
  const now = new Date();
  const ref = await reference();
  upkeep(draft, ref, now);
  const mark = pendingMark();
  const ctx = makeCtx(draft, actorOf(draft), ref, now, await adminShortcut());
  let result = safely(body, ctx);
  if (result.ok) result = await effects(ctx, result, verified);
  if (result.ok) {
    seal(draft, ctx.drafts);
    if (ctx.drafts.some((d) => d.category !== "Session" && d.category !== "Backup")) scheduledBackup(draft, ref, now);
    return { commit: draft, result };
  }
  // Keep the refusal on record; drop everything else the command touched, including its queued side effects.
  // The untouched state is copied only now, since most commands succeed.
  dropPendingAfter(mark);
  const checkpoint = structuredClone(current);
  upkeep(checkpoint, ref, now);
  seal(checkpoint, ctx.drafts.filter((d) => d.outcome !== "Success"));
  return { commit: checkpoint, result };
}

/** Walk the audit chain for audit.verify, but only for someone allowed to: the walk reads the whole trail. */
async function verifyFor(accountId: string | null, cmd: Command | Body): Promise<Verified | undefined> {
  if (typeof cmd === "function" || cmd.type !== "audit.verify" || !accountId) return undefined;
  const state = await readState();
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account || !canWith(actorFor(state, account).grants, "audit", "view")) return undefined;
  return verifyChain();
}

/** Run a command as an account (or as a guest for access requests). */
export async function run(accountId: string | null, cmd: Command | Body): Promise<CommandResult> {
  const verified = await verifyFor(accountId, cmd);
  const result = await transact((draft, current) =>
    commitWith(
      draft,
      current,
      (s) => {
        const acc = accountId ? s.accounts.find((a) => a.id === accountId) : undefined;
        return acc ? actorFor(s, acc) : GUEST;
      },
      typeof cmd === "function" ? cmd : (ctx) => execute(ctx, cmd),
      verified,
    ),
  );
  void anchorAudit();
  return result;
}

/** Run a body as the system itself (sign-in bookkeeping, automatic suspensions). */
export async function runSystem(body: Body): Promise<CommandResult> {
  const result = await transact((draft, current) => commitWith(draft, current, () => SYSTEM, body));
  void anchorAudit();
  return result;
}
