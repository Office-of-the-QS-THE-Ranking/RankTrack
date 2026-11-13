import "server-only";

/* What the Firewall page reads: the summary for a range, the latest matching requests, the rules and the settings. */
import { headers } from "next/headers";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import { firewallOff, isDevServer } from "./guard";
import { CLIENT_IP_HEADER, GEO_COUNTRY_HEADER, clientAddress, clientPlace } from "./ip";
import { DENIED, RANGES, type FirewallDesk, type FirewallRange, type FirewallRequest, type FirewallRule, type FirewallSettings, type FirewallSummary, type FirewallView, type RequestFilter, type TopRow } from "./types";

const EMPTY: FirewallSummary = { total: 0, denied: 0, flagged: 0, ips: 0, countries: 0, sessions: 0, series: [], topIps: [], topPaths: [], topCountries: [], topAgents: [], reasons: [] };

export function readView(input: Partial<Record<keyof FirewallView, unknown>> | undefined): FirewallView {
  const range = typeof input?.range === "string" && input.range in RANGES ? (input.range as FirewallRange) : "24h";
  const filter: RequestFilter = (["all", "allowed", "denied", "flagged"] as const).find((f) => f === input?.filter) ?? "all";
  const q = typeof input?.q === "string" ? input.q.trim().slice(0, 80) : "";
  return { range, filter, q };
}

type SummaryJson = Omit<FirewallSummary, "topIps" | "topPaths" | "topCountries" | "topAgents"> & { top_ips: TopRow[]; top_paths: TopRow[]; top_countries: TopRow[]; top_agents: TopRow[] };

async function summary(from: string, stepMs: number): Promise<FirewallSummary> {
  const { data, error } = await adminDb().rpc("firewall_summary", { p_from: from, p_step: `${stepMs / 1000} seconds` });
  if (error || !data) {
    if (error) console.error(`Firewall summary: ${error.message}`);
    return EMPTY;
  }
  const s = data as unknown as SummaryJson;
  const num = (v: unknown) => Number(v) || 0;
  const rows = (list: TopRow[] | undefined) => (list ?? []).map((r) => ({ ...r, n: num(r.n), denied: num(r.denied) }));
  return {
    total: num(s.total),
    denied: num(s.denied),
    flagged: num(s.flagged),
    ips: num(s.ips),
    countries: num(s.countries),
    sessions: num(s.sessions),
    series: (s.series ?? []).map((p) => ({ t: p.t, allowed: num(p.allowed), denied: num(p.denied), flagged: num(p.flagged) })),
    topIps: rows(s.top_ips),
    topPaths: rows(s.top_paths),
    topCountries: rows(s.top_countries),
    topAgents: rows(s.top_agents),
    reasons: (s.reasons ?? []).map((r) => ({ ...r, n: num(r.n) })),
  };
}

async function requests(view: FirewallView, from: string): Promise<FirewallRequest[]> {
  let query = adminDb().from("firewall_requests").select("*").gte("at", from).order("at", { ascending: false }).limit(200);
  if (view.filter === "denied") query = query.in("action", DENIED);
  else if (view.filter === "flagged") query = query.eq("action", "log");
  else if (view.filter === "allowed") query = query.eq("action", "allow");
  if (view.q) {
    // Commas and parentheses would break the filter syntax; nothing worth searching contains them.
    const q = view.q.replace(/[,()*%\\]/g, " ").trim();
    if (q) query = query.or(`ip.ilike.${q}%,path.ilike.%${q}%,country.ilike.${q},agent.ilike.%${q}%,reason.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) {
    console.error(`Firewall requests: ${error.message}`);
    return [];
  }
  return data.map((r) => ({
    id: r.id,
    at: r.at,
    ip: r.ip,
    country: r.country,
    city: r.city,
    method: r.method,
    host: r.host,
    path: r.path,
    agent: r.agent,
    referrer: r.referrer,
    session: r.session,
    action: r.action as FirewallRequest["action"],
    ruleId: r.rule_id,
    reason: r.reason,
  }));
}

export async function readRules(): Promise<FirewallRule[]> {
  const { data, error } = await adminDb().from("firewall_rules").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(`Firewall rules: ${error.message}`);
    return [];
  }
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as FirewallRule["kind"],
    value: r.value,
    action: r.action as FirewallRule["action"],
    enabled: r.enabled,
    expiresAt: r.expires_at,
    note: r.note,
    hits: Number(r.hits) || 0,
    lastHitAt: r.last_hit_at,
    createdAt: r.created_at,
    createdBy: r.created_by,
  }));
}

export async function readSettings(): Promise<FirewallSettings> {
  const { data } = await adminDb().from("firewall_settings").select("*").eq("id", 1).maybeSingle();
  return {
    mode: (data?.mode as FirewallSettings["mode"]) ?? "log",
    lockdown: data?.lockdown ?? false,
    rateLimit: data?.rate_limit ?? 600,
    blockScanners: data?.block_scanners ?? true,
    retentionDays: data?.retention_days ?? 30,
    devEnabled: data?.dev_enabled ?? false,
    updatedAt: data?.updated_at ?? new Date(0).toISOString(),
    updatedBy: data?.updated_by ?? null,
  };
}

/** The person making this request, as the firewall sees them. */
export async function whoIsAsking() {
  const h = await headers();
  const get = (name: string) => h.get(name);
  return { ip: clientAddress(get).address, country: clientPlace(get).country };
}

export async function firewallDesk(viewer: Viewer, input?: Partial<FirewallView>): Promise<FirewallDesk> {
  const view = readView(input);
  const now = Date.now();
  const { ms, step } = RANGES[view.range];
  // Start on a step boundary, so the chart's bars line up with whole hours or days (in UTC).
  const from = new Date(Math.floor((now - ms) / step) * step + step).toISOString();
  const [s, reqs, rules, settings, you] = await Promise.all([summary(from, step), requests(view, from), readRules(), readSettings(), whoIsAsking()]);
  return {
    view,
    from,
    step,
    now: new Date(now).toISOString(),
    summary: s,
    requests: reqs,
    rules,
    settings,
    you,
    source: { ipHeader: CLIENT_IP_HEADER || null, geo: !!GEO_COUNTRY_HEADER, off: firewallOff(settings.devEnabled), dev: isDevServer() },
    canEdit: viewerCan(viewer, "security", "edit"),
    canManage: viewerCan(viewer, "security", "manage"),
  };
}
