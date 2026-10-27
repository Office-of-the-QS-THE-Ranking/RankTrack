/*
 * The starting state of the governance store: the University directory (from Supabase's unit_directory),
 * datasets, policies, workflows and configuration, and nothing else. No accounts, records, requests or history: the first University
 * Administrator is created at their first Google sign-in (bootstrapAdmin in server/signin.ts) and
 * invites everyone else from the Administration console. The roles are fixed in catalog.ts.
 */
import type { Reference } from "@/lib/reference";
import { importUstDirectory } from "./directory";
import type { AuditEvent, Dataset, GovernanceState, OrgUnit, QualityRule, TermMeta, Workflow } from "./types";

export const SCHEMA = 10;

export const SYSTEM_ACTOR = { id: "system", name: "Hub automation", role: "System" };

/* ---------- Directory ---------- */

/** The University itself; every unit of the directory (unit_directory) is imported beneath it. */
const university = (at: string): OrgUnit => ({
  id: "ust", code: "UST", name: "University of Santo Tomas", kind: "University", parentId: null, status: "Active", adminIds: [],
  established: "1611-04-28", history: [{ at, by: "system", change: "Created with the Hub" }],
});

/* ---------- Data governance ---------- */

type DatasetDraft = Omit<Dataset, "stewardId" | "records" | "version" | "versions" | "updatedAt">;

const DATASETS: DatasetDraft[] = [
  {
    id: "DS-RESULTS",
    name: "Published ranking results",
    description: "Results as the ranking bodies published them, with editions and bands.",
    ownerUnitId: "rankings-office",
    classification: "Public",
    locked: "Already published by the ranking bodies; the Office reports them as published.",
    retention: { years: 25, then: "Archive" },
    exportPolicy: "Allowed",
    bodies: ["THE", "QS", "UI", "WURI"],
    publicSurface: "Rankings pages and the home page of the public website",
    personal: false,
  },
  {
    id: "DS-STORIES",
    name: "Impact stories and innovations",
    description: "Approved impact stories with outcomes, beneficiaries and replication guidance.",
    ownerUnitId: "rankings-office",
    classification: "Public",
    retention: { years: 10, then: "Archive" },
    exportPolicy: "Allowed",
    bodies: ["THE", "QS", "WURI"],
    publicSurface: "Publications pages of the public website",
    personal: false,
  },
  {
    id: "DS-EVIDENCE",
    name: "Evidence submissions",
    description: "Every document, figure and narrative units submit, with review history and indicator mappings.",
    ownerUnitId: "rankings-office",
    classification: "Internal",
    retention: { years: 7, then: "Review" },
    exportPolicy: "Approval required",
    bodies: ["THE", "QS", "UI", "WURI"],
    personal: false,
  },
  {
    id: "DS-INDICATORS",
    name: "Indicator values and readiness",
    description: "Current values, targets and readiness for every indicator the Office tracks.",
    ownerUnitId: "rankings-office",
    classification: "Internal",
    retention: { years: 7, then: "Archive" },
    exportPolicy: "Allowed",
    bodies: ["THE", "QS", "UI", "WURI"],
    personal: false,
  },
  {
    id: "DS-RESEARCH",
    name: "Research outputs and citations",
    description: "Indexed publications, citations and co-authorship from the bibliometric sources the rankings use.",
    ownerUnitId: "vrri",
    classification: "Internal",
    retention: { years: 10, then: "Archive" },
    exportPolicy: "Allowed",
    bodies: ["THE", "QS"],
    personal: false,
  },
  {
    id: "DS-FINANCE",
    name: "Research and industry income",
    description: "Research grants and industry contracts by financial year, converted at purchasing-power parity.",
    ownerUnitId: "industry",
    classification: "Confidential",
    retention: { years: 7, then: "Review" },
    exportPolicy: "Approval required",
    bodies: ["THE"],
    personal: false,
  },
  {
    id: "DS-STAFF",
    name: "Academic staff FTE and qualifications",
    description: "Full-time-equivalent academic staff with qualifications and nationality, aggregated by unit for the rankings.",
    ownerUnitId: "hrd",
    classification: "Confidential",
    retention: { years: 5, then: "Dispose" },
    exportPolicy: "Approval required",
    bodies: ["THE", "QS"],
    personal: true,
  },
  {
    id: "DS-STUDENTS",
    name: "Student and graduate outcomes",
    description: "Enrolment, international students and graduate employment from the tracer study.",
    ownerUnitId: "careers",
    classification: "Confidential",
    retention: { years: 5, then: "Dispose" },
    exportPolicy: "Approval required",
    bodies: ["QS"],
    personal: true,
  },
  {
    id: "DS-SURVEY",
    name: "Reputation survey contact lists",
    description: "Academic and employer contacts nominated for the QS and THE reputation surveys.",
    ownerUnitId: "rankings-office",
    classification: "Restricted",
    retention: { years: 2, then: "Dispose" },
    exportPolicy: "Blocked",
    bodies: ["QS", "THE"],
    personal: true,
  },
  {
    id: "DS-CAMPUS",
    name: "Campus operations: energy, water and waste",
    description: "Metered energy, water, waste and transport figures for UI GreenMetric, QS Sustainability and THE Impact.",
    ownerUnitId: "fmo",
    classification: "Internal",
    retention: { years: 10, then: "Archive" },
    exportPolicy: "Allowed",
    bodies: ["UI", "QS", "THE"],
    personal: false,
  },
  {
    id: "DS-PARTNERS",
    name: "International partnerships and mobility",
    description: "Partner institutions, agreements, and inbound and outbound mobility.",
    ownerUnitId: "oirp",
    classification: "Internal",
    retention: { years: 7, then: "Archive" },
    exportPolicy: "Allowed",
    bodies: ["QS", "THE", "WURI"],
    personal: false,
  },
  {
    id: "DS-ACCESS",
    name: "Accounts, roles and audit records",
    description: "Who can sign in, what each account may do, and the audit trail of the Hub itself.",
    ownerUnitId: "it-services",
    classification: "Restricted",
    retention: { years: 5, then: "Review" },
    exportPolicy: "Blocked",
    bodies: [],
    personal: true,
  },
];

