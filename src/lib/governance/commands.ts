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
  DocumentCoverTone,
  DocumentFile,
  DocumentKind,
  ExportPolicy,
  FeatureFlag,
  Incident,
  ModuleKey,
  OrgKind,
  PostMedia,
  PrivacyAssessment,
  PermissionSet,
  RequestPayload,
  RoleId,
  Scope,
  SecurityAlert,
  SecurityPolicy,
  SubjectRequest,
  SystemConfig,
  WorkflowKey,
  WorkflowStep,
  WorkspaceShelf,
  WorkingDocStatus,
} from "./types";
import type { FormKind, FormSchema, FormStatus } from "@/lib/forms/types";
import type { PersonInput } from "./person-details";

/**
 * Who is invited, in the Request access form's fields (person-details.ts): University of Santo Tomas brings a
 * role and unit, any other affiliation an External guest of the Office. Scope and end date are the inviter's.
 */
export interface InviteInput extends PersonInput {
  scope?: Scope;
  expires?: string;
}

/** What the post composer sends. */
export interface PostInput {
  title: string;
  subtitle: string;
  sdgs: number[];
  themes: string[];
  hashtags: string[];
  layout: "cover" | "feature" | "split" | "essay" | "banner" | "gallery" | "magazine" | "alternate";
  thumbnail: PostMedia | null;
  body: string;
  photos: PostMedia[];
}

/** What the research article and report form sends. */
export interface DocumentInput {
  title: string;
  authors: string[];
  venue: string;
  type: string;
  abstract: string;
  issued: string;
  doi: string;
  url: string;
  file: DocumentFile | null;
  sdgs: number[];
  keywords: string[];
  unitSlug: string;
  featured: boolean;
  coverTone?: DocumentCoverTone;
}

export type Command =
  | { type: "role.permissions"; id: RoleId; scope: "unit" | "university"; permissions: PermissionSet; previous: PermissionSet }
  /* Accounts */
  | { type: "account.invite"; input: InviteInput }
  | { type: "account.update"; id: string; name?: string; title?: string }
  | { type: "account.status"; id: string; status: Exclude<AccountStatus, "Pending Invitation">; reason: string }
  | { type: "account.resend"; id: string }
  | { type: "account.revoke"; id: string }
  | { type: "account.reauth"; id: string }
  | { type: "account.transfer"; id: string; toUnitId: string; moveScope: boolean }
  | { type: "account.keep"; id: string }
  | { type: "assignment.add"; accountId: string; roleId: RoleId; scope: Scope; expires?: string; note?: string }
  | { type: "assignment.remove"; accountId: string; assignmentId: string }
  /* Directory */
  | { type: "unit.create"; name: string; code: string; kind: OrgKind; parentId: string; justification?: string; emails?: string[]; emblem?: { src: string; width: number; height: number } }
  | { type: "unit.update"; id: string; name?: string; code?: string; adminIds?: string[]; emails?: string[]; emblem?: { src: string; width: number; height: number } | null }
  | { type: "unit.coordinator"; id: string; accountId: string; operation: "add" | "remove" }
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
  | { type: "request.decide"; id: string; decision: "Approved" | "Rejected"; note?: string; unitId?: string }
  | { type: "request.cancel"; id: string }
  | { type: "request.review"; id: string }
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
  /** A ranking's deadline and the other dates in its calendar, set by hand on the ranking's page. */
  | { type: "deadline.set"; slug: string; deadline?: string; entries?: { id?: string; label: string; due: string }[] }
  | { type: "deadline.apply"; id: string }
  | { type: "deadline.dismiss"; id: string }
  /* Backup and recovery */
  | { type: "backup.run" }
  | { type: "backup.test"; pointId: string }
  | { type: "backup.schedule"; retentionDays?: number; monthlyMonths?: number; offsite?: boolean }
  | { type: "backup.request"; operation: "restore" | "delete"; pointId: string; justification: string }
  /* Workspace records */
  | {
      type: "evidence.submit";
      unitSlug: string;
      input: {
        title: string;
        type: string;
        period: string;
        background?: string;
        summary: string;
        result: string;
        beneficiaries: string;
        verifiedBy?: string;
        level: 1 | 2 | 3 | 4 | 5;
        sdgs: number[];
        /** Uploaded through startEvidenceUploads; sizes are re-read from storage on the server. */
        files: { name: string; sizeMB: number; src: string; kind?: string }[];
        /** One public page, from older clients; newer ones send `links`. */
        url?: string;
        links?: { url: string; label: string }[];
        references?: { title: string; source: string; url: string }[];
        mappedTo: string[];
      };
    }
  | { type: "evidence.review"; id: string; decision: "accept" | "revise"; note: string }
  | { type: "evidence.map"; id: string; add?: string; remove?: string }
  | { type: "evidence.respond"; id: string; text: string; file?: { name: string; sizeMB: number; src: string } }
  | { type: "data.submit"; unitSlug: string; values: { id: string; label: string; value: string; source: string }[] }
  | {
      type: "story.propose";
      unitSlug: string;
      input: { title: string; challenge: string; response: string; figure: string; figureLabel: string; beneficiaries: string; sdgs: number[]; rankings: string[]; evidence: string[] };
    }
  | { type: "story.state"; slug: string; state: "Published" | "Withdrawn" }
  /* Stories & News posts. `from` names a story or a unit's proposal the new post takes over. */
  | { type: "post.save"; id?: string; from?: string; input: PostInput; publish: boolean }
  | { type: "post.status"; id: string; status: "Published" | "Unpublished" | "Draft" }
  | { type: "post.delete"; id: string }
  /* Research articles and reports */
  | { type: "document.save"; id?: string; kind: DocumentKind; input: DocumentInput; publish: boolean }
  | { type: "document.status"; id: string; status: "Published" | "Unpublished" | "Draft" }
  | { type: "document.delete"; id: string }
  /* Workspace files. No unitId: the Office's shared files. Sizes are read from storage on the server. */
  | { type: "workspace.add"; unitId?: string; shelf: WorkspaceShelf; folderId: string; files: { name: string; src: string; bytes?: number }[] }
  | { type: "workspace.edit"; id: string; name?: string; folderId?: string; shelf?: WorkspaceShelf }
  /** Without `id`, a new folder; with it, a rename or (with `parentId`, "" for the top level) a move. */
  | { type: "workspace.folder"; id?: string; unitId?: string; shelf: WorkspaceShelf; parentId?: string; name: string }
  | { type: "workspace.folderDelete"; id: string }
  | { type: "workspace.archive"; ids: string[]; archived: boolean }
  | { type: "workspace.delete"; ids: string[] }
  /* Working Documents: links a unit (or, with no unitId, the Office) keeps. No id: a new document. */
  | { type: "workdoc.save"; id?: string; unitId?: string; title: string; date: string; rankings: string[]; sdgs?: number[]; authors?: string[]; status: WorkingDocStatus; links: string[]; remarks?: string }
  | { type: "workdoc.status"; id: string; status: WorkingDocStatus }
  | { type: "workdoc.delete"; ids: string[] }
  /* Digital Forms. No id: a new form, which needs its schema. No unitId: the Office's. Responses aren't commands
     (app/actions/forms.ts writes them straight to form_responses). */
  | { type: "form.save"; id?: string; unitId?: string; title: string; description?: string; kind: FormKind; reference?: string; issuerId?: string; closesOn?: string; prefix?: string; copies?: boolean; schema?: FormSchema }
  | { type: "form.status"; id: string; status: FormStatus }
  | { type: "form.duplicate"; id: string }
  | { type: "form.delete"; id: string }
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
