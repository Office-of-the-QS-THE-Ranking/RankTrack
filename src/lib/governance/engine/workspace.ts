/*
 * The Workspace: files a unit keeps for its own work, and the Office's shared library and templates every unit
 * sees. A unit's files are written by people who submit evidence for it; the shared ones by people who edit the
 * Knowledge Center. Folders nest and belong to the same owner as the files in them, and files go only inside
 * folders. An empty folder stays until it is deleted. Archiving is reversible; only an archived file can be
 * deleted for good, and its upload goes with it. Digital Forms, the Workspace's forms, are in forms.ts.
 * Working Documents are links a unit keeps (title, date, rankings, status), written by the same people as its
 * files. Every change is authorized and audited.
 */
import type { Command, CommandResult } from "../commands";
import { cleanFileName, evidenceMime } from "../evidence-files";
import type { WorkingDoc, WorkspaceFile, WorkspaceFolder, WorkspaceShelf } from "../types";
import { cleanAuthors, cleanFolder, cleanLink, cleanSdgs, folderTrail, isShelf, isWorkingStatus, renamed, shelfLabel, WORKING_LIMITS, WORKSPACE_LIMITS, workspacePath } from "../workspace";
import { can, deny, invalid, log, nextId, ok, unitById, type Ctx } from "./core";

const res = (f: { id: string; name: string }) => ({ type: "Workspace file", id: f.id, label: f.name });

const folderRes = (f: WorkspaceFolder) => ({ type: "Workspace folder", id: f.id, label: f.name });

/** Who may change files of this owner: the unit's contributors, or for shared files the Knowledge Center's editors. */
const writes = (ctx: Ctx, unitId: string | undefined) => (unitId ? can(ctx, "evidence", "submit", { unitId }) : can(ctx, "knowledge", "edit"));

const whose = (ctx: Ctx, unitId: string | undefined) => (unitId ? (unitById(ctx, unitId)?.name ?? unitId) : "Shared by the Office");

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const ownerOf = (unitId: unknown) => (typeof unitId === "string" && unitId ? unitId : undefined);

/**
 * The folder named by `id` if it can hold this owner's things on this shelf; null for the top level ("" or none);
 * false for a folder that's gone or belongs elsewhere.
 */
function folderFor(ctx: Ctx, unitId: string | undefined, shelf: WorkspaceShelf, id: unknown): WorkspaceFolder | null | false {
  if (id === undefined || id === "") return null;
  const f = ctx.state.records.workspaceFolders.find((x) => x.id === id);
  return f && f.unitId === unitId && f.shelf === shelf ? f : false;
}

const GONE = "That folder is no longer here. Refresh and try again.";

const PICK = "Open a folder first: files go inside folders.";

/** Where a file sits, for the audit trail. */
const placeOf = (ctx: Ctx, folderId: string | undefined) =>
  folderTrail(ctx.state.records.workspaceFolders, folderId)
    .map((f) => f.name)
    .join(" / ");

