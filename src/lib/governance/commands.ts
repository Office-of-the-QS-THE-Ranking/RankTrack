/*
 * Every change to the governance store is one of these commands. The server authorizes, applies and
 * audits each one; the client only builds them. Type-only module, safe to import anywhere.
 */
import type {
  AccountStatus,
  Action,
  BodyKey,
  Classification,
  CycleConfig,
  ExportPolicy,
  FeatureFlag,
  Incident,
  ModuleKey,
  OrgKind,
  PermissionSet,
  PrivacyAssessment,
  RequestPayload,
  Scope,
  SecurityAlert,
  SecurityPolicy,
  SubjectRequest,
  SystemConfig,
  WorkflowKey,
  WorkflowStep,
} from "./types";

export interface InviteInput {
  name: string;
  email: string;
  title: string;
  unitId: string;
  roleId: string;
  scope?: Scope;
  expires?: string;
  external?: boolean;
}

export type Command =
  /* Accounts */
  | { type: "account.invite"; input: InviteInput }
  | { type: "account.import"; rows: { name: string; email: string; title: string; unit: string; role: string }[]; file: string }
  | { type: "account.update"; id: string; name?: string; title?: string }
  | { type: "account.status"; id: string; status: Exclude<AccountStatus, "Pending Invitation">; reason: string }
  | { type: "account.resend"; id: string }
  | { type: "account.revoke"; id: string }
  | { type: "account.reauth"; id: string }
  | { type: "account.transfer"; id: string; toUnitId: string; moveScope: boolean }
  | { type: "account.keep"; id: string }
  | { type: "assignment.add"; accountId: string; roleId: string; scope: Scope; expires?: string; note?: string }
  | { type: "assignment.remove"; accountId: string; assignmentId: string }
  /* Roles */
  | { type: "role.create"; name: string; description: string; inherits?: string; permissions: PermissionSet; exceptions?: PermissionSet; scopeKind: "university" | "unit" | "custom"; tier?: number }
  | { type: "role.update"; id: string; name?: string; description?: string; inherits?: string | null; permissions?: PermissionSet; exceptions?: PermissionSet; tier?: number }
  | { type: "role.delete"; id: string }
  /* Directory */
  | { type: "unit.create"; name: string; code: string; kind: OrgKind; parentId: string; justification: string }
  | { type: "unit.update"; id: string; name?: string; code?: string; adminIds?: string[] }
  | { type: "unit.move"; id: string; parentId: string }
  | { type: "unit.archive"; id: string; reason: string }
  | { type: "unit.reactivate"; id: string }
  | { type: "unit.merge"; id: string; intoId: string; reason: string }
  /* Data governance */
  | { type: "dataset.update"; id: string; classification?: Classification; stewardId?: string; ownerUnitId?: string; retention?: { years: number; then: "Archive" | "Review" | "Dispose" }; exportPolicy?: ExportPolicy; justification: string }
  | { type: "dataset.version"; id: string; note: string }
  | { type: "rule.toggle"; id: string; enabled: boolean }
  | { type: "rule.run" }
  | { type: "duplicate.resolve"; key: string; decision: "Merged" | "Dismissed"; keep?: string }
  | { type: "term.update"; term: string; definition?: string; unitOfMeasure?: string; stewardId?: string; datasetId?: string }
  | { type: "retention.run" }
  /* Privacy and security */
  | { type: "security.policy"; section: "mfa"; value: SecurityPolicy["mfa"] }
  | { type: "security.policy"; section: "sso"; value: SecurityPolicy["sso"] }
  | { type: "security.policy"; section: "session"; value: SecurityPolicy["session"] }
  | { type: "security.policy"; section: "lockout"; value: SecurityPolicy["lockout"] }
  | { type: "security.policy"; section: "inactivityDays"; value: number }
  | { type: "security.policy"; section: "exports"; value: SecurityPolicy["exports"] }
  | { type: "security.policy"; section: "sharing"; value: SecurityPolicy["sharing"] }
  | { type: "security.policy"; section: "privacy"; value: SecurityPolicy["privacy"] }
  | { type: "review.start"; name: string; population: "privileged" | "external" | "all"; due: string }
  | { type: "review.decide"; id: string; accountId: string; decision: "Keep" | "Revoke" }
  | { type: "review.complete"; id: string }
  | { type: "pia.save"; pia: Omit<PrivacyAssessment, "id" | "updated"> & { id?: string } }
  | { type: "dsr.create"; request: Pick<SubjectRequest, "type" | "subject" | "received"> }
  | { type: "dsr.update"; id: string; status: SubjectRequest["status"]; note?: string }
  | { type: "alert.update"; id: string; status: SecurityAlert["status"] }
  | { type: "key.rotate"; id: string }
  | { type: "incident.report"; title: string; severity: Incident["severity"]; personalData: boolean; note: string }
  | { type: "incident.update"; id: string; status: Incident["status"]; note: string; escalatedTo?: string }
  /* Audit */
  | { type: "audit.verify" }
  | { type: "audit.export"; ids: number[]; filters: string }
  /* Approval workflows */
  | { type: "request.create"; workflowId: WorkflowKey; payload: RequestPayload; justification: string; title?: string }
  | { type: "request.decide"; id: string; decision: "Approved" | "Rejected"; note?: string }
  | { type: "request.cancel"; id: string }
  | { type: "workflow.update"; id: WorkflowKey; enabled?: boolean; slaDays?: number; separation?: boolean; steps?: WorkflowStep[] }
  /* System configuration */
  | { type: "config.body"; key: string; enabled: boolean }
  | { type: "config.bodyAdd"; name: string; short: string; website: string }
  | { type: "config.ranking"; slug: string; enabled?: boolean; public?: boolean; deadline?: string }
  | { type: "config.cycle"; id: string; status: CycleConfig["status"] }
  | { type: "config.cycleAdd"; id: string }
  | { type: "config.year"; id: string }
  | { type: "config.yearAdd"; id: string }
  | { type: "config.period"; id: string; accepting?: boolean; label?: string; note?: string }
  | { type: "config.periodAdd"; label: string; note: string }
  | { type: "config.uploads"; value: SystemConfig["uploads"] }
  | { type: "config.template"; id: string; subject?: string; body?: string; enabled?: boolean }
  | { type: "config.dashboard"; value: Partial<SystemConfig["dashboard"]> }
  | { type: "config.feature"; id: string; enabled: boolean }
  | { type: "config.flag"; id: string; mode?: FeatureFlag["mode"]; accounts?: string[]; units?: string[] }
  | { type: "config.site"; notice?: string; noticeOn?: boolean }
  /* Backup and recovery */
  | { type: "backup.run" }
  | { type: "backup.test"; pointId: string }
  | { type: "backup.schedule"; retentionDays?: number; monthlyMonths?: number; offsite?: boolean }
  | { type: "backup.request"; operation: "restore" | "delete"; pointId: string; justification: string }
  | { type: "backup.reset" }
  /* Workspace records */
  | {
      type: "evidence.submit";
      unitSlug: string;
      input: {
        title: string;
        type: string;
        period: string;
        summary: string;
        result: string;
        beneficiaries: string;
        level: 1 | 2 | 3 | 4 | 5;
        sdgs: number[];
        files: { name: string; sizeMB: number }[];
        url: string;
        mappedTo: string[];
      };
    }
  | { type: "evidence.review"; id: string; decision: "accept" | "revise"; note: string }
  | { type: "evidence.map"; id: string; add?: string; remove?: string }
  | { type: "evidence.respond"; id: string; text: string; file?: string }
  | { type: "data.submit"; unitSlug: string; values: { id: string; label: string; value: string; source: string }[] }
  | {
      type: "story.propose";
      unitSlug: string;
      input: { title: string; challenge: string; response: string; figure: string; figureLabel: string; beneficiaries: string; sdgs: number[]; rankings: string[]; evidence: string[] };
    }
  | { type: "story.state"; slug: string; state: "Published" | "Withdrawn" }
  | { type: "innovation.propose"; unitSlug: string; name: string; category: string }
  | { type: "assistance.request"; unitSlug: string; topic: string; urgent: boolean; message: string }
  | { type: "report.export"; report: string; cycle: string; rows: number; datasets: string[] }
  | { type: "report.publish"; report: string; cycle: string; justification: string }
  | { type: "notice.read" };

export type CommandType = Command["type"];

export interface CommandResult {
  ok: boolean;
  message: string;
  /** Set when the change went to an approval workflow instead of applying at once. */
  requestId?: string;
  /** The export can proceed only after a data access request is approved. */
  needsApproval?: { datasetId: string; name: string };
  /** Extra payload for the caller (an id, a CSV, a verification result). */
  data?: unknown;
}

/** What a check on a permission looks like on the wire. */
export type PermissionCheck = [ModuleKey, Action];

export type { BodyKey };
