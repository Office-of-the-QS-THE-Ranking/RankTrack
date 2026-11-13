/*
 * The firewall as the proxy runs it (src/proxy.ts), on any host. Settings and rules come from Supabase through
 * firewall_config and are held in memory for 15 seconds, refreshed in the background, so checking a request costs no
 * round trip. Each request is recorded after the response is sent (NextFetchEvent.waitUntil), and an instance purges
 * records past their retention at most once an hour. If Supabase can't be reached the firewall fails open: pages keep
 * working, and nothing is recorded until it can be.
 *
 * HUB_FIREWALL=off turns it off entirely (the way back in if a rule ever locks the Office out; it is also off under
 * tests). Development servers run it only when the Office switches on Settings › Run on development servers (or with
 * HUB_FIREWALL_DEV=1), since their visits land in the shared log.
 */
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clientAddress, clientPlace } from "./ip";
import { decide, type Decision } from "./rules";
import type { FirewallConfig } from "./types";

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
const FRESH_MS = 15_000;
const PURGE_MS = 3_600_000;
/** The Firewall page's own polling, and Next.js internals (live reload in development): recording them would only drown the log. */
const QUIET = /^\/(?:api\/firewall(?:\/|$)|_next\/)/;
const SESSION_COOKIES = ["__Host-hub_session", "hub_session"];

export type FirewallOff = "switched-off" | "development" | "no-database";

export const isDevServer = () => process.env.NODE_ENV === "development";

/**
 * Why the firewall isn't running on this server, or null when it is. Development servers share the production
 * database, so they run it only when Settings › Run on development servers is on (`devEnabled`), or with
 * HUB_FIREWALL_DEV=1 set for that one server.
 */
export function firewallOff(devEnabled: boolean): FirewallOff | null {
  if (process.env.HUB_FIREWALL === "off" || process.env.VITEST) return "switched-off";
  if (!SUPABASE || !KEY) return "no-database";
  if (isDevServer() && process.env.HUB_FIREWALL_DEV !== "1" && !devEnabled) return "development";
  return null;
}

async function rpc(name: string, body: unknown, timeout = 2500) {
  return fetch(`${SUPABASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
}

/* ---------- Settings and rules, held briefly ---------- */

type Cached = { at: number; cfg: FirewallConfig | null };
const g = globalThis as typeof globalThis & { __hubFirewall?: { cache: Cached | null; loading: Promise<void> | null; purged: number; hits: Map<string, { start: number; n: number }> } };
const state = (g.__hubFirewall ??= { cache: null, loading: null, purged: 0, hits: new Map() });

async function load() {
  try {
    const res = await rpc("firewall_config", {}, 1500);
    if (!res.ok) throw new Error(`firewall_config ${res.status}`);
    const raw = (await res.json()) as { settings: { mode: FirewallConfig["settings"]["mode"]; lockdown: boolean; rate_limit: number; block_scanners: boolean; dev_enabled?: boolean }; rules: FirewallConfig["rules"] };
    state.cache = {
      at: Date.now(),
      cfg: { settings: { mode: raw.settings.mode, lockdown: raw.settings.lockdown, rateLimit: raw.settings.rate_limit, blockScanners: raw.settings.block_scanners, devEnabled: !!raw.settings.dev_enabled }, rules: raw.rules ?? [] },
    };
  } catch (e) {
    console.error(`Firewall: couldn't load the rules (${e instanceof Error ? e.message : e}). Requests go through unchecked.`);
    // Keep what we had; try again after the usual interval.
    state.cache = { at: Date.now(), cfg: state.cache?.cfg ?? null };
  } finally {
    state.loading = null;
  }
}

async function config(event: NextFetchEvent): Promise<FirewallConfig | null> {
  if (!state.cache) {
    await (state.loading ??= load());
    return (state.cache as Cached | null)?.cfg ?? null;
  }
  if (Date.now() - state.cache.at > FRESH_MS && !state.loading) event.waitUntil((state.loading = load()));
  return state.cache.cfg;
}

