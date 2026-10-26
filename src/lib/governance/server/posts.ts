import "server-only";

/*
 * The Office's post manager: every post, plus the stories and unit proposals that predate the composer, in
 * one shape the manager lists and the composer opens. A story or proposal becomes a post when it is edited.
 */
import { STORIES, type Story } from "@/lib/data";
import { datasetPublic, featureOn } from "../derive";
import { actorFor, makeCtx, needsApproval } from "../engine";
import { postUnit } from "../records";
import type { PostDesk, PostRow } from "../hub-types";
import type { GovernanceState, PostMedia, PostStatus } from "../types";
import type { Viewer } from "../viewer";
import { viewerCan } from "../viewer";
import { readState } from "./store";
import { reference } from "./reference";
import { postAnalytics } from "../post-analytics";
import { countedViews } from "./post-views";

const own = (src: string): PostMedia => ({ src, width: 0, height: 0, alt: "" });

/** A story's sections, as the opening text of the post it becomes. */
const storyBody = (s: Pick<Story, "challenge" | "response" | "implementation" | "outcome" | "beneficiaries" | "replication">) =>
  [s.challenge, s.response, s.implementation, s.outcome, s.beneficiaries && `Beneficiaries: ${s.beneficiaries}.`, s.replication && `How to adapt it: ${s.replication}`].filter(Boolean).join("\n\n");

function pendingRequests(state: GovernanceState) {
  const out = new Map<string, string>();
  for (const r of state.requests) if (r.status === "Pending" && r.payload.kind === "publication" && r.payload.target === "story") out.set(r.payload.id, r.id);
  return out;
}

function rows(state: GovernanceState): PostRow[] {
  const nameOf = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? "Former account";
  const avatarOf = (id: string) => state.accounts.find((a) => a.id === id)?.avatar;
  const unitOf = (id: string) => state.units.find((u) => u.id === id)?.name ?? id;
  const pending = pendingRequests(state);
  const posts: PostRow[] = state.records.posts.map((p) => ({
    key: p.id,
    id: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    sdgs: p.sdgs,
    themes: p.themes,
    hashtags: p.hashtags ?? [],
    layout: p.layout ?? "cover",
    thumbnail: p.thumbnail,
    body: p.body,
    photos: p.photos,
    status: p.status,
    author: { name: nameOf(p.authorId), unit: postUnit(p, state), avatar: avatarOf(p.authorId) },
    postedAt: p.publishedAt,
    updatedAt: p.updatedAt,
    requestId: pending.get(p.slug),
  }));
  const taken = new Set(posts.map((p) => p.slug));
  const stateOf = (slug: string, fallback: Story["state"]): PostStatus => {
    const st = state.records.stories[slug] ?? fallback;
    return st === "Withdrawn" ? "Unpublished" : st === "Deleted" ? "Draft" : st;
  };
  const stories: PostRow[] = STORIES.filter((s) => !taken.has(s.slug) && state.records.stories[s.slug] !== "Deleted").map((s) => ({
    key: s.slug,
    slug: s.slug,
    legacy: "story",
    title: s.title,
    subtitle: [s.outcomeFigure, s.outcomeLabel].filter(Boolean).join(" "),
    sdgs: s.sdgs,
    themes: s.themes,
    hashtags: [],
    layout: "cover",
    thumbnail: s.images[0] ? own(s.images[0]) : null,
    body: storyBody(s),
    photos: s.images.slice(1).map(own),
    status: stateOf(s.slug, s.state),
    author: { name: s.unit, unit: s.unit },
    postedAt: s.postedAt,
    requestId: pending.get(s.slug),
  }));
  const proposals: PostRow[] = state.records.proposals.map((p) => ({
    key: p.slug,
    slug: p.slug,
    legacy: "proposal",
    title: p.title,
    subtitle: p.outcome,
    sdgs: p.sdgs,
    themes: ["SDG Stories"],
    hashtags: [],
    layout: "cover",
    thumbnail: null,
    body: p.challenge,
    photos: [],
    status: stateOf(p.slug, "In review"),
    author: { name: nameOf(p.by), unit: unitOf(p.unitSlug), avatar: avatarOf(p.by) },
    updatedAt: p.at,
    requestId: pending.get(p.slug),
  }));
  return [...posts, ...stories, ...proposals];
}

/** The post manager's data for this viewer. */
export async function postDesk(viewer: Viewer): Promise<PostDesk> {
  const state = await readState();
  const account = state.accounts.find((a) => a.id === viewer.id);
  const ctx = account ? makeCtx(state, actorFor(state, account), await reference(), new Date()) : null;
  const list = rows(state);
  const counted = await countedViews(list.map((row) => row.slug));
  return {
    rows: list.map((row) => ({ ...row, analytics: postAnalytics(state, row.slug, counted.get(row.slug)) })),
    can: {
      create: viewerCan(viewer, "posts", "create"),
      edit: viewerCan(viewer, "posts", "edit"),
      delete: viewerCan(viewer, "posts", "delete"),
      publish: viewerCan(viewer, "posts", "approve"),
    },
    needsApproval: !!ctx && needsApproval(ctx, "publication"),
    live: featureOn(state, "public-impact") && datasetPublic(state, "DS-STORIES"),
    me: { name: viewer.name, unit: viewer.unitName, avatar: viewer.avatar },
  };
}
