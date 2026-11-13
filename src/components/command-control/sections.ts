import type { IconName } from "@/components/ui/Icon";
import type { ModuleKey } from "@/lib/governance/types";

export type SectionKey = "accounts" | "roles" | "directory" | "governance" | "security" | "audit" | "process-pipelines" | "config" | "backup" | "agentic-control" | "firewall";

export interface SectionInfo {
  key: SectionKey;
  title: string;
  short: string;
  description: string;
  icon: IconName;
  /** The module whose view permission opens the section. */
  module?: ModuleKey;
}

/** The eleven sections, in subtab order. Firewall is first, so it is where Command & Control opens. */
export const SECTIONS: SectionInfo[] = [
  { key: "firewall", title: "Firewall", short: "Firewall", description: "Traffic, addresses & blocking rules", icon: "shield", module: "security" },
  { key: "security", title: "Privacy & Security", short: "Security", description: "Protection & security policies", icon: "lock-keyhole", module: "security" },
  { key: "accounts", title: "Account Management", short: "Accounts", description: "Users, invitations & status", icon: "users", module: "accounts" },
  { key: "roles", title: "Roles & Permissions", short: "Roles", description: "Access policies & RBAC", icon: "shield-check", module: "roles" },
  { key: "directory", title: "Organizational Directory", short: "Directory", description: "Colleges, faculties & offices", icon: "building-2", module: "directory" },
  { key: "process-pipelines", title: "Process Pipelines", short: "Pipelines", description: "Workflows & data flows", icon: "workflow", module: "workflows" },
  { key: "governance", title: "Data Governance", short: "Data", description: "Ownership, retention & quality", icon: "data", module: "governance" },
  { key: "agentic-control", title: "Agentic Control", short: "Agentic Control", description: "Models, costs & usage", icon: "agentic", module: "ai" },
  { key: "config", title: "System Configuration", short: "Configuration", description: "Platform-wide settings", icon: "settings", module: "config" },
  { key: "backup", title: "Backup & Recovery", short: "Backup", description: "Backups & restoration", icon: "hard-drive", module: "backup" },
  { key: "audit", title: "Audit Logs", short: "Audit", description: "Activities & change history", icon: "scroll", module: "audit" },
];

export const sectionInfo = (key: string) => SECTIONS.find((s) => s.key === key);

export const sectionHref = (base: string, key: SectionKey) => `${base}/${key}`;

/** The first subtab the viewer may open: Firewall, unless their role doesn't reach it. */
export const firstSection = (modules: readonly string[]) => SECTIONS.find((s) => !s.module || modules.includes(s.module)) ?? null;
