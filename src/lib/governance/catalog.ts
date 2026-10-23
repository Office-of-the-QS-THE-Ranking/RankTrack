import type { Action, BodyKey, Classification, ModuleKey, PermissionSet, Role, Template } from "./types";

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

export const BODY_NAMES: Record<BodyKey, string> = {
  THE: "Times Higher Education",
  QS: "QS Quacquarelli Symonds",
  UI: "UI GreenMetric",
  WURI: "WURI",
};

/** The ranking family each ranking page belongs to, by body. */
export const BODY_OF_FAMILY: Record<string, BodyKey> = { THE: "THE", QS: "QS", QSS: "QS", UI: "UI", WURI: "WURI" };

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

const ALL = (actions: Action[] = ["view", "create", "edit", "delete", "submit", "approve", "export", "manage"]): PermissionSet =>
  Object.fromEntries(MODULES.map((m) => [m.key, m.actions.filter((a) => actions.includes(a))])) as PermissionSet;

const T0 = "2025-06-02T01:00:00.000Z";

/** The roles from the governance proposal. A role decides what; the assignment's scope decides where. */
export const SYSTEM_ROLES: Role[] = [
  {
    id: "super-admin",
    name: "Super Administrator",
    description: "Full platform administration.",
    system: true,
    tier: 100,
    permissions: ALL(),
    scopeKind: "university",
    technical: true,
    createdAt: T0,
  },
  {
    id: "system-admin",
    name: "System Administrator",
    description: "Accounts, configuration, and system maintenance.",
    system: true,
    tier: 90,
    permissions: {
      dashboard: ["view"],
      knowledge: ["view"],
      accounts: ["view", "create", "edit", "delete", "manage"],
      roles: ["view", "create", "edit", "delete", "manage"],
      directory: ["view", "create", "edit", "manage"],
      governance: ["view"],
      security: ["view", "edit", "manage"],
      audit: ["view", "export"],
      workflows: ["view", "approve", "manage"],
      config: ["view", "edit", "manage"],
      backup: ["view", "manage"],
    },
    scopeKind: "university",
    technical: true,
    createdAt: T0,
  },
  {
    id: "university-admin",
    name: "University Administrator",
    description: "University-wide data oversight.",
    system: true,
    tier: 80,
    permissions: {
      dashboard: ["view", "export"],
      rankings: ["view", "edit", "export", "manage"],
      units: ["view", "export"],
      reports: ["view", "create", "export"],
      knowledge: ["view", "edit"],
      evidence: ["view", "edit", "approve", "export"],
      data: ["view", "edit", "approve", "export"],
      stories: ["view", "edit", "approve", "export"],
      accounts: ["view"],
      roles: ["view"],
      directory: ["view", "create", "edit"],
      governance: ["view", "edit", "export", "manage"],
      audit: ["view"],
      workflows: ["view", "approve"],
      config: ["view"],
      backup: ["view"],
    },
    scopeKind: "university",
    createdAt: T0,
  },
  {
    id: "unit-admin",
    name: "College/Faculty Administrator",
    description: "Manage assigned academic unit.",
    system: true,
    tier: 60,
    inherits: "contributor",
    permissions: {
      units: ["view"],
      reports: ["view", "export"],
      evidence: ["delete"],
      data: ["delete"],
      stories: ["edit", "submit"],
      accounts: ["view", "create", "edit"],
      roles: ["view"],
      directory: ["view", "edit"],
      workflows: ["view"],
    },
    scopeKind: "unit",
    createdAt: T0,
  },
  {
    id: "program-coordinator",
    name: "Department/Program Coordinator",
    description: "Manage assigned program data.",
    system: true,
    tier: 50,
    inherits: "contributor",
    permissions: {
      units: ["view"],
      reports: ["view"],
      stories: ["submit"],
    },
    scopeKind: "unit",
    createdAt: T0,
  },
  {
    id: "contributor",
    name: "Data Contributor",
    description: "Upload and edit permitted data.",
    system: true,
    tier: 40,
    permissions: {
      knowledge: ["view"],
      evidence: ["view", "create", "edit", "submit"],
      data: ["view", "create", "edit", "submit"],
      stories: ["view", "create"],
    },
    scopeKind: "unit",
    createdAt: T0,
  },
  {
    id: "reviewer",
    name: "Data Reviewer/Approver",
    description: "Verify and approve submissions.",
    system: true,
    tier: 55,
    permissions: {
      dashboard: ["view"],
      rankings: ["view"],
      units: ["view"],
      reports: ["view", "export"],
      knowledge: ["view"],
      evidence: ["view", "edit", "approve", "export"],
      data: ["view", "approve"],
      stories: ["view", "approve"],
      workflows: ["view", "approve"],
    },
    scopeKind: "university",
    createdAt: T0,
  },
  {
    id: "auditor",
    name: "Auditor",
    description: "Read-only access to logs and records.",
    system: true,
    tier: 45,
    permissions: {
      ...ALL(["view"]),
      audit: ["view", "export"],
    },
    scopeKind: "university",
    createdAt: T0,
  },
  {
    id: "external",
    name: "External Collaborator",
    description: "Restricted, temporary access to approved resources.",
    system: true,
    tier: 10,
    permissions: {
      knowledge: ["view"],
      reports: ["view"],
    },
    scopeKind: "custom",
    createdAt: T0,
  },
];

export const TEMPLATES: Template[] = [
  { id: "tpl-read", name: "Read-only", description: "View every workspace module, change nothing.", permissions: ALL(["view"]) },
  {
    id: "tpl-unit",
    name: "Unit contributor",
    description: "Submit evidence and data for one unit.",
    permissions: { knowledge: ["view"], evidence: ["view", "create", "edit", "submit"], data: ["view", "create", "edit", "submit"], stories: ["view", "create"] },
  },
  {
    id: "tpl-review",
    name: "Ranking body reviewer",
    description: "Validate submissions for the ranking bodies in scope.",
    permissions: { dashboard: ["view"], rankings: ["view"], evidence: ["view", "edit", "approve"], data: ["view", "approve"], stories: ["view", "approve"], knowledge: ["view"] },
  },
  {
    id: "tpl-steward",
    name: "Data steward",
    description: "Own datasets: quality rules, versions, the dictionary.",
    permissions: { dashboard: ["view"], governance: ["view", "edit"], evidence: ["view"], data: ["view", "edit"], knowledge: ["view", "edit"] },
  },
  { id: "tpl-blank", name: "Blank", description: "Start with no permissions.", permissions: {} },
];

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
