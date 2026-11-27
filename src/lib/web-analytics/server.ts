import "server-only";

/* What Firewall › Analytics reads, and the settings /api/pulse holds briefly in memory. */
import { createHmac } from "node:crypto";
import { GEO_COUNTRY_HEADER } from "@/lib/firewall/ip";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import { RANGES, type WaAreaFilter, type WaDesk, type WaEvent, type WaPoint, type WaRange, type WaRow, type WaSettings, type WaSummary, type WaView } from "./types";

const EMPTY: WaSummary = {
  visitors: 0,
  pageviews: 0,
  bounced: 0,
  prevVisitors: 0,
  prevPageviews: 0,
  prevBounced: 0,
  online: 0,
  series: [],
  pages: [],
  routes: [],
  hosts: [],
  referrers: [],
  direct: 0,
  utm: [],
  countries: [],
  devices: [],
  browsers: [],
  os: [],
  events: [],
};
/** Manila is UTC+8 all year: day steps start at Manila midnight. */
const MANILA_MS = 8 * 3_600_000;

export const isDevServer = () => process.env.NODE_ENV === "development";

/** Why this server records nothing, or null when it records. */
export function analyticsOff(devEnabled: boolean): WaDesk["source"]["off"] {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return "no-database";
  if (isDevServer() && process.env.HUB_ANALYTICS_DEV !== "1" && !devEnabled) return "development";
  return null;
}

export function readView(input: Partial<Record<keyof WaView, unknown>> | undefined): WaView {
  const range = typeof input?.range === "string" && input.range in RANGES ? (input.range as WaRange) : "7d";
  const area = (["all", "site", "portal", "form", "signin"] as const).find((a) => a === input?.area) ?? "all";
  return { range, area };
}

export async function readSettings(): Promise<WaSettings> {
  const { data } = await adminDb().from("web_analytics_settings").select("*").eq("id", 1).maybeSingle();
  return {
    enabled: data?.enabled ?? false,
    retentionDays: data?.retention_days ?? 180,
    devEnabled: data?.dev_enabled ?? false,
    updatedAt: data?.updated_at ?? new Date(0).toISOString(),
    updatedBy: data?.updated_by ?? null,
  };
}

/* ---------- Held briefly for /api/pulse ---------- */

const g = globalThis as typeof globalThis & { __hubAnalytics?: { at: number; settings: WaSettings | null; purged: number } };
const held = (g.__hubAnalytics ??= { at: 0, settings: null, purged: 0 });

/** The settings, read at most every 30 seconds per server. */
export async function heldSettings(): Promise<WaSettings | null> {
  if (held.settings && Date.now() - held.at < 30_000) return held.settings;
  try {
    held.settings = await readSettings();
  } catch {
    /* Keep what we had. */
  }
  held.at = Date.now();
  return held.settings;
}

export function forgetAnalyticsSettings() {
  held.at = 0;
}

/** Whether this server should purge old records now (at most once an hour). */
export function purgeDue() {
  if (Date.now() - held.purged < 3_600_000) return false;
  held.purged = Date.now();
  return true;
}

/**
 * A visitor: the address and browser hashed with a salt that changes every day (UTC) and never leaves the server. The
 * same person counts once a day; tomorrow's hash can't be linked to today's.
 */
export function visitorId(ip: string, agent: string, host: string) {
  const secret = process.env.SUPABASE_SECRET_KEY ?? "hub";
  const day = new Date().toISOString().slice(0, 10);
  const salt = createHmac("sha256", secret).update(`web-analytics:${day}`).digest();
  return createHmac("sha256", salt).update(`${ip}|${agent}|${host}`).digest("base64url").slice(0, 22);
}

/* ---------- The page's data ---------- */

type SummaryJson = Record<string, unknown> & { series?: WaPoint[] };

async function summary(from: string, prevFrom: string, stepMs: number, area: WaAreaFilter): Promise<WaSummary> {
  const { data, error } = await adminDb().rpc("web_analytics_summary", { p_from: from, p_prev_from: prevFrom, p_step: `${stepMs / 1000} seconds`, p_area: area === "all" ? undefined : area });
  if (error || !data) {
    if (error) console.error(`Web analytics summary: ${error.message}`);
    return EMPTY;
  }
  const s = data as unknown as SummaryJson;
  const num = (v: unknown) => Number(v) || 0;
  const rows = (v: unknown): WaRow[] => ((v as WaRow[] | undefined) ?? []).map((r) => ({ key: r.key ?? "", visitors: num(r.visitors), n: num(r.n), ...(r.last ? { last: r.last } : {}) }));
  return {
    visitors: num(s.visitors),
    pageviews: num(s.pageviews),
    bounced: num(s.bounced),
    prevVisitors: num(s.prev_visitors),
    prevPageviews: num(s.prev_pageviews),
    prevBounced: num(s.prev_bounced),
    online: num(s.online),
    series: (s.series ?? []).map((p) => ({ t: p.t, visitors: num(p.visitors), pageviews: num(p.pageviews), arrived: num(p.arrived), bounced: num(p.bounced) })),
    pages: rows(s.pages),
    routes: rows(s.routes),
    hosts: rows(s.hosts),
    referrers: rows(s.referrers),
    direct: num(s.direct),
    utm: rows(s.utm),
    countries: rows(s.countries),
    devices: rows(s.devices),
    browsers: rows(s.browsers),
    os: rows(s.os),
    events: rows(s.events),
  };
}

async function recent(from: string, area: WaAreaFilter): Promise<WaEvent[]> {
  const { data, error } = await adminDb().rpc("web_analytics_recent_events", { p_from: from, p_area: area === "all" ? undefined : area, p_limit: 100 });
  if (error || !data) {
    if (error) console.error(`Web analytics events: ${error.message}`);
    return [];
  }
  return data as unknown as WaEvent[];
}

export async function webAnalyticsDesk(viewer: Viewer, input?: Partial<WaView>): Promise<WaDesk> {
  const view = readView(input);
  const now = Date.now();
  const { ms, step } = RANGES[view.range];
  // Start on a step boundary in Manila time, so hours and days line up with the clock on the wall.
  const from = Math.floor((now + MANILA_MS - ms) / step) * step - MANILA_MS + step;
  const prevFrom = from - (now - from);
  const fromIso = new Date(from).toISOString();
  const [settings, s, events] = await Promise.all([readSettings(), summary(fromIso, new Date(prevFrom).toISOString(), step, view.area), recent(fromIso, view.area)]);
  return {
    view,
    from: fromIso,
    step,
    now: new Date(now).toISOString(),
    summary: s,
    recent: events,
    settings,
    source: { off: analyticsOff(settings.devEnabled), geo: !!GEO_COUNTRY_HEADER },
    canEdit: viewerCan(viewer, "security", "edit"),
    canManage: viewerCan(viewer, "security", "manage"),
  };
}
