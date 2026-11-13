"use server";

/*
 * The Agentic Control tab's actions, and the one thing anyone signed in can do: ask for a model that's on request. Each
 * change the Office makes is audited through the store's trail, never with a key in it. A provider counts as connected
 * only after the key has answered a test.
 */
import { audit, BUSY, ENDED, fail, type Result } from "@/lib/analytics/server/guard";
import { chatOptions, managesAgenticControl } from "@/lib/assistant/server/chat";
import { agenticControlDesk } from "@/lib/assistant/server/desk";
import { rebuildIndex } from "@/lib/assistant/server/index-builder";
import { tellManagers } from "@/lib/assistant/server/notices";
import { openKey, sealKey, testKey } from "@/lib/assistant/server/providers";
import { readSetup } from "@/lib/assistant/server/setup";
import { EMBEDDING_PROVIDER, isProvider, PROVIDERS, sharesData, type ModelAccess, type Plan, type ProviderId } from "@/lib/assistant/rules";
import type { AgenticControlDesk, ChatOptions } from "@/lib/assistant/types";
import { notify } from "@/lib/governance/engine/core";
import { allowAccount } from "@/lib/governance/server/limits";
import { run } from "@/lib/governance/server/run";
import { getViewer } from "@/lib/governance/server/session";
import type { Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import { readJob } from "@/lib/review/server/reviewer";

type DeskResult = Result<AgenticControlDesk>;

/** Only someone running the Hub University-wide, whatever a role's permissions were edited to say. */
async function manager(): Promise<Viewer | { ok: false; message: string }> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  if (!managesAgenticControl(viewer)) return fail("Only the Director and Ranking Specialists can manage the assistant.");
  if (!(await allowAccount(viewer.id, "command"))) return BUSY;
  return viewer;
}

const isViewer = (v: Viewer | { ok: false; message: string }): v is Viewer => "grants" in v;

const done = async (message: string): Promise<DeskResult> => ({ ok: true, message, data: await agenticControlDesk() });

const money = (value: unknown, max = 100_000) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? Math.round(value * 100) / 100 : null);

export async function connectProvider(input: { provider: unknown; key: unknown; plan: unknown; accountRef?: unknown }): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  if (!isProvider(input.provider)) return fail("Pick a provider.");
  const provider: ProviderId = input.provider;
  const key = typeof input.key === "string" ? input.key.trim() : "";
  if (key.length < 8 || key.length > 512 || /\s/.test(key)) return fail("Paste the whole key, with no spaces.");
  const plan: Plan = PROVIDERS[provider].hasFreePlan && input.plan === "free" ? "free" : "paid";
  const accountRef = typeof input.accountRef === "string" ? input.accountRef.trim().slice(0, 64) : "";
  if (accountRef && !/^[a-f0-9]{16,64}$/i.test(accountRef)) return fail("That doesn’t look like a Cloudflare account ID.");

  const tested = await testKey(provider, key, accountRef || null);
  if (!tested.ok) return fail(tested.message);

  const now = new Date().toISOString();
  const { error } = await adminDb()
    .from("assistant_providers")
    .update({ key_sealed: sealKey(key), key_hint: key.slice(-4), plan, account_ref: accountRef || null, status: "ok", status_at: now, connected_by: viewer.id, connected_at: now })
    .eq("id", provider);
  if (error) return fail("The key worked, but it couldn’t be saved. Try again.");
  await audit(viewer, "assistant.connect", { type: "AI provider", id: provider, label: PROVIDERS[provider].label }, `Connected on the ${plan} plan.`, [], "Configuration");

  // The first Cloudflare connection is what the index was waiting for.
  if (provider === EMBEDDING_PROVIDER) {
    const built = await rebuildIndex();
    return done(built.ok ? `${PROVIDERS[provider].label} connected. ${built.message}` : `${PROVIDERS[provider].label} connected, but: ${built.message}`);
  }
  return done(`${PROVIDERS[provider].label} connected. Its models are in the chat now.`);
}

