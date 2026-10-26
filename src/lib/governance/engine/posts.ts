/*
 * Impact and Innovation posts. The Office writes them in the composer; a unit's story proposal, or one of the
 * Hub's own stories, becomes a post the first time the Office edits it. Posting goes through the publication
 * workflow whenever enough other administrators can decide it. Every change is authorized and audited.
 */
import { IMPACT_THEMES, STORIES } from "@/lib/data";
import type { Command, CommandResult, PostInput } from "../commands";
import { cleanRich, isRich, plainText } from "@/lib/rich-text";
import { hashtag, isPostLayout, isPostMediaSrc, POST_LIMITS, postPictures, slugify } from "../posts";
import type { PostMedia, PostRecord, PostStatus } from "../types";
import { can, clean, cleanText, deny, invalid, log, nextId, ok, type Ctx } from "./core";
import { publishPost } from "./mutations";
import { needsApproval, openRequest } from "./requests";

type Fields = Pick<PostRecord, "title" | "subtitle" | "sdgs" | "themes" | "hashtags" | "layout" | "thumbnail" | "body" | "photos">;

const res = (p: { id: string; title: string }) => ({ type: "Post", id: p.id, label: p.title });

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** What the audit trail calls each part of a post. */
const PARTS: [keyof Fields, string][] = [
  ["title", "title"],
  ["subtitle", "subtitle"],
  ["body", "text"],
  ["photos", "photos"],
  ["thumbnail", "thumbnail"],
  ["sdgs", "SDGs"],
  ["themes", "themes"],
  ["hashtags", "hashtags"],
  ["layout", "layout"],
];

/** A picture as the composer sent it, or null when it isn't one of the places a post's pictures may come from. */
function picture(m: unknown): PostMedia | null {
  if (!m || typeof m !== "object") return null;
  const { src, width, height, alt } = m as Record<string, unknown>;
  if (typeof src !== "string" || !isPostMediaSrc(src)) return null;
  const size = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 20_000 ? Math.round(n) : 0);
  return { src, width: size(width), height: size(height), alt: clean(alt, POST_LIMITS.alt) };
}

/** The composer's fields, checked. Posting asks for more than saving a draft. */
function read(input: PostInput | undefined, publish: boolean): { fields: Fields } | { problem: string } {
  const i: Partial<PostInput> = input ?? {};
  const title = clean(i.title, POST_LIMITS.title);
  if (title.length < 4) return { problem: "Give the post a title of at least four characters." };
  const sdgs = [...new Set(list(i.sdgs))];
  if (sdgs.some((n) => typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 17)) return { problem: "Choose SDGs between 1 and 17." };
  const themes = [...new Set(list(i.themes))];
  if (themes.some((t) => typeof t !== "string" || !(IMPACT_THEMES as readonly string[]).includes(t))) return { problem: "Choose themes from the list." };
  if (themes.length > POST_LIMITS.themes) return { problem: `Choose up to ${POST_LIMITS.themes} themes.` };
  const tags = list(i.hashtags).map((t) => (typeof t === "string" ? hashtag(t) : ""));
  if (tags.some((t) => !t)) return { problem: "Use letters, numbers or underscores in hashtags." };
  const hashtags = tags.filter((t, n) => tags.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === n);
  if (hashtags.length > POST_LIMITS.hashtags) return { problem: `Add up to ${POST_LIMITS.hashtags} hashtags.` };
  if (i.layout !== undefined && !isPostLayout(i.layout)) return { problem: "Choose a layout from the list." };
  if (list(i.photos).length > POST_LIMITS.photos) return { problem: `Add up to ${POST_LIMITS.photos} photos.` };
  const photos = list(i.photos).map(picture);
  const thumbnail = i.thumbnail ? picture(i.thumbnail) : null;
  if (photos.some((p) => !p) || (i.thumbnail && !thumbnail)) return { problem: "A picture didn’t finish uploading. Remove it and add it again." };
  const raw = typeof i.body === "string" ? i.body.replace(/\r\n?/g, "\n") : "";
  if (raw.length > POST_LIMITS.markup * 2) return { problem: "The story is too long to save." };
  const body = isRich(raw) ? cleanRich(raw) : cleanText(raw, POST_LIMITS.body);
  if (body.length > POST_LIMITS.markup) return { problem: "The story has too much formatting to save. Clear some of it and try again." };
  if (plainText(body).length > POST_LIMITS.body) return { problem: `Shorten the story to ${POST_LIMITS.body.toLocaleString("en")} characters.` };
  if (publish && !plainText(body).trim() && !photos.length) return { problem: "Write the story or add photos before posting." };
  if (publish && !sdgs.length) return { problem: "Tag at least one SDG before posting." };
  return {
    fields: {
      title,
      subtitle: clean(i.subtitle, POST_LIMITS.subtitle),
      sdgs: (sdgs as number[]).sort((a, b) => a - b),
      themes: themes as string[],
      hashtags,
      layout: i.layout ?? "cover",
      thumbnail,
      body,
      photos: photos as PostMedia[],
    },
  };
}

