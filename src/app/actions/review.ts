"use server";

/*
 * Evidence review (docs/evidence-review.md): reading a submission's files as text, the rules' suggestions, and what a
 * reviewer does with them. Every action first checks that this person reviews this submission (evidence: approve
 * within its unit and ranking bodies, and never their own); accepting a suggestion also needs rankings: edit, and
 * changing the terms the rules look for needs rankings: manage. A file is opened in the reviewer's browser
 * (lib/review/extract/browser.ts) and only its text arrives here. What is done is audited, never with a page's text.
 */
import { catalogs } from "@/lib/analytics/server/load";
import { audit, BUSY, ENDED, fail, refresh, type Result } from "@/lib/analytics/server/guard";
import { allowAccount } from "@/lib/governance/server/limits";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import type { EvidenceRecord, GovernanceState } from "@/lib/governance/types";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import { decideFinding as decide } from "@/lib/review/server/decide";
import { beginRead, readBatch, rerunRules, reviewable, reviewDesk, takePages } from "@/lib/review/server/review";
import * as store from "@/lib/review/server/store";
import { termStems } from "@/lib/review/text";
import type { ReviewDesk, TermView } from "@/lib/review/types";

type Gate = { viewer: Viewer; e: EvidenceRecord; state: GovernanceState };

async function gate(evidenceId: unknown, kind: "command" | "upload" = "command"): Promise<Gate | { ok: false; message: string }> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  const found = await reviewable(viewer, evidenceId);
  if (typeof found === "string") return fail(found);
  if (!(await allowAccount(viewer.id, kind))) return BUSY;
  return { viewer, ...found };
}

const passed = (g: Gate | { ok: false; message: string }): g is Gate => "viewer" in g;

const resource = (e: EvidenceRecord) => ({ type: "Evidence", id: e.id, label: e.title.slice(0, 160) });

const desk = async (g: Gate, message: string): Promise<Result<ReviewDesk>> => ({ ok: true, message, data: await reviewDesk(g.viewer, g.e, g.state) });

const trouble = (e: unknown, what: string) => {
  console.error(`Review ${what}: ${e instanceof Error ? e.message : e}`);
  return fail("That didn’t work. Try again in a moment.");
};

export async function openReview(evidenceId: string): Promise<Result<ReviewDesk>> {
  const g = await gate(evidenceId);
  if (!passed(g)) return g;
  try {
    return await desk(g, "");
  } catch (e) {
    return trouble(e, "desk");
  }
}

/** Before the browser reads a file. `cached`: the same file was read before, so its suggestions are already here. */
export async function startReading(input: { evidenceId: string; src: string }): Promise<Result<{ cached: boolean; desk?: ReviewDesk }>> {
  const g = await gate(input?.evidenceId);
  if (!passed(g)) return g;
  try {
    const begun = await beginRead(g.viewer, g.e, input.src);
    if (!begun.ok) return begun;
    if (!begun.cached) return { ok: true, message: "", data: { cached: false } };
    const file = g.e.attachments?.find((a) => a.src === input.src);
    await audit(g.viewer, "review.read", resource(g.e), `${file?.name ?? "A file"}: read before, text reused`);
    return { ok: true, message: "Read before. Suggestions are ready.", data: { cached: true, desk: await reviewDesk(g.viewer, g.e, g.state) } };
  } catch (e) {
    return trouble(e, "start");
  }
}

