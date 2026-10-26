/*
 * The starting state of the governance store: the University directory, datasets, policies, workflows
 * and configuration, and nothing else. No accounts, records, requests or history: the first University
 * Administrator is created at their first Google sign-in (bootstrapAdmin in server/signin.ts) and
 * invites everyone else from the Administration console. The roles are fixed in catalog.ts.
 */
import { RANKINGS } from "@/lib/data";
import { importUstDirectory } from "./directory";
import type { AuditEvent, Dataset, GovernanceState, OrgKind, OrgUnit, QualityRule, TermMeta, Workflow } from "./types";

export const SCHEMA = 8;

export const SYSTEM_ACTOR = { id: "system", name: "Hub automation", role: "System" };

/* ---------- Directory ---------- */

function unit(id: string, code: string, name: string, kind: OrgKind, parentId: string | null, at: string, extra: Partial<OrgUnit> = {}): OrgUnit {
  return { id, code, name, kind, parentId, status: "Active", adminIds: [], history: [{ at, by: "system", change: "Imported from the University directory" }], ...extra };
}

const directory = (at: string): OrgUnit[] => [
  unit("ust", "UST", "University of Santo Tomas", "University", null, at, { established: "1611-04-28" }),
  unit("rector", "OR", "Office of the Rector", "Office", "ust", at),
  unit("rankings-office", "OQTR", "Office of QS/THE Rankings", "Office", "rector", at),
  unit("secgen", "OSG", "Office of the Secretary General", "Office", "ust", at),
  unit("internal-audit", "IAO", "Internal Audit Office", "Office", "rector", at),
  unit("vraa", "OVRAA", "Office of the Vice-Rector for Academic Affairs", "Office", "ust", at),
  unit("vrri", "OVRRI", "Office of the Vice-Rector for Research and Innovation", "Office", "ust", at),
  unit("rcnas", "RCNAS", "Research Center for the Natural and Applied Sciences", "Research Centre", "vrri", at),
  unit("rcsse", "RCSSE", "Research Center for Social Sciences and Education", "Research Centre", "vrri", at),
  unit("rccah", "RCCAH", "Research Center for Culture, Arts and Humanities", "Research Centre", "vrri", at),

  unit("engineering", "ENG", "Faculty of Engineering", "Faculty", "ust", at),
  unit("eng-ce", "ENG-CE", "Department of Civil Engineering", "Department", "engineering", at),
  unit("eng-ce-bs", "BSCE", "BS Civil Engineering", "Program", "eng-ce", at),
  unit("eng-ee", "ENG-EE", "Department of Electrical Engineering", "Department", "engineering", at),
  unit("eng-ee-bs", "BSEE", "BS Electrical Engineering", "Program", "eng-ee", at),
  unit("eng-me", "ENG-ME", "Department of Mechanical Engineering", "Department", "engineering", at),
  unit("eng-me-bs", "BSME", "BS Mechanical Engineering", "Program", "eng-me", at),
  unit("eng-che", "ENG-CHE", "Department of Chemical Engineering", "Department", "engineering", at),
  unit("eng-che-bs", "BSCHE", "BS Chemical Engineering", "Program", "eng-che", at),
  unit("eng-ie", "ENG-IE", "Department of Industrial Engineering", "Department", "engineering", at),
  unit("eng-ie-bs", "BSIE", "BS Industrial Engineering", "Program", "eng-ie", at),
  unit("eng-ece", "ENG-ECE", "Department of Electronics Engineering", "Department", "engineering", at),
  unit("eng-ece-bs", "BSECE", "BS Electronics Engineering", "Program", "eng-ece", at),

  unit("medicine", "MED", "Faculty of Medicine and Surgery", "Faculty", "ust", at),
  unit("med-md", "MD", "Doctor of Medicine", "Program", "medicine", at),
  unit("science", "SCI", "College of Science", "College", "ust", at),
  unit("sci-bio", "SCI-BIO", "Department of Biological Sciences", "Department", "science", at),
  unit("sci-chem", "SCI-CHEM", "Department of Chemistry", "Department", "science", at),
  unit("sci-mp", "SCI-MP", "Department of Mathematics and Physics", "Department", "science", at),
  unit("education", "EDU", "College of Education", "College", "ust", at),
  unit("pharmacy", "PHA", "Faculty of Pharmacy", "Faculty", "ust", at),
  unit("architecture", "ARC", "College of Architecture", "College", "ust", at),
  unit("nursing", "NUR", "College of Nursing", "College", "ust", at),
  unit("arts-letters", "AB", "Faculty of Arts and Letters", "Faculty", "ust", at),
  unit("cics", "CICS", "College of Information and Computing Sciences", "College", "ust", at),
  unit("cics-cs", "CICS-CS", "Department of Computer Science", "Department", "cics", at),
  unit("cics-it", "CICS-IT", "Department of Information Technology", "Department", "cics", at),

  unit("fmo", "FMO", "Facilities Management Office", "Office", "ust", at),
  unit("oirp", "OIRP", "Office of International Relations and Programs", "Office", "ust", at),
  unit("simbahayan", "SIMB", "Office for Community Development (SIMBAHAYAN)", "Office", "ust", at),
  unit("hrd", "HRD", "Human Resource Department", "Office", "ust", at),
  unit("library", "LIB", "Miguel de Benavides Library", "Office", "ust", at),
  unit("careers", "OCS", "Office for Career Services", "Office", "ust", at),
  unit("industry", "OIL", "Office for Industry Linkages", "Office", "ust", at),
  unit("it-services", "ITS", "University IT Services", "Office", "ust", at),
];

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
    publicSurface: "Impact and Innovation pages of the public website",
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
    description: "Giving an active account a role above the one it holds, such as making a coordinator a University Administrator.",
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
    description: "Restoring the platform from a recovery point, or deleting one. A second University Administrator must agree.",
    enabled: true,
    steps: [{ name: "Second administrator sign-off" }],
    slaDays: 1,
    separation: true,
  },
];

