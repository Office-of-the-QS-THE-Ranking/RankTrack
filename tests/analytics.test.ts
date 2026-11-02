import { describe, expect, it } from "vitest";
import { evaluate, formulaProblem, refsOf } from "@/lib/analytics/expr";
import { bandHit, rubricTotal, standing } from "@/lib/analytics/rules";
import { computeEdition, academicYears } from "@/lib/analytics/engine";
import { readPack, nextEdition, packProblem } from "@/lib/analytics/pack";
import { cleanUrl, isFolderLink, urlsIn } from "@/lib/analytics/links";
import { serialDate } from "@/lib/analytics/tabular/xlsx";
import { readDocx, readXlsx } from "@/lib/analytics/tabular/node";
import { readCsv } from "@/lib/analytics/tabular/text";
import { applyProfile, detectProfile, type Profile } from "@/lib/analytics/templates";
import { readTheWorkbook, isTheWorkbook } from "@/lib/analytics/importers/the-workbook";
import { readRegister, yearOf } from "@/lib/analytics/importers/register";
import { readBenchmarks } from "@/lib/analytics/importers/benchmarks";
import { readEvidenceDoc, readWuriCase, codeFromFileName } from "@/lib/analytics/importers/documents";
import { dueActions, unitStandings } from "@/lib/analytics/units";
import { gapMatrix } from "@/lib/analytics/gap";
import { positioningBrief, summarize, movement } from "@/lib/analytics/brief";
import type { Campaign, Catalog, Facts, LinkRow, MethodologyPack, ValueRow, Value } from "@/lib/analytics/types";
import { greenmetric2026 } from "../scripts/analytics/greenmetric-2026";
import { wuri2026 } from "../scripts/analytics/wuri-2026";
import { PROFILES, ALIASES } from "../scripts/analytics/profiles";
import { bands } from "../scripts/analytics/shared";
import { docx, xlsx } from "./zip";

const NOW = "2026-11-01T08:00:00.000Z";

const catalogOf = (p: MethodologyPack): Catalog => ({
  edition: { ...p.edition, status: p.edition.status ?? "Active", updatedBy: "system", updatedAt: NOW },
  groups: p.groups,
  indicators: p.indicators,
});

const emptyFacts = (): Facts => ({ values: [], links: [], activities: [], benchmarks: [], peers: [], cases: [], reviews: [], evidence: [], templates: {} });

let seq = 0;
const value = (edition: string, code: string, v: Value, status: ValueRow["status"] = "For review", unit = ""): ValueRow => ({
  id: `v${++seq}`,
  edition,
  code,
  unit,
  value: v,
  note: "",
  source: "manual",
  status,
  by: "acc-1",
  at: NOW,
});

const link = (edition: string, code: string, extra: Partial<LinkRow> = {}): LinkRow => ({
  id: `l${++seq}`,
  edition,
  code,
  unit: "",
  url: "https://www.ust.edu.ph/simbahayan/report.pdf",
  label: "Report",
  by: "acc-1",
  at: NOW,
  ...extra,
});

describe("formulas", () => {
  it("reads the methodologies' notation and computes", () => {
    const v: Record<string, number> = { "1.5": 235614.94, "1.6": 60000 };
    expect(evaluate("({1.5} − {1.6}) / {1.5} × 100", (c) => v[c])).toBeCloseTo(74.53, 2);
    expect(evaluate("({1.5} - {1.6}) / {1.5} * 100", (c) => v[c])).toBeCloseTo(74.53, 2);
    expect(evaluate("max({1.5}, {1.6}) / 1000", (c) => v[c])).toBeCloseTo(235.61, 2);
    expect(refsOf("({5.1} + {5.2} + {5.3}) / ({1.11} + {1.13})")).toEqual(["5.1", "5.2", "5.3", "1.11", "1.13"]);
  });

  it("returns nothing rather than a misleading number", () => {
    expect(evaluate("{a} / {b}", (c) => ({ a: 4, b: 0 })[c])).toBeNull();
    expect(evaluate("{a} + {b}", (c) => ({ a: 4 })[c as "a"])).toBeNull();
    expect(formulaProblem("({1.5} - ")).toMatch(/ends too soon/);
    expect(formulaProblem("eval({1.5})")).toMatch(/not a function/);
    expect(formulaProblem("{1.5} * 100")).toBeNull();
  });
});

