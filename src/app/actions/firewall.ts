"use server";

/*
 * Command & Control › Firewall: rules and settings. Viewing needs Privacy and security (view), rules need edit, and the
 * mode and lockdown need manage. Every change is audited. A rule that would block the person making it is refused,
 * so nobody can lock themselves out from the console; HUB_FIREWALL=off is the way back in if it happens anyway.
 */
import { audit, BUSY, ENDED, fail, type Result } from "@/lib/analytics/server/guard";
import { forgetFirewallConfig } from "@/lib/firewall/guard";
import { normalizeRange } from "@/lib/firewall/ip";
import { matches } from "@/lib/firewall/rules";
import { firewallDesk, readSettings, whoIsAsking } from "@/lib/firewall/server";
import type { FirewallDesk, FirewallMode, FirewallView, RuleAction, RuleKind } from "@/lib/firewall/types";
import { allowAccount } from "@/lib/governance/server/limits";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import { headers } from "next/headers";

type DeskResult = Result<FirewallDesk>;

async function who(level: "view" | "edit" | "manage"): Promise<Viewer | { ok: false; message: string }> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  if (!viewerCan(viewer, "security", level)) return fail(level === "manage" ? "Only the Director and Ranking Specialists can change that." : "Your role can’t change the firewall.");
  if (level !== "view" && !(await allowAccount(viewer.id, "command"))) return BUSY;
  return viewer;
}
const isViewer = (v: Viewer | { ok: false; message: string }): v is Viewer => "grants" in v;

const done = async (viewer: Viewer, message: string, view?: Partial<FirewallView>): Promise<DeskResult> => {
  forgetFirewallConfig();
  return { ok: true, message, data: await firewallDesk(viewer, view) };
};

export async function loadFirewall(view?: Partial<FirewallView>): Promise<DeskResult> {
  const viewer = await who("view");
  if (!isViewer(viewer)) return viewer;
  return { ok: true, message: "", data: await firewallDesk(viewer, view) };
}

const KINDS: RuleKind[] = ["ip", "country", "path", "agent"];
const ACTIONS: RuleAction[] = ["block", "allow", "log"];
const EXPIRY: Record<string, number | null> = { never: null, "1h": 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 };
const KIND_LABEL: Record<RuleKind, string> = { ip: "Address", country: "Country", path: "Path", agent: "User agent" };
const ACTION_LABEL: Record<RuleAction, string> = { block: "Block", allow: "Allow", log: "Log" };
/** Pages a path rule may not block: signing in, and the console that undoes rules. */
const PROTECTED_PATHS = ["/signin", "/auth", "/admin/command-control/firewall", "/portal/command-control/firewall"];

export async function addFirewallRule(input: { name?: unknown; kind: unknown; value: unknown; action: unknown; expires?: unknown; note?: unknown }, view?: Partial<FirewallView>): Promise<DeskResult> {
  const viewer = await who("edit");
  if (!isViewer(viewer)) return viewer;
  const kind = KINDS.find((k) => k === input.kind);
  const action = ACTIONS.find((a) => a === input.action);
  if (!kind) return fail("Pick what the rule matches.");
  if (!action) return fail("Pick what the rule does.");
  const raw = typeof input.value === "string" ? input.value.trim() : "";
  let value = raw;
  if (kind === "ip") {
    const norm = normalizeRange(raw);
    if (!norm) return fail("Enter an address like 203.0.113.7, or a range like 203.0.113.0/24.");
    const prefix = norm.includes("/") ? Number(norm.split("/")[1]) : null;
    if (prefix !== null && action !== "allow" && ((!norm.includes(":") && prefix < 8) || (norm.includes(":") && prefix < 16))) return fail("That range is too wide to block. Use a narrower one, or Lockdown.");
    value = norm;
  } else if (kind === "country") {
    value = raw.toUpperCase();
    if (!/^[A-Z]{2}$/.test(value)) return fail("Enter a two-letter country code, like PH or US.");
  } else if (kind === "path") {
    value = raw.startsWith("/") ? raw : `/${raw}`;
    if (value.length > 200 || /\s/.test(value)) return fail("Enter a path like /wp-login, with no spaces.");
    if (action === "block" && (value === "/" || PROTECTED_PATHS.some((p) => p.toLowerCase().startsWith(value.toLowerCase()) || value.toLowerCase().startsWith(p.toLowerCase())))) {
      return fail(value === "/" ? "Blocking every path would close the Hub. Use Lockdown instead." : "Sign-in and the firewall console can’t be blocked.");
    }
  } else {
    if (raw.length < 3 || raw.length > 120) return fail("Enter 3 to 120 characters of the user agent.");
  }
  if (action === "block") {
    const h = await headers();
    const you = await whoIsAsking();
    if (matches({ id: "", kind, value, action }, { ip: you.ip, country: you.country, path: "/admin/command-control/firewall", agent: h.get("user-agent") ?? "" })) {
      return fail("This rule would block you too. Narrow it, or add an allow rule for your address first.");
    }
  }
  const expires = typeof input.expires === "string" && input.expires in EXPIRY ? EXPIRY[input.expires] : null;
  const name = (typeof input.name === "string" && input.name.trim() ? input.name.trim() : `${ACTION_LABEL[action]} ${KIND_LABEL[kind].toLowerCase()} ${value}`).slice(0, 80);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 300) || null : null;
  const { data, error } = await adminDb()
    .from("firewall_rules")
    .insert({ name, kind, value, action, note, expires_at: expires ? new Date(Date.now() + expires).toISOString() : null, created_by: viewer.name })
    .select("id")
    .single();
  if (error || !data) return fail("Couldn’t save the rule. Try again.");
  await audit(viewer, "firewall.rule.add", { type: "Firewall rule", id: data.id, label: name }, `${ACTION_LABEL[action]} ${KIND_LABEL[kind]} ${value}${expires ? `, for ${input.expires}` : ""}.`, [], "Security");
  return done(viewer, `Rule added. It applies within 15 seconds.`, view);
}

