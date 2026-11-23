/*
 * The portal demo's commands: the Hub's own engine (lib/governance/engine), run in the visitor's browser on an
 * in-memory copy of the demo state. Approvals, returns, submissions and edits therefore behave exactly as they do in
 * the Hub, but the result lives only in this tab's memory: there is no server action, no database, no storage and no
 * email behind it. The engine's side effects (mail, media clean-up, backups) are dropped, never carried out.
 */
import { actorFor, execute, makeCtx, type Ctx } from "@/lib/governance/engine";
import type { Command, CommandResult } from "@/lib/governance/commands";
import type { AuditEvent, GovernanceState } from "@/lib/governance/types";
import type { Reference } from "@/lib/reference";

export type DemoBody = (ctx: Ctx) => CommandResult;

/** Run one command as one of the demo's people. Returns the next state (unchanged when the command is refused). */
export function runDemo(state: GovernanceState, ref: Reference, accountId: string, cmd: Command | DemoBody): { state: GovernanceState; result: CommandResult } {
  const draft = structuredClone(state);
  const account = draft.accounts.find((a) => a.id === accountId);
  if (!account) return { state, result: { ok: false, message: "Demo: that person isn't part of the sample data." } };
  const ctx = makeCtx(draft, actorFor(draft, account), ref);
  let result: CommandResult;
  try {
    result = typeof cmd === "function" ? cmd(ctx) : execute(ctx, cmd);
  } catch (error) {
    console.error("Demo command failed", error);
    return { state, result: { ok: false, message: "Demo: that didn't work in the demo. Try something else." } };
  }
  if (!result.ok) return { state, result };
  // Keep the audit entries in memory so the screens that show recent activity have something to read.
  const seq = draft.auditHead.seq;
  const sealed: AuditEvent[] = ctx.drafts.map((d, i) => ({ ...d, seq: seq + i + 1, prev: "", hash: "" }));
  draft.recentAudit = [...draft.recentAudit, ...sealed].slice(-200);
  draft.auditHead = { seq: seq + sealed.length, hash: "" };
  return { state: draft, result };
}