describe("bands", () => {
  const si1 = bands("≤1:.05 | >1-80:.25 | >80-90:.5 | >90-95:.75 | >95:1", "%");
  const ec4 = bands("≥2400:.05 | >1500-2400:.25 | >600-1500:.5 | ≥250-600:.75 | <250:1", "kWh");

  it("places values as the guideline's Appendix 1 does", () => {
    expect(bandHit(si1, 0.5, 200)?.share).toBe(0.05);
    expect(bandHit(si1, 80, 200)?.share).toBe(0.25);
    expect(bandHit(si1, 80.01, 200)?.share).toBe(0.5);
    expect(bandHit(si1, 99, 200)?.share).toBe(1);
    expect(bandHit(ec4, 2400, 200)?.share).toBe(0.05);
    expect(bandHit(ec4, 695.4, 200)?.share).toBe(0.5);
    expect(bandHit(ec4, 600, 200)?.share).toBe(0.75);
    expect(bandHit(ec4, 249, 200)?.share).toBe(1);
  });

  it("says what the next band asks, in the right direction", () => {
    const next = bandHit(ec4, 695.4, 200)!.next!;
    expect(next.direction).toBe("lower");
    expect(next.target).toBe(600);
    expect(next.gain).toBe(50);
    expect(bandHit(si1, 50, 200)!.next).toMatchObject({ direction: "raise", gain: 50 });
  });
});

describe("UI GreenMetric 2026, with UST's own figures", () => {
  const pack = greenmetric2026();
  const catalog = catalogOf(pack);

  it("adds up to the guideline's 10,000 points", () => {
    expect(pack.indicators).toHaveLength(118);
    const scored = pack.indicators.filter((i) => i.score);
    expect(scored).toHaveLength(60);
    expect(scored.reduce((s, i) => s + i.score!.points, 0)).toBe(10000);
    for (const g of pack.groups) expect(scored.filter((i) => i.group === g.code).reduce((s, i) => s + i.score!.points, 0)).toBe(g.points);
    expect(packProblem(JSON.parse(JSON.stringify(pack)))).toBeNull();
  });

  it("scores the figures in the Office's evidence files", () => {
    const e = catalog.edition.id;
    const facts = emptyFacts();
    facts.values = [
      value(e, "1.5", { num: 235614.94 }, "Validated"),
      value(e, "1.6", { num: 60000 }, "Validated"),
      value(e, "1.11", { num: 45000 }, "Validated"),
      value(e, "1.13", { num: 4000 }, "Validated"),
      value(e, "2.6", { num: 34072366.92 }),
      value(e, "7.15", { num: 201 }, "Validated"),
      value(e, "7.16", { num: 84 }, "Validated"),
      value(e, "1.15", { choice: "o4" }, "Validated"),
    ];
    const r = computeEdition({ catalog, facts });
    // GD8: 84 of 201 leaders are women, 41.8%, in the > 35 – 50% band: 0.75 × 100.
    expect(r.indicators["7.17"].computed).toBeCloseTo(41.79, 2);
    expect(r.indicators["7.17"].points).toMatchObject({ claimed: 75, secured: 75, open: 0, lost: 25 });
    // EC4: 34,072,366.92 kWh over 49,000 people is 695 kWh each: 0.5 × 200, claimed but not yet validated.
    expect(r.indicators["2.7"].computed).toBeCloseTo(695.35, 1);
    expect(r.indicators["2.7"].points).toMatchObject({ claimed: 100, secured: 0 });
    expect(r.indicators["2.7"].state).toBe("For review");
    // SI5 picked "partially available": 0.75 × 100.
    expect(r.indicators["1.15"].points?.claimed).toBe(75);
    // Nothing for EC1 yet: all of it is open, none lost.
    expect(r.indicators["2.1"].points).toMatchObject({ claimed: 0, open: 200, lost: 0 });
    const ec = r.groups.find((g) => g.code === "EC")!;
    expect(ec.points?.claimed).toBe(100);
    expect(r.total.kind).toBe("sum");
    expect(r.total.max).toBe(10000);
    // The fix list leads with what is worth most.
    expect(r.fixes[0].gain).toBeGreaterThanOrEqual(r.fixes[r.fixes.length - 1].gain);
    expect(r.fixes.find((f) => f.code === "2.7" && f.kind === "band")?.gain).toBe(50);
  });

  it("flags impossible percentages and units that don't match", () => {
    const e = catalog.edition.id;
    const facts = emptyFacts();
    facts.values = [value(e, "3.5", { num: 10 }), value(e, "3.7", { num: 14 }), { ...value(e, "2.6", { num: 34072366.92 }), note: "The total electricity usage in 2025 was 34,072,366.92 kilowatts." }];
    const r = computeEdition({ catalog, facts });
    expect(r.issues.some((i) => i.code === "3.8" && i.kind === "range")).toBe(true);
    expect(r.issues.some((i) => i.code === "2.6" && i.kind === "unit")).toBe(true);
  });

  it("checks year on year", () => {
    const e = catalog.edition.id;
    const facts = emptyFacts();
    facts.values = [value(e, "2.6", { num: 70_000_000 })];
    const r = computeEdition({ catalog, facts, previous: { label: "UI GreenMetric 2025", values: [value("greenmetric-2025", "2.6", { num: 34_000_000 })] } });
    expect(r.issues.find((i) => i.kind === "change")?.text).toMatch(/\+106% since UI GreenMetric 2025/);
  });

  it("suggests values from the activity register and template uploads", () => {
    const facts = emptyFacts();
    facts.templates = { "student-count": { students: 44210, online: 812 } };
    facts.activities = [
      { id: "a1", unitLabel: "AB", kind: "Community development", year: "2024-2025", title: "Tagpi-Tagpi", proponent: "", community: "", reported: true, sdgs: [], partner: "", tags: [], source: "import", by: "x", at: NOW },
      { id: "a2", unitLabel: "AB", kind: "Service learning", year: "2025-2026", title: "GenZyntax", proponent: "", community: "", reported: true, sdgs: [], partner: "", tags: [], source: "import", by: "x", at: NOW },
      { id: "a3", unitLabel: "AB", kind: "Service learning", year: "2019-2020", title: "Old", proponent: "", community: "", reported: true, sdgs: [], partner: "", tags: [], source: "import", by: "x", at: NOW },
    ];
    const r = computeEdition({ catalog, facts });
    expect(r.indicators["1.11"].suggested).toEqual([{ value: 44210, from: "Registrar student count" }]);
    // GreenMetric asks per year: the latest academic year in the window, not every year it touches.
    expect(r.indicators["6.15"].suggested[0]).toEqual({ value: 1, from: "Activity register: community development and service learning (2025–2026)" });
    expect(academicYears([2025])).toEqual(["2024-2025", "2025-2026"]);
  });
});

