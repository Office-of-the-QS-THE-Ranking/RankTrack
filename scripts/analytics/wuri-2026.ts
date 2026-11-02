/*
 * WURI 2026 (World's Universities with Real Impact): three axes of eight categories (WURI2026_Categories.pdf), each a
 * category the University files innovative-programme cases under (WURI2026_Template.pdf). Cases are scored on the
 * Office's internal rubric (WURI Tentative Criteria.pdf): Innovativeness 30, Implementability 30, Impact 40. A
 * category's figure is its best reviewed case.
 */
import type { CatalogIndicator, Criterion, Group, MethodologyPack } from "../../src/lib/analytics/types";
import { indicatorDefaults, ownersOf } from "./shared";

const levels = (spec: [string, number, number, string][]) => spec.map(([label, min, max, hint]) => ({ label, min, max, hint }));

export const WURI_RUBRIC: Criterion[] = [
  {
    key: "originality",
    label: "Originality",
    group: "Innovativeness",
    max: 15,
    levels: levels([
      ["Incremental", 0, 5, "A minor adjustment to practices common in the field."],
      ["Adaptive", 6, 10, "Combines existing ideas creatively, or applies a known concept to a new context."],
      ["Pioneering", 11, 15, "A truly new, paradigm-shifting concept that meets a previously unmet need."],
    ]),
  },
  {
    key: "novelty",
    label: "Novelty of process",
    group: "Innovativeness",
    max: 15,
    levels: levels([
      ["Conventional", 0, 5, "Standard, established methods deliver the program."],
      ["Enhanced", 6, 10, "Modern tools, interdisciplinary approaches or creative pedagogy improve delivery."],
      ["Groundbreaking", 11, 15, "A completely new process or framework that others could adopt as a model."],
    ]),
  },
  {
    key: "efficiency",
    label: "Resource efficiency",
    group: "Implementability",
    max: 15,
    levels: levels([
      ["High-cost", 0, 5, "Needs significant, specialised, non-renewable funding; a high barrier to entry."],
      ["Efficient", 6, 10, "Runs on a reasonable budget whose costs the benefits justify."],
      ["Self-sustaining", 11, 15, "Low-cost, uses existing resources cleverly, or pays for itself."],
    ]),
  },
  {
    key: "scalability",
    label: "Replicability and scalability",
    group: "Implementability",
    max: 15,
    levels: levels([
      ["Context-specific", 0, 5, "Depends on unique institutional factors; hard for others to adopt."],
      ["Adaptable", 6, 10, "Similar institutions can replicate it with moderate adaptation; documentation exists."],
      ["Scalable", 11, 15, "A turnkey model with a toolkit, easy to scale across units, universities or systems."],
    ]),
  },
  {
    key: "scope",
    label: "Scope of influence",
    group: "Impact",
    max: 20,
    levels: levels([
      ["Localized", 0, 7, "A single course, a small group of students, or one department."],
      ["Institutional", 8, 14, "Several departments, a whole college, the student body, or University policy."],
      ["Extra-institutional", 15, 20, "The local community, industry, national policy or the international academic community."],
    ]),
  },
  {
    key: "intensity",
    label: "Intensity of effect",
    group: "Impact",
    max: 20,
    levels: levels([
      ["Anecdotal", 0, 7, "Testimonials or qualitative observations, little quantitative data."],
      ["Quantifiable", 8, 14, "Clear quantitative data: graduation rates, scores, publications, placements."],
      ["Transformative", 15, 20, "Robust longitudinal data of profound, lasting change; major awards or policy shifts."],
    ]),
  },
];

const groups: Group[] = [
  { code: "A", position: 1, name: "Innovation targets: for whom", points: 800, weight: null, mandatory: false },
  { code: "B", position: 2, name: "Innovation means: how", points: 800, weight: null, mandatory: false },
  { code: "C", position: 3, name: "Innovation targets: what", points: 800, weight: null, mandatory: false },
];

