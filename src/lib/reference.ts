/*
 * The Hub's reference data: the ranking frameworks, the dictionary, the calendar, the Office's profile, the
 * public website's pictures and copy, the SDGs and the short lists forms offer. It lives in Supabase (see
 * supabase/migrations/20261026180000_reference_data.sql) and its pictures in the R2 public bucket. Server code
 * reads it with `reference()` (lib/governance/server/reference.ts); client components with `useReference()`
 * (components/reference/ReferenceProvider.tsx). The builders below turn it into the shapes the views draw,
 * with the presentation figures of lib/demo.ts when NEXT_PUBLIC_DEMO_DATA=1.
 */
import { DEMO_ON, demo } from "./demo";
import type { DictionaryEntry, EvidenceStatus, Ranking } from "./data";
import type { UnitEmblem } from "./governance/unit-emblems";

export interface Family {
  key: string;
  name: string;
  /** The ranking body in System Configuration whose switch governs the family's rankings. */
  body: string;
  color: string;
  soft: string;
  band: string;
}

export type Photo = { src: string; alt: string; pos?: string; width?: number; height?: number };

export interface Credit {
  key: string;
  title: string;
  creator: string;
  license: string;
  page: string;
  via: string;
}

export interface DirectoryEntry {
  key: string;
  parentKey: string | null;
  category: string;
  name: string;
  emails: string[];
}

export interface OfficeProfile {
  name: string;
  reportsTo: string;
  profileDate: string;
  location: string;
  landmark: string;
  phone: string;
  email: string;
  /** Postal address lines after the University's name. */
  street: string;
  city: string;
  vision: string;
  mission: string;
  summary: string;
}

export interface Office extends OfficeProfile {
  functions: string[];
  objectives: { title: string; text: string }[];
  deliverables: { title: string; text: string }[];
  workplan: { title: string; owners: string; timing: string }[];
  team: { role: string; who: string; focus: string }[];
  portfolio: { name: string; href: string }[];
}

/** Where a ranking body publishes its dates and how the deadline check reads them (deadline_sources). */
export interface DeadlineSource {
  id: string;
  /** The ranking body (ranking_families.body). */
  body: string;
  name: string;
  /** The page a person opens; {year} and {next} stand for this year and the next. */
  page: string;
  /** What the check reads, or null for a body whose dates are entered by hand. */
  fetchUrl: string | null;
  /** table: rows of a dates table; sentence: a pattern with a named group `due`; watch: what to compare; manual: not read. */
  kind: "table" | "sentence" | "watch" | "manual";
  pattern: string | null;
  /** Which rankings a date belongs to, and whether it is their deadline or another date in their calendar. */
  rules: { row?: string; slugs: string[]; deadline?: boolean; label?: string }[];
  note: string;
}

export interface Reference {
  latestEdition: number;
  families: Record<string, Family>;
  /** The Rankings menu: group labels and their frameworks' slugs, in menu order. */
  groups: { label: string; slugs: string[] }[];
  /** Every framework the Office tracks, in menu order, with UST's recorded results. */
  rankings: Ranking[];
  dimensions: string[];
  dimensionNotes: Record<string, string>;
  /** Which dimensions each ranking measures, by slug. */
  matrix: Record<string, string[]>;
  /** The picture beside each ranking, by slug. */
  rankingPhoto: Record<string, Photo>;
  dictionary: DictionaryEntry[];
  calendar: { month: string; items: string[] }[];
  office: Office;
  /** The public website's photographs, by key. */
  photos: Record<string, Photo>;
  credits: Credit[];
  /** The six stages a contribution passes through, as the home page tells them. */
  process: { name: string; text: string; countLabel: string; photo: Photo }[];
  sdgNames: Record<number, string>;
  sdgColors: Record<number, string>;
  sdgIcons: Record<number, string>;
  storyThemes: string[];
  /** Kinds of research article (Journal article, Conference paper…) and of report (Annual report, Policy brief…). */
  articleTypes: string[];
  insightTypes: string[];
  wuriCategories: string[];
  reportTypes: { name: string; note: string }[];
  quadrantNotes: Record<string, string>;
  /** Broad subject areas and the discipline colour each carries. */
  subjectAreas: Record<string, string>;
  ladderSteps: string[];
  pipelineSteps: string[];
  wuriPipelineSteps: string[];
  researchFunnel: { step: string; note: string }[];
  /** The University's directory as supplied in ust_directory.csv. */
  directory: DirectoryEntry[];
  /** The University's arms for its units, by directory key (unit_emblems). */
  emblems: Record<string, UnitEmblem>;
  deadlineSources: DeadlineSource[];
}