/** A small THE-style edition: SDG 17 and three others, with evidence questions, a ratio and a research metric. */
function thePack(): MethodologyPack {
  const claim = (code: string, group: string, points: number, picks?: Record<string, number>, sum = false) => ({
    code,
    group,
    name: `Question ${code}`,
    input: picks ? { type: "picks", options: Object.keys(picks).map((k) => ({ key: k, label: k })) } : { type: "yesno" },
    score: { kind: "claim", points, existence: picks ? { shares: picks, ...(sum && { sum: true, cap: 1 }) } : { yes: 1 }, evidence: 1, public: 1 },
    evidence: { required: true, public: true },
    ownerLabels: ["Every unit"],
  });
  return readPack({
    pack: 1,
    edition: { id: "the-impact-2027", ranking: "the-impact", year: 2027, label: "THE Impact 2027", scale: 100, aggregate: "the-impact", options: { mandatory: "SDG17", mandatoryWeight: 0.22, best: 3, bestWeight: 0.26 }, years: [2025] },
    groups: ["SDG1", "SDG3", "SDG4", "SDG11", "SDG17"].map((code) => ({ code, name: code, points: 100 })),
    indicators: [
      claim("1.3.3", "SDG1", 50, { free: 1, subsidised: 0.25 }),
      { code: "1.2.1.a", group: "SDG1", name: "Number of students", input: { type: "number" }, rollup: "sum" },
      { code: "1.2.1.b", group: "SDG1", name: "Number of low income students receiving financial aid", input: { type: "number" }, rollup: "sum" },
      { code: "1.2.1", group: "SDG1", name: "Low income students receiving financial aid", score: { kind: "ratio", points: 50, expr: "{1.2.1.b} / {1.2.1.a} * 100" } },
      claim("3.3.2", "SDG3", 100, { local: 0.5, disadvantaged: 0.25, refugee: 0.25 }, true),
      claim("4.3.1", "SDG4", 100),
      claim("11.2.1", "SDG11", 100),
      claim("17.2.1", "SDG17", 73),
      { code: "17.1.1", group: "SDG17", name: "Co-authored output", input: { type: "result" }, score: { kind: "external", points: 27 } },
    ],
  });
}

