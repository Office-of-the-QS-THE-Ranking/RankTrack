/*
 * Governance model for the Rankings and Impact Hub: who can sign in, what each role may do, which
 * records an account can reach, how data is classified and retained, what is logged, what needs a
 * second pair of eyes, and how the platform is configured and recovered.
 *
 * A role decides what a user can do; the organizational scope on each role assignment decides which
 * records they can reach. The store keeps each entity in its own Supabase table (server/db/rows.ts maps
 * this model to them); the domain engine works on this model in memory, one transaction at a time.
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
  | "posts"
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

/** The Hub's four roles. They are fixed: what each one may do is set in catalog.ts, not in the store. */
export type RoleId = "administrator" | "coordinator" | "student" | "external";

export interface Role {
  id: RoleId;
  name: string;
  description: string;
  /** Higher ranks hold more. Giving an active account a higher-ranked role than it holds is privilege escalation. */
  tier: number;
  permissions: PermissionSet;
  /** What the role holds instead when an assignment of it is University-wide (an Administrator of the Rankings Office runs the Hub). */
  universityPermissions?: PermissionSet;
  /** What scope an assignment of this role normally carries. */
  scopeKind: "university" | "unit" | "custom";
}

export interface Assignment {
  id: string;
  roleId: RoleId;
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
  /** Google profile photo, refreshed at each sign-in. */
  avatar?: string;
  /** Home organizational unit. */
  unitId: string;
  status: AccountStatus;
  assignments: Assignment[];
  /** The assignment they act in, one role at a time; absent, or ended, means their highest. */
  activeAssignment?: string;
  createdAt: ISOTime;
  invitedAt?: ISOTime;
  lastLogin?: ISOTime;
  /** The account's first sign-in (the Submission Tracker's last stage). */
  firstLogin?: ISOTime;
  /** Sign-in is through University Google Workspace; external collaborators use a sponsored guest identity. */
  identity: "Google Workspace" | "Sponsored guest";
  external?: boolean;
  /** Their names, salutation and affiliation, from the invitation or the approved access request. */
  profile?: AccountProfile;
  mfa: { enrolled: boolean; method?: "Authenticator app" | "Security key" };
  /** Sessions started before this moment must sign in again. */
  reauthAfter?: ISOTime;
  /**
   * The person's own session choices: a shorter idle sign-out than the policy, or staying signed in (no idle
   * sign-out, and the cookie outlives the browser). The policy's longest session always applies.
   */
  sessionPrefs?: { idleMinutes?: number; stay?: boolean };
  /** The person's own notification choices: email on or off, and the kind:channel pairs switched off. */
  notifyPrefs?: { email?: boolean; off?: string[] };
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
  | "School"
  | "Student Government"
  | "Research Centre";

export interface OrgUnit {
  id: string;
  /** Stable reference to the supplied UST directory, independent of editable names and codes. */
  directoryKey?: string;
  code: string;
  name: string;
  kind: OrgKind;
  parentId: string | null;
  status: "Active" | "Archived";
  /** Designated coordinators (account ids). A unit can have several. */
  adminIds: string[];
  /** The unit's own contact addresses, shown on its profile. */
  emails?: string[];
  /** A logo uploaded in the Directory. Shown in place of the University's official arms (unit-emblems.ts). */
  emblem?: { src: string; width: number; height: number };
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
  mfa: { mode: "Everyone" | "Privileged roles" | "Off"; roles: RoleId[]; methods: ("Authenticator app" | "Security key")[] };
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

/** Anyone with approve rights on workflows (the University-wide Administrators) may decide a step. */
export interface WorkflowStep {
  name: string;
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

/**
 * Who a person is, in the fields the Request access form and the invite drawer share (person-details.ts): kept
 * on the account from its invitation or its approved request.
 */
export interface AccountProfile {
  lastName: string;
  firstName: string;
  middleName?: string;
  /** The preferred salutation (Dr., Prof., …); left out when they prefer not to specify. */
  salutation?: string;
  /** A listed affiliation, or their own words when none matched (listed: false, shown as Others). */
  affiliation: string;
  listed: boolean;
  /** The organization named for "International Accreditation Organization (Specify)". */
  organization?: string;
  /** For an organization not on the list: its website (https only), only ever shown as text. */
  website?: string;
}

/** Who asked for an account from the sign-in page, as they gave it (access-requests.ts). */
export interface Applicant extends AccountProfile {
  /** Empty once removed, a month after the request closed (housekeeping). */
  birthday: ISODate | "";
  /** A Thomasian: on a University email, asking to be an Administrator, Coordinator or Student. */
  thomasian?: boolean;
  /** A Thomasian's college, faculty or office as they gave it; the approver confirms or changes it. */
  unitId?: string;
  /** When the requester accepted the declarations, the Data Privacy Notice and the Terms of Use. */
  agreedAt?: string;
}

export type RequestPayload =
  | {
      kind: "account-access";
      name: string;
      email: string;
      /** Empty when the request came without one: the approver chooses it. */
      unitId: string;
      roleId: RoleId;
      title: string;
      applicant?: Applicant;
      /** Outside the University's sign-in domains: a sponsored guest whose access ends GUEST_DAYS after approval. */
      external?: boolean;
    }
  | { kind: "privilege-escalation"; accountId: string; roleId: RoleId; scope: Scope; expires?: ISODate }
  | { kind: "org-unit"; name: string; code: string; kind2: OrgKind; parentId: string; emails?: string[]; emblem?: OrgUnit["emblem"] }
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
  /** When an approver marked it under review (the Submission Tracker shows it). */
  reviewing?: { by: string; at: ISOTime };
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
  /** Where the deadline came from once someone changed it: set by hand, or read from the ranking body's website. */
  deadlineSource?: "Manual" | "Automatic";
  deadlineUrl?: string;
  deadlineBy?: string;
  deadlineAt?: ISOTime;
}

/** A date in a ranking's calendar besides its deadline: a survey window, a portal closing in stages. */
export interface CalendarEntry {
  id: string;
  slug: string;
  label: string;
  due: ISODate;
  source: "Manual" | "Automatic";
  /** The page an automatic date was read from. */
  url?: string;
  by: string;
  at: ISOTime;
}

/** A date the deadline check read that differs from the Hub's, waiting for the Office. */
export interface DeadlineFinding {
  id: string;
  /** deadline_sources.id */
  sourceId: string;
  slug: string;
  /** The ranking's deadline, or another date in its calendar (matched by label). */
  target: "deadline" | "milestone";
  label: string;
  due: ISODate;
  /** The words the date was read from. */
  quote: string;
  url: string;
  foundAt: ISOTime;
  state: "New" | "Applied" | "Dismissed";
  decidedBy?: string;
  decidedAt?: ISOTime;
}

/** A source's last reading. */
export interface DeadlineWatch {
  /** deadline_sources.id */
  id: string;
  checkedAt: ISOTime;
  /** Read: dates or page read; Waiting: the page isn't published yet; Failed: unreadable or no longer says when. */
  status: "Read" | "Waiting" | "Failed" | "Manual";
  /** What was read, to tell when the page changes. */
  hash?: string;
  changedAt?: ISOTime;
  note: string;
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
  /** Dates in each ranking's calendar besides its deadline. */
  calendar: CalendarEntry[];
  /** What the deadline check read, newest first. */
  findings: DeadlineFinding[];
  watch: DeadlineWatch[];
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
  /** The submitting account; separation of duties compares this, not the name. Absent on older records. */
  submittedById?: string;
  status: "Validated" | "For review" | "Needs revision" | "Not yet submitted" | "Not applicable";
  stage: number;
  level: 1 | 2 | 3 | 4 | 5;
  mappedTo: string[];
  sdgs: number[];
  summary: string;
  result: string;
  beneficiaries: string;
  files: string[];
  /** Files uploaded to the private media bucket, served from /media/evidence/… to people who may see the record. */
  attachments?: EvidenceFile[];
  comments: { by: string; role: string; date: ISODate; text: string }[];
}

export interface EvidenceFile {
  name: string;
  src: string;
  bytes: number;
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

/** A picture in a post. Uploads live in the private media bucket and are served from /media/…; the Hub's own photographs from /media/site/photos/…. */
export interface PostMedia {
  src: string;
  /** Pixel size, or 0 when unknown (the Hub's own photographs). */
  width: number;
  height: number;
  /** What the picture shows, for screen readers. */
  alt: string;
}

export type PostStatus = "Draft" | "In review" | "Published" | "Unpublished";

/** A post in the Impact and Innovation library, written in the Office workspace's composer. */
export interface PostRecord {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  sdgs: number[];
  themes: string[];
  /** Without the #. Missing on posts written before hashtags. */
  hashtags?: string[];
  /** How the public website lays the post out (lib/governance/posts.ts POST_LAYOUTS); "cover" when missing. */
  layout?: "cover" | "feature" | "split" | "essay" | "banner" | "gallery" | "magazine" | "alternate";
  /** Shown in lists and at the top of the post. Without one, the first photo stands in. */
  thumbnail: PostMedia | null;
  /** The editor's rich text (lib/rich-text.ts), or plain text from before it, where a blank line starts a paragraph. */
  body: string;
  photos: PostMedia[];
  status: PostStatus;
  /** Who wrote it. A unit's story proposal that the Office took over keeps its proposer. */
  authorId: string;
  /** The unit a story proposal came from. */
  unitSlug?: string;
  createdAt: ISOTime;
  updatedAt: ISOTime;
  updatedBy: string;
  /** When it first reached the public website. */
  publishedAt?: ISOTime;
}

export interface Records {
  /** Changes to the sample evidence and every new submission, by id. */
  evidence: Record<string, EvidenceRecord>;
  /** Impact and Innovation posts, newest first. */
  posts: PostRecord[];
  /** When anonymous post view counting began (the counts are in hub_post_views). */
  postViewsStartedAt: ISOTime;
  /** Publication state of impact stories, by slug. "Deleted": one of the Hub's own stories that became a post. */
  stories: Record<string, "Published" | "In review" | "Draft" | "Withdrawn" | "Deleted">;
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

/* ---------- The whole model ---------- */

/** The last sealed audit entry: where the next one continues the chain. */
export interface AuditHead {
  seq: number;
  hash: string;
}

export interface GovernanceState {
  schema: number;
  accounts: Account[];
  sessions: Session[];
  challenges: Challenge[];
  failures: { email: string; at: ISOTime }[];
  units: OrgUnit[];
  datasets: Dataset[];
  rules: QualityRule[];
  duplicates: DuplicateDecision[];
  terms: TermMeta[];
  security: SecurityPolicy;
  /** The end of the audit trail (audit_events). New entries are sealed onto it as a transaction commits. */
  auditHead: AuditHead;
  /** The last day of the audit trail, plus entries sealed in this transaction. The full trail is queried from audit_events. */
  recentAudit: AuditEvent[];
  workflows: Workflow[];
  requests: ApprovalRequest[];
  config: SystemConfig;
  backup: BackupState;
  records: Records;
  notices: Notice[];
}
