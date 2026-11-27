"use server";

/*
 * Firewall › Settings › Analytics: page analytics settings. Viewing needs Privacy and security (view), the retention period needs
 * edit, and switching collection on or off, counting development servers and deleting every record need manage.
 * Every change is audited.
 */
import { audit, BUSY, ENDED, fail, type Result } from "@/lib/analytics/server/guard";
import { allowAccount } from "@/lib/governance/server/limits";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import { forgetAnalyticsSettings, readSettings, webAnalyticsDesk } from "@/lib/web-analytics/server";
import type { WaDesk, WaView } from "@/lib/web-analytics/types";

type DeskResult = Result<WaDesk>;

async function who(level: "view" | "edit" | "manage"): Promise<Viewer | { ok: false; message: string }> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  if (!viewerCan(viewer, "security", level)) return fail(level === "manage" ? "Only the Director and Ranking Specialists can change that." : "Your role can’t change page analytics.");
  if (level !== "view" && !(await allowAccount(viewer.id, "command"))) return BUSY;
  return viewer;
}
const isViewer = (v: Viewer | { ok: false; message: string }): v is Viewer => "grants" in v;

export async function saveWebAnalyticsSettings(input: { enabled?: unknown; retentionDays?: unknown; devEnabled?: unknown }, view?: Partial<WaView>): Promise<DeskResult> {
  const sensitive = input.enabled !== undefined || input.devEnabled !== undefined;
  const viewer = await who(sensitive ? "manage" : "edit");
  if (!isViewer(viewer)) return viewer;
  const before = await readSettings();
  const patch: Record<string, unknown> = {};
  const said: string[] = [];
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") return fail("Pick on or off.");
    patch.enabled = input.enabled;
    said.push(input.enabled ? "Collection on" : "Collection off");
  }
  if (input.retentionDays !== undefined) {
    const n = Number(input.retentionDays);
    if (!Number.isInteger(n) || n < 7 || n > 730) return fail("Keep records for 7 to 730 days.");
    patch.retention_days = n;
    said.push(`Keep ${before.retentionDays} → ${n} days`);
  }
  if (input.devEnabled !== undefined) {
    if (typeof input.devEnabled !== "boolean") return fail("Pick on or off.");
    patch.dev_enabled = input.devEnabled;
    said.push(input.devEnabled ? "Development servers counted" : "Development servers not counted");
  }
  if (!said.length) return fail("Nothing to change.");
  const { error } = await adminDb().from("web_analytics_settings").update({ ...patch, updated_at: new Date().toISOString(), updated_by: viewer.name }).eq("id", 1);
  if (error) return fail("Couldn’t save the settings. Try again.");
  forgetAnalyticsSettings();
  await audit(viewer, "web-analytics.settings", { type: "Policy", id: "web-analytics", label: "Firewall analytics settings" }, `${said.join(", ")}.`, [], "Security");
  const message =
    input.enabled === true ? "Page analytics is on. Visits count within 30 seconds." : input.enabled === false ? "Page analytics is off. Nothing new is recorded." : "Analytics settings saved.";
  return { ok: true, message, data: await webAnalyticsDesk(viewer, view) };
}

export async function clearWebAnalytics(view?: Partial<WaView>): Promise<DeskResult> {
  const viewer = await who("manage");
  if (!isViewer(viewer)) return viewer;
  const { error, count } = await adminDb().from("web_analytics_events").delete({ count: "exact" }).gte("id", 0);
  if (error) return fail("Couldn’t delete the records. Try again.");
  await audit(viewer, "web-analytics.clear", { type: "Policy", id: "web-analytics", label: "Firewall analytics records" }, `Deleted ${count ?? 0} records.`, [], "Security");
  return { ok: true, message: `Deleted ${(count ?? 0).toLocaleString("en-US")} records.`, data: await webAnalyticsDesk(viewer, view) };
}