describe("THE Impact scoring", () => {
  const pack = thePack();
  const catalog = catalogOf(pack);
  const e = pack.edition.id;

  it("scores existence, evidence and its being public, one point each", () => {
    const facts = emptyFacts();
    facts.values = [value(e, "1.3.3", { picks: ["free"], yes: true })];
    facts.links = [link(e, "1.3.3", { public: true, relevance: "specific" })];
    expect(computeEdition({ catalog, facts }).indicators["1.3.3"].points?.claimed).toBe(50);
    facts.links = [link(e, "1.3.3", { public: false, url: "https://drive.google.com/file/d/1bKi1I237zqc9paO6a0c6jaYQ9YliQDQw/view" })];
    const r = computeEdition({ catalog, facts });
    // Existence and evidence, but not public: two of three points.
    expect(r.indicators["1.3.3"].points?.claimed).toBeCloseTo(33.33, 2);
    expect(r.fixes.find((f) => f.code === "1.3.3" && f.kind === "public")?.gain).toBeCloseTo(16.67, 2);
    // Unanswered questions are open as a whole, not a list of evidence fixes.
    expect(r.fixes.filter((f) => f.code === "3.3.2").map((f) => f.kind)).toEqual(["missing"]);
    expect(r.issues.some((i) => i.kind === "private")).toBe(true);
    // Subsidised only: a quarter of the existence point.
    facts.values = [value(e, "1.3.3", { picks: ["subsidised"], yes: true })];
    facts.links = [link(e, "1.3.3", { public: true })];
    expect(computeEdition({ catalog, facts }).indicators["1.3.3"].points?.claimed).toBeCloseTo((50 * 2.25) / 3, 5);
  });

  it("adds up components when the methodology says they add up", () => {
    const facts = emptyFacts();
    facts.values = [value(e, "3.3.2", { picks: ["local", "refugee"], yes: true })];
    facts.links = [link(e, "3.3.2", { public: true })];
    expect(computeEdition({ catalog, facts }).indicators["3.3.2"].points?.claimed).toBeCloseTo((100 * 2.75) / 3, 5);
  });

  it("keeps secured to what the Office validated and assessed", () => {
    const facts = emptyFacts();
    facts.values = [value(e, "4.3.1", { yes: true }, "Validated")];
    facts.links = [link(e, "4.3.1", { public: true })];
    let r = computeEdition({ catalog, facts }).indicators["4.3.1"];
    expect(r.points?.claimed).toBe(100);
    expect(r.points?.secured).toBeCloseTo(100 / 3, 6);
    facts.links = [link(e, "4.3.1", { public: true, relevance: "general", assessedBy: "acc-1", assessedAt: NOW })];
    r = computeEdition({ catalog, facts }).indicators["4.3.1"];
    expect(r.points?.secured).toBeCloseTo((100 * 2.5) / 3, 5);
    expect(r.points?.claimed).toBeCloseTo((100 * 2.5) / 3, 5);
  });

  it("sums units' figures, computes the ratio, and projects it only from peers", () => {
    const facts = emptyFacts();
    facts.values = [value(e, "1.2.1.a", { num: 20000 }, "For review", "a12"), value(e, "1.2.1.a", { num: 458 }, "For review", "c01"), value(e, "1.2.1.b", { num: 5326 }, "For review", "a11")];
    let r = computeEdition({ catalog, facts }).indicators["1.2.1"];
    expect(r.computed).toBeCloseTo((5326 / 20458) * 100, 6);
    expect(r.points).toMatchObject({ claimed: 0, open: 50 });
    facts.benchmarks = [10, 20, 30, 40].map((v, i) => ({ id: `b${i}`, ranking: "the-impact", year: 2026, peer: `p${i}`, metric: "1.2.1", value: v, source: "manual", by: "x", at: NOW }));
    r = computeEdition({ catalog, facts }).indicators["1.2.1"];
    // 26% sits above two of four peers: half the points, as an estimate.
    expect(r.points?.claimed).toBeCloseTo(25, 5);
    expect(standing(26.03, [10, 20, 30, 40])).toBeCloseTo(0.5, 5);
  });

  it("counts SDG 17 at 22% and the three strongest others at 26%", () => {
    const facts = emptyFacts();
    for (const code of ["1.3.3", "3.3.2", "4.3.1", "11.2.1", "17.2.1"]) {
      facts.values.push(value(e, code, code === "1.3.3" ? { picks: ["free"], yes: true } : code === "3.3.2" ? { picks: ["local"], yes: true } : { yes: true }));
      facts.links.push(link(e, code, { public: true }));
    }
    const r = computeEdition({ catalog, facts });
    // SDG17: 73 of 100 (the research metric isn't recorded); SDG4 and SDG11 100; SDG3 2.5 of 3 points; SDG1 50.
    expect(r.total.counted).toEqual(["SDG17", "SDG4", "SDG11", "SDG3"]);
    expect(r.total.claimed).toBeCloseTo(73 * 0.22 + (100 + 100 + 250 / 3) * 0.26, 1);
    expect(r.total.open).toBeGreaterThan(0);
    expect(r.total.note).toBeUndefined();
  });

  it("says when the overall rating can't be reached yet", () => {
    const r = computeEdition({ catalog, facts: emptyFacts() });
    expect(r.total.note).toMatch(/SDG 17 and 3 other goals/);
    expect(r.total.claimed).toBe(0);
  });
});