export async function setFirewallRule(id: unknown, enabled: unknown, view?: Partial<FirewallView>): Promise<DeskResult> {
  const viewer = await who("edit");
  if (!isViewer(viewer)) return viewer;
  if (typeof id !== "string" || typeof enabled !== "boolean") return fail("Pick a rule.");
  const { data, error } = await adminDb().from("firewall_rules").update({ enabled }).eq("id", id).select("name").single();
  if (error || !data) return fail("Couldn’t change the rule. Try again.");
  await audit(viewer, enabled ? "firewall.rule.enable" : "firewall.rule.disable", { type: "Firewall rule", id, label: data.name }, enabled ? "Switched on." : "Switched off.", [], "Security");
  return done(viewer, enabled ? `${data.name} is on.` : `${data.name} is off.`, view);
}

export async function deleteFirewallRule(id: unknown, view?: Partial<FirewallView>): Promise<DeskResult> {
  const viewer = await who("edit");
  if (!isViewer(viewer)) return viewer;
  if (typeof id !== "string") return fail("Pick a rule.");
  const { data, error } = await adminDb().from("firewall_rules").delete().eq("id", id).select("name").single();
  if (error || !data) return fail("Couldn’t delete the rule. Try again.");
  await audit(viewer, "firewall.rule.delete", { type: "Firewall rule", id, label: data.name }, "Deleted.", [], "Security");
  return done(viewer, `${data.name} deleted.`, view);
}

const MODE_LABEL: Record<FirewallMode, string> = { off: "Off", log: "Monitor", on: "Enforce" };

export async function saveFirewallSettings(
  input: { mode?: unknown; lockdown?: unknown; rateLimit?: unknown; blockScanners?: unknown; retentionDays?: unknown; devEnabled?: unknown },
  view?: Partial<FirewallView>
): Promise<DeskResult> {
  const sensitive = input.mode !== undefined || input.lockdown !== undefined || input.devEnabled !== undefined;
  const viewer = await who(sensitive ? "manage" : "edit");
  if (!isViewer(viewer)) return viewer;
  const before = await readSettings();
  const patch: Record<string, unknown> = {};
  const said: string[] = [];
  if (input.mode !== undefined) {
    if (input.mode !== "off" && input.mode !== "log" && input.mode !== "on") return fail("Pick a mode.");
    patch.mode = input.mode;
    said.push(`Mode ${MODE_LABEL[before.mode]} → ${MODE_LABEL[input.mode]}`);
  }
  if (input.lockdown !== undefined) {
    if (typeof input.lockdown !== "boolean") return fail("Pick on or off.");
    patch.lockdown = input.lockdown;
    said.push(input.lockdown ? "Lockdown on" : "Lockdown off");
  }
  if (input.rateLimit !== undefined) {
    const n = Number(input.rateLimit);
    if (!Number.isInteger(n) || (n !== 0 && (n < 60 || n > 100_000))) return fail("Set the rate limit from 60 to 100,000 a minute, or 0 for none.");
    patch.rate_limit = n;
    said.push(`Rate limit ${n || "off"}`);
  }
  if (input.blockScanners !== undefined) {
    if (typeof input.blockScanners !== "boolean") return fail("Pick on or off.");
    patch.block_scanners = input.blockScanners;
    said.push(input.blockScanners ? "Scanner blocking on" : "Scanner blocking off");
  }
  if (input.retentionDays !== undefined) {
    const n = Number(input.retentionDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) return fail("Keep records for 1 to 365 days.");
    patch.retention_days = n;
    said.push(`Keep ${n} days`);
  }
  if (input.devEnabled !== undefined) {
    if (typeof input.devEnabled !== "boolean") return fail("Pick on or off.");
    patch.dev_enabled = input.devEnabled;
    said.push(input.devEnabled ? "Development servers on" : "Development servers off");
  }
  if (!said.length) return fail("Nothing to change.");
  const { error } = await adminDb().from("firewall_settings").update({ ...patch, updated_at: new Date().toISOString(), updated_by: viewer.name }).eq("id", 1);
  if (error) return fail("Couldn’t save the settings. Try again.");
  await audit(viewer, "firewall.settings", { type: "Policy", id: "firewall", label: "Firewall settings" }, `${said.join(", ")}.`, [], "Security");
  return done(viewer, "Firewall settings saved. They apply within 15 seconds.", view);
}
