import type { Action, BodyKey, Classification, ModuleKey, PermissionSet, Position, Role, RoleId, RolePermissions } from "./types";

/** Contact addresses a unit's profile may list. */
export const UNIT_EMAILS = 6;

export const ACTIONS: { key: Action; label: string; hint: string }[] = [
  { key: "view", label: "View", hint: "Open and read" },
  { key: "create", label: "Create", hint: "Add new records" },
  { key: "edit", label: "Edit", hint: "Change existing records" },
  { key: "delete", label: "Delete", hint: "Remove records" },
  { key: "submit", label: "Submit", hint: "Send for validation" },
  { key: "approve", label: "Approve", hint: "Validate, accept or authorize" },
  { key: "export", label: "Export", hint: "Download or share outside the Hub" },
  { key: "manage", label: "Manage", hint: "Configure the module itself" },
];

export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  group: "Workspaces" | "Contributions" | "Command & Control";
  /** The actions that mean something for this module. */
  actions: Action[];
}

export const MODULES: ModuleInfo[] = [
  { key: "dashboard", label: "Executive dashboard", group: "Workspaces", actions: ["view", "export"] },
  { key: "rankings", label: "Rankings and indicators", group: "Workspaces", actions: ["view", "edit", "export", "manage"] },
  { key: "units", label: "Unit participation", group: "Workspaces", actions: ["view", "export"] },
  // Publications: units write and submit (send to the Rankings Office); the Office approves and publishes.
  { key: "posts", label: "Publications", group: "Workspaces", actions: ["view", "create", "edit", "delete", "submit", "approve"] },
  { key: "reports", label: "Build a Report", group: "Workspaces", actions: ["view", "create", "export"] },
  { key: "knowledge", label: "Knowledge Base", group: "Workspaces", actions: ["view", "edit"] },
  // Digital Forms (lib/forms/access.ts): build, publish to the Student Portal (manage), file copies and answers
  // (submit, Students), record sign-offs (approve), read and export responses.
  { key: "forms", label: "Digital forms", group: "Contributions", actions: ["view", "create", "edit", "delete", "submit", "approve", "export", "manage"] },
  { key: "evidence", label: "Evidence submissions", group: "Contributions", actions: ["view", "create", "edit", "delete", "submit", "approve", "export"] },
  { key: "data", label: "Reporting-period data", group: "Contributions", actions: ["view", "create", "edit", "delete", "submit", "approve", "export"] },
  { key: "stories", label: "Impact stories and innovations", group: "Contributions", actions: ["view", "create", "edit", "submit", "approve", "export"] },
  { key: "accounts", label: "Account management", group: "Command & Control", actions: ["view", "create", "edit", "delete", "manage"] },
  { key: "roles", label: "Roles and permissions", group: "Command & Control", actions: ["view", "create", "edit", "delete", "manage"] },
  { key: "directory", label: "Organizational directory", group: "Command & Control", actions: ["view", "create", "edit", "manage"] },
  { key: "governance", label: "Data governance", group: "Command & Control", actions: ["view", "edit", "export", "manage"] },
  { key: "security", label: "Privacy and security", group: "Command & Control", actions: ["view", "edit", "manage"] },
  { key: "audit", label: "Audit logs", group: "Command & Control", actions: ["view", "export"] },
  { key: "workflows", label: "Process pipelines", group: "Command & Control", actions: ["view", "approve", "manage"] },
  { key: "config", label: "System configuration", group: "Command & Control", actions: ["view", "edit", "manage"] },
  { key: "backup", label: "Backup and recovery", group: "Command & Control", actions: ["view", "manage"] },
  // The assistant: providers, costs, models. Effective only University-wide (lib/assistant/server/chat.ts, managesAgenticControl).
  { key: "ai", label: "Agentic Control", group: "Command & Control", actions: ["view", "manage"] },
];

export const moduleInfo = (key: ModuleKey) => MODULES.find((m) => m.key === key)!;

export const COMMAND_CONTROL_MODULES: ModuleKey[] = ["accounts", "roles", "directory", "governance", "security", "audit", "workflows", "config", "backup", "ai"];

/** A permission set without the Command & Control modules, which only Super Administrators hold. */
export const withoutCommandControl = (set: PermissionSet): PermissionSet =>
  Object.fromEntries(Object.entries(set).filter(([k]) => !COMMAND_CONTROL_MODULES.includes(k as ModuleKey))) as PermissionSet;

/** "THE Impact · SDG 3" → THE, from the short names used in evidence mappings. */
export function bodyOfMapping(mapping: string): BodyKey | null {
  const head = mapping.split(" · ")[0];
  if (head.startsWith("THE")) return "THE";
  if (head.startsWith("QS")) return "QS";
  if (head.startsWith("UI")) return "UI";
  if (head.startsWith("WURI")) return "WURI";
  return null;
}

