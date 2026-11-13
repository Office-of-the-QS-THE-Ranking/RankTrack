import "server-only";

/*
 * One question, start to finish. Everything that can stop it is checked before a word is sent; then the passages this
 * person may read are found, along with the live records the question needs, and a model answers from those or from
 * general knowledge. A model chooses the records without seeing any, and the answer is written by a model that may read
 * them: never one on a plan that shares data. See lib/assistant/rules.ts for the rules and docs/assistant.md for how the layers fit together. The asker's
 * name and email don't reach a model, and only counts are kept.
 */
import type { ModelMessage } from "ai";
import { hub } from "@/lib/governance/server/hub";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import { PATIENCE, PATIENCE_WITH_BACKUP, PATIENCE_WITH_DATA, planLookups, streamAnswer } from "../answer";
import {
  askWithSources,
  classifyFailure,
  costOf,
  EMBEDDING_PROVIDER,
  instructionsFor,
  isSmallTalk,
  leaksInstructions,
  levelsFor,
  LIMITS,
  modelState,
  modelTier,
  NOTHING_SAID,
  overBudget,
  pickPassages,
  planInstructions,
  PROVIDERS,
  searchText,
  sharesData,
  tidyAnswer,
  WITHHELD_TURN,
  withoutCitations,
  WONT_SHARE_RULES,
  type ChatTurn,
  type Level,
  type Hit,
  type LookupMode,
  type ModelState,
  type ProviderId,
  type RequestStatus,
} from "../rules";
import type { ChatEvent, ChatOptions, ChatSource, ModelOption } from "../types";
import { dataToolsFor } from "../hub-data";
import { ANSWER_DIRECTLY, dataToolsForViewer, type Looked } from "./data-tools";
import { checkSpend, markFailed } from "./notices";
import { callSettings, chatModel, embed, openKey } from "./providers";
import { readSetup, requestsOf, usedToday, type ModelRecord, type ProviderRecord, type Setup } from "./setup";
import { liveSourceIds, WORKSPACE } from "./sources";

/** Whether this person runs the assistant: University-wide, holding its manage permission. */
export const managesAgenticControl = (viewer: Viewer) => viewer.grants.some((g) => g.units === "all" && !!g.perms.ai?.includes("manage"));

const stateOf = (setup: Setup, m: ModelRecord, viewer: Viewer, requests: Map<string, RequestStatus>): ModelState => {
  const p = setup.providers.get(m.provider);
  if (!p) return "off";
  return modelState(m, { status: p.status, budget: p.monthly_budget_usd, spentMonth: p.spentMonth }, { manager: managesAgenticControl(viewer), request: requests.get(m.id) });
};

/** What the chat's settings show this person. */
export async function chatOptions(viewer: Viewer): Promise<ChatOptions> {
  const [setup, requests] = await Promise.all([readSetup(), requestsOf(viewer.id)]);
  const unavailable = setup.paused ? "The assistant is switched off for now." : undefined;
  const models: ModelOption[] = setup.models.map((m) => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    maker: PROVIDERS[m.provider].maker,
    tier: modelTier(m.provider, setup.providers.get(m.provider)?.plan ?? "paid"),
    state: stateOf(setup, m, viewer, requests),
    isDefault: m.is_default,
  }));
  const ready = models.filter((m) => m.state === "ready");
  return {
    unavailable: unavailable ?? (ready.length ? undefined : "The assistant isn’t set up yet."),
    models,
  };
}

export type Prepared = { ok: false; status: number; message: string } | { ok: true; setup: Setup; model: ModelRecord; provider: ProviderRecord; requests: Map<string, RequestStatus> };

