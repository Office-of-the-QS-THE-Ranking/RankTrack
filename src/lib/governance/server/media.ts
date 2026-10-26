import "server-only";

/*
 * Pictures for Impact and Innovation posts, and logos uploaded for units in the Directory. Every upload lands in
 * the private R2 bucket (see src/lib/r2.ts): the browser sends each file straight there through a presigned
 * upload URL the server hands out, so pictures never pass through a Server Function. Whatever the public website
 * may show (pictures of published posts, logos units carry) is copied into the public bucket when a change makes
 * it public and removed from there when it stops being public. /media/… serves a public file from the public
 * bucket, and an internal one only to people who manage posts or the Directory.
 */
import { randomUUID } from "node:crypto";
import { copyObject, deleteObject, getObject, hasObject, listObjects, presignPut, type Bucket } from "@/lib/r2";
import { datasetPublic, featureOn } from "../derive";
import { MEDIA_TYPES, postPictures } from "../posts";
import type { GovernanceState } from "../types";

/** Uploads that never made it into a post are removed after this long. */
const ABANDONED_MS = 24 * 3_600_000;
const SWEEP_MS = 3_600_000;
const UPLOAD_SECONDS = 2 * 3600;

const FOLDERS = ["posts", "emblems"];

const g = globalThis as typeof globalThis & { __hubMedia?: { sweptAt: number; published: Set<string> } };
/** `published`: keys this instance has seen in the public bucket, so serving them skips a lookup. */
const media = (g.__hubMedia ??= { sweptAt: 0, published: new Set() });

const keyOf = (src: string) => src.replace(/^\/media\//, "");

/** One presigned upload URL per picture, each for a fresh path the server chooses. Valid for two hours. */
export async function uploadTickets(types: string[], folder: "posts" | "emblems" = "posts"): Promise<{ src: string; url: string }[]> {
  return Promise.all(
    types.map(async (type) => {
      const path = `${folder}/${randomUUID()}.${MEDIA_TYPES[type]}`;
      return { src: `/media/${path}`, url: await presignPut(path, type, UPLOAD_SECONDS) };
    }),
  );
}

/** Every picture a post in the store shows, and every unit's uploaded logo. */
export const mediaInUse = (state: GovernanceState) =>
  new Set([
    ...state.records.posts.flatMap((p) => postPictures(p).map((m) => m.src)),
    ...state.units.flatMap((u) => (u.emblem ? [u.emblem.src] : [])),
    ...state.requests.flatMap((request) => request.status === "Pending" && request.payload.kind === "org-unit" && request.payload.emblem ? [request.payload.emblem.src] : []),
  ]);

/** Unit logos are shown wherever the unit is, so every logo a unit carries is public. */
export const publicEmblems = (state: GovernanceState) => new Set(state.units.flatMap((u) => (u.emblem ? [u.emblem.src] : [])));

/** Pictures the public website shows: those of published posts, while the library is switched on and its dataset Public. */
export function publicMedia(state: GovernanceState) {
  if (!featureOn(state, "public-impact") || !datasetPublic(state, "DS-STORIES")) return new Set<string>();
  return new Set(state.records.posts.filter((p) => p.status === "Published").flatMap((p) => postPictures(p).map((m) => m.src)));
}

/** Everything the public website may show: the public bucket holds exactly these. */
export const publicSrcs = (state: GovernanceState) => new Set([...publicMedia(state), ...publicEmblems(state)]);

export function readMedia(path: string, bucket: Bucket = "private"): Promise<Blob | null> {
  return getObject(bucket, path);
}

/** Make sure a public file is in the public bucket, copying it over if a sync missed it. False when there is no such upload. */
export async function ensurePublished(path: string) {
  if (media.published.has(path)) return true;
  if (!(await hasObject("public", path))) {
    if (!(await hasObject("private", path))) return false;
    await copyObject(path, "private", "public");
  }
  media.published.add(path);
  return true;
}

/** After a commit: copy what became public into the public bucket and take out what stopped being public. */
export async function syncPublicMedia(before: GovernanceState, after: GovernanceState) {
  const was = publicSrcs(before);
  const now = publicSrcs(after);
  const publish = [...now].filter((src) => !was.has(src)).map(keyOf);
  const withdraw = [...was].filter((src) => !now.has(src)).map(keyOf);
  const results = await Promise.allSettled([
    ...publish.map(async (key) => (await copyObject(key, "private", "public"), media.published.add(key))),
    ...withdraw.map(async (key) => (media.published.delete(key), await deleteObject("public", key))),
  ]);
  const failed = results.filter((r) => r.status === "rejected");
  // The hourly sweep reconciles anything left behind.
  if (failed.length) console.error(`Media: ${failed.length} public copies out of sync (${(failed[0] as PromiseRejectedResult).reason})`);
}

/** Delete files from both buckets. The store no longer names them, so a failure is only logged. */
export async function removeMedia(paths: string[], buckets: Bucket[] = ["private", "public"]) {
  if (!paths.length) return;
  paths.forEach((p) => media.published.delete(p));
  const failed = (await Promise.allSettled(buckets.flatMap((b) => paths.map((p) => deleteObject(b, p))))).filter((r) => r.status === "rejected");
  if (failed.length) console.error(`Media: deleting ${failed.length} of ${paths.length} files failed (${(failed[0] as PromiseRejectedResult).reason})`);
}

/**
 * At most hourly: remove uploads nothing kept (a composer or logo editor closed without saving, a browser that
 * went away), and bring the public bucket back to exactly what the public website may show.
 */
export async function sweepMedia(state: GovernanceState) {
  if (Date.now() - media.sweptAt < SWEEP_MS) return;
  media.sweptAt = Date.now();
  const used = mediaInUse(state);
  const shown = publicSrcs(state);
  for (const folder of FOLDERS) {
    const [held, published] = await Promise.all(
      (["private", "public"] as const).map((b) => listObjects(b, `${folder}/`).catch((e: unknown) => (console.error(e), null))),
    );
    if (held) await removeMedia(held.filter((f) => Date.now() - f.modified > ABANDONED_MS && !used.has(`/media/${f.key}`)).map((f) => f.key));
    if (!published) continue;
    await removeMedia(published.filter((f) => !shown.has(`/media/${f.key}`)).map((f) => f.key), ["public"]);
    const present = new Set(published.map((f) => f.key));
    await Promise.allSettled([...shown].map(keyOf).filter((key) => key.startsWith(`${folder}/`) && !present.has(key)).map((key) => (media.published.delete(key), ensurePublished(key))));
  }
}
