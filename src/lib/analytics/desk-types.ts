/*
 * What the analytics pages receive: each page's data, already filtered to what the viewer may see, plus what they
 * may do. Built on the server (server/desk.ts); type-only, safe for client components.
 */
import type { Profile } from "./templates";
import type { UnitStanding } from "./units";
import type { GapRow } from "./gap";
import type { Movement } from "./brief";
import type {
  CatalogIndicator,
  Group,
  ActionRow,
  Activity,
  AggregateKind,
  BandHit,
  Benchmark,
  Case,
  Check,
  Criterion,
  EditionStatus,
  EvidenceSpec,
  Fix,
  GroupReport,
  IndicatorState,
  InputSpec,
  Issue,
  Peer,
  Points,
  Rollup,
  RuleKind,
  TotalReport,
  Value,
  ValueRow,
} from "./types";

export interface UnitRef {
  id: string;
  name: string;
  code: string;
}

export interface EditionRef {
  id: string;
  ranking: string;
  rankingShort: string;
  color: string;
  label: string;
  year: number;
  status: EditionStatus;
  aggregate: AggregateKind;
  scale: number;
  period: string;
  methodology: string;
  closesOn?: string;
  opensOn?: string;
  years: number[];
  notes: string;
}

export interface Can {
  /** See the analytics. */
  view: boolean;
  /** Enter the University's figures, link and assess evidence, record results and benchmarks. */
  edit: boolean;
  /** Validate or return units' values. */
  validate: boolean;
  /** Methodologies, profiles, campaigns and imports. */
  manage: boolean;
  export: boolean;
}

export interface EditionCard extends EditionRef {
  total: TotalReport;
  readiness: number;
  counts: { indicators: number; scored: number; withValue: number; validated: number; links: number; revisions: number };
  groups: { code: string; name: string; claimed: number; secured: number; open: number; max: number; readiness: number }[];
  fixes: Fix[];
  issues: { errors: number; warnings: number };
  movement: Movement[];
  snapshotAt?: string;
}

export interface CampaignCard {
  id: string;
  code: string;
  edition: string;
  editionLabel: string;
  title: string;
  memo: string;
  message: string;
  due: string;
  status: "Open" | "Closed";
  remindDays: number;
  escalateDays: number;
  at: string;
  by: string;
  units: (UnitStanding & { name: string; codes: string[]; remindedAt?: string; escalatedAt?: string; thankedAt?: string })[];
}

export interface ScorecardDesk {
  editions: EditionCard[];
  campaigns: CampaignCard[];
  actions: (ActionRow & { editionLabel: string; ownerName?: string })[];
  units: UnitRef[];
  can: Can;
}

export interface LinkView {
  id: string;
  unit: string;
  unitName: string;
  url?: string;
  evidenceId?: string;
  evidenceTitle?: string;
  label: string;
  year?: number;
  relevance?: string;
  public?: boolean;
  selfContained?: boolean;
  folder: boolean;
  drive: boolean;
  assessedBy?: string;
  assessedAt?: string;
  by: string;
  at: string;
}