/** A batch of the pages a browser read. With `last`, the rules run and the tab's new state comes back. */
export async function sendPages(input: { evidenceId: string; src: string; pages: unknown; last?: boolean; truncated?: boolean }): Promise<Result<ReviewDesk | undefined>> {
  const g = await gate(input?.evidenceId, "upload");
  if (!passed(g)) return g;
  const pages = readBatch(input.pages);
  if (typeof pages === "string") return fail(pages);
  try {
    const taken = await takePages(g.e, input.src, pages, input.last === true, input.truncated === true);
    if (!taken.ok) return taken;
    if (!taken.done) return { ok: true, message: "" };
    const file = g.e.attachments?.find((a) => a.src === input.src);
    await audit(g.viewer, "review.read", resource(g.e), `${file?.name ?? "A file"}: ${taken.done.pages} pages read${taken.done.ocr ? `, ${taken.done.ocr} by OCR` : ""}`);
    return await desk(g, "Read. Suggestions are ready.");
  } catch (e) {
    return trouble(e, "pages");
  }
}

/** Run the rules again over what was read: after the submission is mapped differently, or terms changed elsewhere. */
export async function recheckReview(evidenceId: string): Promise<Result<ReviewDesk>> {
  const g = await gate(evidenceId);
  if (!passed(g)) return g;
  try {
    await rerunRules(g.e);
    return await desk(g, "Checked again.");
  } catch (e) {
    return trouble(e, "recheck");
  }
}

/** Remove what was read from a file: its text and its open suggestions. Links already made stay on their indicators. */
export async function forgetReading(input: { evidenceId: string; src: string }): Promise<Result<ReviewDesk>> {
  const g = await gate(input?.evidenceId);
  if (!passed(g)) return g;
  try {
    const row = typeof input.src === "string" ? await store.fileBySrc(input.src) : null;
    if (!row || row.evidence_id !== g.e.id) return fail("That file hasn’t been read.");
    await store.dropFile(row);
    await audit(g.viewer, "review.forget", resource(g.e), `${row.name}: text removed`);
    return await desk(g, "Text removed.");
  } catch (e) {
    return trouble(e, "forget");
  }
}

export async function decideFinding(input: { evidenceId: string; id: string; decision: "accept" | "dismiss" | "reopen"; figure?: number | null }): Promise<Result<ReviewDesk>> {
  const g = await gate(input?.evidenceId);
  if (!passed(g)) return g;
  try {
    const done = await decide(g.viewer, g.e, g.state, input);
    if (!done.ok) return done;
    await audit(g.viewer, done.audit.action, { type: "Evidence link", id: g.e.id, label: done.audit.label }, done.audit.detail, [], "Approval");
    // A link changes an indicator's checks and points, so the rankings pages are drawn again.
    refresh();
    return await desk(g, done.message);
  } catch (e) {
    return trouble(e, "decide");
  }
}

/* ---------- Terms ---------- */

type Scope = { sdg: number } | { ranking: string; code: string };

async function readScope(input: { sdg?: unknown; ranking?: unknown; code?: unknown }): Promise<Scope | string> {
  if (input.sdg !== undefined) return Number.isInteger(input.sdg) && (input.sdg as number) >= 1 && (input.sdg as number) <= 17 ? { sdg: input.sdg as number } : "Choose an SDG.";
  const ranking = typeof input.ranking === "string" ? input.ranking : "";
  const code = typeof input.code === "string" ? input.code : "";
  const known = (await catalogs()).some((c) => c.edition.ranking === ranking && c.indicators.some((i) => i.code === code));
  return known ? { ranking, code } : "That indicator is no longer here.";
}

async function termsFor(scope: Scope): Promise<TermView[]> {
  const state = await readState();
  const who = (id: string) => (id === "system" ? "Hub" : (state.accounts.find((a) => a.id === id)?.name ?? "Former account"));
  return (await store.readTerms()).filter((t) => ("sdg" in scope ? t.sdg === scope.sdg : t.ranking === scope.ranking && t.code === scope.code)).map((t) => ({ id: t.id, term: t.term, by: who(t.by) }));
}

/** The terms kept for an SDG or an indicator. Anyone who reviews submissions may see them. */
export async function reviewTerms(input: { sdg?: number; ranking?: string; code?: string }): Promise<Result<TermView[]>> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  if (!viewerCan(viewer, "evidence", "approve")) return fail("Your role can’t see review terms.");
  const scope = await readScope(input ?? {});
  if (typeof scope === "string") return fail(scope);
  return { ok: true, message: "", data: await termsFor(scope) };
}

