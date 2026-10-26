import type { IconName } from "@/components/ui/Icon";
import type { ModuleKey } from "@/lib/governance/types";

export type SectionKey = "overview" | "accounts" | "roles" | "directory" | "governance" | "security" | "audit" | "workflows" | "config" | "backup";

export interface SectionInfo {
  key: SectionKey;
  title: string;
  short: string;
  description: string;
  icon: IconName;
  /** The module whose view permission opens the section. Overview opens for any administrator. */
  module?: ModuleKey;
}

/** The ten sections, in subtab order. */
export const SECTIONS: SectionInfo[] = [
  { key: "overview", title: "Overview", short: "Overview", description: "System health & statistics", icon: "dashboard" },
  { key: "accounts", title: "Account Management", short: "Accounts", description: "Users, invitations & status", icon: "users", module: "accounts" },
  { key: "roles", title: "Roles & Permissions", short: "Roles", description: "Access policies & RBAC", icon: "shield-check", module: "roles" },
  { key: "directory", title: "Organizational Directory", short: "Directory", description: "Colleges, faculties & offices", icon: "building-2", module: "directory" },
  { key: "governance", title: "Data Governance", short: "Data", description: "Ownership, retention & quality", icon: "data", module: "governance" },
  { key: "security", title: "Privacy & Security", short: "Security", description: "Protection & security policies", icon: "lock-keyhole", module: "security" },
  { key: "audit", title: "Audit Logs", short: "Audit", description: "Activities & change history", icon: "scroll", module: "audit" },
  { key: "workflows", title: "Approval Workflows", short: "Approvals", description: "Requests & authorization", icon: "workflow", module: "workflows" },
  { key: "config", title: "System Configuration", short: "Configuration", description: "Platform-wide settings", icon: "settings", module: "config" },
  { key: "backup", title: "Backup & Recovery", short: "Backup", description: "Backups & restoration", icon: "hard-drive", module: "backup" },
];

export const sectionInfo = (key: string) => SECTIONS.find((s) => s.key === key);

/** Where a section lives: Overview is the page itself, the rest are its subtabs. */
export const sectionHref = (base: string, key: SectionKey) => (key === "overview" ? base : `${base}/${key}`);