export function addFiles(ctx: Ctx, cmd: Extract<Command, { type: "workspace.add" }>): CommandResult {
  const unitId = ownerOf(cmd.unitId);
  if (unitId && !unitById(ctx, unitId)) return invalid("That unit no longer exists.");
  if (!isShelf(cmd.shelf)) return invalid("Choose where the files go.");
  const target = { type: "Workspace", id: unitId ?? "shared", label: whose(ctx, unitId) };
  if (!writes(ctx, unitId)) return deny(ctx, "workspace.add", "Data", target, unitId ? "Your role cannot add files for this unit." : "Your role cannot add shared files.");
  const files = Array.isArray(cmd.files) ? cmd.files : [];
  if (!files.length) return invalid("Choose at least one file.");
  if (files.length > WORKSPACE_LIMITS.batch) return invalid(`Add at most ${WORKSPACE_LIMITS.batch} files at a time.`);
  const folder = folderFor(ctx, unitId, cmd.shelf, cmd.folderId);
  if (folder === false) return invalid(GONE);
  if (!folder) return invalid(PICK);
  const up = ctx.state.config.uploads;
  const used = new Set(ctx.state.records.workspace.map((f) => f.src));
  const added: WorkspaceFile[] = [];
  for (const f of files) {
    const name = typeof f?.name === "string" ? cleanFileName(f.name) : "";
    if (!name || typeof f.src !== "string" || !workspacePath(f.src)) return invalid("A file didn’t finish uploading. Add it again.");
    if (!evidenceMime(name, up.types)) return invalid(`${name} is not an accepted type. Use ${up.types.join(", ")}.`);
    const bytes = typeof f.bytes === "number" && Number.isSafeInteger(f.bytes) && f.bytes >= 0 ? f.bytes : NaN;
    if (!(bytes >= 0) || bytes > up.maxFileMB * 1_048_576) return invalid(`${name} must be under ${up.maxFileMB} MB.`);
    if (used.has(f.src)) return invalid(`${name} is already in the Workspace.`);
    used.add(f.src);
    added.push({
      id: nextId(ctx, "workspace", "WS-", 4),
      ...(unitId && { unitId }),
      shelf: cmd.shelf,
      folderId: folder.id,
      name,
      src: f.src,
      bytes,
      createdBy: ctx.actor.id,
      createdAt: ctx.iso,
      updatedAt: ctx.iso,
      updatedBy: ctx.actor.id,
    });
  }
  ctx.state.records.workspace.unshift(...added);
  log(ctx, "workspace.add", "Data", target, "Success", [plural(added.length, "file"), shelfLabel(cmd.shelf), placeOf(ctx, folder.id)].join(" · "));
  return ok(`${plural(added.length, "file")} added.`);
}

export function editFile(ctx: Ctx, cmd: Extract<Command, { type: "workspace.edit" }>): CommandResult {
  const file = ctx.state.records.workspace.find((f) => f.id === cmd.id);
  if (!file) return invalid("That file is no longer in the Workspace.");
  if (!writes(ctx, file.unitId)) return deny(ctx, "workspace.edit", "Data", res(file), "Your role cannot change this file.");
  const changes: string[] = [];
  if (cmd.name !== undefined) {
    const name = typeof cmd.name === "string" ? renamed(file.name, cmd.name) : "";
    if (!name) return invalid("Give the file a name.");
    if (name !== file.name) changes.push(`Renamed from “${file.name}”`), (file.name = name);
  }
  const shelf = cmd.shelf === undefined ? file.shelf : cmd.shelf;
  if (!isShelf(shelf)) return invalid("Choose a shelf from the list.");
  // A file always sits in a folder of its shelf.
  const folder = cmd.folderId !== undefined ? folderFor(ctx, file.unitId, shelf, cmd.folderId) : shelf === file.shelf ? undefined : null;
  if (folder === false) return invalid(GONE);
  if (folder === null) return invalid("Choose a folder for the file.");
  if (shelf !== file.shelf) changes.push(`Moved to ${shelfLabel(shelf)}`), (file.shelf = shelf);
  if (folder && folder.id !== file.folderId) changes.push(`Filed in ${placeOf(ctx, folder.id)}`), (file.folderId = folder.id);
  if (!changes.length) return ok("No changes.");
  file.updatedAt = ctx.iso;
  file.updatedBy = ctx.actor.id;
  log(ctx, "workspace.edit", "Data", res(file), "Success", changes.join(" · "));
  return ok(changes.length === 1 && changes[0].startsWith("Renamed") ? "Renamed." : "Moved.");
}

/** How many levels a folder and the folders inside it take up: 1 for a folder with none inside. */
function height(ctx: Ctx, f: WorkspaceFolder): number {
  const inside = ctx.state.records.workspaceFolders.filter((x) => x.parentId === f.id);
  return 1 + Math.max(0, ...inside.map((x) => height(ctx, x)));
}

