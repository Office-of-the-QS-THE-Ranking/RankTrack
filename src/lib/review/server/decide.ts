import "server-only";

/*
 * What a person does with a suggestion, and asking the Reviewer about a file's suggestions. Accepting links the
 * evidence record to the indicator, under the unit that sent it, with the pages in the link's label; a figure chosen
 * with it is only offered beside the indicator, like the register's and the templates' counts. Nobody's value is
 * written: the Office never answers for a unit (docs/analytics-engine.md §8).
 */
import { catalogOf } from "@/lib/analytics/server/load";
import type { EvidenceRecord, GovernanceState } from "@/lib/governance/types";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { linkLabel } from "./review";
import { askReviewer } from "./reviewer";
import * as store from "./store";

export type Decided = { ok: true; message: string; audit: { action: string; label: string; detail: string } } | { ok: false; message: string };

const fail = (message: string) => ({ ok: false as const, message });

/** The unit a submission's links sit under: the one that sent it, as the Directory knows it. */
function unitFor(e: EvidenceRecord, state: GovernanceState) {
  const active = (id: string | undefined) => !!id && state.units.some((u) => u.id === id && u.status === "Active" && u.kind !== "University");
  return active(e.unitSlug) ? e.unitSlug : active(e.programId) ? e.programId! : null;
}

/** Take a link an accepted suggestion made off its indicator, unless another accepted suggestion rests on it. */
async function releaseLink(finding: store.FindingRow) {
  if (!finding.link_id || !finding.link_made) return;
  const db = adminDb();
  const { count } = await db.from("review_findings").select("id", { count: "exact", head: true }).eq("link_id", finding.link_id).eq("status", "accepted").neq("id", finding.id);
  if (!count) await db.from("analytics_links").delete().eq("id", finding.link_id);
}

export async function decideFinding(viewer: Viewer, e: EvidenceRecord, state: GovernanceState, input: { id: unknown; decision: unknown; figure?: unknown }): Promise<Decided> {
  const finding = typeof input.id === "string" && /^[0-9a-f-]{36}$/.test(input.id) ? await store.findingById(input.id) : null;
  if (!finding || finding.evidence_id !== e.id) return fail("That suggestion is no longer here.");
  if (!viewerCan(viewer, "rankings", "edit")) return fail("Your role can’t link evidence to indicators.");
  const catalog = await catalogOf(finding.edition_id);
  const ind = catalog?.indicators.find((i) => i.code === finding.indicator_code);
  if (!catalog || !ind) return fail("That indicator is no longer in the edition.");
  if (catalog.edition.status === "Archived") return fail("This edition is archived.");
  if (catalog.edition.status === "Closed" && !viewerCan(viewer, "rankings", "manage")) return fail("This edition is closed.");
  const label = `${ind.ref ?? ind.code} ${ind.name}`.slice(0, 160);
  const now = new Date().toISOString();

  if (input.decision === "dismiss" || input.decision === "reopen") {
    if (finding.status === "accepted") await releaseLink(finding);
    const status = input.decision === "dismiss" ? "dismissed" : "suggested";
    await store.patchFinding(finding.id, { status, figure: null, link_id: null, link_made: false, decided_by: status === "dismissed" ? viewer.id : null, decided_at: status === "dismissed" ? now : null });
    return { ok: true, message: status === "dismissed" ? "Dismissed." : "Back to suggestions.", audit: { action: `review.${input.decision}`, label, detail: `${e.id} · ${catalog.edition.label}` } };
  }
  if (input.decision !== "accept") return fail("Choose accept or dismiss.");
  if (finding.status === "accepted") return fail("That suggestion is already accepted.");

  const unit = unitFor(e, state);
  if (!unit) return fail("The unit that sent this isn’t in the Directory.");
  const file = await store.fileBySrc(finding.src);
  if (!file) return fail("That file’s text is no longer here. Read it again.");

  // A figure is only ever one the rules found on the page, chosen by the person, for an indicator that takes a number.
  const figures = store.figuresOf(finding);
  const picked = ind.input.type === "number" && Number.isInteger(input.figure) ? figures[input.figure as number] : undefined;
  if (input.figure !== undefined && input.figure !== null && !picked) return fail("That figure is no longer among the suggestions.");

  const db = adminDb();
  const { data: existing } = await db.from("analytics_links").select("id").eq("edition_id", catalog.edition.id).eq("indicator_code", ind.code).eq("unit_id", unit).eq("evidence_id", e.id).is("url", null).maybeSingle();
  let linkId = existing?.id ?? null;
  let made = false;
  if (!linkId) {
    const { data, error } = await db
      .from("analytics_links")
      .insert({ edition_id: catalog.edition.id, indicator_code: ind.code, unit_id: unit, evidence_id: e.id, url: null, label: linkLabel(store.unitOf(file), finding.pages, file.name), year: finding.year, added_by: viewer.id })
      .select("id")
      .single();
    if (error || !data) return fail("The link couldn’t be saved. Try again in a moment.");
    linkId = data.id;
    made = true;
  }
  await store.patchFinding(finding.id, {
    status: "accepted",
    figure: picked ? ({ value: picked.value, text: picked.text, page: picked.page } as unknown as Json) : null,
    link_id: linkId,
    link_made: made,
    decided_by: viewer.id,
    decided_at: now,
  });
  return {
    ok: true,
    message: picked ? "Linked. The figure is offered beside the indicator." : "Linked to the indicator.",
    audit: { action: "review.accept", label, detail: `${e.id} · ${catalog.edition.label} · ${linkLabel(store.unitOf(file), finding.pages, file.name)}${picked ? ` · figure offered: ${picked.text}` : ""}`.slice(0, 500) },
  };
}

/**
 * Ask the Reviewer about one file's open suggestions. The model's verdicts are stored beside the suggestions; nothing
 * is accepted or dismissed by them.
 */
export async function checkFile(viewer: Viewer, e: EvidenceRecord, src: unknown): Promise<{ ok: true; message: string; checked: number; model: string } | { ok: false; message: string }> {
  const file = typeof src === "string" && e.attachments?.some((a) => a.src === src) ? await store.fileBySrc(src) : null;
  if (!file || file.evidence_id !== e.id || file.status !== "ready") return fail("Read this file first.");
  const open = (await store.findingsOf(e.id)).filter((f) => f.src === file.src && f.status === "suggested");
  if (!open.length) return fail("There are no open suggestions to check for this file.");
  open.sort((a, b) => Number(b.confidence === "high") - Number(a.confidence === "high") || Number(b.score) - Number(a.score));

  const items = [];
  for (const f of open) {
    const catalog = await catalogOf(f.edition_id);
    const ind = catalog?.indicators.find((i) => i.code === f.indicator_code);
    if (!catalog || !ind) continue;
    // The quoted page first, then the others the rules matched.
    const pages = [...new Set([...(f.quote_page ? [f.quote_page] : []), ...f.pages])].slice(0, 3);
    items.push({ ref: f.id, ranking: catalog.edition.label, code: ind.ref ?? ind.code, name: ind.name, guidance: ind.guidance, pages });
  }
  const result = await askReviewer(viewer, items, (pages) => store.pagesOf(file.sha256, pages));
  if (!result.ok) return result;
  for (const [id, check] of result.checks) await store.patchFinding(id, { ai: check as unknown as Json });
  return { ok: true, message: `${result.model} checked ${result.checks.size} of ${open.length}.`, checked: result.checks.size, model: result.model };
}
