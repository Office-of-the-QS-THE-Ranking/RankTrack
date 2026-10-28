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
  DocumentFile,
  DocumentCoverTone,
  DocumentKind,
  NotificationTemplate,
  PeriodConfig,
  PostMedia,
  PostStatus,
  RankingConfig,
  SystemConfig,
  WorkspaceShelf,
  WorkingDocStatus,
} from "./types";
import type { UnitEmblem } from "./unit-emblems";
import type { Answers, FormKind, FormSchema, FormStatus, ResponseStatus, ReviewState, StageSpec, UnitSection } from "@/lib/forms/types";
import type { CopyAccess } from "@/lib/forms/copies";

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
/** A research article or report as the public website and the Office's table show it: the unit by name, no account ids. */
export interface DocumentView {
  id: string;
  slug: string;
  kind: DocumentKind;
  title: string;
  authors: string[];
  venue: string;
  type: string;
  abstract: string;
  issued: string;
  doi?: string;
  url?: string;
  file?: DocumentFile;
  sdgs: number[];
  keywords: string[];
  unitSlug?: string;
  unit?: string;
  featured: boolean;
  coverTone?: DocumentCoverTone;
  status: PostStatus;
}

/** One row of the Office's research article or report table. */
export interface DocumentRow extends DocumentView {
  updatedAt: string;
  updatedBy: string;
  publishedAt?: string;
  /** A publication request waiting on it. */
  requestId?: string;
}

/** The Office's table of research articles or of reports. */
export interface DocumentDesk {
  kind: DocumentKind;
  rows: DocumentRow[];
  can: { create: boolean; edit: boolean; delete: boolean; publish: boolean };
  /** Publishing goes through the publication workflow for this viewer. */
  needsApproval: boolean;
  /** The public website shows published documents (Publications is switched on). */
  live: boolean;
  /** The kinds the form offers (reference list article-type or insight-type). */
  types: string[];
  /** Units a document can come from, Colleges/Faculties first. */
  units: { id: string; name: string; group: string }[];
}

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

/** A Workspace file as the page shows it: names, not account ids. */
export interface WorkspaceItem {
  id: string;
  shelf: WorkspaceShelf;
  folderId?: string;
  name: string;
  src: string;
  bytes: number;
  /** One of the Office's shared files. */
  shared: boolean;
  addedBy: string;
  addedAt: string;
  updatedAt: string;
  archivedAt?: string;
  archivedBy?: string;
}

/** A Workspace folder as the page shows it. */
export interface WorkspaceFolderItem {
  id: string;
  shelf: WorkspaceShelf;
  parentId?: string;
  name: string;
  /** One of the Office's shared folders. */
  shared: boolean;
}

/** A working document as the page shows it. */
export interface WorkingDocItem {
  id: string;
  title: string;
  date: string;
  rankings: string[];
  sdgs: number[];
  authors: string[];
  status: WorkingDocStatus;
  links: string[];
  remarks?: string;
  addedBy: string;
  updatedAt: string;
}

/** A unit's Working Documents. */
export interface WorkingDesk {
  /** Whose documents these are; null for the Office's own. */
  unitId: string | null;
  docs: WorkingDocItem[];
  /** May add, change and remove them. */
  canWrite: boolean;
}

/** One Workspace: a unit's (with the Office's shared files beside its own), or the Office's shared one. */
export interface WorkspaceDesk {
  /** Whose files are written here; null for the Office's shared files. */
  unitId: string | null;
  owner: string;
  shelves: WorkspaceShelf[];
  files: WorkspaceItem[];
  folders: WorkspaceFolderItem[];
  /** May add, rename, move, archive and delete the files (and folders) written here. */
  canWrite: boolean;
  uploads: { types: string[]; maxFileMB: number };
}