export const CLASSIFICATIONS: { key: Classification; note: string }[] = [
  { key: "Public", note: "May appear on the public website. Results already published by the ranking bodies, approved stories." },
  { key: "Internal", note: "Open to signed-in staff with access to the module. Not for the public site." },
  { key: "Confidential", note: "Limited to named roles and units. Exports need approval. Includes personal data." },
  { key: "Restricted", note: "Highest sensitivity. Never exported from the Hub; shared only through the ranking bodies’ own portals." },
];

const ALL = (): PermissionSet => Object.fromEntries(MODULES.map((m) => [m.key, [...m.actions]])) as PermissionSet;

/**
 * Filing contributions is the units' own work: administrators review and approve, never submit for a unit. Filing
 * a form's copies and answers is the Students' (forms submit).
 */
const CONTRIBUTING: Partial<Record<ModuleKey, Action[]>> = {
  evidence: ["create", "edit", "delete", "submit"],
  data: ["create", "edit", "delete", "submit"],
  stories: ["create", "edit", "submit"],
  posts: ["submit"],
  forms: ["submit"],
};
const OVERSIGHT = (): PermissionSet =>
  Object.fromEntries(Object.entries(ALL()).map(([k, acts]) => [k, acts.filter((a) => !CONTRIBUTING[k as ModuleKey]?.includes(a))])) as PermissionSet;

export const ROLE = { superAdmin: "super-admin", admin: "administrator", coordinator: "coordinator", student: "student", external: "external" } as const satisfies Record<string, RoleId>;

/** The Office of QS/THE Rankings, which runs the Hub: its people are the Super Administrators. */
export const HUB_OFFICE = "rankings-office";

/** What a Super Administrator's assignment covers, as people read it (user, 2026-11-12), in place of "University-wide". */
export const OFFICE_SCOPE = "Office of QS/THE Rankings";

/** Where a Student's account is kept: with the Office that runs the Hub, as a guest's is. It is never shown as their unit. */
export const STUDENT_HOME = HUB_OFFICE;

/**
 * Where a role may be held, by the Directory section of the person's unit (user's role diagram, 2026-11-12):
 * Administrators and Coordinators in a University Office or a College/Faculty other than the Rankings Office,
 * External Contributors only as guests of the Office. Super Administrators are the Office's own people, and
 * Students belong to no College/Faculty or Office (STUDENT_HOME).
 */
export const ROLE_SECTIONS: Record<RoleId, ("academic" | "offices")[]> = {
  "super-admin": [],
  administrator: ["offices", "academic"],
  coordinator: ["offices", "academic"],
  student: [],
  external: ["offices"],
};

/**
 * An Administrator of an office or college: their unit's analytics and data, read-only, in the contributor
 * workspace (which shows only their unit). The Coordinators beneath them file; the executive dashboard and
 * approvals stay with the Office.
 */
const UNIT_OVERSIGHT: PermissionSet = {
  units: ["view", "export"],
  reports: ["view", "export"],
  knowledge: ["view"],
  forms: ["view", "export"],
  evidence: ["view", "export"],
  data: ["view", "export"],
  stories: ["view", "export"],
};

const keepOnly = (set: PermissionSet, limits: Partial<Record<ModuleKey, Action[]>>): PermissionSet =>
  Object.fromEntries(
    Object.entries(set)
      .map(([k, acts]) => [k, k in limits ? acts!.filter((a) => limits[k as ModuleKey]!.includes(a)) : acts])
      .filter(([, acts]) => (acts as Action[]).length),
  ) as PermissionSet;

/**
 * The positions a Super Administrator holds in the Office, highest first (user, 2026-11-12). Each is a fixed
 * ladder of access: what the Office does for the University, less the running of the Hub as the rank falls.
 */
export const POSITIONS: { id: Position; name: string; description: string; permissions: PermissionSet }[] = [
  {
    id: "director",
    name: "Director",
    description: "Owns the Hub: sets every role's permissions and appoints Super Administrators and Administrators.",
    permissions: OVERSIGHT(),
  },
  {
    id: "specialist",
    name: "Ranking Specialist",
    description: "Runs the Hub day to day: manages unit accounts, approves requests and configures the Hub, but can't change roles.",
    permissions: keepOnly(OVERSIGHT(), { roles: ["view"] }),
  },
  {
    id: "staff",
    name: "Staff",
    description: "Does the Office's work: reviews and approves submissions, publishes and reports, without managing accounts or the Hub.",
    permissions: keepOnly(OVERSIGHT(), {
      accounts: ["view"],
      roles: ["view"],
      directory: ["view"],
      governance: ["view"],
      security: [],
      audit: ["view"],
      workflows: ["view"],
      config: ["view"],
      backup: [],
      ai: [],
    }),
  },
];

