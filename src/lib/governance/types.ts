/*
 * Governance model for the Rankings and Impact Hub: who can sign in, what each role may do, which
 * records an account can reach, how data is classified and retained, what is logged, what needs a
 * second pair of eyes, and how the platform is configured and recovered.
 *
 * A role decides what a user can do; the organizational scope on each role assignment decides which
 * records they can reach. Everything below is plain JSON so the store can persist it as one document.
 */

export type ISODate = string; // 2026-10-21
export type ISOTime = string; // 2026-10-21T08:30:00.000Z

/* ---------- Permissions ---------- */

export type ModuleKey =
  | "dashboard"
  | "rankings"
  | "evidence"
  | "data"
  | "stories"
  | "units"
  | "reports"
  | "knowledge"
  | "accounts"
  | "roles"
  | "directory"
  | "governance"
  | "security"
  | "audit"
  | "workflows"
  | "config"
  | "backup";

export type Action = "view" | "create" | "edit" | "delete" | "submit" | "approve" | "export" | "manage";

export type PermissionSet = Partial<Record<ModuleKey, Action[]>>;

/** Ranking bodies the Office works with. QS Sustainability sits under QS. */
export type BodyKey = "THE" | "QS" | "UI" | "WURI";

/** Which records a role assignment reaches. "all" means no restriction on that axis. */
export interface Scope {
  /** Organizational units; an assignment on a unit also reaches every unit beneath it. */
  units: "all" | string[];
  rankingBodies: "all" | BodyKey[];
  /** Reporting cycles, e.g. "2026–2027". */
  years: "all" | string[];
  datasets: "all" | string[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  /** Built-in roles from the governance policy; they cannot be edited or deleted, only duplicated. */
  system: boolean;
  /** Privilege tier. Nobody can grant a role above their own tier. */
  tier: number;
  /** Permission inheritance: this role starts from everything the parent grants. */
  inherits?: string;
  permissions: PermissionSet;
  /** Explicit exceptions: inherited actions this role does not get. */
  exceptions?: PermissionSet;
  /** What scope an assignment of this role normally carries. */
  scopeKind: "university" | "unit" | "custom";
  /** May hold destructive backup and restoration privileges. */
  technical?: boolean;
  createdAt: ISOTime;
  createdBy?: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  permissions: PermissionSet;
}

export interface Assignment {
  id: string;
  roleId: string;
  scope: Scope;
  grantedBy: string;
  grantedAt: ISOTime;
  /** Temporary access ends at the start of this day. */
  expires?: ISODate;
  note?: string;
}

/* ---------- Accounts and sessions ---------- */

export type AccountStatus = "Active" | "Pending Invitation" | "Suspended" | "Deactivated";

export interface Account {
  id: string;
  name: string;
  email: string;
  title: string;
  /** Home organizational unit. */
  unitId: string;
  status: AccountStatus;
  assignments: Assignment[];
  createdAt: ISOTime;
  invitedAt?: ISOTime;
  lastLogin?: ISOTime;
  /** Sign-in is through University Google Workspace; external collaborators use a sponsored guest identity. */
  identity: "Google Workspace" | "Sponsored guest";
  external?: boolean;
  mfa: { enrolled: boolean; method?: "Authenticator app" | "Security key" };
  /** Sessions started before this moment must sign in again. */
  reauthAfter?: ISOTime;
  statusReason?: string;
  statusChangedAt?: ISOTime;
  /**
   * Accounts idle past the inactivity policy are flagged for review. Choosing "keep active" records
   * when and by whom, which restarts the inactivity clock.
   */
  keptActive?: { at: ISOTime; by: string };
  transfers: { from: string; to: string; at: ISOTime; by: string }[];
  /** Temporary dataset access granted through an approved data access request. */
  dataGrants?: DataGrant[];
}

export interface DataGrant {
  datasetId: string;
  access: "View" | "Export";
  /** Access ends at the start of this day. */
  until: ISODate;
  requestId: string;
}

export interface Session {
  id: string;
  accountId: string;
  createdAt: ISOTime;
  lastSeen: ISOTime;
  mfa: boolean;
  device: string;
}

/** A sign-in that is waiting for its second factor. */
export interface Challenge {
  id: string;
  accountId: string;
  createdAt: ISOTime;
  next: string;
  attempts: number;
}

/* ---------- Organizational directory ---------- */

export type OrgKind =
  | "University"
  | "Office"
  | "Faculty"
  | "College"
  | "Institute"
  | "Research Centre"
  | "Department"
  | "Program";

export interface OrgUnit {
  id: string;
  code: string;
  name: string;
  kind: OrgKind;
  parentId: string | null;
  status: "Active" | "Archived";
  /** Designated administrators (account ids). The first is the unit's coordinator. */
  adminIds: string[];
  established?: ISODate;
  archivedAt?: ISOTime;
  archivedReason?: string;
  mergedInto?: string;
  history: { at: ISOTime; by: string; change: string }[];
}

/* ---------- Data governance ---------- */

export type Classification = "Public" | "Internal" | "Confidential" | "Restricted";
export type ExportPolicy = "Allowed" | "Approval required" | "Blocked";

export interface Dataset {
  id: string;
  name: string;
  description: string;
  ownerUnitId: string;
  stewardId: string;
  classification: Classification;
  /** Locked datasets cannot be reclassified (for example, results the ranking bodies already published). */
  locked?: string;
  retention: { years: number; then: "Archive" | "Review" | "Dispose" };
  exportPolicy: ExportPolicy;
  bodies: BodyKey[];
  /** Where the dataset appears outside the workspaces, if anywhere. */
  publicSurface?: string;
  personal: boolean;
  records: number;
  version: number;
  versions: { v: number; at: ISOTime; by: string; note: string }[];
  updatedAt: ISOTime;
}

export interface QualityRule {
  id: string;
  datasetId: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: "Error" | "Warning";
  /** Which check runs. "external" rules report results from the source system. */
  check: "period" | "files" | "beneficiaries" | "mapped" | "duplicates" | "replication" | "external";
  externalFailures?: number;
  lastRun?: ISOTime;
}

export interface DuplicateDecision {
  key: string;
  decision: "Merged" | "Dismissed";
  keep?: string;
  by: string;
  at: ISOTime;
}

export interface TermMeta {
  term: string;
  definition?: string;
  datasetId: string;
  stewardId: string;
  unitOfMeasure: string;
  updatedAt: ISOTime;
}

/* ---------- Privacy and security ---------- */

export interface AccessReview {
  id: string;
  name: string;
  scope: string;
  due: ISODate;
  status: "Scheduled" | "In progress" | "Complete";
  reviewerId: string;
  decisions: Record<string, "Keep" | "Revoke">;
  accountIds: string[];
}

export interface PrivacyAssessment {
  id: string;
  name: string;
  datasetId: string;
  risk: "Low" | "Medium" | "High";
  status: "Draft" | "In review" | "Approved";
  owner: string;
  updated: ISODate;
  measures: string;
}

export interface SubjectRequest {
  id: string;
  type: "Access" | "Correction" | "Erasure or blocking" | "Objection" | "Portability";
  subject: string;
  received: ISODate;
  due: ISODate;
  status: "Open" | "In progress" | "Fulfilled" | "Declined";
  handlerId: string;
  note?: string;
}

export interface SecurityAlert {
  id: string;
  at: ISOTime;
  severity: "Low" | "Medium" | "High";
  kind: "Suspicious sign-in" | "Repeated failed sign-ins" | "Unusual export" | "Privilege change" | "Policy change";
  accountId?: string;
  detail: string;
  status: "Open" | "Acknowledged" | "Resolved";
}

export interface SecretKey {
  id: string;
  name: string;
  purpose: string;
  algorithm: string;
  created: ISODate;
  rotated: ISODate;
  rotationDays: number;
}

export interface Incident {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  reported: ISOTime;
  reporterId: string;
  status: "Reported" | "Investigating" | "Escalated" | "Contained" | "Closed";
  personalData: boolean;
  escalatedTo?: string;
  timeline: { at: ISOTime; by: string; note: string }[];
}

export interface SecurityPolicy {
  mfa: { mode: "Everyone" | "Privileged roles" | "Off"; roles: string[]; methods: ("Authenticator app" | "Security key")[] };
  sso: { provider: string; enforced: boolean; domains: string[]; allowGuests: boolean };
  session: { idleMinutes: number; absoluteHours: number; warnMinutes: number };
  lockout: { attempts: number; windowMinutes: number };
  inactivityDays: number;
  exports: { approvalFor: Classification[]; blocked: Classification[]; watermark: boolean };
  sharing: { externalLinks: boolean; guestDownloads: boolean };
  privacy: { officer: string; email: string; noticeUpdated: ISODate; breachHours: number };
  encryption: { atRest: string; inTransit: string; secretsManager: string };
  reviews: AccessReview[];
  assessments: PrivacyAssessment[];
  subjectRequests: SubjectRequest[];
  alerts: SecurityAlert[];
  keys: SecretKey[];
  incidents: Incident[];
}

/* ---------- Audit ---------- */

export type AuditCategory =
  | "Account"
  | "Access"
  | "Session"
  | "Data"
  | "Approval"
  | "Export"
  | "Directory"
  | "Security"
  | "Configuration"
  | "Backup";

export interface AuditEvent {
  seq: number;
  at: ISOTime;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  category: AuditCategory;
  resource: { type: string; id: string; label: string };
  outcome: "Success" | "Denied" | "Failed";
  detail?: string;
  prev: string;
  hash: string;
}

/* ---------- Approval workflows ---------- */

export type WorkflowKey = "account-access" | "privilege-escalation" | "org-unit" | "data-access" | "publication" | "destructive";

export interface WorkflowStep {
  name: string;
  /** Any account holding one of these roles (with approve rights on workflows) may decide this step. */
  approverRoles: string[];
}

export interface Workflow {
  id: WorkflowKey;
  name: string;
  description: string;
  enabled: boolean;
  steps: WorkflowStep[];
  slaDays: number;
  /** The requester can never approve their own request. */
  separation: boolean;
}

export type RequestPayload =
  | { kind: "account-access"; name: string; email: string; unitId: string; roleId: string; title: string }
  | { kind: "privilege-escalation"; accountId: string; roleId: string; scope: Scope; expires?: ISODate }
  | { kind: "org-unit"; name: string; code: string; kind2: OrgKind; parentId: string }
  | { kind: "data-access"; accountId: string; datasetId: string; access: "View" | "Export"; until: ISODate }
  | { kind: "publication"; target: "story" | "report"; id: string; title: string }
  | { kind: "destructive"; operation: "restore" | "delete"; snapshotId: string };

export interface ApprovalRequest {
  id: string;
  workflowId: WorkflowKey;
  title: string;
  requesterId: string;
  requestedAt: ISOTime;
  justification: string;
  payload: RequestPayload;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  step: number;
  decisions: { step: number; by: string; at: ISOTime; decision: "Approved" | "Rejected"; note?: string }[];
  due: ISODate;
  completedAt?: ISOTime;
}

/* ---------- System configuration ---------- */

export interface BodyConfig {
  key: BodyKey | string;
  name: string;
  short: string;
  enabled: boolean;
  website: string;
}

export interface RankingConfig {
  slug: string;
  /** Tracked in the workspaces. */
  enabled: boolean;
  /** Shown on the public website. */
  public: boolean;
  deadline: ISODate;
}

export interface CycleConfig {
  id: string;
  status: "Current" | "Open" | "Closed" | "Archived";
}

export interface PeriodConfig {
  id: string;
  label: string;
  note: string;
  accepting: boolean;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  event: string;
  channel: "Email" | "In-app" | "Email and in-app";
  subject: string;
  body: string;
  enabled: boolean;
}

export interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  area: "Contributor workspace" | "Office workspace" | "Public website";
  enabled: boolean;
}

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  mode: "Off" | "Selected" | "Everyone";
  accounts: string[];
  units: string[];
  updatedAt: ISOTime;
}