const RULES: QualityRule[] = [
  { id: "QR-01", datasetId: "DS-EVIDENCE", name: "Reporting period inside the cycle window", description: "Evidence must cover 2025 or academic year 2025–2026. Earlier periods are returned unless they correct last cycle.", enabled: true, severity: "Error", check: "period" },
  { id: "QR-02", datasetId: "DS-EVIDENCE", name: "A file or public URL is attached", description: "Every submission carries at least one source document.", enabled: true, severity: "Error", check: "files" },
  { id: "QR-03", datasetId: "DS-EVIDENCE", name: "Beneficiaries stated for outcome evidence", description: "Narratives and outcomes name who benefited and how many.", enabled: true, severity: "Warning", check: "beneficiaries" },
  { id: "QR-04", datasetId: "DS-EVIDENCE", name: "Mapped to at least one indicator", description: "Unmapped evidence cannot count in any ranking.", enabled: true, severity: "Error", check: "mapped" },
  { id: "QR-05", datasetId: "DS-EVIDENCE", name: "No duplicate submissions", description: "Near-identical titles from the same unit are flagged for merging.", enabled: true, severity: "Warning", check: "duplicates" },
  { id: "QR-06", datasetId: "DS-STORIES", name: "Published stories give replication guidance", description: "Other universities must be able to adapt the practice.", enabled: true, severity: "Warning", check: "replication" },
  { id: "QR-07", datasetId: "DS-CAMPUS", name: "Twelve monthly meter readings per building", description: "Reported by the building management system.", enabled: true, severity: "Warning", check: "external", externalFailures: 0 },
  { id: "QR-08", datasetId: "DS-STAFF", name: "Staff counted as full-time equivalents", description: "Part-time staff count as fractions, never as headcount.", enabled: true, severity: "Error", check: "external", externalFailures: 0 },
  { id: "QR-09", datasetId: "DS-STUDENTS", name: "Tracer responses within 12 months of graduation", description: "Reported by the Office for Career Services.", enabled: true, severity: "Warning", check: "external", externalFailures: 0 },
];

