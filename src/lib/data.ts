import { DEMO_ON, demo } from "./demo";

/*
 * The shapes of the Hub's data, the helpers that format it, and the stages and statuses its workflows move
 * through. The data itself lives in Supabase: reference data (ranking frameworks, dictionary, calendar, the
 * Office, pictures) through lib/reference.ts, and everything units submit through the governance store. The
 * record lists below are empty unless NEXT_PUBLIC_DEMO_DATA=1 fills them with presentation data (lib/demo.ts).
 */

/** A ranking family's key in Supabase (ranking_families): THE, QS, QSS, UI, WURI. */
export type FamilyKey = string;

/** "none": no result recorded yet. */
export type Direction = "up" | "down" | "steady" | "new" | "none";

export interface RankPoint {
  year: number;
  /** Best (lowest) rank in the band */
  hi: number | null;
  /** Worst (highest) rank in the band */
  lo: number | null;
  label: string;
}

export interface Indicator {
  name: string;
  weight: string;
  current: number | null;
  target: number | null;
  unit?: string;
  trend: "Improving" | "Stable" | "Declining" | "Critical" | "No data";
  status: EvidenceStatus;
  owner: string;
  definition: string;
  formula: string;
  history: number[];
  actions: string[];
  /** QS Sustainability: the category's lenses and lead offices. */
  lenses?: string[];
  offices?: string[];
  /** GreenMetric: the metrics UST reports in the category. */
  metrics?: string[];
}

export interface Ranking {
  slug: string;
  short: string;
  name: string;
  family: FamilyKey;
  current: string;
  previous: string;
  target: string;
  direction: Direction;
  readiness: number;
  deadline: string;
  pending: number;
  message: string;
  /** Executive interpretation shown first on the ranking's Overview tab. */
  interpretation: string;
  measures: string;
  emphasis: string[];
  menu: string[];
  history: RankPoint[];
  indicators: Indicator[];
  strengths: string[];
  gaps: string[];
  opportunities: string[];
  dataSources: string[];
  commonErrors: string[];
  methodologyChanges: string;
  reportingPeriod: string;
  publicNote: string;
}

export type EvidenceStatus =
  | "Validated"
  | "For review"
  | "Needs revision"
  | "Not yet submitted"
  | "Not applicable";

/** A dimension measured across the rankings (ranking_dimensions). */
export type Dimension = string;

/* Executive dashboard dimension performance (0–100 index), once the Office scores each dimension. */
export const DIMENSION_SCORES: { dimension: Dimension; current: number; target: number }[] = DEMO_ON ? demo.dimensionScores : [];

/* Units */
export type UnitKind = "Faculty or college" | "Research centre" | "Office";
export interface Unit {
  slug: string;
  name: string;
  kind: UnitKind;
  coordinator: string;
  assigned: number;
  completed: number;
  validated: number;
  revisions: number;
  rankingsServed: number;
  assistance: boolean;
}

/* Required actions (Action center) */
export interface ActionItem {
  id: string;
  action: string;
  ranking: string;
  unit: string;
  due: string;
  status: EvidenceStatus | "Not started";
}

export const ACTIONS: ActionItem[] = DEMO_ON ? demo.actions : [];

/* Evidence items (shared by validation queue and faculty portal) */
export interface EvidenceItem {
  id: string;
  title: string;
  unit: string;
  unitSlug: string;
  type: string;
  period: string;
  submitted: string;
  submittedBy: string;
  submittedById?: string;
  status: EvidenceStatus;
  stage: number; // 0 Received … 5 Result achieved
  /** Rung on the impact evidence ladder, 1 Activity documented … 5 Long-term impact established. */
  level: 1 | 2 | 3 | 4 | 5;
  mappedTo: string[];
  sdgs: number[];
  summary: string;
  result: string;
  beneficiaries: string;
  files: string[];
  /** Uploaded files, downloadable from /media/evidence/… by people who may see the record. */
  attachments?: { name: string; src: string; bytes: number }[];
  comments: { by: string; role: string; date: string; text: string }[];
}

export const STAGES = ["Received", "Under review", "Accepted", "Included in final submission", "Result achieved"] as const;

export const EVIDENCE: EvidenceItem[] = DEMO_ON ? demo.evidence : [];

/* Engineering portal requirements */
export interface Requirement {
  id: string;
  title: string;
  ranking: string;
  indicator: string;
  due: string;
  status: EvidenceStatus;
  template: string;
  evidenceId?: string;
}

