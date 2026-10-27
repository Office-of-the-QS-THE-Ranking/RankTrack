/*
 * Files attached to evidence. The browser uploads each one straight to the R2 private bucket through a presigned
 * URL (app/actions/evidence.ts); the record keeps its name, its /media/evidence/… address and its size. They are
 * never public: /media serves one only to people who may see the record it belongs to, as a download. No server
 * code, so the submission form can import it.
 */

/** How long a submission's description may be: its words, and the editor's markup around them. */
export const EVIDENCE_SUMMARY = { text: 4000, markup: 24_000 } as const;

/** The upload types System Configuration can allow, by extension, with the Content-Type each is stored under. */
export const EVIDENCE_MIME: Record<string, string> = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  DOC: "application/msword",
  XLS: "application/vnd.ms-excel",
  CSV: "text/csv",
  TXT: "text/plain",
  PNG: "image/png",
  JPG: "image/jpeg",
  JPEG: "image/jpeg",
};

export const fileExt = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toUpperCase() ?? "";

/** The Content-Type a file is uploaded and served with, or null when System Configuration doesn't accept its type. */
export function evidenceMime(name: string, allowed: string[]): string | null {
  const ext = fileExt(name);
  const type = allowed.includes(ext === "JPEG" ? "JPG" : ext) || allowed.includes(ext) ? EVIDENCE_MIME[ext] : undefined;
  return type ?? null;
}

const UPLOADED = /^\/media\/(evidence\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5})$/;

/** The bucket path of an uploaded evidence file, or null for anything that isn't one. */
export const evidencePath = (src: string) => UPLOADED.exec(src)?.[1] ?? null;

/** A file name safe to keep and show: no folders, no control characters, at most 120 characters. */
export const cleanFileName = (name: string) =>
  name
    .replace(/^.*[\\/]/, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(-120);

/** What each attached file is, so a reviewer finds the survey copies, photos and reports at a glance. */
export const EVIDENCE_FILE_KINDS = ["Report", "Survey copy", "Photo", "Attendance", "Certificate", "Data", "Agreement", "Other"] as const;
export type EvidenceFileKind = (typeof EVIDENCE_FILE_KINDS)[number];

export const isFileKind = (k: unknown): k is EvidenceFileKind => typeof k === "string" && (EVIDENCE_FILE_KINDS as readonly string[]).includes(k);

/** A first guess from the file's name and type, which the person can change before sending. */
export function guessFileKind(name: string): EvidenceFileKind {
  const n = name.toLowerCase();
  if (/survey|questionnaire|evaluation|feedback/.test(n)) return "Survey copy";
  if (/attendance|sign-?in|roster|registr/.test(n)) return "Attendance";
  if (/certificat|award/.test(n)) return "Certificate";
  if (/(^|[^a-z])(moa|mou)([^a-z]|$)|agreement|contract/.test(n)) return "Agreement";
  const ext = fileExt(name);
  if (["PNG", "JPG", "JPEG"].includes(ext)) return "Photo";
  if (["XLSX", "XLS", "CSV"].includes(ext)) return "Data";
  return "Report";
}

/** How much else a submission may carry besides its files. */
export const EVIDENCE_LIMITS = {
  background: 600,
  verifiedBy: 160,
  links: 10,
  linkLabel: 80,
  references: 20,
  referenceTitle: 300,
  referenceSource: 160,
  url: 2000,
} as const;

/** A full public web address. */
export const PUBLIC_URL = /^https?:\/\/[^\s.]+\.[^\s]+$/i;