const TERMS: [term: string, datasetId: string, unitOfMeasure: string][] = [
  ["Citations", "DS-RESEARCH", "citations"],
  ["H-index", "DS-RESEARCH", "index"],
  ["Faculty FTE", "DS-STAFF", "full-time equivalents"],
  ["International co-authorship", "DS-RESEARCH", "% of papers"],
  ["Employer reputation", "DS-SURVEY", "survey responses"],
  ["Research income", "DS-FINANCE", "₱ at purchasing-power parity"],
  ["Water recycled", "DS-CAMPUS", "m³"],
  ["Carbon emissions", "DS-CAMPUS", "tCO₂e"],
  ["Beneficiaries", "DS-EVIDENCE", "people"],
  ["Public evidence URL", "DS-EVIDENCE", "URL"],
  ["Graduate employment", "DS-STUDENTS", "% of graduates"],
  ["Innovation programme", "DS-STORIES", "programmes"],
];

/* ---------- Workflows ---------- */

export const WORKFLOWS: Workflow[] = [
  {
    id: "account-access",
    name: "Account access requests",
    description: "Someone asks for an account from the sign-in page, or an administrator asks for one on a colleague's behalf.",
    enabled: true,
    steps: [{ name: "Account review" }],
    slaDays: 3,
    separation: true,
  },
  {
    id: "privilege-escalation",
    name: "Privilege escalation",
    description: "Giving an active account a role above the one it holds, such as making a Coordinator an Administrator.",
    enabled: true,
    steps: [{ name: "Second administrator sign-off" }],
    slaDays: 2,
    separation: true,
  },
  {
    id: "org-unit",
    name: "New organizational units",
    description: "Adding a college, faculty, department, programme, office or research centre to the directory.",
    enabled: true,
    steps: [{ name: "Directory review" }],
    slaDays: 5,
    separation: true,
  },
  {
    id: "data-access",
    name: "Data access requests",
    description: "Temporary access to, or an export of, a dataset the requester cannot already reach.",
    enabled: true,
    steps: [{ name: "Data oversight review" }],
    slaDays: 3,
    separation: true,
  },
  {
    id: "publication",
    name: "Publication of rankings reports and stories",
    description: "Nothing reaches the public website or leaves the Office without two approvals.",
    enabled: true,
    steps: [{ name: "Evidence review" }, { name: "Publication approval" }],
    slaDays: 5,
    separation: true,
  },
  {
    id: "destructive",
    name: "Destructive backup operations",
    description: "Restoring the platform from a recovery point, or deleting one. A second University-wide Administrator must agree.",
    enabled: true,
    steps: [{ name: "Second administrator sign-off" }],
    slaDays: 1,
    separation: true,
  },
];

/* ---------- The document ---------- */

