import "server-only";

/*
 * Evidence review on the server: who may review a submission's files, taking in the text a reviewer's browser read,
 * running the rules over it, and what the Review tab shows. The file itself never passes through here: its SHA-256 is
 * worked out from storage, so text can't be filed under a file it wasn't read from. See docs/evidence-review.md.
 */
import { createHash } from "node:crypto";
import type { Catalog } from "@/lib/analytics/types";
import { activeEditions, catalogs } from "@/lib/analytics/server/load";
import { evidenceBodies } from "@/lib/governance/derive";
import { evidencePath, guessFileKind, isFileKind } from "@/lib/governance/evidence-files";
import { evidenceById } from "@/lib/governance/records";
import { reference } from "@/lib/governance/server/reference";
import { readState } from "@/lib/governance/server/store";
import type { EvidenceRecord, GovernanceState } from "@/lib/governance/types";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { streamObject } from "@/lib/r2";
import { pagesLabel, readerOf, UNIT_OF, unreadable } from "../files";
import { periodFit } from "../figures";
import { signatureOf, similarity, SIMILAR_AT } from "../fingerprint";
import { answerable, groupsFor, lexiconsFor, reviewPages, sdgFound, type TermRow } from "../rules";
import { pageRanges } from "../text";
import { READ_LIMITS, type FindingView, type Flag, type IndicatorPick, type PageText, type PageUnit, type ReviewDesk, type ReviewFile, type SdgView } from "../types";
import { reviewerState } from "./reviewer";
import * as store from "./store";

const targetOf = (e: EvidenceRecord) => ({ unitId: e.programId ?? e.unitSlug, bodies: evidenceBodies(e.mappedTo) });

/**
 * The submission, if this person reviews it: the same rule as accepting or returning it (evidence: approve within its
 * unit and ranking bodies, and never one's own). Its files' text is open to nobody else.
 */
export async function reviewable(viewer: Viewer, evidenceId: unknown): Promise<{ e: EvidenceRecord; state: GovernanceState } | string> {
  const state = await readState();
  const e = typeof evidenceId === "string" ? evidenceById(state, evidenceId) : undefined;
  if (!e) return "That submission is no longer here.";
  if (!viewerCan(viewer, "evidence", "approve", targetOf(e))) return "This submission is outside the units or ranking bodies you review.";
  if (e.submittedById ? e.submittedById === viewer.id : e.submittedBy === viewer.name) return "You sent this submission, so another reviewer reads it.";
  return { e, state };
}

interface Context {
  editions: { catalog: Catalog; short: string }[];
  terms: TermRow[];
}

async function context(): Promise<Context> {
  const [active, ref, terms] = await Promise.all([activeEditions(), reference(), store.readTerms()]);
  const short = new Map(ref.rankings.map((r) => [r.slug, r.short]));
  return { editions: [...active.values()].map((catalog) => ({ catalog, short: short.get(catalog.edition.ranking) ?? "" })).filter((x) => x.short), terms };
}

/* ---------- Reading ---------- */

/** A stored file's SHA-256 and size, read straight from storage. */
async function fingerprintOf(src: string): Promise<{ sha256: string; bytes: number } | null> {
  const path = evidencePath(src);
  const file = path ? await streamObject("private", path).catch(() => null) : null;
  if (!file) return null;
  const hash = createHash("sha256");
  let bytes = 0;
  const reader = file.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > READ_LIMITS.fileMB * 1_048_576) {
      await reader.cancel();
      return null;
    }
    hash.update(value);
  }
  return bytes ? { sha256: hash.digest("hex"), bytes } : null;
}

export type Begun = { ok: true; cached: boolean } | { ok: false; message: string };

/**
 * Before a browser reads a file: is it this submission's, can it be read, and has the same file been read already? If
 * it has (the same bytes, attached here or anywhere), its text is reused and the rules run at once.
 */
