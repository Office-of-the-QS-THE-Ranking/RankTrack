import "server-only";

/*
 * Evidence review's tables (supabase/migrations/20261112015635_evidence_review.sql), read and written only here and
 * only as the Hub's server. Nothing in src/lib/assistant may import this module: a file's text is for the people who
 * review that submission and for the Reviewer job, never for the chat (tests/review-guard.test.ts).
 */
import { adminDb } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { TermRow } from "../rules";
import type { AiCheck, Figure, FileSummary, FindingStatus, Match, PageText, PageUnit } from "../types";

type Tables = Database["public"]["Tables"];
export type FileRow = Tables["review_files"]["Row"];
export type FindingRow = Tables["review_findings"]["Row"];

const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`Review ${what}: ${r.error.message}`);
  return r.data as T;
};

export async function filesOf(evidenceId: string): Promise<FileRow[]> {
  return must(await adminDb().from("review_files").select("*").eq("evidence_id", evidenceId), "files") ?? [];
}

export async function fileBySrc(src: string): Promise<FileRow | null> {
  return must(await adminDb().from("review_files").select("*").eq("src", src).maybeSingle(), "file");
}

/** A ready file with this text, attached anywhere: its pages can be reused. */
export async function readyWithSha(sha256: string): Promise<FileRow | null> {
  return (must(await adminDb().from("review_files").select("*").eq("sha256", sha256).eq("status", "ready").limit(1), "file") ?? [])[0] ?? null;
}

export async function saveFile(row: Tables["review_files"]["Insert"]) {
  must(await adminDb().from("review_files").upsert(row, { onConflict: "src" }), "file");
}

export async function patchFile(src: string, patch: Tables["review_files"]["Update"]) {
  must(await adminDb().from("review_files").update(patch).eq("src", src), "file");
}

/** Forget a file: its row, its suggestions, and its text unless another attachment is the same file. */
export async function dropFile(row: Pick<FileRow, "src" | "sha256">) {
  const db = adminDb();
  must(await db.from("review_files").delete().eq("src", row.src), "file");
  const { count } = await db.from("review_files").select("src", { count: "exact", head: true }).eq("sha256", row.sha256);
  if (!count) must(await db.from("review_pages").delete().eq("sha256", row.sha256), "pages");
}

export async function pagesOf(sha256: string, only?: number[]): Promise<PageText[]> {
  let q = adminDb().from("review_pages").select("page, text, ocr").eq("sha256", sha256).order("page");
  if (only) q = q.in("page", only);
  return (must(await q, "pages") ?? []).map((p) => ({ n: p.page, text: p.text, ocr: p.ocr }));
}

export async function savePages(sha256: string, pages: PageText[]) {
  if (!pages.length) return;
  must(await adminDb().from("review_pages").upsert(pages.map((p) => ({ sha256, page: p.n, text: p.text, ocr: p.ocr })), { onConflict: "sha256,page" }), "pages");
}

export async function clearPages(sha256: string) {
  must(await adminDb().from("review_pages").delete().eq("sha256", sha256), "pages");
}

export async function readTerms(): Promise<TermRow[]> {
  const rows = must(await adminDb().from("review_terms").select("*").order("added_at").limit(5000), "terms") ?? [];
  return rows.map((t) => ({ id: t.id, term: t.term, by: t.added_by, ...(t.sdg !== null && { sdg: t.sdg }), ...(t.ranking_slug && { ranking: t.ranking_slug }), ...(t.indicator_code && { code: t.indicator_code }) }));
}

export async function findingsOf(evidenceId: string): Promise<FindingRow[]> {
  return must(await adminDb().from("review_findings").select("*").eq("evidence_id", evidenceId).order("score", { ascending: false }), "findings") ?? [];
}

export async function findingById(id: string): Promise<FindingRow | null> {
  return must(await adminDb().from("review_findings").select("*").eq("id", id).maybeSingle(), "finding");
}