export interface ContributionView {
  id: string;
  unit: string;
  unitName: string;
  value: Value;
  text: string;
  note: string;
  status: ValueRow["status"];
  source: ValueRow["source"];
  by: string;
  at: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface IndicatorView {
  code: string;
  ref: string | null;
  name: string;
  group: string;
  parent: string | null;
  guidance: string;
  unit: string | null;
  input: InputSpec;
  rule: RuleKind | null;
  points: Points | null;
  /** The rule's maximum on the edition's scale. */
  max: number;
  evidence: EvidenceSpec;
  owners: UnitRef[];
  ownerLabels: string[];
  rollup: Rollup;
  tags: string[];
  state: IndicatorState;
  readiness: number;
  value: Value | null;
  valueText: string;
  computed: number | null;
  band: BandHit | null;
  checks: Check[];
  suggested: { value: number; from: string }[];
  links: LinkView[];
  /** The Office's own figure, then each unit's. */
  office: ContributionView | null;
  contributions: ContributionView[];
  updatedAt?: string;
  /** For bands rules: what the formula reads. */
  formula?: string;
  reads?: string[];
  criteria?: Criterion[];
  bands?: { label: string; share: number }[];
  shares?: { key: string; label: string; share: number }[];
}

export interface IndicatorsDesk {
  edition: EditionRef;
  editions: EditionRef[];
  groups: GroupReport[];
  rows: IndicatorView[];
  total: TotalReport;
  readiness: number;
  issues: Issue[];
  fixes: Fix[];
  units: UnitRef[];
  evidence: { id: string; title: string; unit: string; unitName: string; status: string }[];
  cases: (Case & { unitName?: string; reviews: { reviewer: string; reviewerName: string; total: number; scores: Record<string, number>; note: string; at: string }[]; average: number | null; mine?: { scores: Record<string, number>; note: string } })[];
  results: (Benchmark & { peerName?: string })[];
  can: Can;
  viewer: string;
}

export interface CollectionDesk {
  campaigns: CampaignCard[];
  editions: (EditionRef & { owners: { unit: string; codes: string[] }[]; indicators: { code: string; ref: string | null; name: string; group: string; owners: string[]; ownerLabels: string[] }[] })[];
  units: (UnitRef & { kind: string; section: string })[];
  can: Can;
}

export interface ActivitiesDesk {
  activities: (Activity & { unitName?: string })[];
  years: string[];
  units: UnitRef[];
  aliases: Record<string, string>;
  can: Can;
}

export interface BenchmarksDesk {
  rankings: { slug: string; short: string; color: string }[];
  peers: Peer[];
  benchmarks: Benchmark[];
  gaps: Record<string, GapRow[]>;
  metrics: Record<string, { key: string; label: string }[]>;
  can: Can;
}

export interface ImportsDesk {
  profiles: (Profile & { ownerName?: string })[];
  imports: {
    id: string;
    kind: string;
    profile: string | null;
    fileName: string;
    sha256: string;
    bytes: number;
    rows: number;
    edition: string | null;
    unit: string | null;
    unitName?: string;
    year: string | null;
    summary: Record<string, unknown>;
    totals: Record<string, number> | null;
    breakdowns: unknown[] | null;
    by: string;
    byName: string;
    at: string;
  }[];
  editions: EditionRef[];
  units: UnitRef[];
  aliases: Record<string, string>;
  can: Can;
}

export interface MethodologyDesk {
  editions: (EditionRef & { groups: number; indicators: number; scored: number; kinds: Record<string, number>; facts: number })[];
  rankings: { slug: string; short: string; color: string }[];
  /** The edition open on the page, with its whole catalog for editing. */
  selected: { edition: EditionRef; groups: Group[]; indicators: CatalogIndicator[] } | null;
  units: UnitRef[];
  can: Can;
}

/** A Coordinator's (or office Administrator's) Data requests page. */
export interface RequestsDesk {
  unit: UnitRef;
  campaigns: { id: string; code: string; title: string; edition: string; editionLabel: string; color: string; due: string; status: "Open" | "Closed"; message: string; memo: string; open: number; total: number }[];
  items: {
    campaign: string;
    edition: string;
    code: string;
    ref: string | null;
    name: string;
    guidance: string;
    input: InputSpec;
    unit: string | null;
    evidence: EvidenceSpec;
    mine: ContributionView | null;
    links: LinkView[];
    state: "To do" | "Sent" | "Validated" | "Returned" | "Not applicable";
  }[];
  activities: Activity[];
  evidence: { id: string; title: string; status: string }[];
  can: { submit: boolean };
}

/** A ranking's active edition in brief, for the ranking pages and the dashboard. */
export interface RankingAnalytics {
  edition: string;
  label: string;
  kind: AggregateKind;
  claimed: number;
  secured: number;
  max: number;
  readiness: number;
  /** Indicators not yet validated (or marked not applicable). */
  toGo: number;
  forReview: number;
  /** Indicators by state, for the ranking page's evidence ring. */
  states: { validated: number; forReview: number; revisions: number; notStarted: number };
  fixes: { code: string; title: string; gain: number }[];
}