export async function disconnectProvider(provider: unknown): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  if (!isProvider(provider)) return fail("Pick a provider.");
  const { error } = await adminDb().from("assistant_providers").update({ key_sealed: null, key_hint: null, account_ref: null, status: "disconnected", status_at: new Date().toISOString() }).eq("id", provider);
  if (error) return fail("Couldn’t disconnect it. Try again.");
  await audit(viewer, "assistant.disconnect", { type: "AI provider", id: provider, label: PROVIDERS[provider].label }, "Key removed.", [], "Configuration");
  return done(`${PROVIDERS[provider].label} disconnected. Its key is gone from the Hub.`);
}

/** After credit is added, or a provider recovers: the saved key is tried again. */
export async function recheckProvider(provider: unknown): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  if (!isProvider(provider)) return fail("Pick a provider.");
  const db = adminDb();
  const { data: saved } = await db.from("assistant_providers").select("key_sealed, account_ref").eq("id", provider).maybeSingle();
  const key = openKey(saved?.key_sealed);
  if (!key) return fail("Connect it first.");
  const tested = await testKey(provider, key, saved?.account_ref);
  if (!tested.ok) return fail(tested.message);
  const { error } = await db.from("assistant_providers").update({ status: "ok", status_at: new Date().toISOString() }).eq("id", provider);
  if (error) return fail("Couldn’t update it. Try again.");
  await audit(viewer, "assistant.recheck", { type: "AI provider", id: provider, label: PROVIDERS[provider].label }, "Put back in service.", [], "Configuration");
  return done(`${PROVIDERS[provider].label} is back in the chat. If it refuses again, it stops again.`);
}

export async function setProviderLimits(input: { provider: unknown; budget: unknown; low: unknown }): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  if (!isProvider(input.provider)) return fail("Pick a provider.");
  const budget = input.budget === null ? null : money(input.budget);
  const low = money(input.low);
  if ((input.budget !== null && budget === null) || low === null) return fail("Enter amounts in US dollars.");
  const { error } = await adminDb().from("assistant_providers").update({ monthly_budget_usd: budget, low_credit_usd: low }).eq("id", input.provider);
  if (error) return fail("Couldn’t save that. Try again.");
  await audit(viewer, "assistant.limits", { type: "AI provider", id: input.provider, label: PROVIDERS[input.provider].label }, `Budget ${budget === null ? "none" : `$${budget}`}, warn at $${low}.`, [], "Configuration");
  return done("Limits saved.");
}

export async function recordCredits(input: { provider: unknown; amount: unknown; note?: unknown }): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  if (!isProvider(input.provider)) return fail("Pick a provider.");
  const amount = money(input.amount);
  if (!amount) return fail("Enter what you bought, in US dollars.");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 200) : "";
  const db = adminDb();
  const { error } = await db.from("assistant_credits").insert({ provider: input.provider, amount_usd: amount, note: note || null, recorded_by: viewer.id });
  if (error) return fail("Couldn’t record that. Try again.");
  // Credit is the usual cure for a provider that stopped for lack of it.
  await db.from("assistant_providers").update({ status: "ok", status_at: new Date().toISOString() }).eq("id", input.provider).eq("status", "no_credit");
  await audit(viewer, "assistant.credits", { type: "AI provider", id: input.provider, label: PROVIDERS[input.provider].label }, `Recorded $${amount} of credit.`, [], "Configuration");
  return done(`$${amount.toFixed(2)} recorded for ${PROVIDERS[input.provider].label}.`);
}

