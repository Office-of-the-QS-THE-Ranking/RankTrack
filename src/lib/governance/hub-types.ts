/*
 * What the workspaces and the website read from governance: which rankings are tracked and public, the
 * directory's units, records with their review and publication state, and configuration.
 */
import type { CalendarItem } from "@/lib/calendar";
import type { ActionItem, DictionaryEntry, EvidenceItem, EvidenceStatus, Requirement, Story, Unit } from "@/lib/data";
import type { DeadlineSource } from "@/lib/reference";
import type {
  AccountStatus,
  CalendarEntry,
  CycleConfig,
  DeadlineFinding,
  DeadlineWatch,
  NotificationTemplate,
  PeriodConfig,
  PostMedia,
  PostStatus,
  RankingConfig,
  SystemConfig,
} from "./types";
import type { UnitEmblem } from "./unit-emblems";

export interface HubUnit extends Unit {
  code: string;
  /** The unit's uploaded logo, else the University's arms (unit-emblems.ts). */
  emblem?: UnitEmblem | null;
  status: "Active" | "Archived";
  archivedReason?: string;
  mergedInto?: string;
  mergedIntoName?: string;
  /** Account id of the designated coordinator, if any. */
  coordinatorId?: string;
  /** The unit's own contact addresses. */
  emails: string[];
}

/** A unit's profile in the Office workspace (the Units modal and page), limited to what the viewer may reach. */
export interface UnitProfileData {
  unit: Pick<HubUnit, "slug" | "name" | "code" | "kind" | "status" | "archivedReason" | "mergedIntoName" | "emails"> & {
    /** All designated coordinators, in display order. */
    adminIds: string[];
    /** The unit's official arms or seal, when the University has issued one. */
    emblem: UnitEmblem | null;
  };
  coordinators: { id: string; name: string; email: string; title: string; avatar?: string; status: AccountStatus; lastLogin?: string }[];
  /** Every cycle's submissions, mapped only to the rankings the Hub tracks. */
  evidence: EvidenceItem[];
  /** This cycle's requirements. */
  requirements: Requirement[];
  actions: ActionItem[];
  recognition: { award: string; reason: string }[];
  /** Indicators this unit owns. */
  owned: { ranking: string; name: string; status: EvidenceStatus }[];
  /** Rankings this unit contributes to, soonest deadline first. */
  deadlines: { slug: string; deadline: string }[];
  cycles: CycleConfig[];
  currentCycle: string;
  /** The "evidence reuse insights" experiment. */
  insights: boolean;
  /** University-wide Administrators may edit the name, addresses and coordinator. */
  canEdit: boolean;
  /** Who may be named coordinator; filled only for those who can edit. */
  people: { id: string; name: string; email: string; unitCode: string; here: boolean }[];
}

export interface HubNotice {
  id: string;
  text: string;
  href: string;
  at: string;
  unread: boolean;
}

/** What the Office needs to keep deadlines right: dates waiting, each source's last reading, and each ranking's other dates. */
export interface DeadlineDesk {
  findings: DeadlineFinding[];
  sources: {
    id: string;
    name: string;
    page: string;
    body: string;
    kind: DeadlineSource["kind"];
    slugs: string[];
    status?: DeadlineWatch["status"];
    checkedAt?: string;
    changedAt?: string;
    note: string;
  }[];
  entries: CalendarEntry[];
  /** Where each ranking's deadline came from, once someone changed it. */
  origin: Record<string, Pick<RankingConfig, "deadlineSource" | "deadlineUrl" | "deadlineBy" | "deadlineAt">>;
}

export interface HubData {
  activeSlugs: string[];
  publicSlugs: string[];
  deadlines: Record<string, string>;
  /** Each tracked ranking's deadline and other dates, soonest first. */
  calendar: CalendarItem[];
  /** Only for people who may change deadlines. */
  deadlineDesk: DeadlineDesk | null;
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

/** One row of the Office's post manager: a post, or a story or unit proposal that becomes one when edited. */
export interface PostRow {
  /** The post's id, or the slug of a story or proposal that isn't a post yet. */
  key: string;
  /** Set for posts. */
  id?: string;
  slug: string;
  /** Not a post yet: one of the Hub's own stories, or a unit's proposal. */
  legacy?: "story" | "proposal";
  title: string;
  subtitle: string;
  sdgs: number[];
  themes: string[];
  hashtags: string[];
  layout: "cover" | "feature" | "split" | "essay" | "banner" | "gallery" | "magazine" | "alternate";
  thumbnail: PostMedia | null;
  body: string;
  photos: PostMedia[];
  status: PostStatus;
  author: { name: string; unit: string; avatar?: string };
  /** When it first reached the public website. */
  postedAt?: string;
  /** The last change, or when a unit proposed it. */
  updatedAt?: string;
  /** A publication request waiting on it. */
  requestId?: string;
  analytics?: PostAnalyticsData;
}

export interface PostAnalyticsData {
  totalViews: number;
  last7Days: number;
  last30Days: number;
  daily: { date: string; views: number }[];
  trackingSince: string;
  lastViewedAt?: string;
}

/** What the post manager needs: the rows, and what this viewer may do with them. */
export interface PostDesk {
  rows: PostRow[];
  can: { create: boolean; edit: boolean; delete: boolean; publish: boolean };
  /** Posting goes through the publication workflow for this viewer. */
  needsApproval: boolean;
  /** The public website shows published posts (the library is on and its dataset Public). */
  live: boolean;
  /** The viewer, as the composer shows the author. */
  me: { name: string; unit: string; avatar?: string };
}
