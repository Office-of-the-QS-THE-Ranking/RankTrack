"use server";

/*
 * A unit's logo from the Directory: a signed upload URL for the new file. Saving it on the unit is the
 * unit.update command like any other change (see governance.ts); a logo uploaded but never saved is swept.
 */
import { after } from "next/server";
import { EMBLEM_MAX_MB, EMBLEM_TYPES } from "@/lib/governance/unit-emblems";
import { sweepMedia, uploadTickets } from "@/lib/governance/server/media";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { viewerCan } from "@/lib/governance/viewer";

type Started = { ok: true; src: string; url: string } | { ok: false; message: string };

export async function startEmblemUpload(unitId: string, file: { type: string; size: number }): Promise<Started> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  if (typeof unitId !== "string" || !viewerCan(viewer, "directory", "edit", { unitId })) return { ok: false, message: "That unit is outside the units you administer." };
  return issueLogoUpload(file);
}

/** A new unit has no ID yet: authorize the upload against its chosen parent. */
export async function startUnitLogoUpload(parentId: string, file: { type: string; size: number }): Promise<Started> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  const state = await readState();
  const parent = state.units.find((unit) => unit.id === parentId && unit.status === "Active");
  if (!parent || !viewerCan(viewer, "directory", "create", { unitId: parent.id })) return { ok: false, message: "Choose a parent unit you can add units under." };
  return issueLogoUpload(file);
}

async function issueLogoUpload(file: { type: string; size: number }): Promise<Started> {
  if (!EMBLEM_TYPES[file?.type]) return { ok: false, message: "Use a PNG or JPG logo." };
  if (!(file.size > 0) || file.size > EMBLEM_MAX_MB * 1_048_576) return { ok: false, message: `The logo must be under ${EMBLEM_MAX_MB} MB.` };
  try {
    const [ticket] = await uploadTickets([file.type], "emblems");
    const state = await readState();
    after(() => sweepMedia(state));
    return { ok: true, ...ticket };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "The logo can’t be uploaded right now. Try again in a moment." };
  }
}