export async function patchFinding(id: string, patch: Tables["review_findings"]["Update"]) {
  must(await adminDb().from("review_findings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id), "finding");
}

/**
 * The rules' matches for one file, written over what was there: a match already known keeps its decision and its AI
 * check; one the rules no longer make goes, unless a person had decided it.
 */
export async function saveMatches(evidenceId: string, src: string, matches: (Match & { year?: number })[]) {
  const db = adminDb();
  const existing = must(await db.from("review_findings").select("id, edition_id, indicator_code, status").eq("src", src), "findings") ?? [];
  const id = (edition: string, code: string) => `${edition}\n${code}`;
  const known = new Map(existing.map((f) => [id(f.edition_id, f.indicator_code), f]));
  const now = new Date().toISOString();
  const fields = (m: Match & { year?: number }) => ({
    pages: m.pages,
    confidence: m.confidence,
    score: m.score,
    terms: m.terms,
    quote: m.quote,
    quote_page: m.quotePage ?? null,
    negated: m.negated,
    figures: m.figures as unknown as Json,
    year: m.year ?? null,
    updated_at: now,
  });
  const fresh = matches.filter((m) => !known.has(id(m.edition, m.code)));
  if (fresh.length) must(await db.from("review_findings").insert(fresh.map((m) => ({ evidence_id: evidenceId, src, edition_id: m.edition, indicator_code: m.code, ...fields(m) }))), "findings");
  for (const m of matches) {
    const was = known.get(id(m.edition, m.code));
    if (was) must(await db.from("review_findings").update(fields(m)).eq("id", was.id), "finding");
  }
  const made = new Set(matches.map((m) => id(m.edition, m.code)));
  const gone = existing.filter((f) => f.status === "suggested" && !made.has(id(f.edition_id, f.indicator_code))).map((f) => f.id);
  if (gone.length) must(await db.from("review_findings").delete().in("id", gone), "findings");
}

/** Other submissions' files, for telling copies and near-copies: only what identifies them, never their text. */
export async function otherFiles(evidenceId: string): Promise<Pick<FileRow, "src" | "evidence_id" | "name" | "sha256" | "signature">[]> {
  return must(await adminDb().from("review_files").select("src, evidence_id, name, sha256, signature").eq("status", "ready").neq("evidence_id", evidenceId).order("read_at", { ascending: false }).limit(3000), "files") ?? [];
}

export const summaryOf = (row: FileRow): FileSummary => {
  const s = (row.summary ?? {}) as Partial<FileSummary>;
  return { words: s.words ?? 0, sdgs: s.sdgs ?? [], years: s.years ?? [] };
};

export const unitOf = (row: FileRow) => row.page_unit as PageUnit;
export const statusOf = (row: FindingRow) => row.status as FindingStatus;
export const figuresOf = (row: FindingRow) => (Array.isArray(row.figures) ? (row.figures as unknown as Figure[]) : []);
export const aiOf = (row: FindingRow) => (row.ai ? (row.ai as unknown as AiCheck) : undefined);
export const chosenFigure = (row: FindingRow) => (row.figure ? (row.figure as unknown as { value: number; text: string; page: number }) : undefined);

/** Accepted suggestions that carry a figure, for one edition: what the engine offers beside an indicator. */
export async function acceptedFigures(edition: string): Promise<{ code: string; evidenceId: string; value: number; text: string; page: number; unit: PageUnit }[]> {
  const rows = must(await adminDb().from("review_findings").select("indicator_code, evidence_id, figure, src").eq("edition_id", edition).eq("status", "accepted").not("figure", "is", null).limit(2000), "figures") ?? [];
  if (!rows.length) return [];
  const files = must(await adminDb().from("review_files").select("src, page_unit").in("src", [...new Set(rows.map((r) => r.src))]), "files") ?? [];
  const unit = new Map(files.map((f) => [f.src, f.page_unit as PageUnit]));
  return rows.flatMap((r) => {
    const f = r.figure as { value?: unknown; text?: unknown; page?: unknown } | null;
    if (!f || typeof f.value !== "number") return [];
    return [{ code: r.indicator_code, evidenceId: r.evidence_id, value: f.value, text: String(f.text ?? f.value), page: Number(f.page ?? 0), unit: unit.get(r.src) ?? "page" }];
  });
}
