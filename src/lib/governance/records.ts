/*
 * The workspace records as the governance store sees them: the prototype's sample evidence and stories,
 * overlaid with every change and new submission recorded through the Hub.
 */
import { EVIDENCE, STORIES, type Story } from "@/lib/data";
import type { EvidenceRecord, GovernanceState } from "./types";

export function evidenceList(state: GovernanceState): EvidenceRecord[] {
  const overlay = state.records.evidence;
  const base = EVIDENCE.map((e) => overlay[e.id] ?? (e as EvidenceRecord));
  const added = Object.values(overlay).filter((e) => !EVIDENCE.some((x) => x.id === e.id));
  return [...base, ...added];
}

export const evidenceById = (state: GovernanceState, id: string) => evidenceList(state).find((e) => e.id === id);

/** A proposal from the contributor workspace, shaped like a story so the libraries can list it. */
function proposalStory(p: GovernanceState["records"]["proposals"][number], state: GovernanceState): Story {
  const unit = state.units.find((u) => u.id === p.unitSlug)?.name ?? p.unitSlug;
  return {
    slug: p.slug,
    title: p.title,
    unit,
    kind: "SDG story",
    state: "In review",
    year: Number(p.at.slice(0, 4)),
    themes: ["SDG Stories"],
    sdgs: p.sdgs,
    rankings: p.rankings,
    challenge: p.challenge,
    response: "",
    implementation: "",
    beneficiaries: "",
    outcome: p.outcome,
    outcomeFigure: "",
    outcomeLabel: "",
    evidence: "",
    replication: "",
    lessons: "",
    images: [],
  };
}

export function storyList(state: GovernanceState): Story[] {
  const base = STORIES.map((s) => {
    const st = state.records.stories[s.slug];
    return st ? { ...s, state: st === "Withdrawn" ? ("Draft" as const) : st } : s;
  });
  const proposed = state.records.proposals.map((p) => {
    const st = state.records.stories[p.slug];
    const story = proposalStory(p, state);
    return st ? { ...story, state: st === "Withdrawn" ? ("Draft" as const) : st } : story;
  });
  return [...base, ...proposed];
}