describe("WURI cases", () => {
  const pack = wuri2026();
  const catalog = catalogOf(pack);

  it("scores each category by its best reviewed case on the Office's rubric", () => {
    const rule = pack.indicators[0].score!;
    if (rule.kind !== "rubric") throw new Error("rubric expected");
    expect(rule.criteria.reduce((s, c) => s + c.max, 0)).toBe(100);
    const t = rubricTotal(rule, { originality: 12, novelty: 8, efficiency: 14, scalability: 9, scope: 18, intensity: 99 });
    expect(t.scores.intensity).toBe(20);
    expect(t.total).toBe(81);
    const facts = emptyFacts();
    facts.cases = [
      { id: "c1", edition: "wuri-2026", category: "C6", title: "Basic Caregiving Training", abstract: "", source: "import", checks: [], by: "x", at: NOW },
      { id: "c2", edition: "wuri-2026", category: "C6", title: "Flexicoaching", abstract: "", source: "import", checks: [], by: "x", at: NOW },
    ];
    facts.reviews = [
      { id: "r1", caseId: "c1", reviewer: "a", scores: {}, total: 60, note: "", at: NOW },
      { id: "r2", caseId: "c1", reviewer: "b", scores: {}, total: 70, note: "", at: NOW },
      { id: "r3", caseId: "c2", reviewer: "a", scores: {}, total: 81, note: "", at: NOW },
    ];
    const r = computeEdition({ catalog, facts });
    expect(r.indicators.C6.points?.claimed).toBe(81);
    expect(r.indicators.C6.state).toBe("Validated");
    expect(r.total).toMatchObject({ kind: "best-per-group", claimed: 81, counted: ["C6"] });
  });
});

describe("methodology packs", () => {
  it("refuses formulas that read indicators the pack doesn't have", () => {
    expect(
      packProblem({
        pack: 1,
        edition: { id: "x-2026", ranking: "x", year: 2026, label: "X", aggregate: "sum" },
        groups: [{ code: "A", name: "A" }],
        indicators: [{ code: "1", group: "A", name: "One", score: { kind: "bands", points: 10, expr: "{2} * 100", bands: [{ label: "low", share: 0, max: 1 }, { label: "high", share: 1, min: 1 }] } }],
      }),
    ).toMatch(/reads \{2\}/);
    expect(packProblem({ pack: 1, edition: { id: "Bad Id", ranking: "x", year: 2026, label: "X", aggregate: "sum" }, groups: [], indicators: [] })).toMatch(/edition id/);
    expect(packProblem({ pack: 2 })).toMatch(/version 1/);
  });

  it("moves an edition to another year as a draft", () => {
    const next = nextEdition(greenmetric2026(), 2027);
    expect(next.edition).toMatchObject({ id: "greenmetric-2027", year: 2027, label: "UI GreenMetric 2027", status: "Draft", opensOn: "2027-02-01", years: [2026, 2027] });
  });
});

describe("evidence links", () => {
  it("recognises folders and cleans addresses", () => {
    expect(isFolderLink("https://drive.google.com/drive/folders/1oOTilLzz8w5iwRuj1z8YFZZaWYNcyUWA?usp=drive_link")).toBe(true);
    expect(isFolderLink("https://drive.google.com/drive/u/2/folders/1lvNCSAQEKtU89ycHO5X9ZbyrMZ6mkmp6")).toBe(true);
    expect(isFolderLink("https://drive.google.com/file/d/1bKi1I237zqc9paO6a0c6jaYQ9YliQDQw/view?usp=drive_link")).toBe(false);
    expect(cleanUrl("www.ust.edu.ph/community-development/")).toBe("https://www.ust.edu.ph/community-development/");
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("https://user:pass@example.com")).toBeNull();
    expect(urlsIn("NO Pistang Handog https://drive.google.com/file/d/abc/view, and https://www.ust.edu.ph/x.")).toEqual(["https://drive.google.com/file/d/abc/view", "https://www.ust.edu.ph/x"]);
  });
});

