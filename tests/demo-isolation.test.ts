import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";

/*
 * The portal demo (/portal/demo) must stay sealed off from the real data layer. These checks fail the build's tests if
 * any module the demo can load reaches Supabase, R2, mail, cookies, the server's governance modules or a server
 * action; if the proxy stops gating it; or if its fixtures stop being fictional.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

/** Every file under a folder. */
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));

/** The demo's entry points: its routes, its components and its data module. */
const ENTRIES = [path.join(SRC, "app/(demo)"), path.join(SRC, "components/demo-portal"), path.join(SRC, "lib/demo-portal")].flatMap(walk).filter((f) => /\.tsx?$/.test(f));

const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const e of EXTS) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

/** Runtime imports (type-only imports are erased and load nothing), static and dynamic. */
const IMPORT = /(?:^|[\s;])(?:import|export)\s+(type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function graph(entries: string[]) {
  const via = new Map<string, string | null>(entries.map((e) => [e, null]));
  const packages = new Map<string, string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift()!;
    if (!/\.(tsx?|m?js)$/.test(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT)) {
      if (m[1]) continue;
      const spec = m[2] ?? m[3];
      const target = resolve(file, spec);
      if (target) {
        if (!via.has(target)) {
          via.set(target, file);
          queue.push(target);
        }
      } else if (!spec.startsWith(".") && !spec.startsWith("@/") && !packages.has(spec)) packages.set(spec, file);
    }
  }
  return { via, packages };
}

const rel = (f: string) => path.relative(ROOT, f);

describe("portal demo isolation", () => {
  const { via, packages } = graph(ENTRIES);
  const chain = (f: string) => {
    const out = [rel(f)];
    for (let p = via.get(f); p; p = via.get(p)) out.push(rel(p));
    return out.reverse().join(" → ");
  };

  it("finds the demo's entry points", () => {
    expect(ENTRIES.length).toBeGreaterThan(8);
    expect(via.size).toBeGreaterThan(50);
  });

  it("loads no server action, Supabase client, R2, mail, session or server module", () => {
    const banned = [
      /^src\/app\/actions\//,
      /^src\/lib\/supabase\//,
      /\/server\//, // lib/governance/server, lib/analytics/server, lib/mail/server…
      /^src\/lib\/r2\.ts$/,
      /^src\/lib\/firewall\//,
      /^src\/components\/hub\/RealRuntime\.tsx$/,
      /^src\/components\/site\/HubDocument\.tsx$/,
      /^src\/app\/\(hub\)\//,
    ];
    const hits = [...via.keys()].map(rel).filter((f) => banned.some((b) => b.test(f)));
    expect(hits.map((h) => chain(path.join(ROOT, h)))).toEqual([]);
  });

  it("uses no package that talks to Supabase, storage, mail or cookies", () => {
    const banned = /^(@supabase\/|aws4fetch|nodemailer|server-only|next\/headers|@vercel\/speed-insights|node:)/;
    const hits = [...packages].filter(([p]) => banned.test(p)).map(([p, f]) => `${p} ← ${chain(f)}`);
    expect(hits).toEqual([]);
  });

  it("holds no 'use server' module and reads no secret", () => {
    const bad = [...via.keys()].filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      return /^\s*["']use server["']/m.test(src) || /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE|R2_SECRET|R2_ACCESS_KEY|HUB_VERIFY_SECRET|CRON_SECRET/.test(src);
    });
    expect(bad.map(chain)).toEqual([]);
  });
});