export interface SystemConfig {
  bodies: BodyConfig[];
  rankings: RankingConfig[];
  cycles: CycleConfig[];
  academicYears: { id: string; current: boolean }[];
  periods: PeriodConfig[];
  uploads: { maxFileMB: number; maxFiles: number; types: string[] };
  templates: NotificationTemplate[];
  dashboard: { officeView: "submissions" | "rankings"; showClock: boolean; deadlineWarningDays: number };
  features: FeatureConfig[];
  flags: FeatureFlag[];
  site: { notice: string; noticeOn: boolean; asOf: ISODate };
}

/* ---------- Backup and recovery ---------- */

export interface RecoveryPoint {
  id: string;
  at: ISOTime;
  kind: "Full" | "Incremental" | "Manual";
  sizeMB: number;
  location: "Primary region" | "Off-site copy";
  status: "Completed" | "Failed";
  checksum: string;
  /** Recovery points taken by the Hub itself hold a copy of the governance store. */
  file?: string;
  verifiedAt?: ISOTime;
  expiresAt: ISODate;
}

export interface RestoreTest {
  id: string;
  at: ISOTime;
  pointId: string;
  result: "Passed" | "Failed";
  minutes: number;
  by: string;
  notes: string;
}

export interface BackupState {
  schedule: { full: string; incremental: string; retentionDays: number; monthlyMonths: number; offsite: boolean; encrypted: boolean };
  objectives: { rpoMinutes: number; rtoMinutes: number };
  points: RecoveryPoint[];
  tests: RestoreTest[];
  procedures: { id: string; title: string; owner: string; updated: ISODate; steps: string[] }[];
}

