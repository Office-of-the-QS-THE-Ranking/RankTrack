import "server-only";

/*
 * The analytics engine's daily round, run by the daily cron as the Hub itself: for each open data request, a reminder
 * to every unit that still owes items (every `remindDays`), and once a unit is `escalateDays` past due, word to the
 * Office so the Director follows up (the Office's process: the Ranking Specialist reminds, the Director acts). Each
 * active edition also gets a weekly snapshot, so the quarterly review always has something to compare against.
 */
import { log, notify } from "@/lib/governance/engine/core";
import { readState } from "@/lib/governance/server/store";
import { runSystem } from "@/lib/governance/server/run";
import type { Json } from "@/lib/supabase/database.types";
import { adminDb } from "@/lib/supabase/server";
import { summarize } from "../brief";
import { dueActions, unitStandings } from "../units";
import { readCampaigns, readSnapshots } from "./db";
import { catalogs, reportFor } from "./load";

const WEEK_MS = 7 * 86_400_000;

export async function analyticsDaily(now = new Date()): Promise<{ ok: boolean; message: string }> {
  const db = adminDb();
  const today = now.toISOString().slice(0, 10);
  const state = await readState();
  const unitName = (id: string) => state.units.find((u) => u.id === id)?.name ?? id;
  const notices: { to: string; template: string; vars: Record<string, string | number>; href: string }[] = [];
  const entries: { action: string; id: string; label: string; detail: string }[] = [];
  let reminded = 0;
  let escalated = 0;

  for (const c of (await readCampaigns()).filter((x) => x.status === "Open")) {
    const r = await reportFor(c.edition);
    if (!r) continue;
    const standings = unitStandings(c, r.bundle.facts, r.report, today);
    let mine = 0;
    for (const step of dueActions(c, standings, now)) {
      const s = standings.find((x) => x.unit === step.unit)!;
      const open = s.requested - s.submitted;
      const u = c.units.find((x) => x.unit === step.unit)!;
      if (step.action === "remind") {
        await db.from("analytics_campaign_units").update({ reminded_at: now.toISOString(), reminders: u.reminders + 1 }).eq("campaign_id", c.id).eq("unit_id", step.unit);
        notices.push({ to: `unit:${step.unit}`, template: "tpl-data-reminder", vars: { ranking: r.bundle.catalog.edition.label, open, count: s.requested, due: c.due }, href: "/portal/requests" });
        reminded++;
        mine++;
      } else {
        await db.from("analytics_campaign_units").update({ escalated_at: now.toISOString() }).eq("campaign_id", c.id).eq("unit_id", step.unit);
        notices.push({ to: "office", template: "tpl-data-escalated", vars: { unit: unitName(step.unit), ranking: r.bundle.catalog.edition.label, open, count: s.requested, due: c.due }, href: `/admin/rankings/data-requests?request=${c.id}` });
        entries.push({ action: "analytics.campaign.escalate", id: c.code, label: c.title, detail: `${unitName(step.unit)}: ${open} of ${s.requested} items past due ${c.due}` });
        escalated++;
      }
    }
    if (mine) entries.push({ action: "analytics.campaign.remind", id: c.code, label: c.title, detail: `${mine} ${mine === 1 ? "unit" : "units"} reminded` });
  }

  // Weekly snapshots of every active edition.
  const snapshots = await readSnapshots();
  let taken = 0;
  for (const cat of (await catalogs()).filter((x) => x.edition.status === "Active")) {
    const last = snapshots.find((s) => s.edition === cat.edition.id);
    if (last && now.getTime() - Date.parse(last.at) < WEEK_MS) continue;
    const r = await reportFor(cat.edition.id);
    if (!r) continue;
    const { error } = await db.from("analytics_snapshots").insert({ edition_id: cat.edition.id, by: "system", kind: "auto", summary: summarize(r.report) as unknown as Json });
    if (!error) taken++;
  }

  if (notices.length || entries.length || taken)
    await runSystem((ctx) => {
      for (const e of entries) log(ctx, e.action, "Data", { type: "Data request", id: e.id, label: e.label }, "Success", e.detail);
      if (taken) log(ctx, "analytics.snapshot", "Data", { type: "Snapshot", id: "weekly", label: "Weekly snapshots" }, "Success", `${taken} editions`);
      for (const n of notices) notify(ctx, n.to, n.template, n.vars, n.href);
      return { ok: true, message: "" };
    });
  return { ok: true, message: `${reminded} reminders, ${escalated} escalations, ${taken} snapshots` };
}
