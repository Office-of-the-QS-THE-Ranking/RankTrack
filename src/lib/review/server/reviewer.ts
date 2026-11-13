import "server-only";

/*
 * The Reviewer job's call to a model. Its model is the one an Administrator set for the job on the Agentic Control tab,
 * never the reviewer's own choice in the chat, and it must be on a plan that doesn't share data: checked when the
 * setting is saved and again here, since a provider's plan can change afterwards. The model gets pages of text and the
 * indicators in question (lib/review/reviewer.ts) and nothing else: no tools, no conversation, no Hub records, not who
 * is asking. Only counts are kept in assistant_usage, under the job's name.
 */
import { generateText } from "ai";
import { classifyFailure, costOf, manilaStart, overBudget, sharesData } from "@/lib/assistant/rules";
import { checkSpend, markFailed } from "@/lib/assistant/server/notices";
import { callSettings, chatModel, openKey } from "@/lib/assistant/server/providers";
import { readSetup, type ModelRecord, type ProviderRecord, type Setup } from "@/lib/assistant/server/setup";
import type { Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import { itemId, pagesToSend, readReviewerAnswer, REVIEWER_INSTRUCTIONS, REVIEWER_LIMITS, reviewerPrompt, type ReviewerItem } from "../reviewer";
import type { AiCheck, PageText, ReviewDesk } from "../types";

export type JobId = "reviewer";

export interface JobRecord {
  id: JobId;
  enabled: boolean;
  model_id: string | null;
  backup_model_id: string | null;
  daily_limit: number;
}

export async function readJob(id: JobId = "reviewer"): Promise<JobRecord> {
  const { data, error } = await adminDb().from("assistant_jobs").select("id, enabled, model_id, backup_model_id, daily_limit").eq("id", id).maybeSingle();
  if (error) throw new Error(`Assistant job: ${error.message}`);
  return data ? { ...data, id } : { id, enabled: false, model_id: null, backup_model_id: null, daily_limit: 100 };
}

/** Why a model can't do a job's work right now, or null when it can. A plan that shares data is refused whatever else holds. */
export function jobModelProblem(model: ModelRecord | undefined, provider: ProviderRecord | undefined): string | null {
  if (!model || !provider) return "That model isn’t in the list.";
  if (sharesData(provider.id, provider.plan)) return "Its provider is on a plan that shares what it’s sent, so it can’t read evidence.";
  if (provider.status !== "ok") return "Its provider isn’t connected.";
  if (overBudget(provider.monthly_budget_usd, provider.spentMonth)) return "Its provider has reached this month’s budget.";
  return null;
}

async function runsToday() {
  const { count, error } = await adminDb().from("assistant_usage").select("id", { count: "exact", head: true }).eq("job", "reviewer").gte("at", manilaStart("day").toISOString());
  if (error) throw new Error(`Assistant usage: ${error.message}`);
  return count ?? 0;
}

/** The job's models that can work now, the chosen one first. */
function usable(setup: Setup, job: JobRecord) {
  return [job.model_id, job.backup_model_id]
    .filter((id, i, list): id is string => !!id && list.indexOf(id) === i)
    .map((id) => {
      const model = setup.models.find((m) => m.id === id);
      const provider = model && setup.providers.get(model.provider);
      return { model, provider, problem: jobModelProblem(model, provider) };
    });
}

/** What the Review tab says about the AI check. */
export async function reviewerState(): Promise<ReviewDesk["ai"]> {
  try {
    const [job, setup] = await Promise.all([readJob(), readSetup()]);
    if (!job.enabled || !job.model_id) return { state: "off" };
    const list = usable(setup, job);
    const ok = list.find((x) => !x.problem);
    if (!ok) return { state: "blocked", why: list[0]?.problem ?? "No model is set." };
    if ((await runsToday()) >= job.daily_limit) return { state: "blocked", why: "Today’s limit of AI checks has been reached." };
    return { state: "ready", model: ok.model!.label };
  } catch (e) {
    console.error(`Reviewer state: ${e instanceof Error ? e.message : e}`);
    return { state: "off" };
  }
}

async function record(viewer: Viewer, outcome: "answered" | "error", model: ModelRecord, tokens: { input: number; output: number; cost: number }) {
  const { error } = await adminDb()
    .from("assistant_usage")
    .insert({
      job: "reviewer",
      account_id: viewer.id,
      unit_id: viewer.unitId || null,
      role_id: viewer.roles.find((r) => r.active)?.id ?? null,
      model_id: model.id,
      provider: model.provider,
      outcome,
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      cost_usd: tokens.cost,
    });
  if (error) console.error(`Reviewer usage: ${error.message}`);
}

/** `checks` is keyed by each item's `ref`. */
export type Checked = { ok: true; checks: Map<string, AiCheck>; model: string } | { ok: false; message: string };

/**
 * One run: the suggestions to check and the pages they point to, sent once to the job's model, or to its backup if
 * that one fails. Never throws. What comes back has been through readReviewerAnswer, so it holds only verdicts on the
 * items sent, with quotes that are really on those pages.
 */
export async function askReviewer(viewer: Viewer, items: (Omit<ReviewerItem, "id"> & { ref: string })[], load: (pages: number[]) => Promise<PageText[]>): Promise<Checked> {
  const [job, setup] = await Promise.all([readJob(), readSetup()]);
  if (!job.enabled || !job.model_id) return { ok: false, message: "The AI check is switched off." };
  if ((await runsToday()) >= job.daily_limit) return { ok: false, message: "Today’s limit of AI checks has been reached." };
  const models = usable(setup, job);
  if (!models.some((m) => !m.problem)) return { ok: false, message: `The AI check can’t run: ${models[0]?.problem ?? "no model is set."}` };

  // A model sees a letter for each suggestion, never the Hub's own id for it.
  const refs = items.slice(0, REVIEWER_LIMITS.items).map((i) => i.ref);
  const asked: ReviewerItem[] = items.slice(0, REVIEWER_LIMITS.items).map((i, k) => ({ id: itemId(k), ranking: i.ranking, code: i.code, name: i.name, guidance: i.guidance, pages: [...i.pages] }));
  if (!asked.length) return { ok: false, message: "There is nothing to check." };
  const pages = await load(pagesToSend(asked));
  if (!pages.length) return { ok: false, message: "This file’s text is no longer here. Read it again." };
  // Each item is asked about the pages that were sent, not ones that weren't.
  const sent = new Set(pages.map((p) => p.n));
  for (const i of asked) i.pages = i.pages.filter((n) => sent.has(n));
  const prompt = reviewerPrompt(asked, pages);

  let tried = 0;
  for (const { model, provider, problem } of models) {
    if (problem || !model || !provider) continue;
    const key = openKey(provider.key_sealed);
    if (!key) continue;
    const settings = callSettings(provider.id);
    try {
      const { text, usage } = await generateText({
        model: chatModel(provider.id, key, model.id, provider.account_ref),
        instructions: REVIEWER_INSTRUCTIONS,
        messages: [{ role: "user", content: prompt }],
        maxOutputTokens: REVIEWER_LIMITS.outputTokens,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(tried++ ? REVIEWER_LIMITS.backupTimeoutMs : REVIEWER_LIMITS.timeoutMs),
        // Checking evidence is no place for a model's flair.
        ...(settings.temperature !== undefined && { temperature: 0.1 }),
        ...(settings.providerOptions && { providerOptions: settings.providerOptions as never }),
      });
      const input = usage.inputTokens ?? Math.ceil((REVIEWER_INSTRUCTIONS.length + prompt.length) / 4);
      const output = usage.outputTokens ?? Math.ceil(text.length / 4);
      const cost = costOf(provider.plan, model, input, output);
      const checks = readReviewerAnswer(text, asked, pages, model.label, new Date().toISOString());
      await record(viewer, checks.size ? "answered" : "error", model, { input, output, cost });
      if (cost > 0) await checkSpend(provider, cost);
      if (!checks.size) continue;
      const byRef = new Map<string, AiCheck>();
      asked.forEach((i, k) => {
        const c = checks.get(i.id);
        if (c) byRef.set(refs[k], c);
      });
      return { ok: true, checks: byRef, model: model.label };
    } catch (e) {
      // The error object carries the request, which holds pages of evidence: log only what kind of failure it was.
      const err = e as { statusCode?: number; responseBody?: string; name?: string };
      console.error(`Reviewer ${model.id}: ${err.statusCode ?? err.name ?? "failed"}`);
      const failure = classifyFailure(err.statusCode, err.responseBody ?? "");
      if (failure === "no_credit" || failure === "bad_key") await markFailed(provider, failure);
      await record(viewer, "error", model, { input: 0, output: 0, cost: 0 });
    }
  }
  return { ok: false, message: "The AI check didn’t answer. Try again in a moment." };
}
