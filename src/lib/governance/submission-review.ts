/*
 * The Unit submissions pipeline as evidence follows it (Process Pipelines › Unit submissions). Its steps on, in
 * order, each decided by either approver or by one position; a step given to a position nobody holds is decided by
 * either approver instead, so evidence never waits on someone who isn't there, and never counts unreviewed. Shared
 * by the engine (engine/records.ts review) and the record screen (EvidenceItem.pipeline).
 */
import { ROLE } from "./catalog";
import { canWith, grantsFor } from "./rbac";
import type { EvidenceReview, GovernanceState, StepApprover } from "./types";
import { SUBMISSIONS, onSteps } from "./workflow-steps";

export interface ReviewStep {
  name: string;
  approver: StepApprover;
  /** Its place in the workflow's steps, on or off: what EvidenceReview.step holds. */
  at: number;
  /** Given to a position no one holds, so either approver decides it. */
  open?: boolean;
}

/** Where a submission For review stands, for the record screen. */
export interface SubmissionPipeline {
  steps: { name: string; approver: StepApprover; at: number; open?: boolean }[];
  /** The step it waits on, in `steps`. */
  now: number;
  /** Who approved the steps before it (account ids, and names to show). */
  approvals: { step: number; by: string; name: string; at: string }[];
}

const FALLBACK: ReviewStep[] = [{ name: "Evidence review", approver: "office", at: 0 }];

/** The steps on, in order. Without the workflow (an older store), one review by any reviewer. */
export function submissionSteps(state: GovernanceState, day: string): ReviewStep[] {
  const wf = state.workflows.find((w) => w.id === SUBMISSIONS);
  const steps = wf ? onSteps(wf.steps) : [];
  if (!steps.length) return FALLBACK;
  const held = new Set<StepApprover>();
  for (const a of state.accounts) {
    if (a.status !== "Active") continue;
    for (const g of grantsFor(a, state.units, day, state.config.rolePermissions))
      if (g.roleId === ROLE.superAdmin && (g.position === "director" || g.position === "specialist") && canWith([g], "evidence", "approve")) held.add(g.position);
  }
  return steps.map((s) => ({ name: s.name, approver: s.approver, at: s.at, ...(s.approver !== "office" && !held.has(s.approver) && { open: true }) }));
}

/** The approver who decides a step: its own, or either approver when nobody holds its position. */
export const decidedBy = (s: ReviewStep): StepApprover => (s.open ? "office" : s.approver);

/**
 * The step a submission waits on, as an index into `steps`: the one it stands at, or the next one on when that
 * one was switched off or removed meanwhile, or the last when it stood past them all.
 */
export function waitingAt(steps: readonly ReviewStep[], review?: EvidenceReview): number {
  const at = review?.step ?? 0;
  const i = steps.findIndex((s) => s.at >= at);
  return i < 0 ? steps.length - 1 : i;
}

export function pipelineOf(state: GovernanceState, steps: readonly ReviewStep[], review?: EvidenceReview): SubmissionPipeline {
  const name = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? "A reviewer";
  return {
    steps: steps.map((s) => ({ name: s.name, approver: s.approver, at: s.at, ...(s.open && { open: true }) })),
    now: waitingAt(steps, review),
    approvals: (review?.approvals ?? []).map((a) => ({ ...a, name: name(a.by) })),
  };
}