/** The directory comes from unit_directory and the tracked rankings from ranking_frameworks (the reference data). */
export function buildSeed(ref: Pick<Reference, "directory" | "rankings">, now = new Date()): Omit<GovernanceState, "auditHead" | "recentAudit"> & { audit: Omit<AuditEvent, "prev" | "hash" | "seq">[] } {
  const at = now.toISOString();
  const day = at.slice(0, 10);
  return {
    schema: SCHEMA,
    accounts: [],
    sessions: [],
    challenges: [],
    failures: [],
    units: importUstDirectory([university(at)], ref.directory, at),
    datasets: DATASETS.map((d) => ({ ...d, stewardId: "", records: 0, version: 1, versions: [{ v: 1, at, by: "system", note: "Created with the Hub" }], updatedAt: at })),
    rules: RULES,
    duplicates: [],
    terms: TERMS.map(([term, datasetId, unitOfMeasure]): TermMeta => ({ term, datasetId, stewardId: "", unitOfMeasure, updatedAt: at })),
    security: {
      // Google Workspace's own 2-Step Verification protects sign-in; the Hub asks for no second factor.
      mfa: { mode: "Off", roles: [], methods: ["Authenticator app", "Security key"] },
      sso: { provider: "Google Workspace", enforced: true, domains: ["ust.edu.ph"], allowGuests: false },
      session: { idleMinutes: 30, absoluteHours: 12, warnMinutes: 2 },
      lockout: { attempts: 5, windowMinutes: 15 },
      inactivityDays: 90,
      exports: { approvalFor: ["Confidential"], blocked: ["Restricted"], watermark: true },
      sharing: { externalLinks: false, guestDownloads: false },
      privacy: { officer: "University Data Protection Officer", email: "rankings.office@ust.edu.ph", noticeUpdated: day, breachHours: 72 },
      encryption: { atRest: "AES-256 (Supabase)", inTransit: "TLS 1.2 or later", secretsManager: "Server environment variables" },
      reviews: [],
      assessments: [],
      subjectRequests: [],
      alerts: [],
      keys: [
        { id: "KEY-DB", name: "Supabase secret key", purpose: "Lets the Hub's server read and write the governance store", algorithm: "Supabase API key", created: day, rotated: day, rotationDays: 180 },
        { id: "KEY-SSO", name: "Google OAuth client secret", purpose: "Single sign-on with the University's Google Workspace, through Supabase Auth", algorithm: "OAuth 2.0 client secret", created: day, rotated: day, rotationDays: 180 },
      ],
      incidents: [],
    },
    audit: [],
    workflows: WORKFLOWS,
    requests: [],
    config: {
      bodies: [
        { key: "THE", name: "Times Higher Education", short: "THE", enabled: true, website: "https://www.timeshighereducation.com/world-university-rankings" },
        { key: "QS", name: "QS Quacquarelli Symonds", short: "QS", enabled: true, website: "https://www.topuniversities.com" },
        { key: "UI", name: "UI GreenMetric", short: "UI GreenMetric", enabled: true, website: "https://greenmetric.ui.ac.id" },
        { key: "WURI", name: "World University Rankings for Innovation", short: "WURI", enabled: true, website: "https://www.wuri.world" },
        { key: "AHE", name: "AppliedHE Private University Rankings", short: "AppliedHE", enabled: false, website: "https://appliedhe.com" },
      ],
      rankings: ref.rankings.map((r) => ({ slug: r.slug, enabled: true, public: true, deadline: r.deadline })),
      cycles: [
        { id: "2026–2027", status: "Current" },
        { id: "2025–2026", status: "Closed" },
        { id: "2024–2025", status: "Archived" },
      ],
      academicYears: [
        { id: "2026–2027", current: true },
        { id: "2025–2026", current: false },
        { id: "2024–2025", current: false },
      ],
      periods: [
        { id: "CY2025", label: "Calendar year 2025", note: "THE Impact, QS Sustainability, UI GreenMetric", accepting: true },
        { id: "FY2025", label: "Financial year 2025", note: "THE WUR and THE by Subject income data", accepting: true },
        { id: "AY2526", label: "Academic year 2025–2026", note: "QS staff and student data", accepting: true },
        { id: "CY2024", label: "Calendar year 2024", note: "Only for corrections to last cycle", accepting: true },
      ],
      uploads: { maxFileMB: 25, maxFiles: 10, types: ["PDF", "XLSX", "CSV", "DOCX", "PNG", "JPG"] },
      templates: [
        { id: "tpl-invite", name: "Invitation", event: "An administrator invites someone", channel: "Email", subject: "You're invited to the UST Rankings and Impact Hub", body: "{name}, {inviter} invited you to the {unit} workspace as {role}. Sign in with your UST Google account to accept.", enabled: true },
        { id: "tpl-submitted", name: "New submission", event: "A unit submits evidence", channel: "In-app", subject: "New submission from {unit}", body: "{unit} submitted “{title}”.", enabled: true },
        { id: "tpl-accepted", name: "Evidence accepted", event: "A reviewer accepts evidence", channel: "Email and in-app", subject: "Accepted: {title}", body: "“{title}” was accepted and now counts in {count} rankings.", enabled: true },
        { id: "tpl-revision", name: "Revision requested", event: "A reviewer requests a revision", channel: "Email and in-app", subject: "Revision requested: {title}", body: "A reviewer asked for a revision on “{title}”: {comment}", enabled: true },
        { id: "tpl-decision", name: "Request decision", event: "An approval request is decided", channel: "Email and in-app", subject: "Your request was {decision}", body: "{title} was {decision} by {approver}.", enabled: true },
        { id: "tpl-published", name: "Publication live", event: "A story, article or report reaches the public website", channel: "In-app", subject: "Published: {title}", body: "“{title}” is now on the public website, under Publications.", enabled: true },
        { id: "tpl-deadline", name: "Deadline reminder", event: "A ranking's data collection is about to close", channel: "Email", subject: "{ranking} closes in {days} days", body: "{ranking} closes in {days} days. {open} requirements are still open for {unit}.", enabled: true },
        { id: "tpl-suspended", name: "Account suspended", event: "An account is suspended", channel: "Email", subject: "Your Hub account is suspended", body: "{name}, your account was suspended: {reason} Contact the Office if this is unexpected.", enabled: true },
        { id: "tpl-deadline-found", name: "New date found", event: "The deadline check reads a date that differs from the Hub's", channel: "In-app", subject: "New date for {ranking}", body: "{ranking}: {label} {date} on {source}. Apply it or dismiss it on the ranking's page.", enabled: true },
      ],
      dashboard: { officeView: "submissions", showClock: true, deadlineWarningDays: 21 },
      features: [
        { id: "submit-evidence", name: "Evidence submission", description: "Submit evidence: the evidence written as a document, with its settings beside it.", area: "Contributor workspace", enabled: true },
        { id: "data-entry", name: "Reporting-period data entry", description: "Submit data: values with their source documents.", area: "Contributor workspace", enabled: true },
        { id: "story-proposals", name: "Impact story proposals", description: "Units propose stories for the public library.", area: "Contributor workspace", enabled: true },
        { id: "innovation-proposals", name: "Innovation pipeline proposals", description: "Units propose innovations for the WURI pipeline.", area: "Contributor workspace", enabled: true },
        { id: "assistance", name: "Assistance requests", description: "Units ask the Office for help.", area: "Contributor workspace", enabled: true },
        { id: "reports", name: "Report builder", description: "Filtered reports with CSV export.", area: "Office workspace", enabled: true },
        { id: "recognition-internal", name: "Recognition wall", description: "Unit recognition inside the workspace.", area: "Office workspace", enabled: true },
        { id: "public-publications", name: "Publications", description: "Stories & News, Research Articles and Reports & Insights on the public website.", area: "Public website", enabled: true },
        { id: "public-recognition", name: "Recognition page", description: "The public Recognition page.", area: "Public website", enabled: true },
        { id: "public-knowledge", name: "Knowledge Center", description: "Methodologies, dictionary and templates on the public website.", area: "Public website", enabled: true },
      ],
      flags: [
        { id: "smart-matching", name: "Automatic ranking matching", description: "Submit evidence suggests every ranking that can reuse the evidence and maps it automatically.", mode: "Off", accounts: [], units: [], updatedAt: at },
        { id: "spreadsheet-values", name: "Spreadsheet upload in Submit data", description: "Fill reporting-period values from a CSV file instead of typing them.", mode: "Off", accounts: [], units: [], updatedAt: at },
        { id: "reuse-insights", name: "Evidence reuse insights", description: "Unit dashboards show how many rankings each accepted item feeds.", mode: "Off", accounts: [], units: [], updatedAt: at },
        { id: "story-drafting", name: "Story drafting help", description: "Suggests a structure for impact stories from linked evidence.", mode: "Off", accounts: [], units: [], updatedAt: at },
      ],
      site: { notice: "", noticeOn: false, asOf: day },
      calendar: [],
      findings: [],
      watch: [],
    },
    backup: {
      schedule: { full: "Daily at 02:00", incremental: "Every hour", retentionDays: 35, monthlyMonths: 12, offsite: false, encrypted: true },
      objectives: { rpoMinutes: 60, rtoMinutes: 240 },
      points: [],
      tests: [],
      procedures: [],
    },
    records: {
      evidence: {},
      posts: [],
      documents: [],
      postViewsStartedAt: at,
      stories: {},
      proposals: [],
      values: {},
      publishedReports: [],
      innovations: [],
      assistance: [],
      counters: { evidence: 0, request: 0, account: 0, story: 0, post: 0, document: 0, innovation: 0, assistance: 0, incident: 0, alert: 0, point: 0, test: 0, dsr: 0, pia: 0, review: 0, unit: 0, notice: 0, import: 0, assignment: 0 },
    },
    notices: [],
  };
}
