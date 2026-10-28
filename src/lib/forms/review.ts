/*
 * The review of a response: the sign-offs the form asks for, in order (noted, endorsed, approved), and the
 * status they add up to. A stage that a response's answers skip (an adviser only for local organizations) is
 * left out. Each stage waits for the one before it; a return or a decline ends the chain.
 */
import { fieldMap, holds } from "./modules";
import type { Answers, FormSchema, ResponseStatus, ReviewState, StageRecord, StageSpec } from "./types";

export const STATUS_LABEL: Record<ResponseStatus, string> = {
  received: "Submitted",
  "in-review": "In review",
  approved: "Approved",
  returned: "Returned",
  declined: "Declined",
};

export const STATUSES = Object.keys(STATUS_LABEL) as ResponseStatus[];

/** A team copy that hasn't been sent yet. */
export const INCOMPLETE = "Incomplete";

export const emptyReview = (): ReviewState => ({ stages: {}, fields: {} });

/** The stages this response goes through. */
export function stagesFor(schema: FormSchema, answers: Answers): StageSpec[] {
  const fields = fieldMap(schema.sections);
  return (schema.review?.stages ?? []).filter((s) => holds(s.showIf, answers, fields));
}

/** Where a response stands: the first stage still to decide, and what the decisions so far add up to. */
export function standing(schema: FormSchema, answers: Answers, review: ReviewState): { status: ResponseStatus; next: StageSpec | null; stages: StageSpec[] } {
  const stages = stagesFor(schema, answers);
  let decided = 0;
  for (const s of stages) {
    const rec: StageRecord | undefined = review.stages[s.id];
    if (!rec) return { status: decided ? "in-review" : "received", next: s, stages };
    if (rec.decision === "returned") return { status: "returned", next: null, stages };
    if (rec.decision === "declined") return { status: "declined", next: null, stages };
    decided++;
  }
  return { status: stages.length ? "approved" : "received", next: null, stages };
}

/** A role inside a sentence ("noted by the dean"): a plain first word goes lower case, a name like ComDev or UST stays. */
export const roleWords = (role: string) => (/^[A-Z][a-z]*(\s|$)/.test(role) ? role.charAt(0).toLowerCase() + role.slice(1) : role);

/** The verb a decision reads as on a stage: Noted, Endorsed, Approved; Returned; Declined. */
export const decisionLabel = (stage: StageSpec, rec: StageRecord) => (rec.decision === "approved" ? stage.verb : rec.decision === "returned" ? "Returned" : "Declined");
