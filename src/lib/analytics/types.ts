/*
 * The analytics engine's model. A ranking body's methodology for one edition is data (a catalog of groups and
 * indicators, each with how it is entered and how it scores); the facts are what the Hub knows for that edition
 * (values, evidence links, activities, benchmarks, reviewed cases); the reports are computed from both, never
 * stored except as snapshots. Type-only module, safe to import anywhere.
 */

export type ISODate = string;
export type ISOTime = string;

/* ---------- Methodology catalog ---------- */

export type EditionStatus = "Draft" | "Active" | "Closed" | "Archived";

/**
 * How an edition's indicators add up. Each kind is a function in aggregate.ts, so a new ranking body with a new
 * formula needs one entry there; everything else about it is data.
 */
export type AggregateKind = "sum" | "the-impact" | "best-per-group" | "readiness" | "results";

export interface Edition {
  id: string;
  /** ranking_frameworks.slug */
  ranking: string;
  year: number;
  label: string;
  /** The methodology document it follows, e.g. "Methodology 2026 v1.1". */
  methodology: string;
  /** The reference period the body asks data for. */
  period: string;
  status: EditionStatus;
  /** What a perfect result is worth on the body's own scale (GreenMetric 10,000; one THE SDG 100). */
  scale: number;
  aggregate: AggregateKind;
  /** The aggregate's settings (THE: the mandatory group, its weight, how many best groups and theirs). */
  options: AggregateOptions;
  /** The files it was built from. */
  sources: string[];
  notes: string;
  opensOn?: ISODate;
  closesOn?: ISODate;
  /** Calendar years evidence may come from, when the body restricts it. */
  years?: number[];
  updatedBy: string;
  updatedAt: ISOTime;
}

export interface AggregateOptions {
  mandatory?: string;
  mandatoryWeight?: number;
  best?: number;
  bestWeight?: number;
  /** The body's rounding of the published figure, if any. */
  digits?: number;
  [key: string]: unknown;
}

export interface Group {
  code: string;
  position: number;
  name: string;
  /** Most points the group can earn on the edition's scale; null when it only holds unscored items. */
  points: number | null;
  /** Its share of the overall result (0–1) when the body states one. */
  weight: number | null;
  mandatory: boolean;
}

export interface Choice {
  key: string;
  label: string;
}

/** What someone enters for an indicator. */
export type InputSpec =
  | { type: "none" }
  | { type: "number"; unit?: string; integer?: boolean; min?: number; max?: number }
  | { type: "choice"; options: Choice[] }
  | { type: "picks"; options: Choice[] }
  | { type: "yesno" }
  | { type: "text"; max?: number }
  | { type: "date" }
  /** A published score, rank or band, recorded from the body's own results. */
  | { type: "result" }
  /** Cases reviewed against a rubric (WURI programmes). */
  | { type: "cases" };

/** A banded threshold: the computed value falls in [min, max] (inclusive where stated) and earns `share` of the points. */
export interface Band {
  label: string;
  min?: number;
  minIncl?: boolean;
  max?: number;
  maxIncl?: boolean;
  share: number;
}

export interface Criterion {
  key: string;
  label: string;
  /** The main criterion it belongs to (Innovativeness, Implementability, Impact). */
  group: string;
  max: number;
  levels: { label: string; min: number; max: number; hint: string }[];
}

/**
 * How an indicator scores. Each kind is a function in rules.ts. `points` is the most it can earn on the edition's
 * scale (GreenMetric points; THE: its share of the SDG, in percent).
 */
