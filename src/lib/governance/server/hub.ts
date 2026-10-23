import "server-only";

/*
 * The governed view of the Hub's data for server components: the static sample data passed through
 * the governance store. Rankings follow System Configuration, units follow the Organizational
 * Directory, records carry their review and publication state, and the public website only receives
 * what is classified Public and switched on.
 */
import { cache } from "react";
import {
  DICTIONARY,
  ENGINEERING_REQUIREMENTS,
  RANKINGS,
  UNITS as PARTICIPATION,
  type DictionaryEntry,
  type EvidenceItem,
  type Ranking,
  type Requirement,
  type UnitKind,
} from "@/lib/data";
import { datasetPublic, featureOn, rankingActive, rankingPublic } from "../derive";
import { canWith } from "../rbac";
import { evidenceList, storyList } from "../records";
import type { HubData, HubUnit } from "../hub-types";
import type { GovernanceState, OrgKind } from "../types";
import type { Viewer } from "../viewer";
import { noticeVisible } from "../engine";
import { readState } from "./store";

const KIND: Partial<Record<OrgKind, UnitKind>> = {
  Faculty: "Faculty or college",
  College: "Faculty or college",
  Institute: "Faculty or college",
  "Research Centre": "Research centre",
  Office: "Office",
};

function buildUnits(state: GovernanceState): HubUnit[] {
  const name = (id: string) => state.units.find((u) => u.id === id)?.name ?? id;
  const participating = new Set(PARTICIPATION.map((u) => u.slug));
  const programsOf = (id: string) =>
    state.units
      .filter((u) => u.parentId === id || state.units.find((p) => p.id === u.parentId)?.parentId === id)
      .filter((u) => u.kind === "Department" || u.kind === "Program")
      .map((u) => ({ id: u.id, name: u.name, status: u.status }));
  // Participating units, plus academic units added through the directory since (with no submissions yet).
  const added = state.units.filter((u) => !participating.has(u.id) && u.history[0]?.change === "Created" && ["Faculty", "College", "Institute", "Research Centre"].includes(u.kind));
  const base = PARTICIPATION.map((p) => ({ p, o: state.units.find((u) => u.id === p.slug) }));
  return [
    ...base.map(({ p, o }) => {
      const coord = o?.adminIds.map((id) => state.accounts.find((a) => a.id === id)).find((a) => a && a.status !== "Deactivated");
      return {
        ...p,
        name: o?.name ?? p.name,
        kind: (o && KIND[o.kind]) ?? p.kind,
        coordinator: coord?.name ?? "No coordinator assigned",
        coordinatorId: coord?.id,
        code: o?.code ?? p.slug.toUpperCase(),
        status: o?.status ?? "Active",
        archivedReason: o?.archivedReason,
        mergedInto: o?.mergedInto,
        mergedIntoName: o?.mergedInto ? name(o.mergedInto) : undefined,
        programs: programsOf(p.slug),
      };
    }),
    ...added.map((o) => {
      const coord = o.adminIds.map((id) => state.accounts.find((a) => a.id === id)).find((a) => a && a.status !== "Deactivated");
      return {
        slug: o.id,
        name: o.name,
        kind: KIND[o.kind] ?? "Faculty or college",
        coordinator: coord?.name ?? "No coordinator assigned",
        coordinatorId: coord?.id,
        assigned: 0,
        completed: 0,
        validated: 0,
        revisions: 0,
        rankingsServed: 0,
        assistance: false,
        code: o.code,
        status: o.status,
        archivedReason: o.archivedReason,
        mergedInto: o.mergedInto,
        mergedIntoName: o.mergedInto ? name(o.mergedInto) : undefined,
        programs: programsOf(o.id),
      };
    }),
  ];
}

/** The unit an evidence record is credited to, by its current directory name; archived units say so. */
function unitLabel(state: GovernanceState, slug: string, programId?: string) {
  const u = state.units.find((x) => x.id === slug);
  const base = u?.name ?? PARTICIPATION.find((p) => p.slug === slug)?.name ?? slug;
  const suffix = u?.status === "Archived" ? (u.mergedInto ? ` (merged into ${state.units.find((x) => x.id === u.mergedInto)?.name})` : " (archived)") : "";
  const prog = programId ? state.units.find((x) => x.id === programId) : undefined;
  return `${base}${suffix}${prog ? ` · ${prog.name}${prog.status === "Archived" ? " (archived)" : ""}` : ""}`;
}

function withDeadline(state: GovernanceState, r: Ranking): Ranking {
  const c = state.config.rankings.find((x) => x.slug === r.slug);
  return c && c.deadline !== r.deadline ? { ...r, deadline: c.deadline } : r;
}

function buildDictionary(state: GovernanceState): DictionaryEntry[] {
  return DICTIONARY.map((d) => {
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

function build(state: GovernanceState) {
  const evidence: EvidenceItem[] = evidenceList(state).map((e) => ({ ...e, unit: unitLabel(state, e.unitSlug, e.programId) }));
  const stories = storyList(state);
  const storiesPublic = featureOn(state, "public-impact") && datasetPublic(state, "DS-STORIES");
  const units = buildUnits(state);
  const rankings = RANKINGS.filter((r) => rankingActive(state, r.slug)).map((r) => withDeadline(state, r));
  const publicRankings = RANKINGS.filter((r) => rankingPublic(state, r.slug)).map((r) => withDeadline(state, r));
  const current = state.config.cycles.find((c) => c.status === "Current")?.id ?? state.config.cycles[0]?.id ?? "";
  return {
    state,
    rankings,
    publicRankings,
    isActive: (slug: string) => rankingActive(state, slug),
    isPublic: (slug: string) => rankingPublic(state, slug),
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
    dictionary: buildDictionary(state),
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
export const hub = cache((): Hub => build(readState()));

/** What a workspace's client components receive, filtered to what the viewer may reach. */
export function clientHub(viewer: Viewer, variant: "office" | "unit"): HubData {
  const h = hub();
  const state = h.state;
  const reachable = (e: EvidenceItem) =>
    viewer.superAdmin || canWith(viewer.grants, "evidence", "view", { unitId: (e as EvidenceItem & { programId?: string }).programId ?? e.unitSlug });
  const evidence =
    variant === "office"
      ? h.evidence.filter(reachable)
      : h.evidence.filter((e) => {
          if (e.unitSlug !== viewer.portal.unitId && !state.units.some((u) => u.id === e.unitSlug && u.mergedInto === viewer.portal.unitId)) return false;
          const program = (e as EvidenceItem & { programId?: string }).programId;
          return viewer.portal.programId ? program === viewer.portal.programId || !program : reachable(e);
        });
  const unitName = viewer.portal.unitName;
  const stories = variant === "office" ? h.stories : h.stories.filter((s) => s.state === "Published" || s.unit.startsWith(unitName));
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
    values: Object.fromEntries(Object.entries(state.records.values).map(([k, v]) => [k, { value: v.value, source: v.source, status: v.status }])),
    publishedReports: h.publishedReports.map((r) => ({ id: r.id, title: r.title, at: r.at })),
    templates: state.config.templates.map((t) => ({ id: t.id, name: t.name, enabled: t.enabled })),
  };
}