export async function updateModel(input: { id: unknown; enabled?: unknown; access?: unknown; dailyLimit?: unknown; inputUsd?: unknown; outputUsd?: unknown; isDefault?: unknown }): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  if (typeof input.id !== "string") return fail("Pick a model.");
  const db = adminDb();
  const { data: model } = await db.from("assistant_models").select("label").eq("id", input.id).maybeSingle();
  if (!model) return fail("That model isn’t in the list.");

  const patch: { enabled?: boolean; access?: ModelAccess; daily_limit?: number | null; input_usd?: number; output_usd?: number; is_default?: boolean } = {};
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (input.access === "everyone" || input.access === "on_request") patch.access = input.access;
  if (input.dailyLimit === null) patch.daily_limit = null;
  else if (input.dailyLimit !== undefined) {
    if (!Number.isInteger(input.dailyLimit) || (input.dailyLimit as number) < 1 || (input.dailyLimit as number) > 10_000) return fail("Enter a daily limit from 1 to 10,000.");
    patch.daily_limit = input.dailyLimit as number;
  }
  if (input.inputUsd !== undefined || input.outputUsd !== undefined) {
    const inUsd = money(input.inputUsd, 1000);
    const outUsd = money(input.outputUsd, 1000);
    // Prices run to fractions of a cent, so they keep the precision money() rounds away.
    if (inUsd === null || outUsd === null) return fail("Enter prices in US dollars per million tokens.");
    patch.input_usd = input.inputUsd as number;
    patch.output_usd = input.outputUsd as number;
  }
  if (input.isDefault === true) {
    const { error: cleared } = await db.from("assistant_models").update({ is_default: false }).eq("is_default", true);
    if (cleared) return fail("Couldn’t change the default. Try again.");
    patch.is_default = true;
  }
  if (!Object.keys(patch).length) return done("Nothing to change.");
  const { error } = await db.from("assistant_models").update(patch).eq("id", input.id);
  if (error) return fail("Couldn’t save that. Try again.");
  await audit(viewer, "assistant.model", { type: "AI model", id: input.id, label: model.label }, JSON.stringify(patch), [], "Configuration");
  const message = patch.enabled === false ? `${model.label} is off. It’s out of the chat from the next message.` : patch.enabled === true ? `${model.label} is on.` : `${model.label} updated.`;
  return done(message);
}

export async function updateSettings(input: { paused?: unknown; fallbackModel?: unknown }): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  const patch: { paused?: boolean; fallback_model?: string | null; updated_at: string } = { updated_at: new Date().toISOString() };
  if (typeof input.paused === "boolean") patch.paused = input.paused;
  if (input.fallbackModel === null || typeof input.fallbackModel === "string") patch.fallback_model = (input.fallbackModel as string) || null;
  const { error } = await adminDb().from("assistant_settings").update(patch).eq("id", 1);
  if (error) return fail("Couldn’t save that. Try again.");
  await audit(viewer, "assistant.settings", { type: "Agentic Control", id: "settings", label: "Assistant" }, JSON.stringify(patch), [], "Configuration");
  return done(input.paused === true ? "The assistant is off for everyone." : input.paused === false ? "The assistant is on." : "Saved.");
}

/**
 * A job's model, backup, daily limit and switch. A model on a plan that shares what it's sent is refused here, and
 * again on every run, since evidence text must never reach one.
 */
export async function updateJob(input: { id: unknown; enabled?: unknown; modelId?: unknown; backupModelId?: unknown; dailyLimit?: unknown }): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  if (input.id !== "reviewer") return fail("Pick a job.");
  const [job, setup] = await Promise.all([readJob("reviewer"), readSetup()]);
  const patch: { enabled?: boolean; model_id?: string | null; backup_model_id?: string | null; daily_limit?: number; updated_by: string; updated_at: string } = { updated_by: viewer.id, updated_at: new Date().toISOString() };
  for (const [field, value] of [["model_id", input.modelId], ["backup_model_id", input.backupModelId]] as const) {
    if (value === undefined) continue;
    if (value === null || value === "") {
      patch[field] = null;
      continue;
    }
    const model = setup.models.find((m) => m.id === value);
    if (model && sharesData(model.provider, setup.providers.get(model.provider)?.plan ?? "paid")) return fail(`${model.label} is on a plan that shares what it’s sent, so it can’t read evidence.`);
    if (!model) return fail("That model isn’t in the list.");
    patch[field] = model.id;
  }
  if (input.dailyLimit !== undefined) {
    if (!Number.isInteger(input.dailyLimit) || (input.dailyLimit as number) < 1 || (input.dailyLimit as number) > 10_000) return fail("Enter a daily limit from 1 to 10,000.");
    patch.daily_limit = input.dailyLimit as number;
  }
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  const modelId = patch.model_id !== undefined ? patch.model_id : job.model_id;
  if ((patch.enabled ?? job.enabled) && !modelId) {
    if (patch.enabled) return fail("Choose a model for the Reviewer first.");
    // Taking the model away turns the job off rather than leaving it on with nothing to run.
    patch.enabled = false;
  }
  if (patch.model_id && patch.model_id === (patch.backup_model_id !== undefined ? patch.backup_model_id : job.backup_model_id)) patch.backup_model_id = null;
  const { error } = await adminDb().from("assistant_jobs").update(patch).eq("id", "reviewer");
  if (error) return fail("Couldn’t save that. Try again.");
  const { updated_by: _by, updated_at: _at, ...changed } = patch;
  await audit(viewer, "assistant.job", { type: "AI job", id: "reviewer", label: "Reviewer" }, JSON.stringify(changed), [], "Configuration");
  return done(patch.enabled === true ? "The Reviewer is on." : patch.enabled === false ? "The Reviewer is off." : "Saved.");
}

