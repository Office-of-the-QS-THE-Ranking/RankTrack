/*
 * Which evidence files the reader can open, and how. No server code, so the Review tab and the server agree by
 * importing the same list.
 */
import { fileExt, type EvidenceFileKind } from "@/lib/governance/evidence-files";
import type { PageUnit } from "./types";

export type Reader = "pdf" | "docx" | "pptx" | "sheet" | "text" | "image";

const READERS: Record<string, Reader> = { PDF: "pdf", DOCX: "docx", PPTX: "pptx", XLSX: "sheet", CSV: "sheet", TXT: "text", PNG: "image", JPG: "image", JPEG: "image" };

export const readerOf = (name: string): Reader | null => READERS[fileExt(name)] ?? null;

export const UNIT_OF: Record<Reader, PageUnit> = { pdf: "page", docx: "part", pptx: "slide", sheet: "part", text: "part", image: "image" };

/** Why a file isn't read, or null when it can be. Photos are pictures of an event, not text; older Office formats can't be opened here. */
export function unreadable(name: string, kind: EvidenceFileKind): { state: "skipped" | "unsupported"; why: string } | null {
  const reader = readerOf(name);
  if (!reader) return { state: "unsupported", why: `${fileExt(name) || "This type"} can’t be read here. A PDF copy can.` };
  if (reader === "image" && kind === "Photo") return { state: "skipped", why: "Photos aren’t read." };
  return null;
}

const WORD: Record<PageUnit, [string, string]> = { page: ["p.", "pp."], part: ["part", "parts"], slide: ["slide", "slides"], image: ["image", "image"] };

/** "pp. 12–15", "slide 3", "parts 2, 4". */
export function pagesLabel(unit: PageUnit, pages: number[], ranges: string) {
  if (unit === "image" || !pages.length) return "";
  return `${WORD[unit][pages.length > 1 ? 1 : 0]} ${ranges}`;
}
