/*
 * QS Sustainability Rankings 2027 as the Office asked units for it: the per-unit request letters under memorandum
 * UST: S052-00-ME03 (Letter-for-QSWUSR - <unit>.docx), each a table of Indicators, Data Needed and Evidence drawn
 * from the QS portal. An item asked of several units is one indicator with several owners. QS publishes no formula
 * the Hub can reproduce, so the edition reports readiness only, grouped under QS's three categories.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readDocxTables } from "../../src/lib/analytics/tabular/node";
import type { CatalogIndicator, Group, MethodologyPack } from "../../src/lib/analytics/types";
import { indicatorDefaults } from "./shared";

/** The unit each letter went to, by the name at the end of its file name. */
const LETTER_UNITS: Record<string, { owners: string[]; labels?: string[] }> = {
  Academics: { owners: [], labels: ["Every College/Faculty"] },
  CCPET: { owners: [], labels: ["Center for Conservation of Cultural Property and Environment in the Tropics"] },
  CITED: { owners: ["a34"] },
  FINANCE: { owners: ["a06"] },
  FMO: { owners: ["fmo"] },
  HRD: { owners: ["hrd"] },
  LESO: { owners: ["a36"] },
  OAR: { owners: ["a14"] },
  OFED: { owners: ["a28"] },
  OIRP: { owners: ["oirp"] },
  OSA: { owners: ["a11"] },
  OSG: { owners: ["secgen"] },
  OVRAA: { owners: ["vraa"] },
  OVRII: { owners: ["vrri"] },
  "Property Custodian": { owners: ["a41"] },
  Purchasing: { owners: ["a44"] },
  RCCAH: { owners: ["rccah"] },
  RCNAS: { owners: ["rcnas"] },
  RCSSED: { owners: ["rcsse"] },
  SIMBAHAYAN: { owners: ["simbahayan"] },
  USTH: { owners: [], labels: ["UST Hospital"] },
  USTH1: { owners: [], labels: ["UST Hospital"] },
  USTH2: { owners: [], labels: ["UST Hospital"] },
  USTH3: { owners: [], labels: ["UST Hospital"] },
  USTHS: { owners: [], labels: ["UST Hospital"] },
  VR: { owners: ["a02"] },
  VRRA: { owners: ["a05"] },
};

const groups: Group[] = [
  { code: "ENV", position: 1, name: "Environmental Impact", points: null, weight: 0.45, mandatory: false },
  { code: "SOC", position: 2, name: "Social Impact", points: null, weight: 0.45, mandatory: false },
  { code: "GOV", position: 3, name: "Governance", points: null, weight: 0.1, mandatory: false },
];

const ENV = /carbon|energy|water|waste|climate|environment|procure|purchas|laborator|\blab\b|asset|inventory|disposal|footprint|hazard|resource efficiency|net zero|infrastructure|green|supplier/i;
const GOV = /governance|whistle|grievance|ethic|corruption|report|decision|representation|repository|polic|investment|compliance|leadership|dedicated role|structure|union/i;

/** A requirement's name for matching across letters: case, punctuation and plurals don't matter. */
const key = (s: string) => s.toLowerCase().replace(/\(if applicable\)/g, "").replace(/[^a-z0-9]+/g, " ").replace(/(\w{3,})s\b/g, "$1").trim();

export function qsSustainability2027(letters: string): { pack: MethodologyPack; report: string[] } {
  const report: string[] = [];
  type Found = { name: string; asks: string[]; data: string[]; evidence: string[]; owners: Set<string>; labels: Set<string> };
  const found = new Map<string, Found>();
  const add = (list: string[], lines: string[]) => {
    for (const line of lines.slice(0, 12)) if (!list.includes(line) && !/^response:/i.test(line) && !/^supporting links/i.test(line)) list.push(line);
  };
  for (const file of readdirSync(letters).filter((f) => /^Letter-for-QSWUSR - .+\.docx$/i.test(f)).sort()) {
    const unit = file.replace(/^Letter-for-QSWUSR - /i, "").replace(/\.docx$/i, "").trim();
    const who = LETTER_UNITS[unit];
    if (!who) {
      report.push(`${file}: no unit is set for “${unit}”.`);
      continue;
    }
    const tables = readDocxTables(new Uint8Array(readFileSync(join(letters, file))));
    let count = 0;
    for (const t of tables) {
      const head = t[0]?.map((c) => key(c.join(" ")));
      if (!head || !head[0]?.startsWith("indicator")) continue;
      // A row with only its first cell names an indicator; the rows under it say what to send and what proves it.
      let current: Found | null = null;
      for (const r of t.slice(1)) {
        const first = (r[0] ?? []).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
        const detail = (r[1]?.length ?? 0) + (r[2]?.length ?? 0) > 0;
        if (!first.length && !detail) continue;
        if (first[0] && (/^supporting links/i.test(first[0]) || /^for more detailed guidance/i.test(first[0]) || /^indicators?$/i.test(first[0]))) continue;
        // "Support to colleges in:" introduces a list under the current requirement.
        if (!detail && current && /:$/.test(first[0] ?? "")) {
          add(current.asks, first);
          continue;
        }
        if (!detail || !current) {
          const name = first[0];
          if (!name) continue;
          const k = key(name);
          current = found.get(k) ?? { name, asks: [], data: [], evidence: [], owners: new Set<string>(), labels: new Set<string>() };
          found.set(k, current);
          who.owners.forEach((o) => current!.owners.add(o));
          (who.labels ?? []).forEach((l) => current!.labels.add(l));
          count++;
          if (!detail) continue;
          add(current.asks, first.slice(1));
        } else add(current.asks, first);
        add(current.data, r[1] ?? []);
        add(current.evidence, r[2] ?? []);
      }
    }
    if (!count) report.push(`${file}: no requirements table found.`);
  }
  const base = indicatorDefaults();
  const indicators: CatalogIndicator[] = [...found.values()].map((rec, i) => {
    const group = ENV.test(rec.name) ? "ENV" : GOV.test(rec.name) ? "GOV" : "SOC";
    return {
      ...base,
      code: `QSS-${String(i + 1).padStart(2, "0")}`,
      position: i + 1,
      group,
      name: rec.name.slice(0, 200),
      guidance: [rec.asks.length ? rec.asks.join("; ") : "", rec.data.length ? `Data needed: ${rec.data.join("; ")}` : "", rec.evidence.length ? `Evidence: ${rec.evidence.join("; ")}` : ""].filter(Boolean).join("\n").slice(0, 3800),
      input: { type: "text", max: 4000 },
      evidence: { required: true },
      owners: [...rec.owners],
      ownerLabels: [...rec.labels],
    };
  });
  return {
    report,
    pack: {
      pack: 1,
      edition: {
        id: "qs-sustainability-2027",
        ranking: "qs-sustainability",
        year: 2027,
        label: "QS Sustainability Rankings 2027",
        methodology: "Per-unit requirements under UST: S052-00-ME03, from the QS portal’s indicators",
        period: "AY 2024–2025 and AY 2025–2026",
        status: "Active",
        scale: 100,
        aggregate: "readiness",
        options: {},
        sources: ["1QS Sustainability/Letter/Letter-for-QSWUSR - *.docx"],
        notes: "QS weighs Environmental Impact 45%, Social Impact 45% and Governance 10%; its portal scores the data itself, so the Hub tracks readiness.",
        years: [2024, 2025, 2026],
      },
      groups,
      indicators,
    },
  };
}
