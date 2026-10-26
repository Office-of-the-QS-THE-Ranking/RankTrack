import "server-only";

/*
 * The governed view of the Hub's data for server components: the reference data (Supabase, see
 * reference.ts) passed through the governance store. Rankings follow System Configuration, units follow
 * the Organizational Directory, records carry their review and publication state, and the public website
 * only receives what is classified Public and switched on.
 */
import { cache } from "react";
import { ENGINEERING_REQUIREMENTS, type DictionaryEntry, type EvidenceItem, type Ranking, type Requirement } from "@/lib/data";
import type { Reference } from "@/lib/reference";
import { datasetPublic, featureOn, rankingActive, rankingPublic } from "../derive";
import { canWith } from "../rbac";
import { evidenceList, requirementUnit, storyList } from "../records";
import type { HubData } from "../hub-types";
import type { GovernanceState } from "../types";
import { buildUnits } from "../unit-participation";
import type { Viewer } from "../viewer";
import { noticeVisible } from "../engine";
import { readState } from "./store";
import { reference } from "./reference";

/** The unit an evidence record is credited to, by its current directory name; archived units say so. */
function unitLabel(state: GovernanceState, slug: string, programId?: string) {
  const u = state.units.find((x) => x.id === slug);
  const base = u?.name ?? slug;
  const suffix = u?.status === "Archived" ? (u.mergedInto ? ` (merged into ${state.units.find((x) => x.id === u.mergedInto)?.name})` : " (archived)") : "";
  const prog = programId ? state.units.find((x) => x.id === programId) : undefined;
  return `${base}${suffix}${prog ? ` · ${prog.name}${prog.status === "Archived" ? " (archived)" : ""}` : ""}`;
}

function withDeadline(state: GovernanceState, r: Ranking): Ranking {
  const c = state.config.rankings.find((x) => x.slug === r.slug);
  return c && c.deadline !== r.deadline ? { ...r, deadline: c.deadline } : r;
}

function buildDictionary(state: GovernanceState, ref: Reference): DictionaryEntry[] {
  return ref.dictionary.map((d) => {
    const t = state.terms.find((x) => x.term === d.term);
    return t?.definition ? { ...d, definition: t.definition } : d;
  });
}

function buildRequirements(state: GovernanceState, evidence: EvidenceItem[], unitSlug: string): Requirement[] {
  if (unitSlug !== "engineering") return [];
  return ENGINEERING_REQUIREMENTS.map((r) => {
    const ev = r.evidenceId ? evidence.find((e) => e.id === r.evidenceId) : undefined;
    const v = state.records.values[r.id];
    return { ...r, status: ev?.status ?? v?.status ?? r.status };
  });
}

function build(state: GovernanceState, ref: Reference) {
  const evidence: EvidenceItem[] = evidenceList(state).map((e) => ({ ...e, unit: unitLabel(state, e.unitSlug, e.programId) }));
  const stories = storyList(state);
  const storiesPublic = featureOn(state, "public-impact") && datasetPublic(state, "DS-STORIES");
  const units = buildUnits(state, evidence, ref);
  const rankings = ref.rankings.filter((r) => rankingActive(state, ref, r.slug)).map((r) => withDeadline(state, r));
  const publicRankings = ref.rankings.filter((r) => rankingPublic(state, ref, r.slug)).map((r) => withDeadline(state, r));
  const current = state.config.cycles.find((c) => c.status === "Current")?.id ?? state.config.cycles[0]?.id ?? "";
  return {
    state,
    ref,
    rankings,
    publicRankings,
    isActive: (slug: string) => rankingActive(state, ref, slug),
    isPublic: (slug: string) => rankingPublic(state, ref, slug),
    ranking: (slug: string) => rankings.find((r) => r.slug === slug),
    publicRanking: (slug: string) => publicRankings.find((r) => r.slug === slug),
    units,
    activeUnits: units.filter((u) => u.status === "Active"),
    unit: (slug: string) => units.find((u) => u.slug === slug),
    unitByName: (n: string) => units.find((u) => u.name === n),
    evidence,
    stories,
    /** Stories the public website may show: published, the stories dataset is Public, and the library is on. */
    publishedStories: storiesPublic ? stories.filter((s) => s.state === "Published") : [],
    dictionary: buildDictionary(state, ref),
    cycles: state.config.cycles,
    currentCycle: current,
    periods: state.config.periods.filter((p) => p.accepting),
    uploads: state.config.uploads,
    dashboard: state.config.dashboard,
    site: state.config.site,
    privacy: state.security.privacy,
    feature: (id: string) => featureOn(state, id),
    publishedReports: state.records.publishedReports,
    requirements: (unitSlug: string) => buildRequirements(state, evidence, unitSlug),
  };
}

