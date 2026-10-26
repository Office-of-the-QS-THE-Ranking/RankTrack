"use server";

/*
 * The post composer's pictures: signed upload URLs for new ones, and clearing uploads it didn't keep. Saving,
 * posting and deleting posts are governance commands like any other (see governance.ts).
 */
import { after } from "next/server";
import { MEDIA_TYPES, POST_LIMITS, POST_PICK, mediaPath } from "@/lib/governance/posts";
import { allowAccount } from "@/lib/governance/server/limits";
import { mediaInUse, ownUploads, removeMedia, sweepMedia, uploadTickets } from "@/lib/governance/server/media";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";

const writes = (v: Viewer | null) => viewerCan(v, "posts", "create") || viewerCan(v, "posts", "edit");

type Started = { ok: true; tickets: { src: string; url: string }[] } | { ok: false; message: string };

/** Where each picture goes: one upload URL per file, after checking the person, the formats and the sizes. */
export async function startUploads(files: { type: string; size: number }[]): Promise<Started> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  if (!writes(viewer)) return { ok: false, message: "Your role cannot add pictures to posts." };
  if (!(await allowAccount(viewer.id, "upload"))) return { ok: false, message: "Too many uploads at once. Wait a minute and try again." };
  if (!Array.isArray(files) || !files.length || files.length > POST_LIMITS.photos + 1) return { ok: false, message: `Add up to ${POST_LIMITS.photos} photos at a time.` };
  // The browser compresses JPG and PNG picks, often to WebP, so the stored formats are wider than the pickable ones.
  if (files.some((f) => !MEDIA_TYPES[f?.type])) return { ok: false, message: "Use JPG or PNG pictures." };
  if (files.some((f) => !Number.isSafeInteger(f.size) || f.size <= 0 || f.size > POST_PICK.maxMb * 1_048_576)) return { ok: false, message: `Each picture must be under ${POST_PICK.maxMb} MB.` };
  try {
    const tickets = await uploadTickets(files.map((f) => ({ type: f.type, size: f.size })), "posts", viewer.id);
    const state = await readState();
    after(() => sweepMedia(state));
    return { ok: true, tickets };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Pictures can’t be uploaded right now. Try again in a moment." };
  }
}

/** Remove pictures this person's composer uploaded but didn't save. Anything a post shows, and anyone else's upload, stays. */
export async function discardUploads(srcs: string[]): Promise<void> {
  const viewer = await getViewer();
  if (!viewer || !writes(viewer)) return;
  const used = mediaInUse(await readState());
  const paths = (Array.isArray(srcs) ? srcs : []).filter((s) => typeof s === "string" && !used.has(s)).flatMap((s) => mediaPath(s) ?? []);
  await removeMedia(await ownUploads(paths.slice(0, POST_LIMITS.photos * 2), viewer.id));
}
