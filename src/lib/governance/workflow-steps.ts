/*
 * What a workflow's steps mean, shared by the engine and the Process Pipelines studio: which steps are on, the
 * next one a request stops at, and who may decide each.
 */
import { ROLE } from "./catalog";
import { canWith, has, type Grant, type Target } from "./rbac";
import type { StepApprover, WorkflowKey, WorkflowStep } from "./types";

export const APPROVERS: { id: StepApprover; name: string; short: string }[] = [
  { id: "office", name: "Director or Ranking Specialist", short: "Either approver" },
  { id: "director", name: "Director", short: "Director only" },
  { id: "specialist", name: "Ranking Specialist", short: "Specialist only" },
];

export const approverName = (id: StepApprover) => APPROVERS.find((a) => a.id === id)?.name ?? APPROVERS[0].name;

export const stepOn = (s: Pick<WorkflowStep, "enabled">) => s.enabled !== false;

/** The first step from `from` on that is switched on, or -1 when none is left. */
export function nextStep(steps: readonly Pick<WorkflowStep, "enabled">[], from: number) {
  for (let i = Math.max(0, from); i < steps.length; i++) if (stepOn(steps[i])) return i;
  return -1;
}

/** Whether someone holding these grants may decide a step given to `approver`. */
export const approverFits = (grants: readonly Grant[], approver: StepApprover) =>
  grants.some((g) => has(g.perms, "workflows", "approve") && (approver === "office" || (g.roleId === ROLE.superAdmin && g.position === approver)));

/** Why someone can't decide a step given to `approver`, in the words the request sheet shows. */
export const approverBlock = (approver: StepApprover) =>
  approver === "office" ? "Only the Director and Ranking Specialists can approve requests." : `Only the ${approverName(approver)} decides this step.`;

/** The pipeline evidence from the units follows (engine/records.ts review). */
export const SUBMISSIONS = "unit-submissions" satisfies WorkflowKey;

/** Workflows that can't be switched off or let someone decide their own item. */
export const LOCKED: readonly WorkflowKey[] = ["destructive", SUBMISSIONS];

/** Whether someone holding these grants may decide a review step on evidence with this target. */
export const reviewerFits = (grants: readonly Grant[], approver: StepApprover, target: Target) =>
  grants.some((g) => canWith([g], "evidence", "approve", target) && (approver === "office" || (g.roleId === ROLE.superAdmin && g.position === approver)));

/** Why someone can't decide a review step given to `approver`. */
export const reviewerBlock = (approver: StepApprover) => (approver === "office" ? "This submission is outside the units or ranking bodies you review." : `Only the ${approverName(approver)} decides this step.`);

/** The steps a submission goes through, those switched on, in order, with their place in the workflow. */
export const onSteps = (steps: readonly WorkflowStep[]) => steps.map((s, i) => ({ ...s, at: i })).filter(stepOn);