describe("reading files in memory", () => {
  it("reads an Excel workbook: strings, numbers and dates", () => {
    const book = xlsx({ "List": [["Office Email", "Units"], ["fmo@ust.edu.ph", "Facilities Management Office"], ["Total", 2.5], ["Hired", { date: 45444 }]] });
    const [sheet] = readXlsx(book);
    expect(sheet.name).toBe("List");
    expect(sheet.rows[1]).toEqual(["fmo@ust.edu.ph", "Facilities Management Office"]);
    expect(sheet.rows[2][1]).toBe(2.5);
    expect(sheet.rows[3][1]).toBe("2024-06-01");
    expect(serialDate(45444)).toBe("2024-06-01");
  });

  it("reads CSV and Word documents", () => {
    expect(readCsv('Institution,Year,Overall\n"Ateneo de Manila University",2026,55.2\n')[0].rows).toEqual([["Institution", "Year", "Overall"], ["Ateneo de Manila University", 2026, 55.2]]);
    expect(readDocx(docx(["[1.5] Total Campus Area (meter2)", "Description:", "Total area: 235,614.94  m2"]))).toBe("[1.5] Total Campus Area (meter2)\nDescription:\nTotal area: 235,614.94 m2");
  });
});

describe("template uploads", () => {
  const profiles = PROFILES as Profile[];
  const rows = (n: number, college: string, gender: string) =>
    Array.from({ length: n }, (_, i) => ["2024-2025", "1ST", college, "PROGRAM", 2022, `${college}-${gender}-${i}`, "DELA CRUZ", "JUAN", "C", "", 21, i % 4 ? "FACE-TO-FACE" : "ONLINE", gender]);
  const header = ["SY", "TERM", "COLLEGE", "PROGRAM", "ENTRY_YEAR", "STUD_NUMBER", "SURNAME", "FIRST_NAME", "MIDDLE_NAME", "OTHER_NAME", "LOAD (UNITS)", "CLASS_TYPE", "GENDER"];

  it("keeps only counts, and drops breakdown cells under five", () => {
    const sheets = readXlsx(xlsx({ Sheet1: [header, ...rows(12, "AB", "F"), ...rows(8, "AB", "M"), ...rows(3, "MUSIC", "F"), ["*sample only"]] }));
    const profile = detectProfile(profiles, sheets)!;
    expect(profile.key).toBe("student-count");
    const r = applyProfile(profile, sheets);
    expect(r.totals).toMatchObject({ students: 23, female: 15, online: 6, fte: 23 });
    expect(r.skipped).toBe(1);
    const college = r.breakdowns.find((b) => b.dimension === "COLLEGE")!;
    expect(college.cells.map((c) => c.value)).toEqual(["AB"]);
    expect(college.suppressed).toBe(1);
    // Nothing that names a person leaves the module.
    expect(JSON.stringify(r)).not.toMatch(/DELA CRUZ|JUAN|AB-F-0/);
  });

  it("never reads a disability register's assessments", () => {
    const sheets = readXlsx(xlsx({ Sheet1: [["ID_NO", "COLL_DEPT", "PROGRAM", "ASSESSMENT", "Tagging"], ...Array.from({ length: 6 }, (_, i) => [`2021${i}`, "PHARMACY", "PHARMACY", "t/c tendinitis", i < 5 ? "Student" : "Employee"])] }));
    const r = applyProfile(profiles.find((p) => p.key === "disability")!, sheets);
    expect(r.totals).toEqual({ students: 5, employees: 1 });
    expect(JSON.stringify(r)).not.toMatch(/tendinitis/);
  });

  it("reads label-and-figure templates", () => {
    const sheets = readXlsx(xlsx({ Sheet1: [["Water consumption", "Data"], ["Volume of water used in the university: Inbound (treated/  extracted water)", 412000], ["Campus population", 49000]] }));
    expect(applyProfile(profiles.find((p) => p.key === "fmo-figures")!, sheets).totals).toEqual({ water: 412000, population: 49000 });
  });
});