export async function beginRead(viewer: Viewer, e: EvidenceRecord, src: unknown): Promise<Begun> {
  const file = typeof src === "string" ? e.attachments?.find((a) => a.src === src) : undefined;
  if (!file) return { ok: false, message: "That file is no longer attached to this submission." };
  const kind = isFileKind(file.kind) ? file.kind : guessFileKind(file.name);
  const reader = readerOf(file.name);
  if (!reader) return { ok: false, message: unreadable(file.name, kind)?.why ?? "This file can’t be read here." };
  const print = await fingerprintOf(file.src);
  if (!print) return { ok: false, message: "The file couldn’t be opened from storage. Try again in a moment." };

  const same = await store.readyWithSha(print.sha256);
  if (same) {
    await store.saveFile({
      src: file.src,
      evidence_id: e.id,
      name: file.name.slice(0, 200),
      sha256: print.sha256,
      bytes: print.bytes,
      status: "ready",
      page_unit: same.page_unit,
      pages: same.pages,
      ocr_pages: same.ocr_pages,
      chars: same.chars,
      truncated: same.truncated,
      signature: same.signature,
      read_by: viewer.id,
      read_at: new Date().toISOString(),
    });
    await runRules(e, file.src);
    return { ok: true, cached: true };
  }

  // A read that stopped halfway leaves pages behind: start clean.
  await store.clearPages(print.sha256);
  await store.saveFile({ src: file.src, evidence_id: e.id, name: file.name.slice(0, 200), sha256: print.sha256, bytes: print.bytes, status: "reading", page_unit: UNIT_OF[reader], pages: 0, ocr_pages: 0, chars: 0, truncated: false, signature: null, summary: {}, read_by: viewer.id, read_at: new Date().toISOString(), ruled_at: null });
  return { ok: true, cached: false };
}

/** Text as it may be kept: no control characters (Postgres refuses a NUL), tidy spacing, a page's length at most. */
const cleanPage = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, READ_LIMITS.pageChars);

/** Pages a browser sent, as the server will keep them: real page numbers, real text, within the limits. */
export function readBatch(input: unknown): PageText[] | string {
  if (!Array.isArray(input) || input.length > READ_LIMITS.pages) return "Those pages couldn’t be read.";
  const pages: PageText[] = [];
  let chars = 0;
  for (const p of input as Partial<PageText>[]) {
    if (!Number.isInteger(p?.n) || p.n! < 1 || p.n! > READ_LIMITS.pages || typeof p.text !== "string") return "Those pages couldn’t be read.";
    if (pages.some((x) => x.n === p.n)) return "A page was sent twice.";
    const text = cleanPage(p.text);
    chars += text.length;
    pages.push({ n: p.n!, text, ocr: p.ocr === true });
  }
  if (chars > READ_LIMITS.batchChars * 1.5) return "Too much text at once.";
  return pages;
}

/** A batch of pages for a file being read. With `last`, the file is ready: it gets its signature and the rules run. */
export async function takePages(e: EvidenceRecord, src: unknown, pages: PageText[], last: boolean, truncated: boolean): Promise<{ ok: true; done?: { pages: number; ocr: number } } | { ok: false; message: string }> {
  const row = typeof src === "string" && e.attachments?.some((a) => a.src === src) ? await store.fileBySrc(src) : null;
  if (!row || row.evidence_id !== e.id || row.status !== "reading") return { ok: false, message: "Start reading this file again." };
  await store.savePages(row.sha256, pages);
  if (!last) return { ok: true };
  const all = await store.pagesOf(row.sha256);
  const text = all.map((p) => p.text).join("\n");
  const ocr = all.filter((p) => p.ocr).length;
  await store.patchFile(row.src, { status: "ready", pages: all.length, ocr_pages: ocr, chars: text.length, truncated: truncated === true, signature: signatureOf(text) });
  await runRules(e, row.src);
  return { ok: true, done: { pages: all.length, ocr } };
}

/* ---------- The rules ---------- */

/** Run the rules over one ready file and keep what they find. */
export async function runRules(e: EvidenceRecord, src: string, ctx?: Context) {
  const row = await store.fileBySrc(src);
  if (!row || row.status !== "ready") return;
  const { editions, terms } = ctx ?? (await context());
  const pages = await store.pagesOf(row.sha256);
  const { matches, summary } = reviewPages(pages, lexiconsFor(e, editions, terms), terms);
  const years = new Map(editions.map((x) => [x.catalog.edition.id, x.catalog.edition.years ?? []]));
  await store.saveMatches(
    e.id,
    src,
    matches.map((m) => ({ ...m, year: periodFit(summary.years, years.get(m.edition) ?? []).year })),
  );
  await store.patchFile(src, { summary: summary as never, ruled_at: new Date().toISOString() });
}