/** An address no post, proposal or story uses yet. */
function freeSlug(ctx: Ctx, title: string) {
  const r = ctx.state.records;
  const taken = (s: string) => r.posts.some((p) => p.slug === s) || r.proposals.some((p) => p.slug === s) || STORIES.some((x) => x.slug === s);
  const base = slugify(title);
  let slug = base;
  for (let n = 2; taken(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const pendingFor = (ctx: Ctx, slug: string) => ctx.state.requests.find((r) => r.status === "Pending" && r.payload.kind === "publication" && r.payload.target === "story" && r.payload.id === slug);

/** Withdraw a publication request still waiting on the post. */
function dropRequest(ctx: Ctx, slug: string, why: string) {
  const req = pendingFor(ctx, slug);
  if (!req) return;
  req.status = "Cancelled";
  req.completedAt = ctx.iso;
  log(ctx, "request.cancel", "Approval", { type: "Request", id: req.id, label: req.title }, "Success", why);
}

/** Put the post on the public website, or send it for approval when the publication workflow applies. */
function release(ctx: Ctx, post: PostRecord): CommandResult {
  if (!needsApproval(ctx, "publication")) {
    publishPost(ctx, post);
    return ok("Posted.", { data: post.id });
  }
  post.status = "In review";
  const req =
    pendingFor(ctx, post.slug) ??
    openRequest(ctx, "publication", { kind: "publication", target: "story", id: post.slug, title: post.title }, `Publish post: ${post.title}`, `Posted by ${ctx.actor.name}.`);
  return ok(`Sent for approval (${req.id}).`, { data: post.id, requestId: req.id });
}

/** A unit's proposal or one of the Hub's own stories becoming a post: its address, proposer and standing carry over. */
function takeOver(ctx: Ctx, slug: string): Pick<PostRecord, "slug" | "authorId" | "unitSlug" | "createdAt" | "status" | "publishedAt"> | null {
  const r = ctx.state.records;
  const proposal = r.proposals.find((p) => p.slug === slug);
  const story = STORIES.find((x) => x.slug === slug);
  const was = r.stories[slug] ?? (proposal ? "In review" : story?.state);
  if ((!proposal && !story) || was === "Deleted") return null;
  const status: PostStatus = was === "Published" ? "Published" : was === "In review" ? "In review" : was === "Withdrawn" ? "Unpublished" : "Draft";
  r.proposals = r.proposals.filter((p) => p.slug !== slug);
  // The Hub's own stories stay in the code; marking them taken over keeps them from showing twice.
  if (story) r.stories[slug] = "Deleted";
  else delete r.stories[slug];
  return {
    slug,
    authorId: proposal?.by ?? ctx.actor.id,
    unitSlug: proposal?.unitSlug ?? ctx.state.units.find((u) => u.name === story?.unit)?.id,
    createdAt: proposal?.at ?? ctx.iso,
    status,
    publishedAt: status === "Published" || status === "Unpublished" ? (story?.postedAt ?? ctx.iso) : undefined,
  };
}

export function savePost(ctx: Ctx, cmd: Extract<Command, { type: "post.save" }>): CommandResult {
  const r = ctx.state.records;
  const existing = cmd.id ? r.posts.find((p) => p.id === cmd.id) : undefined;
  if (cmd.id && !existing) return invalid("That post no longer exists.");
  const target = existing ? res(existing) : { type: "Post", id: "new", label: clean(cmd.input?.title) || "Untitled post" };
  if (!can(ctx, "posts", existing ? "edit" : "create")) return deny(ctx, existing ? "post.update" : "post.create", "Data", target, "Your role cannot write Impact and Innovation posts.");
  if (cmd.publish && !can(ctx, "posts", "approve")) return deny(ctx, "post.publish", "Approval", target, "Your role cannot publish posts.");
  const checked = read(cmd.input, cmd.publish);
  if ("problem" in checked) return invalid(checked.problem);
  const f = checked.fields;

  if (existing) {
    const before = postPictures(existing).map((m) => m.src);
    const was = { ...existing, hashtags: existing.hashtags ?? [], layout: existing.layout ?? "cover" };
    const changed = PARTS.filter(([k]) => JSON.stringify(was[k]) !== JSON.stringify(f[k])).map(([, word]) => word);
    Object.assign(existing, f, { updatedAt: ctx.iso, updatedBy: ctx.actor.id });
    log(ctx, "post.update", "Data", res(existing), "Success", changed.length ? `Changed the ${changed.join(", ")}` : "Saved without changes");
    const kept = new Set(postPictures(existing).map((m) => m.src));
    const gone = before.filter((src) => !kept.has(src));
    if (gone.length) ctx.effects.push({ kind: "delete-media", srcs: gone });
    if (cmd.publish && existing.status !== "Published" && !pendingFor(ctx, existing.slug)) return release(ctx, existing);
    return ok(existing.status === "Published" ? "Post updated." : existing.status === "Draft" ? "Draft saved." : "Saved.", { data: existing.id });
  }

  let base: ReturnType<typeof takeOver> = null;
  if (cmd.from) {
    if (r.posts.some((p) => p.slug === cmd.from)) return invalid("That story is already a post. Open it from the list.");
    base = takeOver(ctx, cmd.from);
    if (!base) return invalid("That story no longer exists.");
  }
  const post: PostRecord = {
    id: nextId(ctx, "post", "PO-", 4),
    slug: base?.slug ?? freeSlug(ctx, f.title),
    ...f,
    status: base?.status ?? "Draft",
    authorId: base?.authorId ?? ctx.actor.id,
    unitSlug: base?.unitSlug,
    createdAt: base?.createdAt ?? ctx.iso,
    updatedAt: ctx.iso,
    updatedBy: ctx.actor.id,
    publishedAt: base?.publishedAt,
  };
  r.posts.unshift(post);
  const detail = [cmd.from && `From ${cmd.from}`, count(post.photos.length, "photo"), post.sdgs.length ? `SDG ${post.sdgs.join(", ")}` : "No SDGs yet"];
  log(ctx, "post.create", "Data", res(post), "Success", detail.filter(Boolean).join(" · "));
  if (cmd.publish && post.status !== "Published" && !pendingFor(ctx, post.slug)) return release(ctx, post);
  return ok(post.status === "Published" ? "Post updated." : "Draft saved.", { data: post.id });
}

export function setPostStatus(ctx: Ctx, id: string, to: "Published" | "Unpublished" | "Draft"): CommandResult {
  const post = ctx.state.records.posts.find((p) => p.id === id);
  if (!post) return invalid("That post no longer exists.");
  const action = to === "Published" ? "post.publish" : to === "Unpublished" ? "post.unpublish" : "post.draft";
  if (!can(ctx, "posts", to === "Draft" ? "edit" : "approve"))
    return deny(ctx, action, "Approval", res(post), to === "Draft" ? "Your role cannot edit posts." : "Your role cannot publish or unpublish posts.");
  const touched = () => Object.assign(post, { updatedAt: ctx.iso, updatedBy: ctx.actor.id });
  if (to === "Published") {
    if (post.status === "Published") return ok("Already posted.");
    const pending = pendingFor(ctx, post.slug);
    if (pending) return invalid(`Already waiting for approval (${pending.id}).`);
    if (!plainText(post.body).trim() && !post.photos.length) return invalid("Write the story or add photos before posting.");
    if (!post.sdgs.length) return invalid("Tag at least one SDG before posting.");
    touched();
    return release(ctx, post);
  }
  if (to === "Unpublished") {
    if (post.status !== "Published") return invalid("Only a live post can be unpublished.");
    post.status = "Unpublished";
    touched();
    log(ctx, "post.unpublish", "Approval", res(post), "Success", "Removed from the public website");
    return ok("Unpublished.");
  }
  if (post.status !== "In review") return invalid("Only a post waiting for review can move back to drafts.");
  dropRequest(ctx, post.slug, "The post moved back to drafts");
  post.status = "Draft";
  touched();
  log(ctx, "post.draft", "Data", res(post), "Success", "Moved back to drafts");
  return ok("Moved to drafts.");
}

export function deletePost(ctx: Ctx, id: string): CommandResult {
  const r = ctx.state.records;
  const post = r.posts.find((p) => p.id === id);
  if (!post) return invalid("That post no longer exists.");
  if (!can(ctx, "posts", "delete")) return deny(ctx, "post.delete", "Data", res(post), "Your role cannot delete posts.");
  dropRequest(ctx, post.slug, "The post was deleted");
  r.posts = r.posts.filter((p) => p !== post);
  const pictures = postPictures(post).map((m) => m.src);
  log(ctx, "post.delete", "Data", res(post), "Success", `Was ${post.status.toLowerCase()} · ${count(pictures.length, "picture")}`);
  if (pictures.length) ctx.effects.push({ kind: "delete-media", srcs: pictures });
  return ok("Post deleted.");
}