/* ---------- Records the workspaces write through the governance layer ---------- */

export interface EvidenceRecord {
  id: string;
  title: string;
  unitSlug: string;
  programId?: string;
  type: string;
  period: string;
  submitted: ISODate;
  submittedBy: string;
  status: "Validated" | "For review" | "Needs revision" | "Not yet submitted" | "Not applicable";
  stage: number;
  level: 1 | 2 | 3 | 4 | 5;
  mappedTo: string[];
  sdgs: number[];
  summary: string;
  result: string;
  beneficiaries: string;
  files: string[];
  comments: { by: string; role: string; date: ISODate; text: string }[];
}

export interface Notice {
  id: string;
  at: ISOTime;
  /** An account id, or "unit:<id>" for everyone in a unit, or "office" for Office reviewers. */
  to: string;
  text: string;
  href: string;
  templateId?: string;
  readBy: string[];
}

export interface Records {
  /** Changes to the sample evidence and every new submission, by id. */
  evidence: Record<string, EvidenceRecord>;
  /** Publication state of impact stories, by slug. */
  stories: Record<string, "Published" | "In review" | "Draft" | "Withdrawn">;
  /** Stories proposed through the contributor workspace. */
  proposals: { slug: string; title: string; unitSlug: string; by: string; at: ISOTime; sdgs: number[]; rankings: string[]; challenge: string; outcome: string }[];
  /** Reporting-period values entered in Submit data, by requirement id. */
  values: Record<string, { value: string; source: string; status: "For review" | "Validated" | "Needs revision"; by: string; at: ISOTime }>;
  /** Reports approved for publication outside the Office. */
  publishedReports: { id: string; title: string; at: ISOTime; by: string }[];
  innovations: { id: string; name: string; unitSlug: string; by: string; at: ISOTime; category: string }[];
  assistance: { id: string; topic: string; unitSlug: string; by: string; at: ISOTime; urgent: boolean }[];
  /** Grants of temporary dataset access created by approved data access requests. */
  counters: Record<string, number>;
}

/* ---------- The whole document ---------- */

export interface GovernanceState {
  schema: number;
  accounts: Account[];
  sessions: Session[];
  challenges: Challenge[];
  failures: { email: string; at: ISOTime }[];
  roles: Role[];
  templates: Template[];
  units: OrgUnit[];
  datasets: Dataset[];
  rules: QualityRule[];
  duplicates: DuplicateDecision[];
  terms: TermMeta[];
  security: SecurityPolicy;
  audit: AuditEvent[];
  workflows: Workflow[];
  requests: ApprovalRequest[];
  config: SystemConfig;
  backup: BackupState;
  records: Records;
  notices: Notice[];
}
