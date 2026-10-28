import "server-only";

/*
 * The Workspace for the page that shows it: a unit's own files with the Office's shared ones beside them, or the
 * Office's shared files alone, and a unit's Working Documents. Who may open a file is decided here too, for /media.
 */
import type { WorkingDesk, WorkspaceDesk, WorkspaceFolderItem, WorkspaceItem } from "../hub-types";
import type { GovernanceState, WorkspaceFile, WorkspaceShelf } from "../types";
import type { Viewer } from "../viewer";
import { viewerCan } from "../viewer";
import { readState } from "./store";

/** A unit's files go to the people who see its evidence; shared ones to anyone who uses either workspace. */
export function seesWorkspaceFile(viewer: Viewer | null, f: WorkspaceFile) {
  if (f.unitId) return viewerCan(viewer, "evidence", "view", { unitId: f.unitId });
  if (f.archivedAt) return viewerCan(viewer, "knowledge", "edit");
  return viewerCan(viewer, "knowledge", "view") || viewerCan(viewer, "evidence", "view");
}

function item(state: GovernanceState, f: WorkspaceFile): WorkspaceItem {
  const nameOf = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? "Former account";
  return {
    id: f.id,
    shelf: f.shelf,
    ...(f.folderId && { folderId: f.folderId }),
    name: f.name,
    src: f.src,
    bytes: f.bytes,
    shared: !f.unitId,
    addedBy: nameOf(f.createdBy),
    addedAt: f.createdAt,
    updatedAt: f.updatedAt,
    ...(f.archivedAt && { archivedAt: f.archivedAt, archivedBy: nameOf(f.archivedBy ?? "") }),
  };
}

/** Shelves that hold uploads. Working Documents keeps links instead (workingDesk); Digital Forms keeps forms (forms.ts). */
const FILED: WorkspaceShelf[] = ["library"];

/** The portal's Workspace (the viewer's unit, or the program their role covers) or, with `shared`, the Office's. */
export async function workspaceDesk(viewer: Viewer, shared = false): Promise<WorkspaceDesk> {
  const state = await readState();
  const unitId = shared ? null : (viewer.portal.programId ?? viewer.portal.unitId);
  const files = state.records.workspace.filter((f) =>
    unitId ? f.unitId === unitId || (!f.unitId && !f.archivedAt) : !f.unitId,
  );
  // The Office's folders show wherever its shared files do.
  const seesShared = viewerCan(viewer, "knowledge", "view") || viewerCan(viewer, "evidence", "view");
  const folders = state.records.workspaceFolders.filter((f) => (unitId && f.unitId === unitId) || (!f.unitId && seesShared));
  return {
    unitId,
    owner: unitId ? (viewer.portal.programName ?? viewer.portal.unitName) : "Shared with every unit",
    shelves: FILED,
    files: files.filter((f) => seesWorkspaceFile(viewer, f)).map((f) => item(state, f)),
    folders: folders.map((f): WorkspaceFolderItem => ({ id: f.id, shelf: f.shelf, ...(f.parentId && { parentId: f.parentId }), name: f.name, shared: !f.unitId })),
    canWrite: unitId ? viewerCan(viewer, "evidence", "submit", { unitId }) : viewerCan(viewer, "knowledge", "edit"),
    uploads: { types: state.config.uploads.types, maxFileMB: state.config.uploads.maxFileMB },
  };
}

/** The Working Documents of the viewer's unit (or the program their role covers) or, with `office`, the Office's own. */
export async function workingDesk(viewer: Viewer, office = false): Promise<WorkingDesk> {
  const state = await readState();
  const unitId = office ? null : (viewer.portal.programId ?? viewer.portal.unitId);
  const nameOf = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? "Former account";
  const sees = unitId ? viewerCan(viewer, "evidence", "view", { unitId }) : viewerCan(viewer, "knowledge", "edit");
  return {
    unitId,
    docs: sees
      ? state.records.workingDocs
          .filter((d) => (d.unitId ?? null) === unitId)
          .map((d) => ({ id: d.id, title: d.title, date: d.date, rankings: d.rankings, sdgs: d.sdgs ?? [], authors: d.authors ?? [], status: d.status, links: d.links, remarks: d.remarks ?? "", addedBy: nameOf(d.createdBy), updatedAt: d.updatedAt }))
      : [],
    canWrite: unitId ? viewerCan(viewer, "evidence", "submit", { unitId }) : viewerCan(viewer, "knowledge", "edit"),
  };
}