/* ---------- Rankings ---------- */

export const rankingBySlug = (ref: Reference, slug: string) => ref.rankings.find((r) => r.slug === slug);

export const groupOf = (ref: Reference, slug: string) => ref.groups.find((g) => g.slugs.includes(slug))?.label ?? "Rankings";

export const rankingsInGroup = (ref: Reference, label: string) =>
  (ref.groups.find((g) => g.label === label)?.slugs ?? []).flatMap((s) => rankingBySlug(ref, s) ?? []);

export const familyOf = (ref: Reference, key: string): Family =>
  ref.families[key] ?? { key, name: key, body: key, color: "#6B6B6B", soft: "#EFEFEF", band: "#6B6B6B" };

/** The ranking body (System Configuration) a ranking belongs to, through its family. */
export const bodyOfRanking = (ref: Reference, slug: string) => {
  const r = rankingBySlug(ref, slug);
  return r ? ref.families[r.family]?.body : undefined;
};

/* ---------- Public website ---------- */

/** The ranking bodies, with the colour that identifies each beside its name, and their frameworks. */
export function bodies(ref: Reference) {
  return ref.groups.flatMap((g) => {
    const rankings = g.slugs.flatMap((s) => rankingBySlug(ref, s) ?? []);
    if (!rankings.length) return [];
    const family = familyOf(ref, rankings[0].family);
    return [{
      id: g.label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-+$/, ""),
      label: g.label,
      short: family.key === "UI" ? "GreenMetric" : family.key,
      name: family.name,
      color: family.color,
      rankings,
    }];
  });
}

/** "Where your work counts": which rankings measure each kind of work. */
export const counts = (ref: Reference) =>
  ref.dimensions.map((dim) => ({ dim, rankings: ref.rankings.filter((r) => ref.matrix[r.slug]?.includes(dim)), note: ref.dimensionNotes[dim] }));

export const dimsOf = (ref: Reference, slug: string) => ref.dimensions.flatMap((d, i) => (ref.matrix[slug]?.includes(d) ? [i] : []));

/** The results that rose in their latest editions, in the order the home page shows them. */
export const movers = (ref: Reference) => ref.rankings.filter((r) => r.direction === "up");

/** The home page's contribution stages, with this cycle's counts. */
export const processStages = (ref: Reference) => {
  const counts = pipeline(ref);
  return ref.process.map((s, i) => ({ ...s, count: counts[i]?.count ?? 0 }));
};

/* ---------- Dashboards: labels from Supabase, figures from the Hub (or the presentation data) ---------- */

const counted = (steps: string[], figures: number[]) => steps.map((step, i) => ({ step, count: DEMO_ON ? figures[i] ?? 0 : 0 }));

export const impactLadder = (ref: Reference) => counted(ref.ladderSteps, demo.ladder);
export const pipeline = (ref: Reference) => counted(ref.pipelineSteps, demo.pipeline);
export const wuriPipeline = (ref: Reference) => counted(ref.wuriPipelineSteps, demo.wuriPipeline);

/** The rungs of the impact evidence ladder, 1 Activity documented … 5 Long-term impact established. */
export const evidenceLevels = (ref: Reference) => ref.ladderSteps;

export const researchFunnel = (ref: Reference) => ref.researchFunnel.map((f, i) => ({ ...f, value: DEMO_ON ? demo.funnel[i] ?? "—" : "—" }));

