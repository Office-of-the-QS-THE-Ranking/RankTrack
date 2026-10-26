import type { Action, BodyKey, Classification, ModuleKey, PermissionSet, Role, RoleId } from "./types";

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
  group: "Workspaces" | "Contributions" | "Administration";
  /** The actions that mean something for this module. */
  actions: Action[];
}

export const MODULES: ModuleInfo[] = [
  { key: "dashboard", label: "Executive dashboard", group: "Workspaces", actions: ["view", "export"] },
  { key: "rankings", label: "Rankings and indicators", group: "Workspaces", actions: ["view", "edit", "export", "manage"] },
  { key: "units", label: "Unit participation", group: "Workspaces", actions: ["view", "export"] },
  { key: "posts", label: "Impact and Innovation posts", group: "Workspaces", actions: ["view", "create", "edit", "delete", "approve"] },
  { key: "reports", label: "Reports", group: "Workspaces", actions: ["view", "create", "export"] },
  { key: "knowledge", label: "Knowledge Center", group: "Workspaces", actions: ["view", "edit"] },
  { key: "evidence", label: "Evidence submissions", group: "Contributions", actions: ["view", "create", "edit", "delete", "submit", "approve", "export"] },
  { key: "data", label: "Reporting-period data", group: "Contributions", actions: ["view", "create", "edit", "delete", "submit", "approve", "export"] },
  { key: "stories", label: "Impact stories and innovations", group: "Contributions", actions: ["view", "create", "edit", "submit", "approve", "export"] },
  { key: "accounts", label: "Account management", group: "Administration", actions: ["view", "create", "edit", "delete", "manage"] },
  { key: "roles", label: "Roles and permissions", group: "Administration", actions: ["view", "create", "edit", "delete", "manage"] },
  { key: "directory", label: "Organizational directory", group: "Administration", actions: ["view", "create", "edit", "manage"] },
  { key: "governance", label: "Data governance", group: "Administration", actions: ["view", "edit", "export", "manage"] },
  { key: "security", label: "Privacy and security", group: "Administration", actions: ["view", "edit", "manage"] },
  { key: "audit", label: "Audit logs", group: "Administration", actions: ["view", "export"] },
  { key: "workflows", label: "Approval workflows", group: "Administration", actions: ["view", "approve", "manage"] },
  { key: "config", label: "System configuration", group: "Administration", actions: ["view", "edit", "manage"] },
  { key: "backup", label: "Backup and recovery", group: "Administration", actions: ["view", "manage"] },
];

export const moduleInfo = (key: ModuleKey) => MODULES.find((m) => m.key === key)!;

export const ADMIN_MODULES: ModuleKey[] = ["accounts", "roles", "directory", "governance", "security", "audit", "workflows", "config", "backup"];

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

/** Filing contributions is the units' own work: administrators review and approve, never submit for a unit. */
const CONTRIBUTING: Partial<Record<ModuleKey, Action[]>> = {
  evidence: ["create", "edit", "delete", "submit"],
  data: ["create", "edit", "delete", "submit"],
  stories: ["create", "edit", "submit"],
};
const OVERSIGHT = (): PermissionSet =>
  Object.fromEntries(Object.entries(ALL()).map(([k, acts]) => [k, acts.filter((a) => !CONTRIBUTING[k as ModuleKey]?.includes(a))])) as PermissionSet;

export const ROLE = { admin: "university-admin", coordinator: "coordinator", external: "external" } as const satisfies Record<string, RoleId>;

/** The Hub's roles. A role decides what; the assignment's scope decides where. */
export const ROLES: Role[] = [
  {
    id: ROLE.admin,
    name: "University Administrator",
    description: "Runs the Hub: accounts, configuration, data oversight and approvals across the University.",
    tier: 3,
    permissions: OVERSIGHT(),
    scopeKind: "university",
  },
  {
    id: ROLE.coordinator,
    name: "College/Faculty Coordinator",
    description: "Gathers and submits evidence, data and stories for their college or faculty.",
    tier: 2,
    permissions: {
      units: ["view"],
      reports: ["view", "export"],
      knowledge: ["view"],
      evidence: ["view", "create", "edit", "delete", "submit"],
      data: ["view", "create", "edit", "delete", "submit"],
      stories: ["view", "create", "edit", "submit"],
    },
    scopeKind: "unit",
  },
  {
    id: ROLE.external,
    name: "External Collaborator",
    description: "Temporary, read-only access to approved resources.",
    tier: 1,
    permissions: {
      knowledge: ["view"],
      reports: ["view"],
    },
    scopeKind: "custom",
  },
];

export const roleOf = (id: string) => ROLES.find((r) => r.id === id);

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
