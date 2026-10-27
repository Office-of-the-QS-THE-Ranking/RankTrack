"use server";

/*
 * The PDF of a research article or report: a signed upload URL for a new one, and clearing an upload the form
 * didn't keep. Saving, publishing and deleting documents are governance commands like any other (see governance.ts).
 */
import { after } from "next/server";
import { DOC_LIMITS, documentPath } from "@/lib/governance/documents";
import { allowAccount } from "@/lib/governance/server/limits";
import { mediaInUse, ownUploads, removeMedia, sweepMedia, uploadTickets } from "@/lib/governance/server/media";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";

const writes = (v: Viewer | null) => viewerCan(v, "posts", "create") || viewerCan(v, "posts", "edit");

type Started = { ok: true; src: string; url: string } | { ok: false; message: string };

/** Where the PDF goes: one upload URL, after checking the person, the format and the size. */
export async function startDocumentUpload(file: { name: string; size: number }): Promise<Started> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  if (!writes(viewer)) return { ok: false, message: "Your role cannot add files to publications." };
  if (!(await allowAccount(viewer.id, "upload"))) return { ok: false, message: "Too many uploads at once. Wait a minute and try again." };
  if (typeof file?.name !== "string" || !/\.pdf$/i.test(file.name.trim())) return { ok: false, message: "Use a PDF file." };
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > DOC_LIMITS.fileMb * 1_048_576) return { ok: false, message: `The PDF must be under ${DOC_LIMITS.fileMb} MB.` };
  try {
    const [ticket] = await uploadTickets([{ type: "application/pdf", size: file.size, ext: "pdf" }], "documents", viewer.id);
    const state = await readState();
    after(() => sweepMedia(state));
    return { ok: true, src: ticket.src, url: ticket.url };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "The PDF can’t be uploaded right now. Try again in a moment." };
  }
}

/** Remove a PDF this person's form uploaded but didn't save. A file a document keeps, and anyone else's upload, stays. */
export async function discardDocumentUpload(src: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer || !writes(viewer) || typeof src !== "string") return;
  if (mediaInUse(await readState()).has(src)) return;
  const path = documentPath(src);
  if (path) await removeMedia(await ownUploads([path], viewer.id));
}