/** Every reason this question can't go ahead, as a message for the person asking. Nothing is streamed until this passes. */
export async function prepare(viewer: Viewer, modelId: unknown): Promise<Prepared> {
  const [setup, requests] = await Promise.all([readSetup(), requestsOf(viewer.id)]);
  if (setup.paused) return { ok: false, status: 503, message: "The assistant is switched off for now." };
  const usable = setup.models.filter((m) => stateOf(setup, m, viewer, requests) === "ready");
  // The picker may be out of date by a moment. A model that went away falls to the default, but one never given isn't granted.
  const asked = typeof modelId === "string" ? setup.models.find((m) => m.id === modelId) : undefined;
  if (asked && ["request", "pending", "denied"].includes(stateOf(setup, asked, viewer, requests))) return { ok: false, status: 403, message: `Ask for access to ${asked.label} first.` };
  const model = (asked && usable.find((m) => m.id === asked.id)) ?? usable.find((m) => m.is_default) ?? usable[0];
  const provider = model && setup.providers.get(model.provider);
  if (!model || !provider) return { ok: false, status: 503, message: "No model is available right now. Try again later." };
  if (model.daily_limit !== null && (await usedToday(viewer.id, model.id)) >= model.daily_limit) {
    return { ok: false, status: 429, message: `You’ve reached today’s limit of ${model.daily_limit} messages for ${model.label}. Pick another model or try again tomorrow.` };
  }
  return { ok: true, setup, model, provider, requests };
}

/**
 * Who answers a question a model on a plan that shares data may not read: a working model this person may use, on a plan
 * that doesn't share, and under its daily limit. The backup the Administrator chose comes first, then free ones, since
 * nobody asked to spend money here.
 */
async function dataModelFor(viewer: Viewer, prepared: Extract<Prepared, { ok: true }>, tried: ReadonlySet<string>) {
  const { setup, requests } = prepared;
  const candidates = setup.models
    .filter((m) => !tried.has(m.id) && stateOf(setup, m, viewer, requests) === "ready" && !sharesData(m.provider, setup.providers.get(m.provider)!.plan))
    .sort((a, b) => Number(b.id === setup.fallbackModel) - Number(a.id === setup.fallbackModel) || Number(setup.providers.get(b.provider)!.plan === "free") - Number(setup.providers.get(a.provider)!.plan === "free"));
  for (const model of candidates) {
    if (model.daily_limit === null || (await usedToday(viewer.id, model.id)) < model.daily_limit) return model;
  }
  return null;
}

type Outcome = "answered" | "general" | "stopped" | "error";

async function record(viewer: Viewer, outcome: Outcome, model?: ModelRecord, tokens?: { input: number; output: number; cost: number }) {
  const { error } = await adminDb()
    .from("assistant_usage")
    .insert({
      account_id: viewer.id,
      unit_id: viewer.unitId || null,
      role_id: viewer.roles.find((r) => r.active)?.id ?? null,
      model_id: model?.id ?? null,
      provider: model?.provider ?? null,
      outcome,
      input_tokens: tokens?.input ?? 0,
      output_tokens: tokens?.output ?? 0,
      cost_usd: tokens?.cost ?? 0,
    });
  if (error) console.error(`Assistant usage: ${error.message}`);
}

/** Who may read a passage. A unit's content with no permission named is a mistake in the index, so it reads as closed, not open. */
export const canRead = (viewer: Pick<Viewer, "grants">) => (hit: Pick<Hit, "module" | "action" | "unit_id">) => {
  if (!hit.module) return !hit.unit_id;
  return viewerCan(viewer as Viewer, hit.module as "knowledge", (hit.action ?? "view") as "view", hit.unit_id ? { unitId: hit.unit_id } : {});
};

const linkFor = (viewer: Viewer, href: string) => (href.startsWith(WORKSPACE) ? `${viewer.workspaces.includes("office") ? "/admin" : "/portal"}${href.slice(WORKSPACE.length)}` : href);

