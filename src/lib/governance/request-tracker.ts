/*
 * The Submission Tracker: where an access request from the sign-in page stands, as the requester sees it on
 * /signin and the Office sees it in Accounts. Four stages: received, under review, the decision, and the
 * first sign-in. The requester sees only these stages, never who decided or the request's other details.
 */
import type { ApprovalRequest, ISOTime } from "./types";

export type StageState = "done" | "current" | "upcoming" | "stopped";

export interface TrackStage {
  key: "received" | "review" | "decision" | "signin";
  label: string;
  state: StageState;
  at?: ISOTime;
  /** One short line under the label. */
  detail?: string;
}

/** The one-word standing, for lists and pills. */
export type TrackStatus = "Under review" | "Approved" | "Signed in" | "Not approved" | "Withdrawn";

export interface Track {
  reference: string;
  status: TrackStatus;
  stages: TrackStage[];
  /** The email to sign in with, once approved. */
  email: string;
}

/** "rq-4", "RQ 0004" and "0004" all mean RQ-0004. */
export function normalizeReference(input: string): string {
  const digits = /^\s*(?:rq)?[\s-]*0*(\d{1,6})\s*$/i.exec(input)?.[1];
  return digits ? `RQ-${digits.padStart(4, "0")}` : "";
}

export function trackStatus(req: Pick<ApprovalRequest, "status">, signedIn: boolean): TrackStatus {
  if (req.status === "Approved") return signedIn ? "Signed in" : "Approved";
  if (req.status === "Rejected") return "Not approved";
  if (req.status === "Cancelled") return "Withdrawn";
  return "Under review";
}

/**
 * The stages for one request. `steps` is the number of approval steps in its workflow; `firstLogin` is when
 * the account it created first signed in, if it has.
 */
export function trackRequest(req: ApprovalRequest, steps: number, firstLogin?: ISOTime): Track {
  const email = req.payload.kind === "account-access" ? req.payload.email : "";
  const status = trackStatus(req, !!firstLogin);
  const decided = req.decisions.find((d) => d.decision === "Rejected") ?? req.decisions[req.decisions.length - 1];
  // Every submitted request enters review immediately.
  const reviewAt = req.requestedAt;
  const closed = req.status !== "Pending";

  const stages: TrackStage[] = [
    { key: "received", label: "Request received", state: "done", at: req.requestedAt },
    {
      key: "review",
      label: "Under review",
      state: closed ? "done" : "current",
      at: reviewAt,
      detail: !closed && steps > 1 ? `Step ${Math.min(req.step + 1, steps)} of ${steps}.` : undefined,
    },
  ];
  if (req.status === "Rejected") stages.push({ key: "decision", label: "Not approved", state: "stopped", at: req.completedAt, detail: decided?.note });
  else if (req.status === "Cancelled") stages.push({ key: "decision", label: "Withdrawn", state: "stopped", at: req.completedAt, detail: "This request was withdrawn." });
  else
    stages.push({
      key: "decision",
      label: req.status === "Approved" ? "Approved" : "Decision",
      state: req.status === "Approved" ? "done" : "upcoming",
      at: req.status === "Approved" ? req.completedAt : undefined,
      detail: req.status === "Approved" ? "Your account is ready." : undefined,
    });
  if (req.status === "Pending" || req.status === "Approved")
    stages.push({
      key: "signin",
      label: firstLogin ? "Signed in" : "First sign-in",
      state: firstLogin ? "done" : req.status === "Approved" ? "current" : "upcoming",
      at: firstLogin,
      detail: req.status === "Approved" && !firstLogin ? `Sign in with ${email}.` : undefined,
    });

  return { reference: req.id, status, stages, email };
}
