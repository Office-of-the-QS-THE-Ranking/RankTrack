import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import { FRAME_DENY_SOURCE, frameAncestors, framable, portfolioOrigins } from "@/lib/framing";

/*
 * Framing (lib/framing.ts): PORTFOLIO_ORIGINS may embed the public pages and the portal demo, nothing else.
 */

const PUBLIC = ["/", "/rankings", "/rankings/the-wur", "/publications/stories", "/publications/research/a-paper", "/knowledge-base", "/recognition", "/about", "/privacy", "/terms", "/cookies", "/portal/demo", "/portal/demo/office"];
const LOCKED = ["/admin", "/admin/unit-submissions", "/portal", "/portal/submit", "/portal/demonstration", "/signin", "/api/chat", "/f/FM-0001", "/media/evidence/x.pdf", "/preview/post", "/aboutx", "/rankingsfoo"];

describe("PORTFOLIO_ORIGINS", () => {
  it("accepts https origins and http://localhost on any port, in production too", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(portfolioOrigins("https://me.example, http://localhost:4321  http://localhost https://me.example/path")).toEqual([
        "https://me.example",
        "http://localhost:4321",
        "http://localhost",
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("ignores plain http for any other host, and anything that isn't an origin", () => {
    expect(portfolioOrigins("http://me.example, http://127.0.0.1:3000, http://localhost.evil.example, ftp://localhost, javascript:alert(1), not a url")).toEqual([]);
  });
});

describe("which pages may be framed", () => {
  const origins = ["https://me.example", "http://localhost:4321"];

  it("lets the origins frame the public pages and the demo", () => {
    for (const p of PUBLIC) {
      expect(framable(p), p).toBe(true);
      expect(frameAncestors(p, origins), p).toBe("'self' https://me.example http://localhost:4321");
    }
  });

  it("keeps the workspaces, sign-in, APIs, forms and media unframable", () => {
    for (const p of LOCKED) {
      expect(framable(p), p).toBe(false);
      expect(frameAncestors(p, origins), p).toBe("'none'");
    }
  });

  it("frames no public page while PORTFOLIO_ORIGINS is unset", () => {
    expect(frameAncestors("/rankings", [])).toBe("'none'");
    expect(frameAncestors("/portal/demo", [])).toBe("'self'");
  });

  it("sends X-Frame-Options: DENY on exactly the unframable pages", async () => {
    // The matcher Next.js itself uses for next.config.ts header sources (it ships without types).
    const { pathToRegexp } = (await import("next/dist/compiled/path-to-regexp" as string)) as { pathToRegexp: (source: string) => RegExp };
    const deny = pathToRegexp(FRAME_DENY_SOURCE);
    for (const p of PUBLIC) expect(deny.test(p), p).toBe(false);
    for (const p of LOCKED) expect(deny.test(p), p).toBe(true);
  });

  it("next.config.ts uses that rule", async () => {
    const config = (await import("../next.config")).default;
    const rules = await config.headers!();
    const xfo = rules.filter((r) => r.headers.some((h) => h.key === "X-Frame-Options"));
    expect(xfo).toEqual([{ source: FRAME_DENY_SOURCE, headers: [{ key: "X-Frame-Options", value: "DENY" }] }]);
  });
});

describe("framing in the proxy", () => {
  beforeAll(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HUB_FIREWALL", "off");
    vi.stubEnv("PORTAL_DEMO_ENABLED", "true");
    vi.stubEnv("PORTFOLIO_ORIGINS", "https://me.example, http://localhost:4321, http://elsewhere.example");
  });
  afterAll(() => vi.unstubAllEnvs());

  const event = { waitUntil: () => undefined } as unknown as NextFetchEvent;
  async function ancestors(path: string) {
    vi.resetModules();
    const { proxy } = await import("@/proxy");
    const res = await proxy(new NextRequest(`https://hub.example${path}`, { headers: { cookie: "hub_session=x" } }), event);
    return /frame-ancestors ([^;]*)/.exec(res.headers.get("content-security-policy") ?? "")?.[1];
  }

  it("lets the portfolio frame public pages and the demo", async () => {
    for (const p of ["/", "/rankings/the-wur", "/about", "/terms", "/portal/demo"]) expect(await ancestors(p), p).toBe("'self' https://me.example http://localhost:4321");
  });

  it("refuses every frame on the workspaces, sign-in, forms and APIs", async () => {
    for (const p of ["/admin", "/portal", "/portal/submit", "/signin", "/f/FM-0001", "/api/chat"]) expect(await ancestors(p), p).toBe("'none'");
  });
});