async function retrieve(viewer: Viewer, setup: Setup, provider: ProviderRecord, query: string, signal: AbortSignal) {
  const embedder = setup.providers.get(EMBEDDING_PROVIDER);
  const key = openKey(embedder?.key_sealed);
  if (!key) throw new Error("Cloudflare isn’t connected.");
  const [vector] = await embed([query], key, embedder?.account_ref, signal);
  const levels = levelsFor(provider.id, provider.plan);
  const { data, error } = await adminDb().rpc("assistant_search", { p_embedding: JSON.stringify(vector), p_query: query, p_levels: levels, p_limit: 16 });
  if (error) throw new Error(error.message);
  const live = await liveSourceIds();
  return pickPassages((data ?? []) as Hit[], levels, (hit) => live.has(hit.source_id), canRead(viewer));
}

/** The live records a question needs, chosen by the chosen model or its backup, with the question alone to go on. */
async function lookUp(viewer: Viewer, prepared: Extract<Prepared, { ok: true }>, turns: ChatTurn[], signal: AbortSignal): Promise<{ looked: Looked[]; modelId?: string; input: number; output: number } | null> {
  const { setup, model: chosen, provider: chosenProvider } = prepared;
  const data = await dataToolsForViewer(viewer);
  if (!data) return { looked: [], input: 0, output: 0 };
  const backup = setup.models.find((m) => m.id === setup.fallbackModel && m.id !== chosen.id && m.enabled);
  const backupProvider = backup && setup.providers.get(backup.provider);
  const planners = [{ model: chosen, provider: chosenProvider }, ...(backup && backupProvider?.status === "ok" ? [{ model: backup, provider: backupProvider }] : [])];
  // The turns as a plan's model may see them: it may be on a plan that shares data, and it never needs an earlier answer's figures.
  const messages: ModelMessage[] = turns.map((t) => (t.from === "me" ? { role: "user", content: t.text } : { role: "assistant", content: t.internal ? WITHHELD_TURN : withoutCitations(t.text) }));
  for (const { model, provider } of planners) {
    const key = openKey(provider.key_sealed);
    if (!key) continue;
    // Twice each: a free model now and then ignores being told to choose.
    for (let tries = 0; tries < 2; tries++) {
      if (signal.aborted) return null;
      try {
        const { providerOptions } = callSettings(provider.id);
        const { calls, inputTokens, outputTokens } = await planLookups({ model: chatModel(provider.id, key, model.id, provider.account_ref), instructions: planInstructions(viewer.portal?.unitName), messages, tools: data.tools, signal, ...(providerOptions && { providerOptions }) });
        const wanted = calls.filter((c) => c.name !== ANSWER_DIRECTLY).slice(0, LIMITS.lookups);
        const read = await Promise.all(wanted.map((c) => data.read(c.name, c.input)));
        return { looked: read.filter((r): r is Looked => !!r), modelId: model.id, input: inputTokens, output: outputTokens };
      } catch (e) {
        console.error(`Assistant plan ${model.id}: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
      }
    }
  }
  return null;
}

/** The answer, streamed through `send`. Never throws: whatever goes wrong becomes a message and a usage row. */
export async function runChat(viewer: Viewer, prepared: Extract<Prepared, { ok: true }>, turns: ChatTurn[], signal: AbortSignal, send: (event: ChatEvent) => void) {
  const { setup, model: chosen, provider: chosenProvider } = prepared;
  const question = turns.at(-1)!.text;
  const started = Date.now();
  const smallTalk = isSmallTalk(question);
  const mayUseData = dataToolsFor(viewer.grants).length > 0;
  const chosenShares = sharesData(chosenProvider.id, chosenProvider.plan);

  // Who may write from internal data: the chosen model, or one that takes over from a model on a plan that shares it.
  const dataModel = !mayUseData ? null : chosenShares ? await dataModelFor(viewer, prepared, new Set([chosen.id])) : chosen;

  let looked: Looked[] = [];
  let planned: { modelId?: string; input: number; output: number } | null = null;
  if (dataModel && !smallTalk) {
    const read = await lookUp(viewer, prepared, turns, signal).catch((e: unknown) => {
      console.error(`Assistant lookup: ${e instanceof Error ? e.message : e}`);
      return null;
    });
    if (signal.aborted) return record(viewer, "stopped");
    if (read) {
      looked = read.looked;
      planned = read;
    } else send({ t: "notice", text: "The Hub’s live data isn’t available right now, so this answer won’t include it." });
  }

  // A chat that holds internal data stays with a model that may read it, so "explain that" still has something to explain.
  const holdsData = looked.length > 0 || turns.some((t) => t.internal);
  const takesOver = chosenShares && holdsData && dataModel ? dataModel : null;
  const first = takesOver ? { model: takesOver, provider: setup.providers.get(takesOver.provider)! } : { model: chosen, provider: chosenProvider };
  if (takesOver && looked.length) send({ t: "notice", text: `${takesOver.label} answered, since ${chosen.label}’s free plan doesn’t get the Hub’s internal data.` });

  let passages: Hit[] = [];
  if (!smallTalk) {
    try {
      passages = await retrieve(viewer, setup, first.provider, searchText(turns), signal);
    } catch (e) {
      if (signal.aborted) return record(viewer, "stopped");
      // The conversation can go on without the search: the model is told not to guess Hub facts, and says it doesn't have them.
      console.error(`Assistant search: ${e instanceof Error ? e.message : e}`);
      const failure = classifyFailure((e as { statusCode?: number }).statusCode, (e as { responseBody?: string }).responseBody ?? "");
      const embedder = setup.providers.get(EMBEDDING_PROVIDER);
      if (embedder && (failure === "no_credit" || failure === "bad_key")) await markFailed(embedder, failure);
      send({ t: "notice", text: "Hub search isn’t available right now, so this answer won’t include Hub information." });
    }
  }

  // Whose words a unit's passage is: the model is told, and so is the person reading the sources.
  const units = passages.some((p) => p.unit_id) ? new Map((await hub()).state.units.map((u) => [u.id, u.name])) : null;
  const unitOf = (p: Hit) => (p.unit_id ? (units?.get(p.unit_id) ?? "a University unit") : undefined);

  // An earlier answer built on internal data stays out of a later request to a model on a plan that shares data.
  const messagesWith = (readable: Hit[], records: Looked[], shares: boolean): ModelMessage[] =>
    turns.map((t, i) =>
      t.from === "assistant"
        ? { role: "assistant", content: shares && t.internal ? WITHHELD_TURN : withoutCitations(t.text) }
        : { role: "user", content: i === turns.length - 1 ? askWithSources(t.text, [...readable.map((p) => ({ title: p.title, content: p.content, unit: unitOf(p) })), ...records.map((r) => ({ title: `Live record: ${r.title}`, content: r.content }))]) : t.text },
    );

  // The first model, then the fallback the Administrator picked, if that's a different one that's working and may read this.
  const attempts = [first];
  const fallback = setup.models.find((m) => m.id === setup.fallbackModel && m.id !== first.model.id && m.enabled);
  const fallbackProvider = fallback && setup.providers.get(fallback.provider);
  if (fallback && fallbackProvider?.status === "ok" && !overBudget(fallbackProvider.monthly_budget_usd, fallbackProvider.spentMonth) && !(looked.length && sharesData(fallbackProvider.id, fallbackProvider.plan))) attempts.push({ model: fallback, provider: fallbackProvider });

  for (const [index, attempt] of attempts.entries()) {
    const key = openKey(attempt.provider.key_sealed);
    if (!key) continue;
    if (index > 0) send({ t: "notice", text: `${first.model.label} isn’t answering, so ${attempt.model.label} answered instead.` });
    // Passages were found for the first model. A backup on a plan that shares data mustn't get internal ones with them.
    const levels: Level[] = levelsFor(attempt.provider.id, attempt.provider.plan);
    const readable = passages.filter((p) => levels.includes(p.level as Level));
    const shares = sharesData(attempt.provider.id, attempt.provider.plan);
    // Live records are internal: this is the check that keeps them from a plan that shares data, whatever came before it.
    const records = shares ? [] : looked;
    const mode: LookupMode = records.length ? "data" : mayUseData && dataModel ? "chat" : "none";

    // Whatever has gone before, this attempt must end inside the route's 60 seconds.
    const left = Math.max(5_000, 55_000 - (Date.now() - started));
    const patience = records.length ? PATIENCE_WITH_DATA : index === 0 && attempts.length > 1 ? PATIENCE_WITH_BACKUP : PATIENCE;
    const settings = callSettings(attempt.provider.id);

    let heard = "";
    const result = await streamAnswer({
      model: chatModel(attempt.provider.id, key, attempt.model.id, attempt.provider.account_ref),
      instructions: instructionsFor(mode),
      messages: messagesWith(readable, records, shares),
      maxOutputTokens: LIMITS.outputTokens,
      signal,
      patience: { ...patience, totalMs: Math.min(patience.totalMs, left) },
      ...settings,
      // Reporting records is no place for a model's flair.
      ...(records.length && settings.temperature !== undefined && { temperature: 0.2 }),
      onDelta: (text) => {
        // Once it starts reciting its instructions nothing more goes out, and the answer is replaced below.
        heard += text;
        if (!leaksInstructions(heard)) send({ t: "delta", text });
      },
    });
    // Choosing the records was part of this answer when the same model did it. Elsewhere it was a free plan's, which costs nothing.
    const plan = planned?.modelId === attempt.model.id ? planned : null;
    const [inputTokens, outputTokens] = [result.inputTokens + (plan?.input ?? 0), result.outputTokens + (plan?.output ?? 0)];
    const cost = costOf(attempt.provider.plan, attempt.model, inputTokens, outputTokens);
    const tokens = { input: inputTokens, output: outputTokens, cost };

    if (result.stopped) {
      await record(viewer, "stopped", attempt.model, tokens);
      if (cost > 0) await checkSpend(attempt.provider, cost);
      return;
    }

    if (result.error) {
      console.error(`Assistant ${attempt.model.id}: ${result.error.status ?? "no status"} ${result.error.message.slice(0, 200)}`);
      const failure = classifyFailure(result.error.status, result.error.body);
      if (failure === "no_credit" || failure === "bad_key") await markFailed(attempt.provider, failure);
      await record(viewer, "error", attempt.model, { input: 0, output: 0, cost: 0 });
      // Once part of an answer is on screen, starting over with another model would muddle it.
      if (result.shown) {
        send({ t: "error", message: "The answer was cut off. Ask again in a moment." });
        return;
      }
      continue;
    }

    const tidy = tidyAnswer(result.text, readable.length + records.length);
    if (leaksInstructions(result.text)) {
      send({ t: "replace", text: WONT_SHARE_RULES });
      send({ t: "sources", sources: [] });
      await record(viewer, "general", attempt.model, tokens);
    } else if (!tidy.text) {
      send({ t: "replace", text: NOTHING_SAID });
      await record(viewer, "error", attempt.model, tokens);
    } else {
      if (tidy.text !== result.text.trim()) send({ t: "replace", text: tidy.text });
      const sources: ChatSource[] = tidy.cited.map((cited, i) => {
        const r = records[cited - readable.length - 1];
        if (r) return { n: i + 1, title: r.title, href: r.href };
        const p = readable[cited - 1]!;
        const from = unitOf(p);
        return { n: i + 1, title: p.title, href: linkFor(viewer, p.href), ...(from && { from }) };
      });
      // A model that read the records and forgot to cite them: the person still sees where the answer came from.
      if (!sources.length) records.filter((r) => r.found).forEach((r, i) => sources.push({ n: i + 1, title: r.title, href: r.href }));
      const internal = records.length > 0 || tidy.cited.some((cited) => readable[cited - 1]?.level === "internal");
      send({ t: "sources", sources, ...(internal && { internal }) });
      await record(viewer, sources.length ? "answered" : "general", attempt.model, tokens);
    }
    if (cost > 0) await checkSpend(attempt.provider, cost);
    return;
  }

  send({ t: "error", message: `${PROVIDERS[attempts.at(-1)!.model.provider as ProviderId].label} isn’t answering right now. Try again in a moment.` });
}