export type ScoreRule =
  /** A value computed from inputs, then banded (GreenMetric SI1: ({1.5} − {1.6}) / {1.5} × 100). */
  | { kind: "bands"; points: number; expr: string; bands: Band[] }
  /** One option picked, each worth a share. */
  | { kind: "choice"; points: number; shares: Record<string, number> }
  /**
   * THE's evidence questions: existence (a yes; or the options picked: the best one's share, their sum, or `each`
   * per pick, up to `cap`), the evidence's relevance (specific 1, general 0.5) and whether it is public.
   */
  | {
      kind: "claim";
      points: number;
      /** `shares` with `sum`: the picked options add up (to `cap`); without: the best picked option counts. */
      existence: { yes?: number; shares?: Record<string, number>; sum?: boolean; each?: number; cap?: number };
      evidence: number;
      public: number;
      /** A further point for a policy's dates, where the body gives one. */
      dates?: number;
    }
  /** A proportion the body normalises against every participant: shown as the ratio, projected only from benchmarks. */
  | { kind: "ratio"; points: number; expr: string; better?: "higher" | "lower" }
  /** Measured by the body itself (bibliometrics, reputation surveys): known only once results are recorded. */
  | { kind: "external"; points: number }
  /** A target date: the earlier, the more it earns (THE 13.4.2). */
  | { kind: "dated"; points: number; steps: { until: ISODate; share: number }[]; later: number }
  /** Cases scored by reviewers against criteria; the indicator takes its best case. */
  | { kind: "rubric"; points: number; criteria: Criterion[] };

export type RuleKind = ScoreRule["kind"];

export interface EvidenceSpec {
  required?: boolean;
  /** The body awards a point for public evidence (THE). */
  public?: boolean;
  /** The body asks when a policy was made and last reviewed. */
  policyDates?: boolean;
  /** What counts as evidence, in the body's words. */
  note?: string;
}

/** A source in the Hub that suggests a value: counts from the activity register, totals from a template upload. */
export type Feed =
  /** `per`: "year" counts the latest academic year with activities, "average" the mean across the edition's years. */
  | { kind: "activities"; kinds?: string[]; tags?: string[]; measure?: "count" | "beneficiaries"; per?: "year" | "average"; label?: string }
  | { kind: "template"; profile: string; measure: string; label?: string };

/** How unit contributions make the University's value: the Office's own figure, a sum, the highest, the latest. */
export type Rollup = "office" | "sum" | "max" | "latest";

export interface CatalogIndicator {
  code: string;
  position: number;
  group: string;
  /** The metric it sits under (THE 1.3 for 1.3.3). */
  parent: string | null;
  /** The body's own label for it (GreenMetric SI1). */
  ref: string | null;
  name: string;
  guidance: string;
  unit: string | null;
  input: InputSpec;
  score: ScoreRule | null;
  evidence: EvidenceSpec;
  /** org_units ids of the units that supply it. */
  owners: string[];
  /** The office names the methodology or responsibility map gives, kept when no unit matches. */
  ownerLabels: string[];
  rollup: Rollup;
  feeds: Feed[] | null;
  tags: string[];
}

/** One edition's methodology as a portable document: what the Methodology page imports and exports. */
export interface MethodologyPack {
  pack: 1;
  edition: Omit<Edition, "updatedBy" | "updatedAt" | "status"> & { status?: EditionStatus };
  groups: Group[];
  indicators: CatalogIndicator[];
}

export interface Catalog {
  edition: Edition;
  groups: Group[];
  indicators: CatalogIndicator[];
}

/* ---------- Facts ---------- */

/** What was entered for an indicator. Only the fields its input type uses are set. */
export interface Value {
  num?: number;
  choice?: string;
  picks?: string[];
  yes?: boolean;
  text?: string;
  date?: ISODate;
  /** When a policy was made and last reviewed. */
  created?: ISODate;
  reviewed?: ISODate;
}

export type ValueStatus = "Draft" | "For review" | "Validated" | "Needs revision" | "Not applicable";
export type ValueSource = "manual" | "import" | "template" | "register" | "portal";

/** The University's own figure, compiled by the Office, has no unit. */
export const UNIVERSITY = "";

export interface ValueRow {
  id: string;
  edition: string;
  code: string;
  /** org_units id, or UNIVERSITY. */
  unit: string;
  value: Value;
  note: string;
  source: ValueSource;
  sourceRef?: string;
  status: ValueStatus;
  by: string;
  at: ISOTime;
  reviewedBy?: string;
  reviewedAt?: ISOTime;
  reviewNote?: string;
}