/** Run the rules again over every file read for a submission: after a term is added, or the submission is remapped. */
export async function rerunRules(e: EvidenceRecord) {
  const ctx = await context();
  for (const row of await store.filesOf(e.id)) if (row.status === "ready" && e.attachments?.some((a) => a.src === row.src)) await runRules(e, row.src, ctx);
}

/* ---------- What the Review tab shows ---------- */

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export async function reviewDesk(viewer: Viewer, e: EvidenceRecord, state: GovernanceState): Promise<ReviewDesk> {
  const attached = e.attachments ?? [];
  let rows = await store.filesOf(e.id);
  // A file taken off the submission takes its text with it.
  const gone = rows.filter((r) => !attached.some((a) => a.src === r.src));
  for (const r of gone) await store.dropFile(r);
  rows = rows.filter((r) => !gone.includes(r));

  const [all, ref, findings, others, ai, active] = await Promise.all([catalogs(), reference(), store.findingsOf(e.id), store.otherFiles(e.id), reviewerState(), activeEditions()]);
  const byId = new Map(all.map((c) => [c.edition.id, c]));
  const short = new Map(ref.rankings.map((r) => [r.slug, r.short]));
  const rowOf = new Map(rows.map((r) => [r.src, r]));
  const person = (id: string | null) => (id ? (state.accounts.find((a) => a.id === id)?.name ?? "Former account") : undefined);

  const files: ReviewFile[] = attached.map((a) => {
    const kind = isFileKind(a.kind) ? a.kind : guessFileKind(a.name);
    const row = rowOf.get(a.src);
    const reader = readerOf(a.name);
    const base = { src: a.src, name: a.name, kind, bytes: a.bytes, unit: (row ? store.unitOf(row) : reader ? UNIT_OF[reader] : "page") as PageUnit, pages: row?.pages ?? 0, ocrPages: row?.ocr_pages ?? 0, words: row ? store.summaryOf(row).words : 0 };
    if (row?.status === "ready") return { ...base, state: "ready", readAt: row.read_at };
    const no = unreadable(a.name, kind);
    return no ? { ...base, state: no.state, why: no.why } : { ...base, state: "unread" };
  });

  const ready = rows.filter((r) => r.status === "ready");
  const flags: Flag[] = [];

  // Copies and near-copies among other submissions. Whose they are is shown only to someone who may see that submission.
  const name = (evidenceId: string) => {
    const other = evidenceById(state, evidenceId);
    if (!other || !viewerCan(viewer, "evidence", "view", { unitId: other.programId ?? other.unitSlug })) return "another submission";
    return `${other.id} from ${state.units.find((u) => u.id === other.unitSlug)?.name ?? other.unitSlug}`;
  };
  for (const r of ready) {
    const copy = others.find((o) => o.sha256 === r.sha256);
    if (copy) {
      flags.push({ kind: "copy", tone: "alert", src: r.src, text: `${r.name} is the same file as one in ${name(copy.evidence_id)}.` });
      continue;
    }
    let near: { o: (typeof others)[number]; share: number } | null = null;
    for (const o of others) {
      const share = similarity(r.signature, o.signature);
      if (share >= SIMILAR_AT && (!near || share > near.share)) near = { o, share };
    }
    if (near) flags.push({ kind: "similar", tone: "alert", src: r.src, text: `${r.name} shares about ${Math.round(near.share * 100)}% of its text with a file in ${name(near.o.evidence_id)}.` });
  }

  for (const r of ready) {
    const s = store.summaryOf(r);
    if (s.words < 30) flags.push({ kind: "thin", tone: "note", src: r.src, text: `${r.name} has almost no readable text.` });
    if (r.truncated) flags.push({ kind: "cut", tone: "note", src: r.src, text: `Only the first ${plural(r.pages, store.unitOf(r) === "page" ? "page" : "part")} of ${r.name} were read.` });
  }

  // The year a file is about, against the years each edition its suggestions belong to takes evidence from.
  const editionsHit = [...new Set(findings.map((f) => f.edition_id))];
  for (const r of ready) {
    const years = store.summaryOf(r).years;
    if (!years.length) continue;
    for (const id of editionsHit) {
      const c = byId.get(id);
      if (!c?.edition.years?.length || !findings.some((f) => f.src === r.src && f.edition_id === id)) continue;
      const fit = periodFit(years, c.edition.years);
      if (!fit.fits) flags.push({ kind: "period", tone: "alert", src: r.src, text: `${r.name} is mostly about ${fit.main}. ${c.edition.label} takes evidence from ${c.edition.years.join(", ")}.` });
    }
  }

  // The SDGs the Coordinator chose, against what the files that were read say.
  const hits = new Map<number, { terms: Set<string>; found: boolean }>();
  for (const r of ready) {
    for (const h of store.summaryOf(r).sdgs) {
      const cur = hits.get(h.n) ?? { terms: new Set<string>(), found: false };
      h.terms.forEach((t) => cur.terms.add(t));
      cur.found ||= sdgFound(h);
      hits.set(h.n, cur);
    }
  }
  const sdgs: SdgView[] = e.sdgs.map((n) => ({ n, chosen: true, found: hits.get(n)?.found ?? false, terms: [...(hits.get(n)?.terms ?? [])].slice(0, 6) }));
  // Goals the text is plainly about that weren't chosen: the three strongest, each with several terms.
  const extra = [...hits]
    .filter(([n, h]) => !e.sdgs.includes(n) && h.terms.size >= 4)
    .sort((a, b) => b[1].terms.size - a[1].terms.size)
    .slice(0, 3);
  for (const [n, h] of extra) sdgs.push({ n, chosen: false, found: true, terms: [...h.terms].slice(0, 6) });
  const allRead = files.every((f) => f.state !== "unread");
  if (ready.length && allRead) {
    const missing = sdgs.filter((s) => s.chosen && !s.found).map((s) => s.n);
    if (missing.length) flags.push({ kind: "sdg", tone: "alert", text: `Nothing in the files read is about SDG ${missing.join(", ")}.` });
  }

  const views: FindingView[] = findings.flatMap((f) => {
    const c = byId.get(f.edition_id);
    const ind = c?.indicators.find((i) => i.code === f.indicator_code);
    const row = rowOf.get(f.src);
    if (!c || !ind || !row) return [];
    const locked = c.edition.status === "Archived" ? "This edition is archived." : c.edition.status === "Closed" && !viewerCan(viewer, "rankings", "manage") ? "This edition is closed." : undefined;
    return [
      {
        id: f.id,
        src: f.src,
        file: row.name,
        unit: store.unitOf(row),
        edition: c.edition.id,
        ranking: `${short.get(c.edition.ranking) ?? c.edition.ranking} ${c.edition.year}`,
        code: ind.code,
        label: ind.ref ?? ind.code,
        name: ind.name,
        group: c.groups.find((g) => g.code === ind.group)?.name ?? ind.group,
        pages: f.pages,
        confidence: f.confidence as FindingView["confidence"],
        terms: f.terms,
        quote: f.quote,
        ...(f.quote_page !== null && { quotePage: f.quote_page }),
        negated: f.negated,
        figures: store.figuresOf(f),
        numeric: ind.input.type === "number",
        ...(store.aiOf(f) && { ai: store.aiOf(f) }),
        status: store.statusOf(f),
        ...(store.chosenFigure(f) && { figure: store.chosenFigure(f) }),
        ...(f.decided_by && { decidedBy: person(f.decided_by) }),
        href: `/admin/rankings/${c.edition.ranking}?edition=${c.edition.id}&code=${encodeURIComponent(ind.code)}#indicators`,
        ...(locked && { locked }),
      },
    ];
  });

  // Every indicator the rules match this submission against, so a term can be added to one they missed.
  const indicators: IndicatorPick[] = [...active.values()].flatMap((c) => {
    const name = short.get(c.edition.ranking);
    const groups = name ? groupsFor(c, name, e.mappedTo) : null;
    if (!groups) return [];
    return c.indicators.filter((i) => answerable(i) && groups.has(i.group)).map((i) => ({ ranking: c.edition.ranking, editionId: c.edition.id, edition: `${name} ${c.edition.year}`, code: i.code, label: i.ref ?? i.code, name: i.name.slice(0, 120) }));
  });

  return {
    evidenceId: e.id,
    files,
    findings: views,
    indicators,
    sdgs,
    flags,
    can: { decide: viewerCan(viewer, "rankings", "edit"), terms: viewerCan(viewer, "rankings", "manage") },
    ai,
    maxPages: READ_LIMITS.pages,
  };
}

/** A link's label for an accepted suggestion: where in which file. */
export function linkLabel(unit: PageUnit, pages: number[], file: string) {
  const where = pagesLabel(unit, pages, pageRanges(pages));
  return `${where ? `${where} · ` : ""}${file}`.slice(0, 300);
}
