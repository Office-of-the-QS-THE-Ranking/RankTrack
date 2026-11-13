import "server-only";

/*
 * Telling the people who run the assistant: the bell, through the governance store's notices. Rare by design (each is
 * sent on crossing a line, not on every message), since every commit moves the store's version.
 */
import { alert } from "@/lib/alerts";
import { notify } from "@/lib/governance/engine/core";
import { actingGrants, has } from "@/lib/governance/rbac";
import { runSystem } from "@/lib/governance/server/run";
import type { GovernanceState } from "@/lib/governance/types";
import { adminDb } from "@/lib/supabase/server";
import { PROVIDERS, spendAlerts, type Failure, type ProviderId } from "../rules";
import type { ProviderRecord } from "./setup";

export const AGENTIC_CONTROL_TAB = "/admin/command-control/agentic-control";

/** Everyone able to manage the assistant: University-wide, and holding its manage permission in the role they're acting in. */
export function managerIds(state: GovernanceState) {
  const day = new Date().toISOString().slice(0, 10);
  return state.accounts
    .filter((a) => a.status === "Active" && actingGrants(a, state.units, day, state.config.rolePermissions).some((g) => g.units === "all" && has(g.perms, "ai", "manage")))
    .map((a) => a.id);
}

export async function tellManagers(template: string, vars: Record<string, string | number>) {
  await runSystem((ctx) => {
    for (const id of managerIds(ctx.state)) notify(ctx, id, template, vars, AGENTIC_CONTROL_TAB);
    return { ok: true, message: "" };
  }).catch((e: unknown) => console.error(`Assistant notice: ${e instanceof Error ? e.message : e}`));
}

export const FAILURE_REASON: Record<Extract<Failure, "no_credit" | "bad_key">, string> = {
  no_credit: "it has no credit left",
  bad_key: "it refused the saved key",
};

/** Record that a provider refused us, and say so once: only when it was working until now. */
export async function markFailed(provider: ProviderRecord, failure: "no_credit" | "bad_key") {
  if (provider.status === failure) return;
  await adminDb().from("assistant_providers").update({ status: failure, status_at: new Date().toISOString() }).eq("id", provider.id);
  const label = PROVIDERS[provider.id].label;
  void alert("assistant", `${label} stopped answering`, { reason: failure });
  await tellManagers("tpl-ai-down", { provider: label, reason: FAILURE_REASON[failure] });
}

/** After a paid message: did it take this provider past its low-credit line or its budget? */
export async function checkSpend(provider: ProviderRecord, cost: number) {
  const spentTotal = provider.spentTotal + cost;
  const spentMonth = provider.spentMonth + cost;
  const label = PROVIDERS[provider.id as ProviderId].label;
  for (const hit of spendAlerts({ plan: provider.plan, bought: provider.bought, spentTotal, spentMonth, cost, low: provider.low_credit_usd, budget: provider.monthly_budget_usd })) {
    if (hit === "low") await tellManagers("tpl-ai-credits", { provider: label, left: (provider.bought - spentTotal).toFixed(2) });
    else await tellManagers("tpl-ai-budget", { provider: label, budget: (provider.monthly_budget_usd ?? 0).toFixed(2) });
  }
}