/* ---------- The document ---------- */

export function buildSeed(now = new Date()): Omit<GovernanceState, "audit"> & { audit: Omit<AuditEvent, "prev" | "hash">[] } {
  const at = now.toISOString();
  const day = at.slice(0, 10);
  return {
    schema: SCHEMA,
    accounts: [],
    sessions: [],
    challenges: [],
    failures: [],
    units: importUstDirectory(directory(at), at),
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
      rankings: RANKINGS.map((r) => ({ slug: r.slug, enabled: true, public: true, deadline: r.deadline })),
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
        { id: "tpl-published", name: "Story published", event: "A story reaches the public website", channel: "In-app", subject: "Published: {title}", body: "“{title}” is now on the public Impact and Innovation page.", enabled: true },
        { id: "tpl-deadline", name: "Deadline reminder", event: "A ranking's data collection is about to close", channel: "Email", subject: "{ranking} closes in {days} days", body: "{ranking} closes in {days} days. {open} requirements are still open for {unit}.", enabled: true },
        { id: "tpl-suspended", name: "Account suspended", event: "An account is suspended", channel: "Email", subject: "Your Hub account is suspended", body: "{name}, your account was suspended: {reason} Contact the Office if this is unexpected.", enabled: true },
      ],
      dashboard: { officeView: "submissions", showClock: true, deadlineWarningDays: 21 },
      features: [
        { id: "submit-evidence", name: "Evidence submission", description: "The nine-step Submit evidence wizard.", area: "Contributor workspace", enabled: true },
        { id: "data-entry", name: "Reporting-period data entry", description: "Submit data: values with their source documents.", area: "Contributor workspace", enabled: true },
        { id: "story-proposals", name: "Impact story proposals", description: "Units propose stories for the public library.", area: "Contributor workspace", enabled: true },
        { id: "innovation-proposals", name: "Innovation pipeline proposals", description: "Units propose innovations for the WURI pipeline.", area: "Contributor workspace", enabled: true },
        { id: "assistance", name: "Assistance requests", description: "Units ask the Office for help.", area: "Contributor workspace", enabled: true },
        { id: "reports", name: "Report builder", description: "Filtered reports with CSV export.", area: "Office workspace", enabled: true },
        { id: "recognition-internal", name: "Recognition wall", description: "Unit recognition inside the workspace.", area: "Office workspace", enabled: true },
        { id: "public-impact", name: "Impact and Innovation library", description: "Published stories on the public website.", area: "Public website", enabled: true },
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
      postViews: {},
      postViewsStartedAt: at,
      stories: {},
      proposals: [],
      values: {},
      publishedReports: [],
      innovations: [],
      assistance: [],
      counters: { evidence: 0, request: 0, account: 0, story: 0, post: 0, innovation: 0, assistance: 0, incident: 0, alert: 0, point: 0, test: 0, dsr: 0, pia: 0, review: 0, unit: 0, notice: 0, import: 0, assignment: 0 },
    },
    notices: [],
  };
}
