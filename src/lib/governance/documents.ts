/*
 * Research articles and reports as both sides see them: the limits the form and the server share, where a
 * document's PDF may come from, and how a citation is written. No server code, so the form can import it.
 */
import type { DocumentKind, DocumentRecord } from "./types";

export const DOC_LIMITS = { title: 220, authors: 30, author: 120, venue: 160, type: 60, abstract: 4000, keywords: 10, keyword: 40, url: 400, fileMb: 25, fileName: 160 } as const;

/** What each kind is called, in the form, the table and the audit trail. */
export const DOC_NOUN: Record<DocumentKind, { one: string; many: string; summary: string; venue: string; authors: string }> = {
  article: { one: "article", many: "articles", summary: "Abstract", venue: "Journal or proceedings", authors: "Authors" },
  report: { one: "report", many: "reports", summary: "Summary", venue: "Series or issuing office", authors: "Prepared by" },
};

/** Uploaded PDFs are served from /media/documents/<uuid>.pdf. */
const UPLOADED = /^\/media\/(documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf)$/;

/** The bucket path of an uploaded document, or null for anything that isn't one. */
export const documentPath = (src: string) => UPLOADED.exec(src)?.[1] ?? null;

/** A DOI as stored: no resolver prefix, "10." then a registrant code, a slash and a suffix. Null when it isn't one. */
export function cleanDoi(text: string): string | null {
  const v = text
    .trim()
    .replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  return /^10\.\d{4,9}\/\S{1,200}$/.test(v) ? v : null;
}

export const doiUrl = (doi: string) => `https://doi.org/${doi}`;

/** An http(s) address, or null. */
export function cleanUrl(text: string): string | null {
  const v = text.trim();
  if (!v || v.length > DOC_LIMITS.url) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Where a reader goes to read it: the DOI, else the publisher's page. */
export const readerLink = (d: Pick<DocumentRecord, "doi" | "url">) => (d.doi ? doiUrl(d.doi) : d.url || null);

/** Words that belong to the family name before it: "Dela Cruz", "De los Reyes", "San Juan", "van der Berg". */
const PARTICLES = new Set(["de", "del", "dela", "della", "delos", "di", "da", "das", "dos", "du", "la", "las", "le", "los", "san", "santa", "sta.", "sto.", "van", "von", "der", "den", "ten", "ter", "bin", "binti"]);

/** "Santos, M. R." from "Maria Rosa Santos", "Dela Cruz, J." from "Jose Dela Cruz"; a name already written "Family, Given" keeps its order. Offices stay whole. */
function citedName(name: string) {
  const n = name.trim();
  if (n.includes(",")) {
    const [family, given = ""] = n.split(",", 2).map((x) => x.trim());
    return given ? `${family}, ${initialsOf(given)}` : family;
  }
  const parts = n.split(/\s+/);
  if (parts.length < 2 || /\b(office|university|faculty|college|centre|center|department|institute)\b/i.test(n)) return n;
  let at = parts.length - 1;
  while (at > 1 && PARTICLES.has(parts[at - 1].toLowerCase())) at--;
  return `${parts.slice(at).join(" ")}, ${initialsOf(parts.slice(0, at).join(" "))}`;
}

const initialsOf = (given: string) =>
  given
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((g) => `${g[0].toUpperCase()}.`)
    .join(" ");

/** Authors as a reference list writes them: "A., B., & C."; past twenty, the first nineteen, an ellipsis and the last. */
export function citedAuthors(authors: string[]) {
  const names = authors.map(citedName);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length > 20) return `${names.slice(0, 19).join(", ")}, … ${names.at(-1)}`;
  return `${names.slice(0, -1).join(", ")}, & ${names.at(-1)}`;
}

/** The document as a reference list entry (APA 7th), in plain text. */
export function citation(d: Pick<DocumentRecord, "authors" | "issued" | "title" | "venue" | "doi" | "url">) {
  const who = citedAuthors(d.authors);
  const year = d.issued.slice(0, 4);
  const title = /[.?!]$/.test(d.title) ? d.title : `${d.title}.`;
  const where = d.venue ? ` ${d.venue}.` : "";
  const link = readerLink(d);
  return `${who ? `${who} ` : ""}(${year}). ${title}${where}${link ? ` ${link}` : ""}`;
}

/** Paragraphs as written: a blank line starts a new one. */
export const docParagraphs = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
