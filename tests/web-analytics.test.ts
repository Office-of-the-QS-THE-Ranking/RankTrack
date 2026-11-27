import { describe, expect, it } from "vitest";
import { areaOf, cleanEvent, cleanPath, isBot, parseAgent, referrerHost, routeOf, utmOf } from "@/lib/web-analytics/classify";

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const SAFARI_IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("web analytics paths", () => {
  it("sorts paths into parts of the Hub", () => {
    expect(areaOf("/")).toBe("site");
    expect(areaOf("/impact")).toBe("site");
    expect(areaOf("/admin/command-control/firewall")).toBe("portal");
    expect(areaOf("/portal")).toBe("portal");
    expect(areaOf("/f/[code]")).toBe("form");
    expect(areaOf("/signin")).toBe("signin");
    expect(areaOf("/administration")).toBe("site");
  });
  it("drops query strings and never keeps a form's secret code", () => {
    expect(cleanPath("/impact?q=secret#top")).toBe("/impact");
    expect(cleanPath("/f/AbC123xyz/receipt")).toBe("/f/[code]/receipt");
    expect(cleanPath("/about/")).toBe("/about");
    expect(cleanPath("/api/firewall")).toBeNull();
    expect(cleanPath("/_next/static/x.js")).toBeNull();
    expect(cleanPath("//evil.example")).toBeNull();
    expect(cleanPath("https://evil.example/")).toBeNull();
    expect(cleanPath("/a<script>")).toBeNull();
  });
  it("groups record pages into routes", () => {
    expect(routeOf("/admin/rankings/the")).toBe("/admin/rankings/the");
    expect(routeOf("/impact/2f1c7b2e-8d4a-4f7e-9a51-0c3d2b1a9e88")).toBe("/impact/[id]");
    expect(routeOf("/posts/1234")).toBe("/posts/[id]");
    expect(routeOf("/f/[code]")).toBe("/f/[code]");
    expect(routeOf("/publications/stories-and-news")).toBe("/publications/stories-and-news");
    expect(routeOf("/news/qs-2026-world-results")).toBe("/news/qs-2026-world-results");
    expect(routeOf("/r/Xk29fLq81mZp")).toBe("/r/[id]");
  });
});

describe("web analytics sources", () => {
  it("keeps only another site's host as the referrer", () => {
    expect(referrerHost("https://www.google.com/search?q=ust", "hub.ust.edu.ph")).toBe("google.com");
    expect(referrerHost("https://hub.ust.edu.ph/about", "hub.ust.edu.ph")).toBeNull();
    expect(referrerHost("http://localhost:3000/", "localhost:3000")).toBeNull();
    expect(referrerHost("android-app://com.google.android.gm/", "hub")).toBeNull();
    expect(referrerHost("", "hub")).toBeNull();
  });
  it("reads UTM tags and nothing else", () => {
    expect(utmOf("?utm_source=Facebook&utm_medium=social&utm_campaign=QS2026&email=a@b.c")).toEqual({ utm_source: "facebook", utm_medium: "social", utm_campaign: "qs2026" });
    expect(utmOf("?q=1")).toEqual({ utm_source: null, utm_medium: null, utm_campaign: null });
  });
});

describe("web analytics agents", () => {
  it("ignores bots and tools", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/130.0")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(CHROME_MAC)).toBe(false);
    expect(isBot(SAFARI_IPHONE)).toBe(false);
  });
  it("names the device, browser and system", () => {
    expect(parseAgent(CHROME_MAC, 1440)).toEqual({ device: "desktop", browser: "Chrome", os: "macOS" });
    expect(parseAgent(SAFARI_IPHONE, 390)).toEqual({ device: "mobile", browser: "Safari", os: "iOS" });
    expect(parseAgent(EDGE_WIN, 1920)).toEqual({ device: "desktop", browser: "Edge", os: "Windows" });
    expect(parseAgent(SAFARI_IPAD_DESKTOP, 1180, true)).toEqual({ device: "tablet", browser: "Safari", os: "iOS" });
  });
  it("trims custom events", () => {
    expect(cleanEvent("  Download  ", { file: "report.pdf", n: 2, ok: true, bad: { x: 1 } })).toEqual({ name: "Download", props: { file: "report.pdf", n: 2, ok: true } });
    expect(cleanEvent("", {})).toBeNull();
    expect(cleanEvent(42, {})).toBeNull();
    expect(cleanEvent("x".repeat(80), null)?.name).toHaveLength(60);
  });
});
