import type { NextRequest } from "next/server";
import { documentPath } from "@/lib/governance/documents";
import { evidencePath } from "@/lib/governance/evidence-files";
import { mediaPath } from "@/lib/governance/posts";
import { evidenceList } from "@/lib/governance/records";
import { emblemPath } from "@/lib/governance/unit-emblems";
import { ensurePublished, publicDocuments, publicEmblems, publicMedia } from "@/lib/governance/server/media";
import { publicUrl, streamObject, type Bucket } from "@/lib/r2";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { viewerCan } from "@/lib/governance/viewer";

/** The website's own pictures and the units' official arms (reference data, lib/governance/server/reference.ts). */
const REFERENCE = /^\/media\/((?:site\/(?:photos|sdg)|units)\/[a-z0-9][a-z0-9._-]*\.(?:jpg|webp|png))$/;

const missing = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/** A file from a bucket, streamed through without being held in memory. Only pictures are served inline. */
async function serve(bucket: Bucket, path: string, cache: string, download?: string) {
  const file = await streamObject(bucket, path).catch((e: unknown) => (console.error(e), null));
  if (!file || (!download && !file.type.startsWith("image/"))) return missing();
  const headers: Record<string, string> = { "Content-Type": file.type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" };
  if (file.size) headers["Content-Length"] = String(file.size);
  if (download) {
    // An uploaded document is always a download, in a sandbox: it can never run as a page of the Hub.
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
  }
  return new Response(file.body, { headers });
}

/**
 * A file from the media buckets. A post's picture is open to anyone while a published post shows it; until then
 * (drafts, posts in review, unpublished ones, uploads not yet saved) only people who manage posts can see it. A
 * unit's logo is open to anyone once a unit carries it; before that, only to people who edit the Directory. A
 * file attached to evidence goes only to people who may see that record, as a download; so does a document's PDF,
 * to anyone once its article or report is published. The website's
 * photographs, SDG icons and the units' official arms are open to anyone. Public pictures come from the public
 * bucket: a redirect when it has a custom domain (publicUrl), otherwise streamed from here with headers that let
 * Vercel's CDN cache them; the rest are streamed from the private bucket.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const src = `/media/${(await ctx.params).path.join("/")}`;
  const ref = REFERENCE.exec(src)?.[1];
  if (ref) {
    const url = publicUrl(ref);
    if (url) return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "public, max-age=86400" } });
    // The CDN keeps reference pictures for a month; browsers for a day.
    return serve("public", ref, "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800");
  }

  const evidence = evidencePath(src);
  if (evidence) {
    const state = await readState();
    const viewer = await getViewer();
    for (const e of evidenceList(state)) {
      const file = e.attachments?.find((f) => f.src === src);
      if (file && viewerCan(viewer, "evidence", "view", { unitId: e.programId ?? e.unitSlug })) return serve("private", evidence, "private, no-store", file.name);
    }
    return missing();
  }

  const doc = documentPath(src);
  if (doc) {
    // A published article's or report's PDF is open to anyone, as a download; until then only to people who manage posts.
    const state = await readState();
    const record = state.records.documents.find((d) => d.file?.src === src);
    if (!record?.file) return missing();
    if (!publicDocuments(state).has(src)) {
      if (!viewerCan(await getViewer(), "posts", "view")) return missing();
      return serve("private", doc, "private, no-store", record.file.name);
    }
    if (!(await ensurePublished(doc).catch((e: unknown) => (console.error(e), false)))) return missing();
    return serve("public", doc, "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600", record.file.name);
  }

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
    return serve("private", path, "private, no-store");
  }
  if (!(await ensurePublished(path).catch((e: unknown) => (console.error(e), false)))) return missing();
  const url = publicUrl(path);
  if (url) return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "public, max-age=300" } });
  // An hour, so a picture taken off the website stops being served soon after.
  return serve("public", path, "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600");
}
