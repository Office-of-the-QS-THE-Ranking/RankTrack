import { describe, expect, it } from "vitest";
import { pickerSearchScore, UNIT_ALIASES } from "@/lib/picker-search";

describe("picker suggestions", () => {
  it.each(Object.entries(UNIT_ALIASES).flatMap(([label, aliases]) => aliases.map((alias) => [label, alias])))("maps the aliases for %s: %s", (label, alias) => {
    expect(Number.isFinite(pickerSearchScore(label, alias.toUpperCase()))).toBe(true);
  });
  it("handles named Accountancy units and University prefixes", () => {
    for (const label of ["UST-Alfredo M. Velayo College of Accountancy", "UST-AMV College of Accountancy", "AMV–College of Accountancy"]) {
      expect(pickerSearchScore(label, "AMV")).toBe(1);
      expect(pickerSearchScore(label, "COA")).toBe(1);
    }
    expect(pickerSearchScore("Faculty of Arts and Letters", "UST AB")).toBe(1);
    expect(pickerSearchScore("Faculty of Arts and Letters", "A.B.")).toBe(1);
    expect(pickerSearchScore("Faculty of Arts and Letters", "ab")).toBeLessThan(pickerSearchScore("College of Accountancy", "ab"));
    expect(pickerSearchScore("Graduate School of Law", "GSL")).toBe(1);
    expect(pickerSearchScore("Graduate School", "GSL")).toBe(Infinity);
  });
  it.each(["CICS", "cics", " CICS ", "C.I.C.S."])("maps %s to Information and Computing Sciences", (query) => {
    expect(Number.isFinite(pickerSearchScore("College of Information and Computing Sciences", query))).toBe(true);
    expect(pickerSearchScore("College of Science", query)).toBe(Infinity);
  });
  it.each(["PHARMA", "pharma", "FOP", "fop", "F.O.P."])("maps %s to Pharmacy", (query) => {
    expect(Number.isFinite(pickerSearchScore("Faculty of Pharmacy", query))).toBe(true);
    expect(pickerSearchScore("College of Information and Computing Sciences", query)).toBe(Infinity);
  });
  it("also matches generated unit acronyms", () => {
    expect(Number.isFinite(pickerSearchScore("College of Science", "COS"))).toBe(true);
    expect(Number.isFinite(pickerSearchScore("College of Architecture", "CA"))).toBe(true);
    expect(Number.isFinite(pickerSearchScore("College of Information and Computing Sciences", "ci"))).toBe(true);
  });
  it("matches partial names, words in any order, and spelling mistakes", () => {
    expect(Number.isFinite(pickerSearchScore("Faculty of Pharmacy", "pharm"))).toBe(true);
    expect(Number.isFinite(pickerSearchScore("Faculty of Pharmacy", "pharmacy faculty"))).toBe(true);
    expect(Number.isFinite(pickerSearchScore("Faculty of Pharmacy", "pharmcy"))).toBe(true);
    expect(Number.isFinite(pickerSearchScore("College of Science", "scince"))).toBe(true);
  });
  it("ranks exact and partial matches before approximate ones", () => {
    expect(pickerSearchScore("Pharmacy", "Pharmacy")).toBeLessThan(pickerSearchScore("Faculty of Pharmacy", "Pharmacy"));
    expect(pickerSearchScore("Faculty of Pharmacy", "Pharmacy")).toBeLessThan(pickerSearchScore("Faculty of Pharmacy", "pharmcy"));
  });
  it("omits unrelated choices and preserves all choices for an empty search", () => {
    expect(pickerSearchScore("College of Science", "pharmacy")).toBe(Infinity);
    expect(pickerSearchScore("College of Science", "zzzzzzzzzz")).toBe(Infinity);
    expect(pickerSearchScore("College of Science", "  ")).toBe(0);
  });
});
