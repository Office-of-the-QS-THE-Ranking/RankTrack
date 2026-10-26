import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { BOOT_SCRIPTS } from "@/lib/boot-scripts";
import { ROLE } from "@/lib/governance/catalog";
import { checkCommand } from "@/lib/governance/command-guard";
import { evidenceMime, evidencePath } from "@/lib/governance/evidence-files";
import { proxy } from "@/proxy";

describe("command guard", () => {
  it("accepts a known command", () => {
    expect(checkCommand({ type: "notice.read" }).ok).toBe(true);
  });
  it("refuses unknown types, non-objects and non-JSON values", () => {
    expect(checkCommand({ type: "account.delete-everything" }).ok).toBe(false);
    expect(checkCommand("account.invite").ok).toBe(false);
    expect(checkCommand(null).ok).toBe(false);
    expect(checkCommand({ type: "notice.read", at: new Date() }).ok).toBe(false);
    expect(checkCommand({ type: "notice.read", n: Number.NaN }).ok).toBe(false);
    expect(checkCommand(JSON.parse('{"type":"notice.read","__proto__":{"admin":true}}')).ok).toBe(false);
  });
  it("refuses oversized commands", () => {
    expect(checkCommand({ type: "post.save", input: { body: "x".repeat(600_000) } }).ok).toBe(false);
  });
});

describe("evidence files", () => {
  it("only accepts the Hub's own upload paths", () => {
    expect(evidencePath("/media/evidence/0b8e4f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b.pdf")).toBe("evidence/0b8e4f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b.pdf");
    expect(evidencePath("/media/evidence/../posts/x.pdf")).toBeNull();
    expect(evidencePath("https://example.org/a.pdf")).toBeNull();
  });
  it("types files by extension against System Configuration", () => {
    expect(evidenceMime("report.PDF", ["PDF"])).toBe("application/pdf");
    expect(evidenceMime("photo.jpeg", ["JPG"])).toBe("image/jpeg");
    expect(evidenceMime("page.html", ["PDF", "HTML"])).toBeNull();
    expect(evidenceMime("report.pdf", ["DOCX"])).toBeNull();
  });
});

describe("sign-in gate", () => {
  it("names the same administrator role as the Hub", () => {
    const dir = path.resolve(__dirname, "../supabase/migrations");
    const latest = readdirSync(dir).filter((f) => /sign_in_gate/.test(f)).sort().at(-1)!;
    expect(readFileSync(path.join(dir, latest), "utf8")).toContain(`'${ROLE.admin}'`);
  });
});

describe("proxy", () => {
  it("allows the boot scripts by hash and sends a nonce", () => {
    const res = proxy(new NextRequest("https://hub.example/"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    for (const s of BOOT_SCRIPTS) expect(csp).toContain(`'sha256-${createHash("sha256").update(s).digest("base64")}'`);
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("frame-ancestors 'none'");
  });
  it("sends a request with no session cookie to sign-in", () => {
    const res = proxy(new NextRequest("https://hub.example/admin/reports?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://hub.example/signin?next=%2Fadmin%2Freports%3Fx%3D1");
  });
  it("lets a request with a session cookie through to the page's own checks", () => {
    const req = new NextRequest("https://hub.example/admin", { headers: { cookie: "hub_session=abc" } });
    expect(proxy(req).headers.get("location")).toBeNull();
  });
});
