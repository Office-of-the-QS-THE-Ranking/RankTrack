/*
 * The Workspace as both sides see it: its shelves of files, the limits the page and the server share, and where
 * an uploaded file lives. A unit keeps its own files; the Office's shared Resource Library shows in every unit's
 * Workspace. Archiving keeps a file's shelf, so restoring puts it back where it was. Digital Forms, the Workspace's
 * repository of electronic forms, has its own page and its own rules (lib/forms). No server code, so the page can
 * import it.
 */
import { fileExt } from "./evidence-files";
import type { WorkingDocStatus, WorkspaceShelf } from "./types";

export const WORKSPACE_SHELVES: { key: WorkspaceShelf; label: string; short: string }[] = [
  { key: "working", label: "Working Documents", short: "Working" },
  { key: "library", label: "Resource Library", short: "Library" },
];

export const shelfLabel = (s: WorkspaceShelf) => WORKSPACE_SHELVES.find((x) => x.key === s)!.label;

export const isShelf = (s: unknown): s is WorkspaceShelf => WORKSPACE_SHELVES.some((x) => x.key === s);

/** A page of the Workspace: a shelf, Digital Forms, or Archives. Each opens from the sidebar at <base>/<view>. */
export type WorkspaceView = WorkspaceShelf | "forms" | "archive";

/** Both Workspaces have every page: the Office's Working Documents and forms are its own, its library shared with every unit. */
export const workspaceViews = (_office: boolean): WorkspaceView[] => [...WORKSPACE_SHELVES.map((s) => s.key), "forms", "archive"];

export const workspaceViewLabel = (v: WorkspaceView) => (v === "archive" ? "Archives" : v === "forms" ? "Digital Forms" : shelfLabel(v));

export const WORKSPACE_LIMITS = { name: 120, folder: 48, folders: 120, depth: 5, batch: 20 } as const;

/** Uploads are served from /media/workspace/<uuid>.<ext>. */
const UPLOADED = /^\/media\/(workspace\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5})$/;

/** The bucket path of a Workspace upload, or null for anything that isn't one. */
export const workspacePath = (src: string) => UPLOADED.exec(src)?.[1] ?? null;

