import "server-only";

/*
 * The assistant's settings as they stand right now. Read fresh for every question, with no cache, so connecting a
 * provider or switching a model off on the AI tab reaches the whole chat from the next message, on every server.
 */
import { adminDb } from "@/lib/supabase/server";
import { manilaStart, type ModelAccess, type Plan, type ProviderId, type ProviderStatus, type RequestStatus } from "../rules";

export interface ProviderRecord {
  id: ProviderId;
  key_sealed: string | null;
  key_hint: string | null;
  plan: Plan;
  account_ref: string | null;
  status: ProviderStatus;
  status_at: string | null;
  monthly_budget_usd: number | null;
  low_credit_usd: number;
  connected_by: string | null;
  connected_at: string | null;
  bought: number;
  spentTotal: number;
  spentMonth: number;
}

export interface ModelRecord {
  id: string;
  provider: ProviderId;
  label: string;
  input_usd: number;
  output_usd: number;
  enabled: boolean;
  access: ModelAccess;
  daily_limit: number | null;
  is_default: boolean;
}

export interface Setup {
  paused: boolean;
  fallbackModel: string | null;
  indexChunks: number;
  index: { builtAt: string | null; chunks: number; error: string | null };
  providers: Map<ProviderId, ProviderRecord>;
  models: ModelRecord[];
}

const need = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error || r.data === null) throw new Error(`Assistant ${what}: ${r.error?.message ?? "no data"}`);
  return r.data;
};

export async function readSetup(): Promise<Setup> {
  const db = adminDb();
  const [settings, providers, models, credits, spend] = await Promise.all([
    db.from("assistant_settings").select("*").eq("id", 1).single(),
    db.from("assistant_providers").select("*").order("position"),
    db.from("assistant_models").select("*").order("position"),
    db.from("assistant_credits").select("provider, amount_usd"),
    db.rpc("assistant_provider_spend", { p_month_start: manilaStart("month").toISOString() }),
  ]);
  const s = need(settings, "settings");
  const bought = new Map<string, number>();
  for (const c of need(credits, "credits")) bought.set(c.provider, (bought.get(c.provider) ?? 0) + Number(c.amount_usd));
  const spent = new Map(need(spend, "spend").map((r) => [r.provider, r]));
  return {
    paused: s.paused,
    fallbackModel: s.fallback_model,
    indexChunks: s.index_chunks,
    index: { builtAt: s.index_built_at, chunks: s.index_chunks, error: s.index_error },
    providers: new Map(
      need(providers, "providers").map((p) => [
        p.id as ProviderId,
        {
          id: p.id as ProviderId,
          key_sealed: p.key_sealed,
          key_hint: p.key_hint,
          plan: p.plan as Plan,
          account_ref: p.account_ref,
          status: p.status as ProviderStatus,
          status_at: p.status_at,
          monthly_budget_usd: p.monthly_budget_usd === null ? null : Number(p.monthly_budget_usd),
          low_credit_usd: Number(p.low_credit_usd),
          connected_by: p.connected_by,
          connected_at: p.connected_at,
          bought: bought.get(p.id) ?? 0,
          spentTotal: Number(spent.get(p.id)?.total_usd ?? 0),
          spentMonth: Number(spent.get(p.id)?.month_usd ?? 0),
        },
      ]),
    ),
    models: need(models, "models").map((m) => ({
      id: m.id,
      provider: m.provider as ProviderId,
      label: m.label,
      input_usd: Number(m.input_usd),
      output_usd: Number(m.output_usd),
      enabled: m.enabled,
      access: m.access as ModelAccess,
      daily_limit: m.daily_limit,
      is_default: m.is_default,
    })),
  };
}

export async function requestsOf(accountId: string): Promise<Map<string, RequestStatus>> {
  const { data, error } = await adminDb().from("assistant_model_access").select("model_id, status").eq("account_id", accountId);
  if (error) throw new Error(`Assistant requests: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.model_id, r.status as RequestStatus]));
}

/** Answers this person has had from this model today, against its daily limit. */
export async function usedToday(accountId: string, modelId: string) {
  const { count, error } = await adminDb()
    .from("assistant_usage")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("model_id", modelId)
    // A job's runs are the Office's work, not this person's messages.
    .eq("job", "assistant")
    .in("outcome", ["answered", "general", "stopped"])
    .gte("at", manilaStart("day").toISOString());
  if (error) throw new Error(`Assistant usage: ${error.message}`);
  return count ?? 0;
}
