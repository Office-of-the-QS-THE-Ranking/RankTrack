/*
 * What a page view says about itself, worked out from the path, the referrer and the user agent. Pure functions, so
 * /api/pulse and the tests share them. Nothing here keeps an address or a query string beyond the UTM tags.
 */
import type { WaArea, WaDevice } from "./types";

/** Which part of the Hub a path belongs to. */
export function areaOf(path: string): WaArea {
  if (/^\/(?:admin|portal)(?:\/|$)/.test(path)) return "portal";
  if (/^\/f(?:\/|$)/.test(path)) return "form";
  if (/^\/(?:signin|auth)(?:\/|$)/.test(path)) return "signin";
  return "site";
}

/** Paths that are never recorded: the API, framework files and the screenshot previews. */
export const IGNORED = /^\/(?:api|_next|preview|media)(?:\/|$)/;

/**
 * The path as recorded. A form's link carries its secret code (/f/<code>), so only the route is kept for /f. Trailing
 * slashes and case in the path are left alone except for one trailing slash.
 */
export function cleanPath(raw: string): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  let path = raw.split(/[?#]/)[0].slice(0, 512);
  try {
    path = decodeURI(path);
  } catch {
    /* Keep it encoded. */
  }
  if (/[\s<>"]/.test(path)) return null;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (IGNORED.test(path)) return null;
  if (/^\/f\/[^/]+/.test(path)) return path.replace(/^\/f\/[^/]+/, "/f/[code]");
  return path;
}

const ID = /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|(?=[A-Za-z0-9_]*\d)(?=[A-Za-z0-9_]*[A-Za-z])[A-Za-z0-9_]{12,}|[A-Z]{2,4}-\d{3,})$/i;

/** The path with record ids and codes replaced by [id], so the pages of one kind count together. */
export function routeOf(path: string): string {
  return path
    .split("/")
    .map((seg) => (seg && seg !== "[code]" && ID.test(seg) ? "[id]" : seg))
    .join("/");
}

/** The referring site's host, or null for a direct visit or one of the Hub's own pages. */
export function referrerHost(referrer: unknown, ownHost: string | null): string | null {
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    const u = new URL(referrer);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const own = ownHost?.split(":")[0].replace(/^www\./, "").toLowerCase();
    if (!host || host === own || host === "localhost") return null;
    return host.slice(0, 200);
  } catch {
    return null;
  }
}

/** utm_source, utm_medium and utm_campaign from a query string; nothing else is kept. */
export function utmOf(search: unknown): { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null } {
  const none = { utm_source: null, utm_medium: null, utm_campaign: null };
  if (typeof search !== "string" || !search.includes("utm_")) return none;
  try {
    const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const tag = (k: string) => p.get(k)?.trim().toLowerCase().slice(0, 100) || null;
    return { utm_source: tag("utm_source"), utm_medium: tag("utm_medium"), utm_campaign: tag("utm_campaign") };
  } catch {
    return none;
  }
}

/** Crawlers, previews, monitors and headless browsers: they don't count as visitors. */
const BOT = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|embedly|preview|monitor|pingdom|uptime|lighthouse|headless|phantom|puppeteer|playwright|selenium|python|curl|wget|httpclient|okhttp|axios|node-fetch|go-http|java\//i;

export const isBot = (agent: string) => !agent.trim() || BOT.test(agent);

/** Device, browser and operating system from a user agent, in the broad strokes a dashboard needs. */
export function parseAgent(agent: string, width?: unknown, touch?: unknown): { device: WaDevice; browser: string; os: string } {
  const ua = agent || "";
  const ipad = /Macintosh/i.test(ua) && touch === true;
  const os = /Windows/i.test(ua)
    ? "Windows"
    : ipad || /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Mac OS X|Macintosh/i.test(ua)
        ? "macOS"
        : /Android/i.test(ua)
          ? "Android"
          : /CrOS/i.test(ua)
            ? "ChromeOS"
            : /Linux/i.test(ua)
              ? "Linux"
              : "Other";
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /SamsungBrowser/i.test(ua)
        ? "Samsung Internet"
        : /Firefox|FxiOS/i.test(ua)
          ? "Firefox"
          : /Chrome|CriOS|Chromium/i.test(ua)
            ? "Chrome"
            : /Safari/i.test(ua)
              ? "Safari"
              : "Other";
  const w = typeof width === "number" && Number.isFinite(width) ? width : null;
  // iPads ask for the desktop site and say they are Macs; a touch screen gives them away.
  const tablet = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || ipad;
  const mobile = !tablet && (/Mobi|iPhone|iPod|Android.*Mobile/i.test(ua) || (w !== null && w < 640));
  return { device: tablet ? "tablet" : mobile ? "mobile" : "desktop", browser, os };
}

/** A custom event's name and properties, trimmed to what the table keeps. */
export function cleanEvent(name: unknown, props: unknown): { name: string; props: Record<string, string | number | boolean> | null } | null {
  if (typeof name !== "string") return null;
  const n = name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!n) return null;
  if (!props || typeof props !== "object" || Array.isArray(props)) return { name: n, props: null };
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props).slice(0, 8)) {
    const key = k.slice(0, 40);
    if (typeof v === "string") out[key] = v.slice(0, 120);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "boolean") out[key] = v;
  }
  return { name: n, props: Object.keys(out).length ? out : null };
}