/** Forget the held rules, so the next request reads them afresh (after the Office changes them on this instance). */
export function forgetFirewallConfig() {
  if (state.cache) state.cache.at = 0;
}

/* ---------- Requests per address per minute (this instance) ---------- */

function count(ip: string) {
  const now = Date.now();
  const minute = now - (now % 60_000);
  const hit = state.hits.get(ip);
  if (!hit || hit.start !== minute) {
    if (state.hits.size > 20_000) for (const [k, v] of state.hits) if (v.start !== minute) state.hits.delete(k);
    state.hits.set(ip, { start: minute, n: 1 });
    return 1;
  }
  return ++hit.n;
}

/* ---------- Responses ---------- */

function page(status: 403 | 429 | 503, ref: string) {
  const text =
    status === 503
      ? { title: "Signed-in access only", body: "The Hub is open only to signed-in people for now.", link: `<a href="/signin">Sign in</a>` }
      : status === 429
        ? { title: "Too many requests", body: "This address sent too many requests. Wait a minute and try again.", link: "" }
        : { title: "Access blocked", body: "The Hub's firewall blocked this request. If you think this is a mistake, contact the Office of QS/THE Rankings with the reference below.", link: "" };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${text.title}</title><style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f5f5f7;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}main{max-width:420px;padding:32px 24px;text-align:center}b{display:block;margin-bottom:8px;font-size:24px;letter-spacing:-.02em}p{margin:0 0 16px;color:#a1a1a6}code{font:13px ui-monospace,Menlo,monospace;color:#86868b}a{color:#f2b705}</style></head><body><main><b>${text.title}</b><p>${text.body}</p>${text.link ? `<p>${text.link}</p>` : ""}<code>Ref ${ref}</code></main></body></html>`;
  const res = new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  if (status === 429) res.headers.set("Retry-After", "60");
  return res;
}

/* ---------- The check ---------- */

/** Check a request: a response to send instead of the page, or null to carry on. Records the request either way. */
export async function firewall(request: NextRequest, event: NextFetchEvent): Promise<NextResponse | null> {
  // Everything but the development switch, which lives with the rules.
  if (firewallOff(true)) return null;
  const { pathname } = request.nextUrl;
  if (QUIET.test(pathname)) return null;
  const cfg = await config(event);
  if (!cfg || firewallOff(cfg.settings.devEnabled) || cfg.settings.mode === "off") return null;

  const get = (name: string) => request.headers.get(name);
  const { address: ip } = clientAddress(get);
  const { country, city } = clientPlace(get);
  const agent = get("user-agent") ?? "";
  const session = SESSION_COOKIES.some((name) => request.cookies.has(name));
  const decision: Decision = decide(cfg, { ip, country, path: pathname, agent, session, perMinute: count(ip) });

  const ref = crypto.randomUUID().slice(0, 8).toUpperCase();
  let referrer: string | null = null;
  try {
    const r = get("referer");
    referrer = r ? new URL(r).host || null : null;
  } catch {
    referrer = null;
  }
  const row = {
    at: new Date().toISOString(),
    ip,
    country,
    city,
    method: request.method,
    host: request.nextUrl.host,
    path: pathname,
    agent: agent || null,
    referrer,
    session,
    action: decision.action,
    rule_id: decision.ruleId,
    reason: decision.respond ? `${decision.reason} · ${ref}` : decision.reason,
  };
  event.waitUntil(
    rpc("firewall_log", { p_rows: [row] })
      .then((res) => {
        if (!res.ok) console.error(`Firewall: couldn't record a request (${res.status}).`);
      })
      .catch(() => console.error("Firewall: couldn't record a request."))
  );
  if (Date.now() - state.purged > PURGE_MS) {
    state.purged = Date.now();
    event.waitUntil(rpc("firewall_purge", {}).catch(() => undefined));
  }
  return decision.respond ? page(decision.respond, ref) : null;
}