export const ENGINEERING_REQUIREMENTS: Requirement[] = DEMO_ON ? demo.requirements : [];

/* Impact stories arrive through the Hub's proposal workflow. Each follows the proposal's showcase format:
   challenge → Thomasian response → implementation → measurable outcome → beneficiaries →
   SDG/ranking alignment → replication guidance. Only "Published" stories reach the public view. */
/** One of the impact themes in Supabase (reference_lists "impact-theme"). */
export type ImpactTheme = string;

export interface Story {
  slug: string;
  title: string;
  unit: string;
  kind: "SDG story" | "Innovation" | "Campus sustainability" | "Research" | "Partnership";
  state: "Published" | "In review" | "Draft";
  year: number;
  themes: ImpactTheme[];
  sdgs: number[];
  rankings: string[];
  challenge: string;
  response: string;
  implementation: string;
  beneficiaries: string;
  outcome: string;
  outcomeFigure: string;
  outcomeLabel: string;
  evidence: string;
  replication: string;
  lessons: string;
  images: string[];
  /** When it reached the public website. */
  postedAt?: string;
  /** Set for stories written as posts in the Office's composer: their own text and pictures. */
  post?: StoryPost;
}

/** A picture in a post: an upload served from /media/…, or one of the Hub's own photographs. Size 0 when unknown. */
export interface StoryPicture {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface StoryPost {
  id: string;
  subtitle: string;
  /** The editor's rich text (lib/rich-text.ts), or plain text where a blank line starts a paragraph. */
  body: string;
  /** Without the #. */
  hashtags: string[];
  layout: "cover" | "feature" | "split" | "essay" | "banner" | "gallery" | "magazine" | "alternate";
  thumbnail: StoryPicture | null;
  photos: StoryPicture[];
}

export const STORIES: Story[] = DEMO_ON ? demo.stories : [];

export const storyBySlug = (slug: string) => STORIES.find((s) => s.slug === slug);
export const PUBLISHED_STORIES = STORIES.filter((s) => s.state === "Published");

/** The WURI categories where UST placed in the Top 100, from the official result letter. */
export const WURI_PLACEMENTS: string[] = DEMO_ON ? demo.wuriPlacements : [];

/** A broad subject area (reference_lists "subject-area"), shown with its discipline colour. */
export type SubjectArea = string;

/** A subject portfolio quadrant (reference_lists "subject-quadrant"). */
export type Quadrant = string;

/** Awards the Office gives units for their contribution in a cycle. */
export const RECOGNITION: { award: string; unit: string; reason: string }[] = DEMO_ON ? demo.recognition : [];

export interface DictionaryEntry {
  term: string;
  definition: string;
  links: { ranking: string; indicator: string }[];
}

export type PlanStatus = "On track" | "At risk" | "Not started" | "Complete";
export const ACTION_PLAN: { action: string; kpi: string; owner: string; timeline: string; progress: number; status: PlanStatus }[] = DEMO_ON ? demo.plan : [];

/** Peer positions beside UST's in QS WUR, for the comparison panel. */
export const COMPARISON: { name: string; value: string; own: boolean }[] = DEMO_ON ? demo.comparison : [];

export const NOTIFICATIONS: { text: string; when: string; href: string }[] = DEMO_ON ? demo.notifications : [];

export const UNIT_NOTIFICATIONS: { text: string; when: string; href: string }[] = DEMO_ON ? demo.unitNotifications : [];

export function daysUntil(iso: string, from = new Date().toISOString().slice(0, 10)) {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(iso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

/** "15 October 2026": the date the Hub's figures are current as of (System Configuration, site.asOf). */
export const formatAsOf = (iso: string) => formatDate(iso, { day: "numeric", month: "long", year: "numeric" });

/** Readable text colour on a coloured fill (WCAG relative luminance). */
export function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.179 ? "#15130F" : "#FFFFFF";
}

/** Readiness wording follows "progress, not pressure": no unit or ranking is called failing. */
export function readinessLevel(pct: number): { label: string; tone: "ok" | "revise" | "missing" } {
  if (pct >= 85) return { label: "Ready", tone: "ok" };
  if (pct >= 70) return { label: "On track", tone: "ok" };
  if (pct >= 60) return { label: "Needs attention", tone: "revise" };
  return { label: "Early stage", tone: "missing" };
}
