/*
 * The workspace records as the governance store sees them: the prototype's sample evidence and stories,
 * overlaid with every change and new submission recorded through the Hub, and the posts written in the
 * Office's composer.
 */
import { EVIDENCE, STORIES, type ImpactTheme, type Story } from "@/lib/data";
import { excerpt, postPictures } from "./posts";
import type { EvidenceRecord, GovernanceState, PostRecord } from "./types";

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

/** The story kind a post's first theme suggests. */
const KIND_OF: Partial<Record<ImpactTheme, Story["kind"]>> = {
  "Thomasian Innovations": "Innovation",
  "Campus Sustainability": "Campus sustainability",
  "Research Impact": "Research",
  "International Partnerships": "Partnership",
};

/** The unit a post speaks for: the proposing unit, else the author's own. */
export function postUnit(p: PostRecord, state: GovernanceState) {
  const id = p.unitSlug ?? state.accounts.find((a) => a.id === p.authorId)?.unitId;
  return state.units.find((u) => u.id === id)?.name ?? "University of Santo Tomas";
}

/** A post, shaped like a story so the libraries and the public website list it beside the others. */
function postStory(p: PostRecord, state: GovernanceState): Story {
  const themes = p.themes as ImpactTheme[];
  return {
    slug: p.slug,
    title: p.title,
    unit: postUnit(p, state),
    kind: themes.map((t) => KIND_OF[t]).find(Boolean) ?? "SDG story",
    state: p.status === "Published" ? "Published" : p.status === "In review" ? "In review" : "Draft",
    year: Number((p.publishedAt ?? p.createdAt).slice(0, 4)),
    themes,
    sdgs: p.sdgs,
    rankings: [],
    challenge: excerpt(p.body),
    response: "",
    implementation: "",
    beneficiaries: "",
    outcome: "",
    outcomeFigure: "",
    outcomeLabel: p.subtitle,
    evidence: "",
    replication: "",
    lessons: "",
    images: postPictures(p).map((m) => m.src),
    postedAt: p.publishedAt,
    post: { id: p.id, subtitle: p.subtitle, body: p.body, hashtags: p.hashtags ?? [], layout: p.layout ?? "cover", thumbnail: p.thumbnail, photos: p.photos },
  };
}

export function storyList(state: GovernanceState): Story[] {
  const posts = state.records.posts.map((p) => postStory(p, state));
  const isPost = new Set(posts.map((p) => p.slug));
  const base = STORIES.flatMap((s) => {
    const st = state.records.stories[s.slug];
    if (isPost.has(s.slug) || st === "Deleted") return [];
    return [st ? { ...s, state: st === "Withdrawn" ? ("Draft" as const) : st } : s];
  });
  const proposed = state.records.proposals.map((p) => {
    const st = state.records.stories[p.slug];
    const story = proposalStory(p, state);
    return st && st !== "Deleted" ? { ...story, state: st === "Withdrawn" ? ("Draft" as const) : st } : story;
  });
  return [...posts, ...base, ...proposed];
}
