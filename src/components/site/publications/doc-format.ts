import type { DocumentFile } from "@/lib/governance/types";

/* How articles and reports print their dates, bylines and files. A document's date is a day, read in UTC so it never shifts. */
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const issuedDay = (iso: string) => DAY.format(at(iso));
export const issuedMonth = (iso: string) => MONTH.format(at(iso));
export const issuedDayMonth = (iso: string) => DAY_MONTH.format(at(iso));

/** "Ana Cruz, Ben Reyes and Carla Santos", or the first few and "+ 4 more" for long author lists. */
export function byline(authors: string[], max = 4) {
  if (authors.length <= 1) return authors[0] ?? "";
  if (authors.length > max) return `${authors.slice(0, max - 1).join(", ")} + ${authors.length - (max - 1)} more`;
  return `${authors.slice(0, -1).join(", ")} and ${authors.at(-1)}`;
}

export const fileLabel = (f: DocumentFile) => `PDF${f.sizeMB ? ` · ${f.sizeMB < 0.1 ? "<0.1" : f.sizeMB} MB` : ""}`;