describe("unit workbooks", () => {
  it("reads a THE data-collection workbook into values and links", () => {
    const pack = thePack();
    const sheets = [
      {
        name: "SDG1 ",
        rows: [
          ["SDG1: No Poverty"],
          ["Type", "Metric and indicator reference", "Metric / Indicator", "Value  (for continuous data)", "Yes/No", "Evidence1", "Public (Yes/No)", "Evidence2", "Public (Yes/No)"],
          ["Indicator", "1.2.1", "Low income students receiving financial aid"],
          [null, null, "Number of students", 20458],
          [null, null, "Number of low income students receiving financial aid", 5326],
          ["Indicator", "1.3.3", "Low-income student support", null, "YES"],
          [null, null, "free", null, "yes", "https://drive.google.com/file/d/1bKi/view?usp=drive_link", "NO Pistang Handog: Pagpapaunlad ng Kabuhayan", "https://www.ust.edu.ph/community-development/", "Yes UST SIMBAHAYAN Mission and Vision"],
          [null, null, "subsidised"],
          ["Indicator", "9.9.9", "Not in this edition", null, "YES"],
        ],
      },
      { name: "SDG2", rows: [] },
      { name: "SDG3", rows: [] },
    ];
    expect(isTheWorkbook(sheets)).toBe(true);
    const r = readTheWorkbook(sheets, pack.indicators);
    expect(r.values).toEqual(
      expect.arrayContaining([
        { code: "1.2.1.a", value: { num: 20458 }, note: "" },
        { code: "1.2.1.b", value: { num: 5326 }, note: "" },
        { code: "1.3.3", value: { yes: true, picks: ["free"] }, note: "" },
      ]),
    );
    expect(r.links).toEqual([
      { code: "1.3.3", url: "https://drive.google.com/file/d/1bKi/view?usp=drive_link", label: "Pistang Handog: Pagpapaunlad ng Kabuhayan", public: false },
      { code: "1.3.3", url: "https://www.ust.edu.ph/community-development/", label: "UST SIMBAHAYAN Mission and Vision", public: true },
    ]);
    expect(r.unplaced).toEqual(["SDG1  9.9.9: not in this edition"]);
  });

  it("reads an activity register and matches units by alias", () => {
    const sheets = [
      { name: "Service Learning 2025-2026", rows: [["Academic Unit", "Proponent", "Project Title", "Target Community", "Project Proposal", "Terminal Report"], ["AB", "3rd year - English Language Studies", "GenZyntax English Proficiency 101", "Macario B. Asistio Sr. High School", "SL [AB - 103251] GenZyntax", "TR_GenZyntax.pdf"], ["XYZ", "Someone", "Mystery", "", "", ""]] },
      { name: "Target Community 2025-2026", rows: [[null, "Community Target", "MOU Link"], [1, "Barangay Sibulan, Nagcarlan, Laguna", "https://drive.google.com/file/d/1rDr/view"], [2, "LGU Navotas", "No MOU"]] },
    ];
    const r = readRegister(sheets, ALIASES);
    expect(r.activities[0]).toMatchObject({ unit: "arts-letters", kind: "Service learning", year: "2025-2026", reported: true, proposalRef: "SL [AB - 103251] GenZyntax" });
    expect(r.unknownUnits).toEqual(["XYZ"]);
    expect(r.partners).toEqual([{ name: "Barangay Sibulan, Nagcarlan, Laguna", mou: "https://drive.google.com/file/d/1rDr/view" }, { name: "LGU Navotas" }]);
    expect(yearOf("Ad2425")).toBe("2024-2025");
  });

  it("reads peer tables in long and wide form", () => {
    const wide = readBenchmarks([{ name: "S", rows: [["Institution", "Country", "Band", "Year", "Overall", "Academic Reputation"], ["University of Santo Tomas", "Philippines", "", 2026, 48.1, 37.4], ["Chulalongkorn University", "Thailand", "ASEAN", 2026, 61.2, 58.0]] }], 2026);
    expect(wide.rows).toHaveLength(4);
    expect(wide.rows[0]).toMatchObject({ own: true, band: "Philippines", metric: "overall", value: 48.1 });
    expect(wide.rows[3]).toMatchObject({ institution: "Chulalongkorn University", band: "ASEAN", metric: "academic-reputation", value: 58 });
    const long = readBenchmarks([{ name: "S", rows: [["Institution", "Year", "Metric", "Value", "Rank"], ["Ateneo de Manila University", 2026, "EC4", 512, ""], ["De La Salle University", 2026, "overall", "", "601-650"]] }], 2026);
    expect(long.rows.map((r) => [r.metric, r.value, r.label])).toEqual([["EC4", 512, undefined], ["overall", undefined, "601-650"]]);
  });
});

