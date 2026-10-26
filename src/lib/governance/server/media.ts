import "server-only";

/*
 * Pictures for Impact and Innovation posts, and logos uploaded for units in the Directory. Every upload lands in
 * the private R2 bucket (see src/lib/r2.ts): the browser sends each file straight there through a presigned
 * upload URL the server hands out, so pictures never pass through a Server Function. Whatever the public website
 * may show (pictures of published posts, logos units carry) is copied into the public bucket when a change makes
 * it public, re-encoded on the way so nothing but the picture itself (no camera or location metadata, no other
 * bytes) reaches the public bucket, and removed from there when it stops being public. /media/… serves a public
 * file from the public bucket, and an internal one only to people who manage posts or the Directory. Files
 * attached to evidence (folder evidence/) never become public.
 *
 * public.media_uploads records who was handed each upload URL (only they may discard it) and when a file stopped
 * being used: a released file is kept for the backup retention period, so restoring a recovery point that still
 * shows it finds it in place.
 */
import { randomUUID } from "node:crypto";
import { alert } from "@/lib/alerts";
import { adminDb } from "@/lib/supabase/server";
import { deleteObject, getObject, hasObject, listObjects, presignPut, putObject, type Bucket } from "@/lib/r2";
import { datasetPublic, featureOn } from "../derive";
import { MEDIA_TYPES, mediaPath, postPictures } from "../posts";
import { evidenceList } from "../records";
import type { GovernanceState } from "../types";

/** Uploads that never made it into a post, unit or evidence item are removed after this long. */
const ABANDONED_MS = 24 * 3_600_000;
const SWEEP_MS = 3_600_000;
const UPLOAD_SECONDS = 2 * 3600;
const DAY_MS = 86_400_000;

type Folder = "posts" | "emblems" | "evidence";
const FOLDERS: Folder[] = ["posts", "emblems", "evidence"];

const g = globalThis as typeof globalThis & { __hubMedia?: { sweptAt: number; published: Set<string> } };
/** `published`: keys this instance has seen in the public bucket, so serving them skips a lookup. */
const media = (g.__hubMedia ??= { sweptAt: 0, published: new Set() });

const keyOf = (src: string) => src.replace(/^\/media\//, "");

/**
 * One presigned upload URL per file, each for a fresh path the server chooses and the checked type and size, valid
 * for two hours. Each is recorded against the account it was handed to.
 */
export async function uploadTickets(
  files: { type: string; size: number; ext?: string }[],
  folder: Folder,
  uploadedBy: string,
): Promise<{ src: string; url: string; type: string }[]> {
  const tickets = await Promise.all(
    files.map(async ({ type, size, ext }) => {
      const path = `${folder}/${randomUUID()}.${(ext ?? MEDIA_TYPES[type]).toLowerCase()}`;
      return { path, src: `/media/${path}`, url: await presignPut(path, type, size, UPLOAD_SECONDS), type };
    }),
  );
  const { error } = await adminDb().from("media_uploads").insert(tickets.map((t) => ({ key: t.path, uploaded_by: uploadedBy })));
  if (error) throw new Error(`Media: recording uploads failed (${error.message})`);
  return tickets.map(({ src, url, type }) => ({ src, url, type }));
}

/** Of these paths, the ones uploaded by this account. */
export async function ownUploads(paths: string[], accountId: string): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await adminDb().from("media_uploads").select("key").in("key", paths).eq("uploaded_by", accountId);
  if (error) throw new Error(`Media: reading uploads failed (${error.message})`);
  return data.map((r) => r.key);
}

/** Mark files as no longer used. They stay for the backup retention period (see sweepMedia). */
export async function releaseMedia(paths: string[]) {
  if (!paths.length) return;
  const at = new Date().toISOString();
  const db = adminDb();
  const { error } = await db.from("media_uploads").update({ released_at: at }).in("key", paths);
  // Files uploaded before uploads were recorded have no row yet.
  const { error: added } = error ? { error: null } : await db.from("media_uploads").upsert(paths.map((key) => ({ key, uploaded_by: "unknown", released_at: at })), { onConflict: "key", ignoreDuplicates: true });
  if (error || added) console.error(`Media: releasing ${paths.length} files failed (${(error ?? added)!.message})`);
}

/** A post's uploaded pictures. The Hub's own photographs (/media/site/…) are reference data and never synced or swept. */
const uploadsOf = (p: Parameters<typeof postPictures>[0]) => postPictures(p).flatMap((m) => (mediaPath(m.src) ? [m.src] : []));

/** Every picture a post in the store shows, and every unit's uploaded logo. */
export const mediaInUse = (state: GovernanceState) =>
  new Set([
    ...state.records.posts.flatMap(uploadsOf),
    ...state.units.flatMap((u) => (u.emblem ? [u.emblem.src] : [])),
    ...state.requests.flatMap((request) => request.status === "Pending" && request.payload.kind === "org-unit" && request.payload.emblem ? [request.payload.emblem.src] : []),
    ...evidenceList(state).flatMap((e) => (e.attachments ?? []).map((f) => f.src)),
  ]);

/** Unit logos are shown wherever the unit is, so every logo a unit carries is public. */
export const publicEmblems = (state: GovernanceState) => new Set(state.units.flatMap((u) => (u.emblem ? [u.emblem.src] : [])));

