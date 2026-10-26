import type { NextRequest } from "next/server";
import { mediaPath } from "@/lib/governance/posts";
import { emblemPath } from "@/lib/governance/unit-emblems";
import { ensurePublished, publicEmblems, publicMedia, readMedia } from "@/lib/governance/server/media";
import { publicUrl } from "@/lib/r2";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { viewerCan } from "@/lib/governance/viewer";

const missing = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * A picture from the media buckets. A post's picture is open to anyone while a published post shows
 * it; until then (drafts, posts in review, unpublished ones, uploads not yet saved) only people who manage
 * posts can see it. A unit's logo is open to anyone once a unit carries it; before that, only to people who
 * edit the Directory. Public pictures come from the public bucket: a redirect to its address when R2_PUBLIC_URL
 * is set, otherwise streamed from it; the rest are streamed from the private bucket.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const src = `/media/${(await ctx.params).path.join("/")}`;
  const post = mediaPath(src);
  const logo = post ? null : emblemPath(src);
  const path = post ?? logo;
  if (!path) return missing();
  const state = await readState();
  const open = post ? publicMedia(state).has(src) : publicEmblems(state).has(src);
  if (!open) {
    const viewer = await getViewer();
    const allowed = post ? viewerCan(viewer, "posts", "view") : viewerCan(viewer, "directory", "edit") || viewerCan(viewer, "directory", "create");
    if (!allowed) return missing();
  }
  if (open) {
    if (!(await ensurePublished(path).catch((e: unknown) => (console.error(e), false)))) return missing();
    const url = publicUrl(path);
    if (url) return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "public, max-age=300" } });
  }
  const file = await readMedia(path, open ? "public" : "private");
  if (!file || !file.type.startsWith("image/")) return missing();
  return new Response(file, {
    headers: {
      "Content-Type": file.type,
      "Cache-Control": open ? "public, max-age=3600, stale-while-revalidate=86400" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
