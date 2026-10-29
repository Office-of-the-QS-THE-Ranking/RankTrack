import { describe, expect, it } from "vitest";
import { portalCatalog } from "@/lib/forms/portal-catalog";
import type { PortalForm, StudentCopy } from "@/lib/governance/hub-types";

const form = (code: string, title: string, day: string): PortalForm => ({
  id: code, code, title, createdAt: `${day}T00:00:00.000Z`, description: "Project proposal", kind: "proposal",
  issuer: "Community Development Office", prefix: "CDP", steps: 3, questions: 10,
});
const forms = [form("a", "Youth outreach", "2026-10-25"), form("b", "Barangay partnership", "2026-10-20"), form("c", "Community training", "2026-10-10")];
const copy = (code: string, day: string): StudentCopy => ({
  token: code, ref: "CDP-0001", label: "Outreach", access: "private", status: "draft", progress: 0,
  form: { code, title: "Project", kind: "proposal" }, createdAt: "2026-10-21T00:00:00.000Z", edited: { by: "Secretary", at: `${day}T00:00:00.000Z` },
});
const copies = [copy("a", "2026-10-22"), copy("b", "2026-10-24"), copy("a", "2026-10-28")];
const codes = (rows: PortalForm[]) => rows.map((f) => f.code);

describe("proposal form catalog", () => {
  it("sorts by title, creation date, or latest saved use across multiple copies", () => {
    expect(codes(portalCatalog(forms, copies, "", "all", "alphabetical"))).toEqual(["b", "c", "a"]);
    expect(codes(portalCatalog(forms, copies, "", "all", "newest"))).toEqual(["a", "b", "c"]);
    expect(codes(portalCatalog(forms, copies, "", "all", "recent"))).toEqual(["a", "b", "c"]);
    expect(codes(forms)).toEqual(["a", "b", "c"]);
  });

  it("combines search and usage filters, including no prior usage", () => {
    expect(codes(portalCatalog(forms, copies, " OUTREACH ", "used", "alphabetical"))).toEqual(["a"]);
    expect(codes(portalCatalog(forms, copies, "", "unused", "alphabetical"))).toEqual(["c"]);
    expect(portalCatalog(forms, copies, "outreach", "unused", "alphabetical")).toEqual([]);
    expect(portalCatalog(forms, [], "", "used", "recent")).toEqual([]);
  });

  it("searches issuer names and falls back to title order when nothing was used", () => {
    expect(codes(portalCatalog(forms, [], "development office", "all", "recent"))).toEqual(["b", "c", "a"]);
  });
});