/** A digital form as the Digital Forms page shows it. */
export interface FormItem {
  id: string;
  code: string;
  prefix: string;
  title: string;
  description: string;
  kind: FormKind;
  reference?: string;
  issuer?: { id: string; name: string };
  status: FormStatus;
  closesOn?: string;
  /** Its link builds team copies, each a response with its own reference and link. */
  copies: boolean;
  /** The Office's form, in a unit's Workspace: open to fill in and share, not to change. */
  shared: boolean;
  /** The viewer runs it: details, status, responses and analytics. */
  manage: boolean;
  /** Its questions; the review's too for those who run it. */
  schema: FormSchema;
  /** For those who run it, team copies included from the moment they're built; `drafts` are the ones not sent yet. */
  responses?: { total: number; week: number; lastAt?: string; drafts: number };
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/** A unit a unit question can name, by Directory section. */
export interface FormUnit {
  id: string;
  name: string;
  section: UnitSection;
  /** Nested under the unit before it, for the picker's indent. */
  depth?: number;
}

/** The Digital Forms of a Workspace: a unit's own with the Office's open forms beside them, or the Office's. */
export interface FormsDesk {
  /** Whose forms are run here; null for the Office's. */
  unitId: string | null;
  /** May change the forms run here. */
  canWrite: boolean;
  /** Where responder links point: https://… */
  origin: string;
  forms: FormItem[];
  units: FormUnit[];
  /** Offices a form can name as its issuer. */
  issuers: { id: string; name: string }[];
}

/** One response, for the people who run its form; a team copy is one from the moment it's built, "draft" until it's sent. */
export interface FormResponseItem {
  id: string;
  ref: string;
  answers: Answers;
  review: ReviewState;
  status: "draft" | ResponseStatus;
  respondent: { name: string; email: string };
  submittedAt: string;
  updatedAt: string;
  /** A team copy: its name and who started it. */
  copy?: { label: string; owner: string };
}

/** A response that has been sent: what the review, analytics and export work on. */
export type SentResponse = FormResponseItem & { status: ResponseStatus };

export const isSent = (r: FormResponseItem): r is SentResponse => r.status !== "draft";

/** A form as its responder link opens it: no review fields, nothing internal. */
export interface ResponderForm {
  code: string;
  /** Starts each response's reference: CDP-0007. */
  prefix: string;
  title: string;
  description: string;
  kind: FormKind;
  reference?: string;
  issuer?: string;
  /** The Faculty, College, Institute or School the issuer belongs to: the unit mark names it, with the issuer under it as a department. */
  issuerUnit?: string;
  status: FormStatus;
  closesOn?: string;
  schema: FormSchema;
  /** The sign-offs a response goes through, in order, for the confirmation's "what happens next". */
  stages: StageSpec[];
  units: FormUnit[];
  /** Opened by someone who runs it, before it takes responses: nothing is sent. */
  preview: boolean;
  /** Its link builds team copies (lib/forms/copies.ts) instead of opening on the questions. */
  copies: boolean;
}

/** Who a form's pages know this browser to be: from Google sign-in on a form, or the Hub's own session. */
export interface FormWho {
  email: string;
  name: string;
  avatar?: string;
  via: "google" | "hub";
}

/** A team copy in a list: the start page's "Your copies". */
export interface CopySummary {
  token: string;
  ref: string;
  label: string;
  access: CopyAccess;
  status: "draft" | ResponseStatus;
  /** The viewer started it. */
  mine: boolean;
  editedAt: string;
}

/** Someone with a copy open now, by the page they have it open on. */
export interface CopyPerson {
  id: string;
  name: string;
  avatar?: string;
}

/** A sign-off as a sent copy's link shows it. */
export interface CopyStage {
  verb: string;
  role: string;
  state: "done" | "next" | "waiting" | "returned" | "declined";
  on?: string;
  note?: string;
}

/** A team copy as its link opens it. */
/** Someone signed in with Google who asked a private copy's owner to let them open it. */
export interface CopyRequest {
  email: string;
  name: string;
  /** Their Google photo, as they asked or from their Hub account. */
  avatar?: string;
  at: string;
}

export interface CopyView {
  token: string;
  ref: string;
  label: string;
  access: CopyAccess;
  /** Who started it: their Google name, or email. */
  owner: string;
  /** The viewer started it: may rename it and choose who can open it. */
  mine: boolean;
  /** Who else may open it when private; for its owner only. */
  members?: string[];
  /** Who asked to open it while private, oldest first; for its owner only. */
  requests?: CopyRequest[];
  /** Full names and photos of the people on it and asking, by email (Hub accounts, then the owner's directory); for its owner only. */
  faces?: Record<string, { name: string; photo?: string }>;
  version: number;
  answers: Answers;
  status: "draft" | ResponseStatus;
  edited?: { by: string; at: string };
  here: CopyPerson[];
  /** The Realtime channel its open pages share changes on (lib/forms/copies.ts liveChannel); new whenever its sharing changes. */
  live: string;
  /** Once sent: when, and where its sign-offs stand. */
  sent?: { at: string; stages: CopyStage[] };
}
