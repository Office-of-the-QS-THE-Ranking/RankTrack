"use server";

/*
 * Files attached to evidence: signed upload URLs to the private bucket, for a new submission or a corrected file
 * on one sent back for revision. Saving them on the record is the evidence.submit or evidence.respond command
 * (see governance.ts), which checks each file is in storage before the engine accepts it.
 */
import { after } from "next/server";
import { cleanFileName, evidenceMime, fileExt } from "@/lib/governance/evidence-files";
import { featureOn } from "@/lib/governance/derive";
import { evidenceById } from "@/lib/governance/records";
import { allowAccount } from "@/lib/governance/server/limits";
import { sweepMedia, uploadTickets } from "@/lib/governance/server/media";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { viewerCan } from "@/lib/governance/viewer";

type Started = { ok: true; tickets: { src: string; url: string; type: string }[] } | { ok: false; message: string };

export async function startEvidenceUploads(input: { unitSlug: string; evidenceId?: string; files: { name: string; size: number }[] }): Promise<Started> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  const state = await readState();
  const files = Array.isArray(input?.files) ? input.files : [];
  if (input?.evidenceId !== undefined) {
    const e = typeof input.evidenceId === "string" ? evidenceById(state, input.evidenceId) : undefined;
    if (!e || !viewerCan(viewer, "evidence", "edit", { unitId: e.programId ?? e.unitSlug })) return { ok: false, message: "This submission belongs to another unit." };
  } else {
    const unit = typeof input?.unitSlug === "string" ? input.unitSlug : "";
    const own = [viewer.portal.programId, unit].filter(Boolean) as string[];
    if (!featureOn(state, "submit-evidence")) return { ok: false, message: "Evidence submission is switched off in System Configuration." };
    if (!own.some((unitId) => viewerCan(viewer, "evidence", "submit", { unitId }))) return { ok: false, message: "You cannot submit evidence for this unit." };
  }
  if (!(await allowAccount(viewer.id, "upload"))) return { ok: false, message: "Too many uploads at once. Wait a minute and try again." };
  const up = state.config.uploads;
  if (!files.length || files.length > up.maxFiles) return { ok: false, message: `Attach at most ${up.maxFiles} files.` };
  const checked: { type: string; size: number; ext: string }[] = [];
  for (const f of files) {
    const name = typeof f?.name === "string" ? cleanFileName(f.name) : "";
    const type = name ? evidenceMime(name, up.types) : null;
    if (!type) return { ok: false, message: `${name || "That file"} is not an accepted type. Use ${up.types.join(", ")}.` };
    if (!Number.isSafeInteger(f.size) || f.size <= 0 || f.size > up.maxFileMB * 1_048_576) return { ok: false, message: `${name} must be under ${up.maxFileMB} MB.` };
    checked.push({ type, size: f.size, ext: fileExt(name) === "JPEG" ? "jpg" : fileExt(name).toLowerCase() });
  }
  try {
    const tickets = await uploadTickets(checked, "evidence", viewer.id);
    after(() => sweepMedia(state));
    return { ok: true, tickets };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Files can’t be uploaded right now. Try again in a moment." };
  }
}
