import { describe, expect, it } from "vitest";
import { inRange, normalizeRange, parseIp, parseRange } from "@/lib/firewall/ip";
import { decide, matches, scannerReason, type Facts } from "@/lib/firewall/rules";
import type { FirewallConfig } from "@/lib/firewall/types";

describe("firewall addresses", () => {
  it("parses IPv4, IPv6 and IPv4-mapped addresses", () => {
    expect(parseIp("203.0.113.7")?.v).toBe(4);
    expect(parseIp("2001:db8::1")?.v).toBe(6);
    expect(parseIp("::ffff:203.0.113.7")).toEqual(parseIp("203.0.113.7"));
    expect(parseIp("[2001:db8::1]")?.v).toBe(6);
    for (const bad of ["", "256.1.1.1", "1.2.3", "2001:db8:::1", "abc", "1:2:3:4:5:6:7:8:9"]) expect(parseIp(bad)).toBeNull();
  });
  it("matches CIDR ranges", () => {
    const v4 = parseRange("203.0.113.0/24")!;
    expect(inRange(parseIp("203.0.113.200")!, v4)).toBe(true);
    expect(inRange(parseIp("203.0.114.1")!, v4)).toBe(false);
    const v6 = parseRange("2001:db8::/32")!;
    expect(inRange(parseIp("2001:db8:ffff::1")!, v6)).toBe(true);
    expect(inRange(parseIp("2001:db9::1")!, v6)).toBe(false);
    expect(inRange(parseIp("203.0.113.1")!, v6)).toBe(false);
  });
  it("writes ranges canonically", () => {
    expect(normalizeRange("203.0.113.77/24")).toBe("203.0.113.0/24");
    expect(normalizeRange(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(normalizeRange("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe("2001:db8::1");
    expect(normalizeRange("10.0.0.0/33")).toBeNull();
  });
});

const base: Facts = { ip: "198.51.100.4", country: "PH", path: "/rankings", agent: "Mozilla/5.0", session: false, perMinute: 1 };
const cfg = (over: Partial<FirewallConfig["settings"]> = {}, rules: FirewallConfig["rules"] = []): FirewallConfig => ({
  settings: { mode: "on", lockdown: false, rateLimit: 600, blockScanners: true, devEnabled: false, ...over },
  rules,
});

describe("firewall decisions", () => {
  it("lets ordinary requests through", () => {
    expect(decide(cfg(), base)).toMatchObject({ action: "allow", respond: null });
  });
  it("blocks scanners and probes", () => {
    expect(scannerReason("/.env", "Mozilla")).toMatch(/Probe/);
    expect(scannerReason("/wp-login.php", "Mozilla")).toMatch(/Probe/);
    expect(scannerReason("/", "sqlmap/1.7")).toBe("Scanner: sqlmap");
    expect(scannerReason("/", "")).toBe("No user agent");
    expect(scannerReason("/.well-known/security.txt", "Mozilla")).toBeNull();
    expect(decide(cfg(), { ...base, path: "/.git/config" })).toMatchObject({ action: "block", respond: 403 });
    expect(decide(cfg({ blockScanners: false }), { ...base, path: "/.git/config" }).action).toBe("allow");
  });
  it("applies rules by address, country, path and agent", () => {
    const rule = (kind: "ip" | "country" | "path" | "agent", value: string) => ({ id: "r", kind, value, action: "block" as const });
    expect(matches(rule("ip", "198.51.100.0/24"), base)).toBe(true);
    expect(matches(rule("country", "ph"), base)).toBe(true);
    expect(matches(rule("country", "US"), base)).toBe(false);
    expect(matches(rule("country", "PH"), { ...base, country: null })).toBe(false);
    expect(matches(rule("path", "/RANK"), base)).toBe(true);
    expect(matches(rule("agent", "mozilla"), base)).toBe(true);
    expect(decide(cfg({}, [rule("ip", "198.51.100.4")]), base)).toMatchObject({ action: "block", ruleId: "r", respond: 403 });
  });
  it("lets an allow rule win over everything", () => {
    const rules = [{ id: "a", kind: "ip" as const, value: "198.51.100.4", action: "allow" as const }, { id: "b", kind: "country" as const, value: "PH", action: "block" as const }];
    expect(decide(cfg({ lockdown: true, rateLimit: 60 }, rules), { ...base, perMinute: 999, path: "/.env" })).toMatchObject({ action: "allow", ruleId: "a" });
  });
  it("rate-limits and locks down", () => {
    expect(decide(cfg({ rateLimit: 60 }), { ...base, perMinute: 61 })).toMatchObject({ action: "rate_limit", respond: 429 });
    expect(decide(cfg({ rateLimit: 0 }), { ...base, perMinute: 99999 }).action).toBe("allow");
    expect(decide(cfg({ lockdown: true }), base)).toMatchObject({ action: "lockdown", respond: 503 });
    expect(decide(cfg({ lockdown: true }), { ...base, session: true }).action).toBe("allow");
    expect(decide(cfg({ lockdown: true }), { ...base, path: "/signin" }).action).toBe("allow");
    expect(decide(cfg({ lockdown: true }), { ...base, path: "/api/cron/deadlines" }).action).toBe("allow");
  });
  it("only flags while monitoring", () => {
    const d = decide(cfg({ mode: "log" }), { ...base, path: "/.env" });
    expect(d).toMatchObject({ action: "log", respond: null });
    expect(d.reason).toMatch(/^Would block/);
  });
});