export type Hub = ReturnType<typeof build>;

/** Governed data for this request. */
export const hub = cache(async (): Promise<Hub> => {
  const [state, ref] = await Promise.all([readState(), reference()]);
  return build(state, ref);
});

/** What a workspace's client components receive, filtered to what the viewer may reach. */
export async function clientHub(viewer: Viewer, variant: "office" | "unit"): Promise<HubData> {
  const h = await hub();
  const state = h.state;
  const reachable = (e: EvidenceItem) =>
    canWith(viewer.grants, "evidence", "view", { unitId: (e as EvidenceItem & { programId?: string }).programId ?? e.unitSlug });
  const evidence =
    variant === "office"
      ? h.evidence.filter(reachable)
      : h.evidence.filter((e) => {
          if (e.unitSlug !== viewer.portal.unitId && !state.units.some((u) => u.id === e.unitSlug && u.mergedInto === viewer.portal.unitId)) return false;
          const program = (e as EvidenceItem & { programId?: string }).programId;
          return viewer.portal.programId ? program === viewer.portal.programId || !program : reachable(e);
        });
  const unitName = viewer.portal.unitName;
  // A post's full text and pictures stay on the server: the workspaces list stories, and the post manager reads its own data.
  const ownUnit = (label: string) => label === unitName || label.startsWith(`${unitName} · `);
  const stories = (variant === "office" ? h.stories : h.stories.filter((s) => s.state === "Published" || ownUnit(s.unit))).map(({ post: _post, ...s }) => s);
  // Reporting-period values only for units the viewer may see data for.
  const values = Object.entries(state.records.values).filter(([id]) => {
    const unitId = requirementUnit(id);
    return !!unitId && (variant === "unit" ? unitId === viewer.portal.unitId : true) && canWith(viewer.grants, "data", "view", { unitId });
  });
  return {
    activeSlugs: h.rankings.map((r) => r.slug),
    publicSlugs: h.publicRankings.map((r) => r.slug),
    deadlines: Object.fromEntries(state.config.rankings.map((r) => [r.slug, r.deadline])),
    bodies: state.config.bodies.map((b) => ({ key: b.key, name: b.name, short: b.short, enabled: b.enabled })),
    units: h.units,
    evidence,
    stories,
    dictionary: h.dictionary,
    cycles: state.config.cycles,
    currentCycle: h.currentCycle,
    periods: h.periods,
    uploads: h.uploads,
    dashboard: h.dashboard,
    site: h.site,
    notices: state.notices
      .filter((n) => noticeVisible(n.to, viewer.id, viewer.grants) && (variant === "office" ? !n.to.startsWith("unit:") || n.to === viewer.id : n.to !== "office"))
      .slice(0, 12)
      .map((n) => ({ id: n.id, text: n.text, href: n.href, at: n.at, unread: !n.readBy.includes(viewer.id) })),
    requirements: variant === "unit" ? h.requirements(viewer.portal.unitId) : [],
    values: Object.fromEntries(values.map(([k, v]) => [k, { value: v.value, source: v.source, status: v.status }])),
    publishedReports: h.publishedReports.map((r) => ({ id: r.id, title: r.title, at: r.at })),
    templates: state.config.templates.map((t) => ({ id: t.id, name: t.name, enabled: t.enabled })),
  };
}