/** A folder name as kept: no slashes, single spaces. */
export const cleanFolder = (name: unknown) =>
  typeof name === "string"
    ? name
        .replace(/[\\/\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, WORKSPACE_LIMITS.folder)
    : "";

/** Folders by where they sit: the shelf's top level under "", each folder's children under its id, by name. */
export function folderTree<T extends { id: string; parentId?: string; name: string }>(folders: T[]) {
  const kids = new Map<string, T[]>();
  for (const f of folders) kids.set(f.parentId ?? "", [...(kids.get(f.parentId ?? "") ?? []), f]);
  for (const list of kids.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return (id = "") => kids.get(id) ?? [];
}

/** The folders from the shelf's top level down to `id`, itself last; empty for the top level or a folder that's gone. */
export function folderTrail<T extends { id: string; parentId?: string }>(folders: T[], id: string | undefined): T[] {
  const trail: T[] = [];
  for (let f = folders.find((x) => x.id === id); f && trail.length <= WORKSPACE_LIMITS.depth; f = folders.find((x) => x.id === f!.parentId)) trail.unshift(f);
  return trail;
}

/** A rename keeps the file's extension, whatever was typed. */
export function renamed(name: string, typed: string) {
  const ext = fileExt(name);
  const base = typed.replace(/[\\/\u0000-\u001f\u007f]/g, "").trim().replace(/\.[a-z0-9]{2,5}$/i, (m) => (m.slice(1).toUpperCase() === ext ? "" : m));
  if (!base) return "";
  return (ext ? `${base}.${ext.toLowerCase()}` : base).slice(-WORKSPACE_LIMITS.name);
}

/** How a file reads at a glance: its family, for the icon and its colour. */
export type FileFamily = "pdf" | "doc" | "sheet" | "slides" | "image" | "text";

export function fileFamily(name: string): FileFamily {
  const ext = fileExt(name);
  if (ext === "PDF") return "pdf";
  if (["DOC", "DOCX"].includes(ext)) return "doc";
  if (["XLS", "XLSX", "CSV"].includes(ext)) return "sheet";
  if (["PPT", "PPTX"].includes(ext)) return "slides";
  if (["PNG", "JPG", "JPEG"].includes(ext)) return "image";
  return "text";
}

export const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(bytes < 10 * 1_048_576 ? 1 : 0)} MB`;

/* ---------- Working Documents: links, not uploads ---------- */

export const WORKING_STATUSES: WorkingDocStatus[] = ["Draft", "In progress", "For review", "Final"];

export const isWorkingStatus = (s: unknown): s is WorkingDocStatus => WORKING_STATUSES.includes(s as WorkingDocStatus);

export const WORKING_LIMITS = { title: 160, links: 10, rankings: 12, link: 2000, authors: 12, author: 80, remarks: 5000 } as const;

/** Authors as kept: single-spaced names, each once, at most WORKING_LIMITS.authors of them. */
export function cleanAuthors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const r of raw) {
    const name = typeof r === "string" ? r.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, WORKING_LIMITS.author) : "";
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

/** SDG numbers as kept: 1 to 17, each once, in order. */
export const cleanSdgs = (raw: unknown): number[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 17))].sort((a, b) => a - b) : [];

/** A link as kept: https only, no credentials, at most WORKING_LIMITS.link long; null for anything else. */
export function cleanLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/[).,;]+$/, "");
  if (!text || text.length > WORKING_LIMITS.link) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Every link in pasted text (one per line, or separated by spaces or commas), each once. */
export function linksIn(text: string): { links: string[]; bad: string[] } {
  const links: string[] = [];
  const bad: string[] = [];
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    const link = cleanLink(part);
    if (!link) bad.push(part);
    else if (!links.includes(link)) links.push(link);
  }
  return { links, bad };
}

/** What a link opens, for its icon: Google Docs, Sheets, Slides, Forms or Drive, a PDF, a Word, Excel or PowerPoint file, or any other page. */
export type LinkKind = "gdoc" | "gsheet" | "gslides" | "gform" | "gdrive" | "pdf" | "word" | "excel" | "powerpoint" | "web";

/** The kind a file name's extension gives, or null. */
const byExt = (path: string): LinkKind | null => {
  const ext = /\.([a-z0-9]{2,5})$/.exec(path)?.[1];
  if (ext === "pdf") return "pdf";
  if (ext && ["doc", "docx", "rtf", "odt"].includes(ext)) return "word";
  if (ext && ["xls", "xlsx", "csv", "ods"].includes(ext)) return "excel";
  if (ext && ["ppt", "pptx", "odp"].includes(ext)) return "powerpoint";
  return null;
};

export function linkKind(href: string): LinkKind {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return "web";
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  const file = byExt(path);
  if (file) return file;
  if (host === "docs.google.com") {
    if (path.startsWith("/document")) return "gdoc";
    if (path.startsWith("/spreadsheets")) return "gsheet";
    if (path.startsWith("/presentation")) return "gslides";
    if (path.startsWith("/forms")) return "gform";
    return "gdrive";
  }
  if (host === "sheets.google.com") return "gsheet";
  if (host === "slides.google.com") return "gslides";
  if (host === "forms.gle" || host === "forms.google.com") return "gform";
  if (host === "drive.google.com") return "gdrive";
  // OneDrive and SharePoint sharing links say what they open: /:w:/ Word, /:x:/ Excel, /:p:/ PowerPoint, /:b:/ PDF.
  if (host.endsWith("sharepoint.com") || host === "1drv.ms" || host.endsWith("onedrive.live.com")) {
    const code = /^\/:([wxpb]):\//.exec(path)?.[1];
    if (code) return ({ w: "word", x: "excel", p: "powerpoint", b: "pdf" } as const)[code as "w" | "x" | "p" | "b"];
    const app = u.searchParams.get("app")?.toLowerCase();
    if (app === "word" || app === "excel" || app === "powerpoint") return app;
  }
  return "web";
}

export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  gdoc: "Google Docs",
  gsheet: "Google Sheets",
  gslides: "Google Slides",
  gform: "Google Forms",
  gdrive: "Google Drive",
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  powerpoint: "PowerPoint",
  web: "Link",
};