export async function rebuildAssistantIndex(): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  const built = await rebuildIndex();
  if (!built.ok) return fail(built.message);
  return done(built.message);
}

export async function decideModelRequest(input: { modelId: unknown; accountId: unknown; approve: unknown }): Promise<DeskResult> {
  const viewer = await manager();
  if (!isViewer(viewer)) return viewer;
  if (typeof input.modelId !== "string" || typeof input.accountId !== "string") return fail("Pick a request.");
  const decision = input.approve === true ? "approved" : "denied";
  const db = adminDb();
  const { data: model } = await db.from("assistant_models").select("label").eq("id", input.modelId).maybeSingle();
  const { error } = await db.from("assistant_model_access").update({ status: decision, decided_at: new Date().toISOString(), decided_by: viewer.id }).eq("model_id", input.modelId).eq("account_id", input.accountId);
  if (error || !model) return fail("Couldn’t save that. Try again.");
  const accountId = input.accountId;
  await run(viewer.id, (ctx) => {
    notify(ctx, accountId, "tpl-ai-decision", { model: model.label, decision }, "/portal");
    return { ok: true, message: "" };
  });
  await audit(viewer, "assistant.request", { type: "AI model", id: input.modelId, label: model.label }, `Request ${decision} for ${accountId}.`, [], "Access");
  return done(`Request ${decision}.`);
}

/* ---------- For anyone signed in ---------- */

export async function assistantOptions(): Promise<ChatOptions> {
  const viewer = await getViewer();
  if (!viewer) return { unavailable: "Your session has ended. Sign in again to continue.", models: [] };
  try {
    return await chatOptions(viewer);
  } catch (e) {
    console.error(`Assistant options: ${e instanceof Error ? e.message : e}`);
    return { unavailable: "The assistant isn’t available right now.", models: [] };
  }
}

export async function requestModelAccess(modelId: unknown): Promise<Result<ChatOptions>> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  if (!(await allowAccount(viewer.id, "command"))) return BUSY;
  if (typeof modelId !== "string") return fail("Pick a model.");
  const db = adminDb();
  const { data: model } = await db.from("assistant_models").select("label, access, enabled").eq("id", modelId).maybeSingle();
  if (!model?.enabled) return fail("That model isn’t available.");
  if (model.access !== "on_request") return { ok: true, message: `${model.label} is open to everyone.`, data: await chatOptions(viewer) };
  // Asking again after a denial reopens it; an approval stays as it is.
  const { data: existing } = await db.from("assistant_model_access").select("status").eq("model_id", modelId).eq("account_id", viewer.id).maybeSingle();
  if (existing?.status === "approved") return { ok: true, message: `You already have ${model.label}.`, data: await chatOptions(viewer) };
  if (existing?.status === "pending") return { ok: true, message: `Your request for ${model.label} is waiting for the Office.`, data: await chatOptions(viewer) };
  const { error } = await db.from("assistant_model_access").upsert({ model_id: modelId, account_id: viewer.id, status: "pending", requested_at: new Date().toISOString(), decided_at: null, decided_by: null }, { onConflict: "model_id,account_id" });
  if (error) return fail("Couldn’t send that. Try again.");
  await tellManagers("tpl-ai-request", { name: viewer.name, model: model.label });
  return { ok: true, message: `Request sent. The Office will decide on ${model.label}.`, data: await chatOptions(viewer) };
}