export const positionOf = (id?: string) => POSITIONS.find((p) => p.id === id) ?? POSITIONS[0];

/** The Hub's roles, after the user's role diagram (2026-11-12). A role decides what; the assignment's scope decides where. */
export const ROLES: Role[] = [
  {
    id: ROLE.superAdmin,
    name: "Super Administrator",
    description: "The Office of QS/THE Rankings, University-wide. Its Director, Ranking Specialists and Staff each hold the access of their position.",
    tier: 5,
    permissions: POSITIONS[0].permissions,
    scopeKind: "university",
  },
  {
    id: ROLE.admin,
    name: "Administrator",
    description: "Heads a University Office or College/Faculty in the Hub: views its analytics and data, over the Coordinators who file for it.",
    tier: 4,
    permissions: UNIT_OVERSIGHT,
    scopeKind: "unit",
  },
  {
    id: ROLE.coordinator,
    name: "Coordinator",
    description: "Gathers and submits evidence, data and publications for their University Office or College/Faculty, and runs its surveys, evaluation and registration forms.",
    tier: 3,
    permissions: {
      units: ["view"],
      reports: ["view", "export"],
      knowledge: ["view"],
      forms: ["view", "create", "edit", "delete", "approve", "export", "manage"],
      evidence: ["view", "create", "edit", "delete", "submit"],
      data: ["view", "create", "edit", "delete", "submit"],
      stories: ["view", "create", "edit", "submit"],
      posts: ["view", "create", "edit", "delete", "submit"],
    },
    scopeKind: "unit",
  },
  {
    id: ROLE.student,
    name: "Student Organizer",
    description: "Secretary of a student organization, commission or council: files its project proposals and terminal reports, builds its evaluation and registration forms, and answers the surveys assigned to it.",
    tier: 2,
    permissions: {
      forms: ["view", "create", "edit", "delete", "submit", "export"],
    },
    scopeKind: "unit",
  },
  {
    id: ROLE.external,
    name: "External Contributor",
    description: "A partner from outside the University, until an end date: contributes evidence, data and stories for the Office to review, and reads approved resources.",
    tier: 1,
    permissions: {
      knowledge: ["view"],
      reports: ["view"],
      evidence: ["view", "create", "edit", "delete", "submit"],
      data: ["view", "create", "edit", "delete", "submit"],
      stories: ["view", "create", "edit", "submit"],
    },
    scopeKind: "custom",
  },
];

export const roleOf = (id: string, overrides?: RolePermissions): Role | undefined => {
  const base = ROLES.find((r) => r.id === id);
  if (!base) return undefined;
  // A Super Administrator's permissions are fixed by position: whoever owns the Hub can always configure it.
  if (base.id === ROLE.superAdmin) return base;
  const custom = overrides?.[base.id]?.permissions;
  if (!custom) return base;
  // The Command & Control console belongs to Super Administrators only (user, 2026-11-12): whatever was saved for
  // another role, it never holds an Command & Control module.
  return { ...base, permissions: withoutCommandControl(custom) };
};

export const STATUS_TONE: Record<string, "ok" | "review" | "revise" | "missing" | "danger"> = {
  Active: "ok",
  "Pending Invitation": "review",
  Suspended: "revise",
  Deactivated: "missing",
  Archived: "missing",
  Pending: "review",
  Approved: "ok",
  Rejected: "danger",
  Cancelled: "missing",
  // the Submission Tracker's standings (request-tracker.ts)
  "Under review": "review",
  "Signed in": "ok",
  "Not approved": "danger",
  Withdrawn: "missing",
  Public: "ok",
  Internal: "review",
  Confidential: "revise",
  Restricted: "danger",
  Open: "revise",
  Acknowledged: "review",
  Resolved: "ok",
  Success: "ok",
  Denied: "danger",
  Failed: "danger",
  Passed: "ok",
  Completed: "ok",
  Validated: "ok",
  "For review": "review",
  "Needs revision": "revise",
  "Not applicable": "missing",
  "Not yet submitted": "missing",
  "In progress": "review",
  Scheduled: "missing",
  Complete: "ok",
  Draft: "missing",
  "In review": "review",
  Published: "ok",
  Unpublished: "revise",
  Fulfilled: "ok",
  Declined: "danger",
  Reported: "revise",
  Investigating: "revise",
  Escalated: "danger",
  Contained: "review",
  Closed: "ok",
  Low: "missing",
  Medium: "revise",
  High: "danger",
  Critical: "danger",
  Current: "ok",
  Overdue: "danger",
  Supported: "ok",
};
