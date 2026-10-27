/*
 * Stories & News posts as both sides see them: the limits the composer and the server share, where
 * a post's pictures may come from, and the plain-text helpers that turn a post into excerpts and paragraphs.
 * No server code, so the composer can import it.
 */
import { plainText } from "@/lib/rich-text";
import type { PostMedia, PostRecord } from "./types";

/** `body` counts the story's text; `markup` caps its stored HTML (lib/rich-text.ts). */
export const POST_LIMITS = { title: 140, subtitle: 220, body: 20_000, markup: 120_000, photos: 20, themes: 3, hashtags: 10, hashtag: 40, alt: 240 } as const;

/** How a post is laid out on the public website. The composer draws each as a small schematic. */
export const POST_LAYOUTS = [
  { key: "cover", name: "Cover", hint: "A large picture beside the title, then the story and its gallery." },
  { key: "feature", name: "Feature", hint: "The title first, a wide picture under it, then the story." },
  { key: "split", name: "Side by side", hint: "The story on one side, its pictures alongside." },
  { key: "essay", name: "Essay", hint: "Words first; the pictures gather at the end." },
  { key: "banner", name: "Banner", hint: "The title set over a full-width picture." },
  { key: "gallery", name: "Gallery first", hint: "The pictures lead, the story follows." },
  { key: "magazine", name: "Magazine", hint: "A cover picture, then the story in two columns." },
  { key: "alternate", name: "Alternating", hint: "Each paragraph beside a picture, switching sides as the story goes." },
] as const;
export type PostLayout = (typeof POST_LAYOUTS)[number]["key"];
export const isPostLayout = (v: unknown): v is PostLayout => POST_LAYOUTS.some((l) => l.key === v);

/** A hashtag as stored: no #, letters, numbers and underscores only, so "#Climate Action" becomes "ClimateAction". */
export const hashtag = (text: string) => text.normalize("NFC").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, POST_LIMITS.hashtag);

/** Picture formats the composer accepts and the media bucket stores, with the extension each is saved under. */
export const MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const MEDIA_MAX_MB = 10;

/** What a post's pictures may be when picked: JPG or PNG up to 2 MB. The browser then compresses each before upload. */
export const POST_PICK = { types: { "image/jpeg": "JPG", "image/png": "PNG" } as Record<string, string>, maxMb: 2 } as const;

/** Uploads are served from /media/posts/<uuid>.<ext>; the Hub's own photographs (media_assets) from /media/site/photos/. */
const UPLOADED = /^\/media\/(posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|gif|avif))$/;
const OWN = /^\/media\/site\/photos\/[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/;

/** The bucket path of an uploaded picture, or null for anything that isn't one. */
export const mediaPath = (src: string) => UPLOADED.exec(src)?.[1] ?? null;

export const isPostMediaSrc = (src: string) => UPLOADED.test(src) || OWN.test(src);

/** Every picture a post shows, thumbnail first, each once. */
export function postPictures(p: Pick<PostRecord, "thumbnail" | "photos">): PostMedia[] {
  const out: PostMedia[] = [];
  for (const m of [p.thumbnail, ...p.photos]) if (m && !out.some((x) => x.src === m.src)) out.push(m);
  return out;
}

export function slugify(title: string) {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "post"
  );
}

/** Paragraphs as written: a blank line starts a new one; single line breaks stay inside it. */
export const paragraphs = (body: string) =>
  body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Minutes to read a text at about 220 words a minute, never less than one. */
export const readingMinutes = (text: string) => Math.max(1, Math.round(plainText(text).split(/\s+/).filter(Boolean).length / 220));

/** The opening of the body, cut at a word, for lists and previews. */
export function excerpt(body: string, max = 220) {
  const flat = plainText(body).replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s.,;:–—-]+$/, "")}…`;
}
