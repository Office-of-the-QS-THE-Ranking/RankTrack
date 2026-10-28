"use server";

/*
 * Workspace files: signed upload URLs to the private bucket. Filing them is the workspace.add command (see
 * governance.ts), which checks each upload is in storage and reads its size from there.
 */
import { after } from "next/server";
import { cleanFileName, evidenceMime, fileExt } from "@/lib/governance/evidence-files";
import { allowAccount } from "@/lib/governance/server/limits";
import { sweepMedia, uploadTickets } from "@/lib/governance/server/media";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { viewerCan } from "@/lib/governance/viewer";
import { WORKSPACE_LIMITS } from "@/lib/governance/workspace";

type Started = { ok: true; tickets: { src: string; url: string; type: string }[] } | { ok: false; message: string };

/** `unitId` null: the Office's shared files. */
export async function startWorkspaceUploads(input: { unitId: string | null; files: { name: string; size: number }[] }): Promise<Started> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  const unitId = typeof input?.unitId === "string" && input.unitId ? input.unitId : null;
  const allowed = unitId ? viewerCan(viewer, "evidence", "submit", { unitId }) : viewerCan(viewer, "knowledge", "edit");
  if (!allowed) return { ok: false, message: unitId ? "Your role cannot add files for this unit." : "Your role cannot add shared files." };
  if (!(await allowAccount(viewer.id, "upload"))) return { ok: false, message: "Too many uploads at once. Wait a minute and try again." };
  const state = await readState();
  const up = state.config.uploads;
  const files = Array.isArray(input?.files) ? input.files : [];
  if (!files.length || files.length > WORKSPACE_LIMITS.batch) return { ok: false, message: `Add 1 to ${WORKSPACE_LIMITS.batch} files at a time.` };
  const checked: { type: string; size: number; ext: string }[] = [];
  for (const f of files) {
    const name = typeof f?.name === "string" ? cleanFileName(f.name) : "";
    const type = name ? evidenceMime(name, up.types) : null;
    if (!type) return { ok: false, message: `${name || "That file"} is not an accepted type. Use ${up.types.join(", ")}.` };
    if (!Number.isSafeInteger(f.size) || f.size <= 0 || f.size > up.maxFileMB * 1_048_576) return { ok: false, message: `${name} must be under ${up.maxFileMB} MB.` };
    checked.push({ type, size: f.size, ext: fileExt(name) === "JPEG" ? "jpg" : fileExt(name).toLowerCase() });
  }
  try {
    const tickets = await uploadTickets(checked, "workspace", viewer.id);
    after(() => sweepMedia(state));
    return { ok: true, tickets };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Files can’t be uploaded right now. Try again in a moment." };
  }
}