export function saveFolder(ctx: Ctx, cmd: Extract<Command, { type: "workspace.folder" }>): CommandResult {
  const folders = ctx.state.records.workspaceFolders;
  const folder = cmd.id === undefined ? undefined : folders.find((f) => f.id === cmd.id);
  if (cmd.id !== undefined && !folder) return invalid(GONE);
  const unitId = folder ? folder.unitId : ownerOf(cmd.unitId);
  const shelf = folder ? folder.shelf : cmd.shelf;
  if (!folder && unitId && !unitById(ctx, unitId)) return invalid("That unit no longer exists.");
  if (!isShelf(shelf)) return invalid("Choose a shelf from the list.");
  const target = folder ? folderRes(folder) : { type: "Workspace", id: unitId ?? "shared", label: whose(ctx, unitId) };
  if (!writes(ctx, unitId)) return deny(ctx, "workspace.folder", "Data", target, "Your role cannot change these folders.");
  const name = cleanFolder(cmd.name);
  if (!name) return invalid("Name the folder.");
  const parent = cmd.parentId === undefined ? folderFor(ctx, unitId, shelf, folder?.parentId) : folderFor(ctx, unitId, shelf, cmd.parentId);
  if (parent === false) return invalid(GONE);
  const trail = parent ? folderTrail(folders, parent.id) : [];
  if (folder && trail.includes(folder)) return invalid("A folder can’t go inside itself.");
  if (trail.length + (folder ? height(ctx, folder) : 1) > WORKSPACE_LIMITS.depth) return invalid(`Folders go at most ${WORKSPACE_LIMITS.depth} levels deep.`);
  const clash = folders.find(
    (f) => f !== folder && f.unitId === unitId && f.shelf === shelf && f.parentId === parent?.id && f.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) return invalid(`There’s already a folder called “${clash.name}” here.`);

  if (!folder) {
    if (folders.filter((f) => f.unitId === unitId && f.shelf === shelf).length >= WORKSPACE_LIMITS.folders)
      return invalid(`A shelf holds at most ${WORKSPACE_LIMITS.folders} folders.`);
    const made: WorkspaceFolder = {
      id: nextId(ctx, "workspaceFolder", "WF-", 4),
      ...(unitId && { unitId }),
      shelf,
      ...(parent && { parentId: parent.id }),
      name,
      createdBy: ctx.actor.id,
      createdAt: ctx.iso,
      updatedAt: ctx.iso,
      updatedBy: ctx.actor.id,
    };
    folders.push(made);
    log(ctx, "workspace.folder", "Data", folderRes(made), "Success", `Created in ${[shelfLabel(shelf), ...trail.map((f) => f.name)].join(" / ")}`);
    return ok("Folder created.");
  }

  const changes: string[] = [];
  if (name !== folder.name) changes.push(`Renamed from “${folder.name}”`), (folder.name = name);
  if (parent?.id !== folder.parentId) {
    changes.push(`Moved to ${[shelfLabel(shelf), ...trail.map((f) => f.name)].join(" / ")}`);
    if (parent) folder.parentId = parent.id;
    else delete folder.parentId;
  }
  if (!changes.length) return ok("No changes.");
  folder.updatedAt = ctx.iso;
  folder.updatedBy = ctx.actor.id;
  log(ctx, "workspace.folder", "Data", folderRes(folder), "Success", changes.join(" · "));
  return ok(changes.length === 1 && changes[0].startsWith("Renamed") ? "Folder renamed." : "Folder moved.");
}

/** Only an empty folder goes, archived files included: a file is restored to its own folder. */
export function deleteFolder(ctx: Ctx, cmd: Extract<Command, { type: "workspace.folderDelete" }>): CommandResult {
  const folder = ctx.state.records.workspaceFolders.find((f) => f.id === cmd.id);
  if (!folder) return invalid(GONE);
  if (!writes(ctx, folder.unitId)) return deny(ctx, "workspace.folderDelete", "Data", folderRes(folder), "Your role cannot change these folders.");
  if (ctx.state.records.workspaceFolders.some((f) => f.parentId === folder.id)) return invalid("Empty the folder first: it still holds folders.");
  const inside = ctx.state.records.workspace.filter((f) => f.folderId === folder.id);
  if (inside.some((f) => !f.archivedAt)) return invalid("Empty the folder first: move or archive its files.");
  if (inside.length) return invalid("Its archived files still belong here. Delete them from Archives first.");
  ctx.state.records.workspaceFolders = ctx.state.records.workspaceFolders.filter((f) => f !== folder);
  log(ctx, "workspace.folderDelete", "Data", folderRes(folder), "Success", `Deleted from ${shelfLabel(folder.shelf)}`);
  return ok("Folder deleted.");
}

