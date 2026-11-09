import "server-only";

/* Everything the AI Assistant tab shows. Keys never leave the server: only their last four characters do. */
import { ROLES } from "@/lib/governance/catalog";
import { hub } from "@/lib/governance/server/hub";
import { adminDb } from "@/lib/supabase/server";
import { creditsLeft, PROVIDERS, type ProviderId, type RequestStatus } from "../rules";
import type { AssistantDesk, CreditRow, UsageRow } from "../types";
import { accountKnown, sealedLength } from "./providers";
import { readSetup } from "./setup";

const USAGE_DAYS = 90;

export async function assistantDesk(): Promise<AssistantDesk> {
  const db = adminDb();
  const since = new Date(Date.now() - USAGE_DAYS * 86_400_000).toISOString();
  const [setup, h, requests, credits, usage] = await Promise.all([
    readSetup(),
    hub(),
    db.from("assistant_model_access").select("*").eq("status", "pending" satisfies RequestStatus).order("requested_at"),
    db.from("assistant_credits").select("*").order("recorded_at", { ascending: false }).limit(50),
    db.rpc("assistant_usage_rollup", { p_since: since }),
  ]);
  if (requests.error || credits.error || usage.error) throw new Error(`Assistant desk: ${(requests.error ?? credits.error ?? usage.error)!.message}`);

  const accounts = new Map(h.state.accounts.map((a) => [a.id, a]));
  const units = new Map(h.state.units.map((u) => [u.id, u.name]));
  const roles = new Map(ROLES.map((r) => [r.id as string, r.name]));
  const modelLabel = new Map(setup.models.map((m) => [m.id, m.label]));
  const person = (id: string | null) => (id ? (accounts.get(id)?.name ?? "Former account") : "");

  return {
    now: new Date().toISOString(),
    paused: setup.paused,
    fallbackModel: setup.fallbackModel,
    index: setup.index,
    accountKnown: accountKnown(),
    providers: [...setup.providers.values()].map((p) => ({
      id: p.id,
      label: PROVIDERS[p.id].label,
      keyUrl: PROVIDERS[p.id].keyUrl,
      billingUrl: PROVIDERS[p.id].billingUrl,
      hasFreePlan: PROVIDERS[p.id].hasFreePlan,
      plan: p.plan,
      status: p.status,
      statusAt: p.status_at,
      keyHint: p.key_hint,
      keyLength: sealedLength(p.key_sealed),
      connectedAt: p.connected_at,
      connectedBy: person(p.connected_by) || null,
      accountRef: p.account_ref,
      budget: p.monthly_budget_usd,
      low: p.low_credit_usd,
      bought: p.bought,
      spentTotal: p.spentTotal,
      spentMonth: p.spentMonth,
      left: creditsLeft(p.bought, p.spentTotal),
    })),
    models: setup.models.map((m) => ({
      id: m.id,
      provider: m.provider,
      label: m.label,
      inputUsd: m.input_usd,
      outputUsd: m.output_usd,
      enabled: m.enabled,
      access: m.access,
      dailyLimit: m.daily_limit,
      isDefault: m.is_default,
    })),
    requests: (requests.data ?? []).map((r) => {
      const a = accounts.get(r.account_id);
      return { modelId: r.model_id, modelLabel: modelLabel.get(r.model_id) ?? r.model_id, accountId: r.account_id, name: a?.name ?? "Former account", unit: a ? (units.get(a.unitId) ?? "") : "", requestedAt: r.requested_at };
    }),
    credits: (credits.data ?? []).map((c): CreditRow => ({ id: c.id, provider: c.provider as ProviderId, amount: Number(c.amount_usd), note: c.note ?? "", by: person(c.recorded_by), at: c.recorded_at })),
    usage: (usage.data ?? []).map(
      (u): UsageRow => ({
        day: u.day,
        model: u.model_id ? (modelLabel.get(u.model_id) ?? u.model_id) : "No model",
        provider: u.provider ?? "",
        unit: u.unit_id ? (units.get(u.unit_id) ?? "Former unit") : "No unit",
        role: u.role_id ? (roles.get(u.role_id) ?? u.role_id) : "No role",
        outcome: u.outcome as UsageRow["outcome"],
        messages: Number(u.messages),
        inputTokens: Number(u.input_tokens),
        outputTokens: Number(u.output_tokens),
        cost: Number(u.cost_usd),
      }),
    ),
  };
}