const CATEGORIES: [string, string, string][] = [
  ["A1", "Student Support and Engagement", "Student Affairs / Career"],
  ["A2", "Student Mobility and Openness", "International Relations"],
  ["A3", "Industrial Application", "Office for Industry Linkages"],
  ["A4", "Entrepreneurial Culture and Ecosystem", "TOMASInno Center"],
  ["A5", "Crisis Management", "Simbahayan / Office of Planning and Quality Management"],
  ["A6", "Ethics and Integrity", "Academic Affairs / Secretary General"],
  ["A7", "Future-Oriented Responses to Global Uncertainty and Geopolitical Risk", "Office of Planning and Quality Management"],
  ["A8", "SDG- and ESG-Based Responses to Past and Present Global Challenges", "Simbahayan"],
  ["B1", "Visionary Leadership", "Rector"],
  ["B2", "Empowerment-Based Management", "Human Resource"],
  ["B3", "Digital and AI Transformation in Strategy and Management", "Information and Communications Technology"],
  ["B4", "Culture and Values", "Office of the Vice-Rector for Religious Affairs"],
  ["B5", "Funding for Sustainability", "Grants, Endowments"],
  ["B6", "Infrastructure and Technology", "Facilities Management Office"],
  ["B7", "Cost-Effectiveness Management", "Finance"],
  ["B8", "University Brand and Reputation", "Office of Public Affairs / Communications Bureau"],
  ["C1", "Representative Research Project", "Research and Innovation"],
  ["C2", "Interdisciplinary, Convergent and Integrated Research", "Research and Innovation"],
  ["C3", "Curricular Innovation for Future-Readiness", "Academic Affairs"],
  ["C4", "AI-Based Teaching and Learning Transformation", "CITED / Educational Technology"],
  ["C5", "Social Impact through Knowledge Transfer", "Simbahayan"],
  ["C6", "Inclusive Social Innovation for the Underserved", "Simbahayan"],
  ["C7", "University-Based Entrepreneurial Projects", "TOMASInno Center"],
  ["C8", "Financial Impact-Driven Technology Transfer", "Office for Industry Linkages / TOMASInno Center"],
];

const EXTRA: [RegExp, string][] = [
  [/industry linkages/i, "industry"],
  [/planning and quality/i, "a40"],
  [/religious affairs/i, "a05"],
  [/public affairs/i, "a42"],
  [/communications bureau/i, "a18"],
];

export function wuri2026(): MethodologyPack {
  const base = indicatorDefaults();
  const indicators: CatalogIndicator[] = CATEGORIES.map(([code, name, owner], i) => {
    const o = ownersOf(owner);
    for (const label of [...o.ownerLabels]) {
      const hit = EXTRA.find(([re]) => re.test(label))?.[1];
      if (hit) {
        o.owners.push(hit);
        o.ownerLabels.splice(o.ownerLabels.indexOf(label), 1);
      }
    }
    return {
      ...base,
      code,
      position: i + 1,
      group: code[0],
      ref: code,
      name,
      input: { type: "cases" },
      score: { kind: "rubric", points: 100, criteria: WURI_RUBRIC },
      evidence: { required: true, note: "One case per programme on WURI's template: abstract within 300 words, planning, doing and seeing sections, writer and champion named." },
      owners: [...new Set(o.owners)],
      ownerLabels: o.ownerLabels,
    };
  });
  return {
    pack: 1,
    edition: {
      id: "wuri-2026",
      ranking: "wuri",
      year: 2026,
      label: "WURI 2026",
      methodology: "WURI 2026 categories and case template; the Office’s tentative criteria for choosing cases",
      period: "Programmes active 2024–2026",
      status: "Active",
      scale: 100,
      aggregate: "best-per-group",
      options: {},
      sources: ["WURI2026_Categories.pdf", "WURI2026_Template.pdf", "WURI Tentative Criteria.pdf"],
      notes: "WURI ranks programmes, not indicators. Each category takes the University’s strongest reviewed case.",
      years: [2024, 2025, 2026],
    },
    groups,
    indicators,
  };
}