/** Pictures the public website shows: those of published posts, while the library is switched on and its dataset Public. */
export function publicMedia(state: GovernanceState) {
  if (!featureOn(state, "public-impact") || !datasetPublic(state, "DS-STORIES")) return new Set<string>();
  return new Set(state.records.posts.filter((p) => p.status === "Published").flatMap(uploadsOf));
}

/** Everything the public website may show: the public bucket holds exactly these. */
export const publicSrcs = (state: GovernanceState) => new Set([...publicMedia(state), ...publicEmblems(state)]);

/** Image formats sharp writes back in the same format, by file extension. */
const ENCODE = { jpg: "jpeg", png: "png", webp: "webp", gif: "gif", avif: "avif" } as const;

/**
 * Copy an upload into the public bucket as a freshly encoded image: auto-rotated, metadata (EXIF, GPS, ICC
 * comments) dropped, and anything that isn't a decodable image refused.
 */
async function publishImage(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() as keyof typeof ENCODE | undefined;
  const format = ext && ENCODE[ext];
  if (!format) throw new Error(`Media: ${path} is not a publishable picture`);
  const file = await getObject("private", path);
  if (!file) throw new Error(`Media: ${path} is missing from the private bucket`);
  const { default: sharp } = await import("sharp");
  const out = await sharp(Buffer.from(await file.arrayBuffer()), { animated: format === "gif" || format === "webp", limitInputPixels: 50_000_000 })
    .rotate()
    .toFormat(format, format === "jpeg" ? { quality: 86, mozjpeg: true } : {})
    .toBuffer();
  await putObject("public", path, new Uint8Array(out), `image/${format}`);
}

/** Make sure a public file is in the public bucket, publishing it if a sync missed it. False when there is no such upload. */
export async function ensurePublished(path: string) {
  if (media.published.has(path)) return true;
  if (!(await hasObject("public", path))) {
    if (!(await hasObject("private", path))) return false;
    await publishImage(path);
  }
  media.published.add(path);
  return true;
}

/** After a commit: publish what became public and take out what stopped being public. */
export async function syncPublicMedia(before: GovernanceState, after: GovernanceState) {
  const was = publicSrcs(before);
  const now = publicSrcs(after);
  const publish = [...now].filter((src) => !was.has(src)).map(keyOf);
  const withdraw = [...was].filter((src) => !now.has(src)).map(keyOf);
  const results = await Promise.allSettled([
    ...publish.map(async (key) => (await publishImage(key), media.published.add(key))),
    ...withdraw.map(async (key) => (media.published.delete(key), await deleteObject("public", key))),
  ]);
  const failed = results.filter((r) => r.status === "rejected");
  // The hourly sweep reconciles anything left behind.
  if (failed.length) void alert("media-sync", `${failed.length} public copies out of sync`, { reason: String((failed[0] as PromiseRejectedResult).reason).slice(0, 300) });
}

/** Delete files from both buckets. The store no longer names them, so a failure is only logged. */
export async function removeMedia(paths: string[], buckets: Bucket[] = ["private", "public"]) {
  if (!paths.length) return;
  paths.forEach((p) => media.published.delete(p));
  const failed = (await Promise.allSettled(buckets.flatMap((b) => paths.map((p) => deleteObject(b, p))))).filter((r) => r.status === "rejected");
  if (failed.length) console.error(`Media: deleting ${failed.length} of ${paths.length} files failed (${(failed[0] as PromiseRejectedResult).reason})`);
}

/** When each of these files was released, for those that were. */
async function releasedAt(keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 500) {
    const { data, error } = await adminDb().from("media_uploads").select("key, released_at").in("key", keys.slice(i, i + 500)).not("released_at", "is", null);
    if (error) throw new Error(`Media: reading uploads failed (${error.message})`);
    for (const r of data) out.set(r.key, Date.parse(r.released_at!));
  }
  return out;
}

/**
 * At most hourly: remove uploads nothing kept (a composer, logo editor or submission closed without saving, a
 * browser that went away) and released files past the backup retention period, and bring the public bucket back
 * to exactly what the public website may show.
 */
export async function sweepMedia(state: GovernanceState) {
  if (Date.now() - media.sweptAt < SWEEP_MS) return;
  media.sweptAt = Date.now();
  const used = mediaInUse(state);
  const shown = publicSrcs(state);
  const keepReleased = Math.max(1, state.backup.schedule.retentionDays) * DAY_MS;
  for (const folder of FOLDERS) {
    const [held, published] = await Promise.all(
      (["private", "public"] as const).map((b) => listObjects(b, `${folder}/`).catch((e: unknown) => (console.error(e), null))),
    );
    if (held) {
      const unused = held.filter((f) => !used.has(`/media/${f.key}`));
      const released = await releasedAt(unused.map((f) => f.key)).catch((e: unknown) => (console.error(e), null));
      if (released) {
        const now = Date.now();
        const gone = unused.filter((f) => (released.has(f.key) ? now - released.get(f.key)! > keepReleased : now - f.modified > ABANDONED_MS)).map((f) => f.key);
        await removeMedia(gone);
        for (let i = 0; i < gone.length; i += 500) await adminDb().from("media_uploads").delete().in("key", gone.slice(i, i + 500));
      }
    }
    if (!published) continue;
    await removeMedia(published.filter((f) => !shown.has(`/media/${f.key}`)).map((f) => f.key), ["public"]);
    const present = new Set(published.map((f) => f.key));
    await Promise.allSettled([...shown].map(keyOf).filter((key) => key.startsWith(`${folder}/`) && !present.has(key)).map((key) => (media.published.delete(key), ensurePublished(key))));
  }
}
