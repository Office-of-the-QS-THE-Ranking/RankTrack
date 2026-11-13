import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";

/* The firewall as the proxy runs it, against a stand-in for Supabase. */
const calls: { name: string; body: unknown }[] = [];
let settings = { mode: "on", lockdown: false, rate_limit: 600, block_scanners: true, dev_enabled: false };
const rules = [{ id: "r1", kind: "ip", value: "203.0.113.0/24", action: "block" }];

beforeAll(() => {
  vi.stubEnv("VITEST", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-key");
  vi.stubEnv("HUB_CLIENT_IP_HEADER", "x-real-ip");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const name = url.split("/rpc/")[1];
    calls.push({ name, body: JSON.parse(String(init.body)) });
    if (name === "firewall_config") return new Response(JSON.stringify({ settings, rules }), { status: 200 });
    return new Response(null, { status: 204 });
  });
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function run(path: string, ip: string, agent = "Mozilla/5.0") {
  vi.resetModules();
  // The held rules live on globalThis (they survive hot reloads); start each case afresh.
  delete (globalThis as { __hubFirewall?: unknown }).__hubFirewall;
  const { firewall } = await import("@/lib/firewall/guard");
  const waits: Promise<unknown>[] = [];
  const event = { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as NextFetchEvent;
  const res = await firewall(new NextRequest(`https://hub.example${path}`, { headers: { "x-real-ip": ip, "user-agent": agent } }), event);
  await Promise.all(waits);
  const logged = calls.filter((c) => c.name === "firewall_log").at(-1)?.body as { p_rows: { action: string; ip: string; reason: string | null }[] } | undefined;
  return { res, row: logged?.p_rows[0] };
}

describe("firewall in the proxy", () => {
  it("lets ordinary requests through and records them", async () => {
    const { res, row } = await run("/rankings", "198.51.100.4");
    expect(res).toBeNull();
    expect(row).toMatchObject({ action: "allow", ip: "198.51.100.4" });
  });
  it("blocks a blocked address with a 403 page and records why", async () => {
    const { res, row } = await run("/rankings", "203.0.113.9");
    expect(res?.status).toBe(403);
    expect(await res?.text()).toContain("Access blocked");
    expect(row?.action).toBe("block");
    expect(row?.reason).toMatch(/^Block rule · [A-F0-9]{8}$/);
  });
  it("blocks probes", async () => {
    const { res } = await run("/.env", "198.51.100.4");
    expect(res?.status).toBe(403);
  });
  it("only flags while monitoring", async () => {
    settings = { ...settings, mode: "log" };
    const { res, row } = await run("/.env", "198.51.100.4");
    expect(res).toBeNull();
    expect(row?.action).toBe("log");
  });
  it("does nothing when off", async () => {
    settings = { ...settings, mode: "off" };
    calls.length = 0;
    const { res, row } = await run("/.env", "203.0.113.9");
    expect(res).toBeNull();
    expect(row).toBeUndefined();
  });
  it("stays off on a development server until Settings switches it on", async () => {
    settings = { ...settings, mode: "on", dev_enabled: false };
    vi.stubEnv("NODE_ENV", "development");
    calls.length = 0;
    let out = await run("/.env", "198.51.100.4");
    expect(out.res).toBeNull();
    expect(out.row).toBeUndefined();
    settings = { ...settings, dev_enabled: true };
    out = await run("/.env", "198.51.100.4");
    expect(out.res?.status).toBe(403);
    expect(out.row?.action).toBe("block");
    vi.stubEnv("NODE_ENV", "test");
  });
});
