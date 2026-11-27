/*
 * Firewall › Analytics' collector: every page sends its page view here (components/ui/WebAnalytics.tsx), and custom events
 * come through track() (lib/web-analytics/track.ts). It always answers 204 at once and records after the response,
 * so a page never waits on it. Nothing is recorded while page analytics is off, from bots, or on a development server
 * unless the Office counts them. Named "pulse" rather than "analytics" so content blockers leave it alone.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { clientAddress, clientPlace } from "@/lib/firewall/ip";
import { areaOf, cleanEvent, cleanPath, isBot, parseAgent, referrerHost, routeOf, utmOf } from "@/lib/web-analytics/classify";
import { analyticsOff, heldSettings, purgeDue, visitorId } from "@/lib/web-analytics/server";
import { adminDb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const agent = request.headers.get("user-agent") ?? "";
  if (isBot(agent)) return done();
  // A page on another site can't post page views here.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return done();

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 4096) return done();
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return done();
  }
  const path = cleanPath(typeof body.p === "string" ? body.p : "");
  if (!path) return done();
  const kind = body.t === "event" ? "event" : "pageview";
  const event = kind === "event" ? cleanEvent(body.n, body.d) : null;
  if (kind === "event" && !event) return done();

  const settings = await heldSettings();
  if (!settings?.enabled || analyticsOff(settings.devEnabled)) return done();

  const get = (name: string) => request.headers.get(name);
  const host = request.nextUrl.host;
  const ip = clientAddress(get).address;
  const { country } = clientPlace(get);
  const { device, browser, os } = parseAgent(agent, body.w, body.tp);
  const row = {
    at: new Date().toISOString(),
    kind,
    name: event?.name ?? null,
    visitor: visitorId(ip, agent, host),
    area: areaOf(path),
    host: host.slice(0, 120),
    path,
    route: routeOf(path),
    referrer: kind === "pageview" ? referrerHost(body.r, host) : null,
    ...(kind === "pageview" ? utmOf(body.s) : { utm_source: null, utm_medium: null, utm_campaign: null }),
    country,
    device,
    browser,
    os,
    props: event?.props ?? null,
  };
  after(async () => {
    const db = adminDb();
    const { error } = await db.rpc("web_analytics_record", { p_rows: [row] });
    if (error) console.error(`Web analytics: couldn't record a ${kind} (${error.message}).`);
    if (purgeDue()) await db.rpc("web_analytics_purge");
  });
  return done();
}
