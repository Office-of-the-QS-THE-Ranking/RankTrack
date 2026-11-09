import { describe, expect, it } from "vitest";
import { NAV, isOverviewTab, navPages, publicPathFor, rankingOverviewTabs } from "@/components/shell/nav";

const office = () => NAV.office.flatMap((g) => g.items);

describe("each office tab has one job", () => {
  it("has no Analytics tab: its pages live under Rankings", () => {
    expect(office().map((i) => i.label)).not.toContain("Analytics");
    expect(navPages("office").some((p) => p.href.includes("/analytics"))).toBe(false);
  });

  it("guards every overview tab, each with its own permission", () => {
    const guarded = navPages("office");
    for (const tab of rankingOverviewTabs("/admin/rankings")) {
      expect(guarded.find((p) => p.href === tab.href)?.need).toEqual(tab.need);
    }
    expect(guarded.find((p) => p.href === "/admin/rankings/imports")?.need).toEqual(["rankings", "manage"]);
    expect(guarded.find((p) => p.href === "/admin/rankings/data-requests")?.need).toEqual(["rankings", "view"]);
  });

  it("keeps the Rankings overview guarded, since scoring data lives on it", () => {
    expect(navPages("office").find((p) => p.href === "/admin/rankings")?.need).toEqual(["rankings", "view"]);
  });

  it("offers the overview's tabs to the Office only", () => {
    expect(NAV.public.flatMap((g) => g.items).some((i) => i.overviewTabs)).toBe(false);
    expect(NAV.unit.flatMap((g) => g.items).some((i) => i.overviewTabs)).toBe(false);
  });

  it("orders the overview's tabs, and keeps Data imports for those who manage", () => {
    expect(rankingOverviewTabs("/admin/rankings").map((t) => t.label)).toEqual(["Scorecard", "Positions", "Data requests", "Activities", "Benchmarks", "Data imports"]);
    expect(rankingOverviewTabs("/admin/rankings").filter((t) => t.need[1] === "manage").map((t) => t.label)).toEqual(["Data imports"]);
  });

  it("tells an overview tab from a ranking's own page", () => {
    expect(isOverviewTab("/admin/rankings", "/admin/rankings")).toBe(true);
    expect(isOverviewTab("/admin/rankings", "/admin/rankings/benchmarks")).toBe(true);
    expect(isOverviewTab("/admin/rankings", "/admin/rankings/the-wur")).toBe(false);
  });
});

describe("public view switch", () => {
  it("sends an overview tab to the public Rankings page, which has no such page of its own", () => {
    for (const tab of rankingOverviewTabs("/admin/rankings")) expect(publicPathFor(tab.href)).toBe("/rankings");
  });

  it("keeps a reader on the same ranking", () => {
    expect(publicPathFor("/admin/rankings/the-wur")).toBe("/rankings/the-wur");
    expect(publicPathFor("/admin/rankings")).toBe("/rankings");
  });
});