export type Relevance = "specific" | "general" | "not relevant";

export interface LinkRow {
  id: string;
  edition: string;
  code: string;
  unit: string;
  /** An evidence record in the governance store. */
  evidenceId?: string;
  url?: string;
  label: string;
  /** The calendar year the evidence documents. */
  year?: number;
  relevance?: Relevance;
  public?: boolean;
  /** One self-contained item, not a folder or a page of links (THE rejects those). */
  selfContained?: boolean;
  assessedBy?: string;
  assessedAt?: ISOTime;
  by: string;
  at: ISOTime;
}

export const ACTIVITY_KINDS = ["Service learning", "Community development", "Advocacy", "Outreach", "Event", "Research", "Other"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface Activity {
  id: string;
  unit?: string;
  /** The unit as the source wrote it (AB, AMV-COA). */
  unitLabel: string;
  kind: ActivityKind;
  /** Academic year, "2024-2025". */
  year: string;
  title: string;
  proponent: string;
  community: string;
  proposalRef?: string;
  reportRef?: string;
  /** A terminal report was filed. */
  reported: boolean;
  sdgs: number[];
  beneficiaries?: number;
  partner: string;
  mou?: string;
  startsOn?: ISODate;
  endsOn?: ISODate;
  /** sustainability, international, student-led, cultural */
  tags: string[];
  source: "manual" | "import" | "portal";
  sourceRef?: string;
  by: string;
  at: ISOTime;
}

export const PEER_BANDS = ["Philippines", "ASEAN", "Aspirational", "Other"] as const;
export type PeerBand = (typeof PEER_BANDS)[number];

export interface Peer {
  id: string;
  name: string;
  country: string;
  band: PeerBand;
}

/** The University's own published result has no peer. */
export const OWN = "";

export interface Benchmark {
  id: string;
  ranking: string;
  year: number;
  /** analytics_peers id, or OWN. */
  peer: string;
  /** An indicator or group code, "overall", or "<subject>:<indicator>". */
  metric: string;
  value?: number;
  /** A rank or band as published ("701-850"). */
  label?: string;
  source: "manual" | "import";
  note?: string;
  by: string;
  at: ISOTime;
}

export interface Case {
  id: string;
  edition: string;
  /** The indicator (WURI category) it is filed under. */
  category: string;
  title: string;
  unit?: string;
  abstract: string;
  source: "manual" | "import";
  sourceRef?: string;
  /** What the case file left blank or got wrong. */
  checks: { label: string; ok: boolean }[];
  by: string;
  at: ISOTime;
}

export interface Review {
  id: string;
  caseId: string;
  reviewer: string;
  scores: Record<string, number>;
  total: number;
  note: string;
  at: ISOTime;
}

export interface CampaignUnit {
  unit: string;
  codes: string[];
  remindedAt?: ISOTime;
  reminders: number;
  escalatedAt?: ISOTime;
  thankedAt?: ISOTime;
}

export interface Campaign {
  id: string;
  code: string;
  edition: string;
  title: string;
  /** The memorandum it follows, e.g. "UST: S052-00-ME03". */
  memo: string;
  message: string;
  due: ISODate;
  status: "Open" | "Closed";
  /** Days between reminders while open. */
  remindDays: number;
  /** Days past due before the Office is told. */
  escalateDays: number;
  by: string;
  at: ISOTime;
  closedAt?: ISOTime;
  units: CampaignUnit[];
}

export const PLAN_STATUSES = ["Not started", "On track", "At risk", "Complete"] as const;
export type PlanState = (typeof PLAN_STATUSES)[number];

export interface ActionRow {
  id: string;
  edition: string;
  code?: string;
  action: string;
  owner?: string;
  due?: ISODate;
  status: PlanState;
  progress: number;
  note: string;
  by: string;
  at: ISOTime;
}

/** Evidence records from the governance store that links point at. */
export interface EvidenceRef {
  id: string;
  title: string;
  unit: string;
  status: string;
  submitted: ISODate;
  public?: boolean;
}

/** Everything the engine reads to report on one edition. */
export interface Facts {
  values: ValueRow[];
  links: LinkRow[];
  activities: Activity[];
  benchmarks: Benchmark[];
  peers: Peer[];
  cases: Case[];
  reviews: Review[];
  evidence: EvidenceRef[];
  /** Template totals by profile and measure, from the latest upload of each. */
  templates: Record<string, Record<string, number>>;
  /**
   * Figures a reviewer accepted from a unit's evidence (lib/review): offered beside the indicator like a feed's
   * count, never entered for anyone.
   */
  findings?: { code: string; value: number; from: string }[];
}

/* ---------- Reports ---------- */

/**
 * An indicator's points on the edition's scale. `secured`: from validated values and assessed evidence; `claimed`:
 * from everything submitted; `open`: not yet computable (no data, or measured by the body); `lost`: what the
 * current answers can't earn.
 */
export interface Points {
  max: number;
  secured: number;
  claimed: number;
  open: number;
  lost: number;
}

export type CheckKey = "value" | "validated" | "evidence" | "relevant" | "public" | "single" | "dates" | "period" | "owner";

export interface Check {
  key: CheckKey;
  label: string;
  ok: boolean;
  /** Points that passing it would add. */
  gain?: number;
}

export interface BandHit {
  label: string;
  share: number;
  /** The next band up, what it takes and what it adds. */
  next?: { label: string; target: number; gain: number; direction: "raise" | "lower" };
}

export type IndicatorState = "Validated" | "For review" | "Needs revision" | "Not started" | "Not applicable";

export interface IndicatorReport {
  code: string;
  /** The University's resolved value. */
  value: Value | null;
  /** The value an expression computed (a ratio, a percentage). */
  computed: number | null;
  band: BandHit | null;
  points: Points | null;
  readiness: number;
  checks: Check[];
  state: IndicatorState;
  /** Units whose values or evidence feed it. */
  contributors: string[];
  links: number;
  /** Values the register or a template upload suggests. */
  suggested: { value: number; from: string }[];
  updatedAt?: ISOTime;
}

export interface GroupReport {
  code: string;
  name: string;
  points: Points | null;
  /** The group's score on its own scale (0–100 for THE SDGs; points for GreenMetric categories). */
  readiness: number;
  indicators: number;
  done: number;
}

export interface TotalReport {
  kind: AggregateKind;
  label: string;
  secured: number;
  claimed: number;
  open: number;
  max: number;
  /** The groups that count (THE: SDG 17 and the best three). */
  counted?: string[];
  note?: string;
}

export interface Fix {
  code: string;
  title: string;
  /** Points it would add, on the edition's scale. */
  gain: number;
  kind: CheckKey | "band" | "missing";
  owners: string[];
}

export interface Issue {
  code?: string;
  level: "error" | "warn" | "info";
  kind: string;
  text: string;
}

export interface EditionReport {
  edition: string;
  indicators: Record<string, IndicatorReport>;
  groups: GroupReport[];
  total: TotalReport;
  /** 0–100, weighted by what each indicator is worth. */
  readiness: number;
  fixes: Fix[];
  issues: Issue[];
  counts: { indicators: number; scored: number; withValue: number; validated: number; links: number; revisions: number };
}

/** What a snapshot keeps, to show movement later. */
export interface SnapshotSummary {
  readiness: number;
  total: Pick<TotalReport, "secured" | "claimed" | "open" | "max">;
  groups: { code: string; claimed: number; secured: number; readiness: number }[];
  counts: EditionReport["counts"];
}

export interface Snapshot {
  id: string;
  edition: string;
  at: ISOTime;
  by: string;
  kind: "auto" | "manual";
  summary: SnapshotSummary;
}