/** QS Sustainability's three categories, with their lenses and lead offices. */
export function qssPillars(ref: Reference) {
  return (rankingBySlug(ref, "qs-sustainability")?.indicators ?? []).map((ind, i) => ({
    name: ind.name,
    weight: ind.weight,
    lenses: ind.lenses ?? [],
    offices: ind.offices ?? [],
    policies: DEMO_ON ? demo.qss[i]?.[0] ?? 0 : 0,
    outcomes: DEMO_ON ? demo.qss[i]?.[1] ?? 0 : 0,
    status: (DEMO_ON ? demo.qss[i]?.[2] : undefined) ?? ("Not yet submitted" as EvidenceStatus),
  }));
}

/** GreenMetric's six categories and the metrics UST reports in each: [metric, value, target]. */
export function greenmetricPanels(ref: Reference) {
  return (rankingBySlug(ref, "greenmetric")?.indicators ?? []).map((ind, i) => ({
    name: ind.name,
    metrics: DEMO_ON && demo.greenmetric[i] ? demo.greenmetric[i] : (ind.metrics ?? []).map((m) => [m, "—", "—"]),
  }));
}

/** SDG tiles (THE Impact): every goal at zero until its evidence arrives. */
export const sdgTiles = (ref: Reference) =>
  Object.keys(ref.sdgNames).map(Number).sort((a, b) => a - b).map((sdg) => {
    const t = { sdg, readiness: 0, submitted: 0, validated: 0, units: 0, outputs: 0, policies: 0, beneficiaries: "To be documented", outcomes: 0, submittedForRating: false };
    return DEMO_ON ? demo.sdgTile(t) : t;
  });

export const subjectPortfolio = (ref: Reference) =>
  Object.keys(ref.quadrantNotes).map((quadrant) => ({ quadrant, subjects: DEMO_ON ? demo.subjects[quadrant] ?? [] : [] }));

/** The ranking whose data collection closes first. */
export const nearestDeadline = (rankings: Ranking[]) => [...rankings].sort((a, b) => a.deadline.localeCompare(b.deadline))[0];

/** Everything views draw from the reference data, in one object: lists, maps and the dashboards' figures. */
export function views(ref: Reference) {
  return {
    rankings: ref.rankings,
    families: ref.families,
    groups: ref.groups,
    latestEdition: ref.latestEdition,
    dimensions: ref.dimensions,
    dimensionNotes: ref.dimensionNotes,
    matrix: ref.matrix,
    photos: ref.photos,
    credits: ref.credits,
    rankingPhoto: ref.rankingPhoto,
    calendar: ref.calendar,
    dictionary: ref.dictionary,
    office: ref.office,
    sdgNames: ref.sdgNames,
    sdgColors: ref.sdgColors,
    sdgIcons: ref.sdgIcons,
    storyThemes: ref.storyThemes,
    articleTypes: ref.articleTypes,
    insightTypes: ref.insightTypes,
    wuriCategories: ref.wuriCategories,
    reportTypes: ref.reportTypes,
    quadrantNotes: ref.quadrantNotes,
    subjectAreas: ref.subjectAreas,
    evidenceLevels: evidenceLevels(ref),
    impactLadder: impactLadder(ref),
    pipeline: pipeline(ref),
    wuriPipeline: wuriPipeline(ref),
    researchFunnel: researchFunnel(ref),
    qssPillars: qssPillars(ref),
    greenmetricPanels: greenmetricPanels(ref),
    sdgTiles: sdgTiles(ref),
    subjectPortfolio: subjectPortfolio(ref),
    bodies: bodies(ref),
    counts: counts(ref),
    processStages: processStages(ref),
    rankingBySlug: (slug: string) => rankingBySlug(ref, slug),
    groupOf: (slug: string) => groupOf(ref, slug),
    familyOf: (key: string) => familyOf(ref, key),
    dimsOf: (slug: string) => dimsOf(ref, slug),
  };
}

export type Views = ReturnType<typeof views>;
