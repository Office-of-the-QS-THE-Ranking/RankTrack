/*
 * What the workspaces and the website read from governance: which rankings are tracked and public, the
 * directory's units, records with their review and publication state, and configuration.
 */
import type { DictionaryEntry, EvidenceItem, Requirement, Story, Unit } from "@/lib/data";
import type { CycleConfig, NotificationTemplate, PeriodConfig, SystemConfig } from "./types";

export interface HubUnit extends Unit {
  code: string;
  status: "Active" | "Archived";
  archivedReason?: string;
  mergedInto?: string;
  mergedIntoName?: string;
  /** Account id of the designated coordinator, if any. */
  coordinatorId?: string;
  programs: { id: string; name: string; status: "Active" | "Archived" }[];
}

export interface HubNotice {
  id: string;
  text: string;
  href: string;
  at: string;
  unread: boolean;
}

export interface HubData {
  activeSlugs: string[];
  publicSlugs: string[];
  deadlines: Record<string, string>;
  bodies: { key: string; name: string; short: string; enabled: boolean }[];
  units: HubUnit[];
  evidence: EvidenceItem[];
  stories: Story[];
  dictionary: DictionaryEntry[];
  cycles: CycleConfig[];
  currentCycle: string;
  periods: PeriodConfig[];
  uploads: SystemConfig["uploads"];
  dashboard: SystemConfig["dashboard"];
  site: SystemConfig["site"];
  notices: HubNotice[];
  requirements: Requirement[];
  values: Record<string, { value: string; source: string; status: "For review" | "Validated" | "Needs revision" }>;
  publishedReports: { id: string; title: string; at: string }[];
  templates: Pick<NotificationTemplate, "id" | "name" | "enabled">[];
}