describe("portal demo fixtures", () => {
  it("are fictional: every address is on .invalid and none is the University's", async () => {
    const { demoReference } = await import("@/lib/demo-portal/reference");
    const { demoState } = await import("@/lib/demo-portal/state");
    const ref = demoReference();
    const state = demoState(ref);
    const text = JSON.stringify({ ref, state });
    const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [])];
    expect(emails.length).toBeGreaterThan(5);
    expect(emails.filter((e) => !e.endsWith(".invalid"))).toEqual([]);
    expect(text).not.toMatch(/ust\.edu\.ph/i);
    expect(state.accounts.every((a) => a.email.endsWith("@demo.invalid"))).toBe(true);
  });

  it("cover every state the screens draw, and a unit with nothing yet", async () => {
    const { demoReference } = await import("@/lib/demo-portal/reference");
    const { demoState } = await import("@/lib/demo-portal/state");
    const state = demoState(demoReference());
    const ev = Object.values(state.records.evidence);
    for (const s of ["Not yet submitted", "For review", "Needs revision", "Validated"]) expect(ev.some((e) => e.status === s)).toBe(true);
    expect(ev.some((e) => e.status === "For review" && e.review?.step === 0)).toBe(true);
    expect(ev.some((e) => e.status === "For review" && (e.review?.step ?? 0) > 0)).toBe(true);
    expect(ev.some((e) => e.stage === 3)).toBe(true);
    expect(ev.some((e) => e.stage === 4)).toBe(true);
    expect(ev.some((e) => e.unitSlug === "cnm")).toBe(false);
    // What the screens list is the fixtures and nothing else (no presentation data from lib/demo.ts).
    const { evidenceList, storyList } = await import("@/lib/governance/records");
    expect(evidenceList(state).every((e) => e.id.startsWith("EV-D"))).toBe(true);
    expect(storyList(state)).toEqual([]);
  });

  it("run the Hub's own engine in memory: a reviewer approves, a coordinator submits", async () => {
    const { demoReference } = await import("@/lib/demo-portal/reference");
    const { demoState, DEMO_PEOPLE } = await import("@/lib/demo-portal/state");
    const { runDemo } = await import("@/lib/demo-portal/engine");
    const ref = demoReference();
    const s0 = demoState(ref);
    const waiting = Object.values(s0.records.evidence).find((e) => e.status === "For review" && e.review?.step === 0)!;
    const a = runDemo(s0, ref, DEMO_PEOPLE.staff, { type: "evidence.review", id: waiting.id, decision: "accept", note: "" });
    expect(a.result.ok).toBe(true);
    expect(a.state.records.evidence[waiting.id].review?.step).toBe(1);
    // The input state is never mutated.
    expect(s0.records.evidence[waiting.id].review?.step).toBe(0);
    const b = runDemo(a.state, ref, DEMO_PEOPLE.coordinator, {
      type: "evidence.submit",
      unitSlug: "cce",
      input: {
        title: "Sample submission",
        type: "Narrative and outcomes",
        academicYear: "2025–2026",
        term: "Whole year",
        summary: "A sample.",
        result: "A sample result.",
        beneficiaries: "Sample residents",
        level: 2,
        sdgs: [14],
        files: [{ name: "sample.pdf", sizeMB: 0.1, src: "/media/evidence/00000000-0000-4000-8000-000000000000.pdf" }],
        mappedTo: [],
      },
    });
    expect(b.result.ok, b.result.message).toBe(true);
    expect(Object.values(b.state.records.evidence).some((e) => e.title === "Sample submission")).toBe(true);
  });
});

describe("portal demo in the proxy", () => {
  beforeAll(() => {
    vi.stubEnv("HUB_FIREWALL", "off");
    vi.stubEnv("PORTFOLIO_ORIGINS", "https://portfolio.example, not a url, http://insecure.example");
    // Real-looking hosts, so the policy checks below prove the demo leaves them out.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.example");
    vi.stubEnv("R2_ACCOUNT_ID", "account");
    vi.stubEnv("R2_PUBLIC_URL", "https://public.r2.example");
  });
  afterAll(() => vi.unstubAllEnvs());

  const event = { waitUntil: () => undefined } as unknown as NextFetchEvent;
  async function call(url: string, init: { method?: string; headers?: Record<string, string> } = {}, enabled = true) {
    vi.stubEnv("PORTAL_DEMO_ENABLED", enabled ? "true" : "");
    vi.resetModules();
    const { proxy } = await import("@/proxy");
    return proxy(new NextRequest(`https://hub.example${url}`, init), event);
  }

  it("is a 404 while PORTAL_DEMO_ENABLED is unset", async () => {
    const res = await call("/portal/demo", {}, false);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/__portal-demo-off");
  });

  it("opens without a session when enabled, framable only by PORTFOLIO_ORIGINS", async () => {
    const res = await call("/portal/demo/office");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'self' https://portfolio.example;");
    expect(csp).not.toContain("insecure.example");
    // The browser itself refuses any connection from the demo to Supabase or R2.
    expect(csp).toMatch(/connect-src 'self';/);
    expect(csp).toMatch(/img-src 'self' data: blob:;/);
    expect(csp).toMatch(/form-action 'self';/);
    expect(csp).not.toMatch(/supabase|r2\.|cloudflarestorage|googleusercontent/);
  });

  it("keeps the real portal behind sign-in, and unframable", async () => {
    const res = await call("/portal");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/signin?next=%2Fportal");
    const page = await call("/signin");
    const csp = page.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    // The Hub's own pages keep their Supabase and R2 hosts.
    expect(csp).toContain("https://project.supabase.example");
    expect(csp).toContain("https://public.r2.example");
  });

  it("refuses real workspace routes, media and APIs asked for from a demo page, even with a session", async () => {
    const cookie = "__Host-hub_session=abc; hub_session=abc";
    for (const target of ["/portal/submit", "/admin", "/media/evidence/x.pdf", "/api/chat"]) {
      const viaReferer = await call(target, { headers: { referer: "https://hub.example/portal/demo/submit", cookie } });
      expect(viaReferer.status, target).toBe(404);
      const viaPrefetch = await call(target, { headers: { "next-url": "/portal/demo", "next-router-prefetch": "1", cookie } });
      expect(viaPrefetch.status, target).toBe(404);
    }
  });

  it("refuses server actions posted to a demo page", async () => {
    const res = await call("/portal/demo", { method: "POST", headers: { "next-action": "abc" } });
    expect(res.status).toBe(405);
  });
});