/** The files named, each once, or a reason none of them can be changed. */
function pick(ctx: Ctx, ids: unknown, action: string): WorkspaceFile[] | CommandResult {
  const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string"))] : [];
  if (!list.length) return invalid("Choose at least one file.");
  if (list.length > 100) return invalid("Choose at most 100 files at a time.");
  const files = list.map((id) => ctx.state.records.workspace.find((f) => f.id === id));
  if (files.some((f) => !f)) return invalid("A file is no longer in the Workspace. Refresh and try again.");
  const barred = (files as WorkspaceFile[]).find((f) => !writes(ctx, f.unitId));
  if (barred) return deny(ctx, action, "Data", res(barred), "Your role cannot change this file.");
  return files as WorkspaceFile[];
}

export function archiveFiles(ctx: Ctx, cmd: Extract<Command, { type: "workspace.archive" }>): CommandResult {
  const files = pick(ctx, cmd.ids, cmd.archived ? "workspace.archive" : "workspace.restore");
  if (!Array.isArray(files)) return files;
  const moving = files.filter((f) => !!f.archivedAt !== cmd.archived);
  for (const f of moving) {
    if (cmd.archived) Object.assign(f, { archivedAt: ctx.iso, archivedBy: ctx.actor.id });
    else delete f.archivedAt, delete f.archivedBy;
    f.updatedAt = ctx.iso;
    f.updatedBy = ctx.actor.id;
    log(ctx, cmd.archived ? "workspace.archive" : "workspace.restore", "Data", res(f), "Success", cmd.archived ? `From ${shelfLabel(f.shelf)}` : `Back to ${shelfLabel(f.shelf)}`);
  }
  if (!moving.length) return ok("No changes.");
  return ok(cmd.archived ? `${plural(moving.length, "file")} archived.` : `${plural(moving.length, "file")} restored.`);
}

export function deleteFiles(ctx: Ctx, cmd: Extract<Command, { type: "workspace.delete" }>): CommandResult {
  const files = pick(ctx, cmd.ids, "workspace.delete");
  if (!Array.isArray(files)) return files;
  if (files.some((f) => !f.archivedAt)) return invalid("Archive a file before deleting it.");
  const gone = new Set(files);
  ctx.state.records.workspace = ctx.state.records.workspace.filter((f) => !gone.has(f));
  for (const f of files) log(ctx, "workspace.delete", "Data", res(f), "Success", `Deleted from Archives · was in ${shelfLabel(f.shelf)}`);
  ctx.effects.push({ kind: "delete-media", srcs: files.map((f) => f.src) });
  return ok(`${plural(files.length, "file")} deleted.`);
}

/* ---------- Working Documents ---------- */

const docRes = (d: { id: string; title: string }) => ({ type: "Working document", id: d.id, label: d.title });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