async function manager(): Promise<Viewer | { ok: false; message: string }> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  if (!viewerCan(viewer, "rankings", "manage")) return fail("Only people who manage methodologies can change review terms.");
  if (!(await allowAccount(viewer.id, "command"))) return BUSY;
  return viewer;
}

/** Add a word or phrase the rules look for. With `evidenceId`, that submission is checked again and its tab returned. */
export async function addReviewTerm(input: { sdg?: number; ranking?: string; code?: string; term: string; evidenceId?: string }): Promise<Result<{ terms: TermView[]; desk?: ReviewDesk }>> {
  const viewer = await manager();
  if (!("grants" in viewer)) return viewer;
  const scope = await readScope(input ?? {});
  if (typeof scope === "string") return fail(scope);
  const term = typeof input.term === "string" ? input.term.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  if (term.length < 2 || !termStems(term).length) return fail("Enter a word or short phrase.");
  if (termStems(term).length > 6) return fail("Keep a phrase to six words.");
  const row = { term, added_by: viewer.id, sdg: "sdg" in scope ? scope.sdg : null, ranking_slug: "sdg" in scope ? null : scope.ranking, indicator_code: "sdg" in scope ? null : scope.code };
  const { error } = await adminDb().from("review_terms").insert(row);
  if (error) return fail(/duplicate/i.test(error.message) ? "That term is already there." : "The term couldn’t be saved.");
  await audit(viewer, "review.term.add", { type: "Review term", id: "sdg" in scope ? `sdg:${scope.sdg}` : `${scope.ranking}:${scope.code}`, label: term }, "sdg" in scope ? `SDG ${scope.sdg}` : `${scope.ranking} ${scope.code}`, [], "Configuration");
  return { ok: true, message: "Term added.", data: { terms: await termsFor(scope), ...(await again(viewer, input.evidenceId)) } };
}

export async function removeReviewTerm(input: { id: string; evidenceId?: string }): Promise<Result<{ terms: TermView[]; desk?: ReviewDesk }>> {
  const viewer = await manager();
  if (!("grants" in viewer)) return viewer;
  const id = typeof input?.id === "string" && /^[0-9a-f-]{36}$/.test(input.id) ? input.id : null;
  const db = adminDb();
  const { data: row } = id ? await db.from("review_terms").select("*").eq("id", id).maybeSingle() : { data: null };
  if (!row) return fail("That term is no longer here.");
  const { error } = await db.from("review_terms").delete().eq("id", row.id);
  if (error) return fail("The term couldn’t be removed.");
  const scope: Scope = row.sdg !== null ? { sdg: row.sdg } : { ranking: row.ranking_slug!, code: row.indicator_code! };
  await audit(viewer, "review.term.remove", { type: "Review term", id: "sdg" in scope ? `sdg:${scope.sdg}` : `${scope.ranking}:${scope.code}`, label: row.term }, "sdg" in scope ? `SDG ${scope.sdg}` : `${scope.ranking} ${scope.code}`, [], "Configuration");
  return { ok: true, message: "Term removed.", data: { terms: await termsFor(scope), ...(await again(viewer, input.evidenceId)) } };
}

/** After the terms change: the submission in front of the person is checked again, if they review it. */
async function again(viewer: Viewer, evidenceId: unknown): Promise<{ desk?: ReviewDesk }> {
  if (typeof evidenceId !== "string") return {};
  const found = await reviewable(viewer, evidenceId);
  if (typeof found === "string") return {};
  try {
    await rerunRules(found.e);
    return { desk: await reviewDesk(viewer, found.e, found.state) };
  } catch (e) {
    console.error(`Review recheck: ${e instanceof Error ? e.message : e}`);
    return {};
  }
}