describe("case and evidence documents", () => {
  it("reads a WURI case and what it left blank", () => {
    const text = [
      "TEMPLATE OF UNIVERSITY’S INNOVATIVE PROGRAM",
      "Writer of this template",
      "Full name",
      "(Enter your last name first, in capital letters. For example: DOE, John.)",
      "Relationship",
      "Program name",
      "UST College of Nursing’s Basic Caregiving Training for Community Empowerment",
      "Category",
      "C7",
      "Champion (Program's physical leader)",
      "Full name",
      "(Enter the champion’s last name first.)",
      "Official title",
      "Abstract of Program",
      "The UST Basic Caregiving Training Program is a flagship community engagement initiative.",
      "Details of Program",
    ].join("\n");
    const c = readWuriCase(text, ["C6", "C7"]);
    expect(c).toMatchObject({ title: "UST College of Nursing’s Basic Caregiving Training for Community Empowerment", category: "C7" });
    expect(c.checks.filter((x) => !x.ok).map((x) => x.label)).toEqual(["Writer named", "Champion named", "Champion’s email given"]);
  });

  it("reads a GreenMetric evidence file's indicator and figures", () => {
    expect(codeFromFileName("University_Country_1_5_Total_main_campus_area.docx")).toBe("1.5");
    const d = readEvidenceDoc("Template for Evidence(s)\nUI GreenMetric Questionnaire\n[1.5] Total Campus Area (meter2)\nDescription:\nTotal area: 235,614.94 m2\nAdditional evidence link", "University_Country_1_5_Total_main_campus_area.docx");
    expect(d.code).toBe("1.5");
    expect(d.figures[0]).toMatchObject({ value: 235614.94 });
  });
});

describe("requests, gaps and the brief", () => {
  const campaign: Campaign = {
    id: "c1",
    code: "REQ-001",
    edition: "the-impact-2027",
    title: "THE Impact 2027",
    memo: "UST: S052-00-ME02",
    message: "",
    due: "2026-10-26",
    status: "Open",
    remindDays: 7,
    escalateDays: 3,
    by: "acc-1",
    at: "2026-10-07T01:00:00.000Z",
    units: [
      { unit: "fmo", codes: ["1.3.3", "4.3.1"], reminders: 0 },
      { unit: "a12", codes: ["4.3.1"], reminders: 1, remindedAt: "2026-10-20T01:00:00.000Z" },
    ],
  };

  it("reminds every week, then tells the Office once a unit is past due", () => {
    const facts = emptyFacts();
    facts.values = [value("the-impact-2027", "4.3.1", { yes: true }, "For review", "fmo")];
    const s = unitStandings(campaign, facts, null, "2026-10-15");
    expect(s.find((x) => x.unit === "fmo")).toMatchObject({ requested: 2, submitted: 1 });
    expect(dueActions(campaign, s, new Date("2026-10-15T00:00:00Z"))).toEqual([{ unit: "fmo", action: "remind" }, { unit: "a12", action: "remind" }].filter((a) => a.unit === "fmo"));
    expect(dueActions(campaign, s, new Date("2026-10-30T00:00:00Z"))).toEqual([{ unit: "fmo", action: "escalate" }, { unit: "a12", action: "escalate" }]);
  });

  it("measures the gap to each peer band and writes the brief", () => {
    const pack = thePack();
    const catalog = catalogOf(pack);
    const benchmarks = [
      { id: "1", ranking: "the-impact", year: 2026, peer: "", metric: "overall", value: 60, source: "manual" as const, by: "x", at: NOW },
      { id: "2", ranking: "the-impact", year: 2026, peer: "admu", metric: "overall", value: 70, source: "manual" as const, by: "x", at: NOW },
      { id: "3", ranking: "the-impact", year: 2026, peer: "dlsu", metric: "overall", value: 80, source: "manual" as const, by: "x", at: NOW },
      { id: "4", ranking: "the-impact", year: 2026, peer: "nus", metric: "overall", value: 90, source: "manual" as const, by: "x", at: NOW },
    ];
    const band = new Map([["admu", "Philippines"], ["dlsu", "Philippines"], ["nus", "Aspirational"]] as const);
    const gap = gapMatrix("the-impact", benchmarks, band, catalog);
    expect(gap[0]).toMatchObject({ metric: "overall", own: 60, medians: { Philippines: { value: 75, n: 2 }, Aspirational: { value: 90, n: 1 } }, gaps: { Philippines: -20, Aspirational: -33.3 } });
    const report = computeEdition({ catalog, facts: emptyFacts() });
    const brief = positioningBrief({ title: "THE Impact positioning brief", catalog, report, benchmarks, peerBand: band, unitName: (u) => u, standings: [], actions: [], snapshot: null, campaignsDue: [{ title: "THE Impact 2027", due: "2026-10-26" }], today: "2026-11-01" });
    expect(brief).toMatch(/## Peer benchmark\n- Overall: 60 \(-20% vs Philippines median; -33.3% vs Aspirational median\)/);
    expect(brief).toMatch(/THE Impact 2027: due 2026-10-26/);
    const now = summarize(report);
    expect(movement(catalog, now, { ...now, readiness: now.readiness - 5 })[1]).toMatchObject({ key: "readiness", delta: 5 });
  });
});