export function saveDoc(ctx: Ctx, cmd: Extract<Command, { type: "workdoc.save" }>): CommandResult {
  const doc = cmd.id ? ctx.state.records.workingDocs.find((d) => d.id === cmd.id) : undefined;
  if (cmd.id && !doc) return invalid("That document is no longer in Working Documents.");
  // No unit: the Office's own Working Documents, written by the Knowledge Center's editors.
  const unitId = doc ? doc.unitId : typeof cmd.unitId === "string" && cmd.unitId ? cmd.unitId : undefined;
  if (unitId && !unitById(ctx, unitId)) return invalid("That unit no longer exists.");
  const target = doc ? docRes(doc) : { type: "Workspace", id: unitId ?? "office", label: unitId ? whose(ctx, unitId) : "Office of QS/THE Rankings" };
  if (!writes(ctx, unitId)) return deny(ctx, "workdoc.save", "Data", target, unitId ? "Your role cannot change this unit’s working documents." : "Your role cannot change the Office’s working documents.");
  const title = typeof cmd.title === "string" ? cmd.title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!title) return invalid("Give the document a title.");
  if (title.length > WORKING_LIMITS.title) return invalid(`Keep the title under ${WORKING_LIMITS.title} characters.`);
  if (!validDate(cmd.date)) return invalid("Enter the date the document is due.");
  if (!isWorkingStatus(cmd.status)) return invalid("Choose a status from the list.");
  const rankings = Array.isArray(cmd.rankings) ? [...new Set(cmd.rankings.filter((r): r is string => typeof r === "string" && /^[a-z0-9-]{1,40}$/.test(r)))] : [];
  if (rankings.length > WORKING_LIMITS.rankings) return invalid(`Tag at most ${WORKING_LIMITS.rankings} rankings.`);
  const sdgs = cleanSdgs(cmd.sdgs);
  const authors = cleanAuthors(cmd.authors);
  if (authors.length > WORKING_LIMITS.authors) return invalid(`Name at most ${WORKING_LIMITS.authors} authors.`);
  const raw = Array.isArray(cmd.links) ? cmd.links : [];
  const links = [...new Set(raw.map(cleanLink))];
  if (!raw.length) return invalid("Paste at least one link.");
  if (links.some((l) => !l)) return invalid("Use https links, like https://docs.google.com/….");
  if (links.length > WORKING_LIMITS.links) return invalid(`Add at most ${WORKING_LIMITS.links} links to a document.`);
  const remarks = cmd.remarks === undefined ? doc?.remarks ?? "" : typeof cmd.remarks === "string" ? cmd.remarks.trim() : "";
  if (remarks.length > WORKING_LIMITS.remarks) return invalid(`Keep remarks under ${WORKING_LIMITS.remarks} characters.`);
  const fields = { title, date: cmd.date, rankings, sdgs, authors, status: cmd.status, links: links as string[], remarks };
  if (doc) {
    const changes = (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => JSON.stringify(doc[k] ?? []) !== JSON.stringify(fields[k]));
    if (!changes.length) return ok("No changes.");
    Object.assign(doc, fields, { updatedAt: ctx.iso, updatedBy: ctx.actor.id });
    log(ctx, "workdoc.save", "Data", docRes(doc), "Success", `Changed ${changes.join(", ")}`);
    return ok("Document saved.");
  }
  const added: WorkingDoc = {
    id: nextId(ctx, "workdoc", "WD-", 4),
    ...(unitId && { unitId }),
    ...fields,
    createdBy: ctx.actor.id,
    createdAt: ctx.iso,
    updatedAt: ctx.iso,
    updatedBy: ctx.actor.id,
  };
  ctx.state.records.workingDocs.unshift(added);
  log(ctx, "workdoc.save", "Data", docRes(added), "Success", `Added · ${plural(added.links.length, "link")} · ${added.status}`);
  return ok("Document added.");
}

export function setDocStatus(ctx: Ctx, cmd: Extract<Command, { type: "workdoc.status" }>): CommandResult {
  const doc = ctx.state.records.workingDocs.find((d) => d.id === cmd.id);
  if (!doc) return invalid("That document is no longer in Working Documents.");
  if (!writes(ctx, doc.unitId)) return deny(ctx, "workdoc.status", "Data", docRes(doc), "Your role cannot change this document.");
  if (!isWorkingStatus(cmd.status)) return invalid("Choose a status from the list.");
  if (cmd.status === doc.status) return ok("No changes.");
  log(ctx, "workdoc.status", "Data", docRes(doc), "Success", `${doc.status} → ${cmd.status}`);
  Object.assign(doc, { status: cmd.status, updatedAt: ctx.iso, updatedBy: ctx.actor.id });
  return ok(`Marked ${cmd.status.toLowerCase()}.`);
}

export function deleteDocs(ctx: Ctx, cmd: Extract<Command, { type: "workdoc.delete" }>): CommandResult {
  const ids = Array.isArray(cmd.ids) ? [...new Set(cmd.ids.filter((x): x is string => typeof x === "string"))] : [];
  if (!ids.length) return invalid("Choose at least one document.");
  if (ids.length > 100) return invalid("Choose at most 100 documents at a time.");
  const docs = ids.map((id) => ctx.state.records.workingDocs.find((d) => d.id === id));
  if (docs.some((d) => !d)) return invalid("A document is no longer in Working Documents. Refresh and try again.");
  const barred = (docs as WorkingDoc[]).find((d) => !writes(ctx, d.unitId));
  if (barred) return deny(ctx, "workdoc.delete", "Data", docRes(barred), "Your role cannot remove this document.");
  const gone = new Set(docs);
  ctx.state.records.workingDocs = ctx.state.records.workingDocs.filter((d) => !gone.has(d));
  for (const d of docs as WorkingDoc[]) log(ctx, "workdoc.delete", "Data", docRes(d), "Success", `Removed · ${plural(d.links.length, "link")}`);
  return ok(`${plural(docs.length, "document")} removed.`);
}
