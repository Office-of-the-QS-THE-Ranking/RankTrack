/*
 * Evidence review's model (docs/evidence-review.md). A reviewer's browser reads a file into pages of text; rules match
 * those pages against the indicators a submission could count toward, pick out figures and years, and compare the
 * text with other files. What they find is a suggestion until a person accepts it. Type-only, safe to import anywhere.
 */
import type { EvidenceFileKind } from "@/lib/governance/evidence-files";

/** What a "page" of a file is: a PDF's page, a slide, an image, or a part of a document or sheet that has no pages. */
export type PageUnit = "page" | "part" | "slide" | "image";

export interface PageText {
  /** From 1. */
  n: number;
  text: string;
  /** Read by OCR rather than from the file's own text. */
  ocr: boolean;
}

/** Limits on what is read and kept, checked in the browser and again on the server. */
export const READ_LIMITS = {
  pages: 300,
  /** Characters kept from one page. */
  pageChars: 20_000,
  /** Characters sent to the server in one call (a Server Action takes 1 MB). */
  batchChars: 400_000,
  /** A page with fewer characters than this is taken for a scan and read by OCR. */
  scanBelow: 40,
  fileMB: 60,
} as const;

/** An indicator a file is matched against. */
export interface Candidate {
  edition: string;
  code: string;
  name: string;
  guidance: string;
  /** What its number counts ("students", "m²"), when it takes one. */
  unit: string | null;
  /** It takes a number, so a figure can be offered beside it. */
  numeric: boolean;
  /** Terms the Office added for it. */
  extra: string[];
}

export interface Figure {
  value: number;
  /** As written: "1,240 participants". */
  text: string;
  page: number;
  /** The sentence it sits in. */
  quote: string;
}

export interface Match {
  edition: string;
  code: string;
  /** The pages that support it, in order. */
  pages: number[];
  confidence: "high" | "medium";
  score: number;
  /** The words and phrases found, strongest first. */
  terms: string[];
  quote: string;
  quotePage?: number;
  /** The quoted sentence says no, not or none. */
  negated: boolean;
  figures: Figure[];
}

export interface SdgHit {
  n: number;
  /** Different terms found. */
  terms: string[];
  pages: number[];
}

export interface FileSummary {
  words: number;
  /** SDGs the text is about, strongest first. */
  sdgs: SdgHit[];
  /** Calendar years the text names, most named first. */
  years: { year: number; count: number }[];
}

/* ---------- The Reviewer's check ---------- */

export type Verdict = "supports" | "partial" | "no" | "unverified";

export interface AiCheck {
  verdict: Verdict;
  reason: string;
  /** A sentence the model copied, kept only when it is on the page it names. */
  quote?: string;
  page?: number;
  figure?: { value: number; text: string };
  model: string;
  at: string;
}

/* ---------- What the Review tab shows ---------- */

export type FileState = "unread" | "reading" | "ready" | "skipped" | "unsupported";

export interface Flag {
  kind: "copy" | "similar" | "period" | "sdg" | "thin" | "cut";
  tone: "alert" | "note";
  text: string;
  /** Where it applies. */
  src?: string;
}

export interface ReviewFile {
  src: string;
  name: string;
  kind: EvidenceFileKind;
  bytes: number;
  state: FileState;
  /** Why it isn't read: a photo, or a type the reader can't open. */
  why?: string;
  unit: PageUnit;
  pages: number;
  ocrPages: number;
  words: number;
  readAt?: string;
}

export type FindingStatus = "suggested" | "accepted" | "dismissed";

export interface FindingView {
  id: string;
  src: string;
  file: string;
  unit: PageUnit;
  edition: string;
  /** The ranking's short name and the edition's year: "THE Impact 2027". */
  ranking: string;
  code: string;
  /** The body's own label, or the code. */
  label: string;
  name: string;
  group: string;
  pages: number[];
  confidence: "high" | "medium";
  terms: string[];
  quote: string;
  quotePage?: number;
  negated: boolean;
  figures: Figure[];
  /** The indicator takes a number. */
  numeric: boolean;
  ai?: AiCheck;
  status: FindingStatus;
  figure?: { value: number; text: string; page: number };
  decidedBy?: string;
  /** The indicator on its ranking's page. */
  href: string;
  /** Why it can't be accepted: a closed edition. */
  locked?: string;
}

export interface SdgView {
  n: number;
  /** The Coordinator chose it. */
  chosen: boolean;
  found: boolean;
  terms: string[];
}

/** An indicator this submission could count toward, for adding terms to one the rules didn't match. */
export interface IndicatorPick {
  /** The ranking's slug: terms are kept by ranking and code, so they carry to next year's edition. */
  ranking: string;
  editionId: string;
  /** "THE Impact 2027". */
  edition: string;
  code: string;
  label: string;
  name: string;
}

export interface ReviewDesk {
  evidenceId: string;
  files: ReviewFile[];
  findings: FindingView[];
  indicators: IndicatorPick[];
  sdgs: SdgView[];
  flags: Flag[];
  can: {
    /** Accept or dismiss a suggestion (rankings: edit as well as reviewing this submission). */
    decide: boolean;
    /** Add or remove terms (rankings: manage). */
    terms: boolean;
  };
  ai: { state: "ready"; model: string } | { state: "off" } | { state: "blocked"; why: string };
  maxPages: number;
}

export interface TermView {
  id: string;
  term: string;
  by: string;
}
