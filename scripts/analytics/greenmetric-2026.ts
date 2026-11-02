/*
 * UI GreenMetric Sustainable University Rankings 2026, from the 2026 guideline (2026_Guideline_UI-GreenMetric-SUR-
 * eng-v2.pdf): seven categories, the questionnaire's 118 items, and the 60 scored indicators with the formulas the
 * questionnaire prints and the bands and points of Appendix 1. Owners follow the Office's Indicator-to-Department
 * Responsibility Map. Every item asks for evidence where the guideline says “Evidence is required”.
 */
import type { CatalogIndicator, Group, InputSpec, MethodologyPack, ScoreRule } from "../../src/lib/analytics/types";
import { bands, indicatorDefaults, ownersOf } from "./shared";

const groups: Group[] = [
  { code: "SI", position: 1, name: "Setting and Infrastructure", points: 1100, weight: 0.11, mandatory: false },
  { code: "EC", position: 2, name: "Energy and Climate Change", points: 2000, weight: 0.2, mandatory: false },
  { code: "WS", position: 3, name: "Waste", points: 1700, weight: 0.17, mandatory: false },
  { code: "WR", position: 4, name: "Water", points: 1100, weight: 0.11, mandatory: false },
  { code: "TR", position: 5, name: "Transportation", points: 1700, weight: 0.17, mandatory: false },
  { code: "ED", position: 6, name: "Education and Research", points: 1300, weight: 0.13, mandatory: false },
  { code: "GD", position: 7, name: "Governance and Digitalization", points: 1100, weight: 0.11, mandatory: false },
];

const POP = "({1.11} + {1.13})";

type Opt = [string, number?];
type Item = {
  code: string;
  name: string;
  owner: string;
  ref?: string;
  unit?: string;
  input?: InputSpec;
  score?: ScoreRule;
  evidence?: boolean;
  guidance?: string;
  feeds?: CatalogIndicator["feeds"];
};

const num = (unit?: string, integer = false): InputSpec => ({ type: "number", ...(unit && { unit }), ...(integer && { integer: true }), min: 0 });
const options = (opts: Opt[]) => opts.map(([label], i) => ({ key: `o${i + 1}`, label }));
/** A scored choice: each option's share of the indicator's points, as Appendix 1 gives them. */
const pick = (points: number, opts: Opt[]): { input: InputSpec; score: ScoreRule } => ({
  input: { type: "choice", options: options(opts) },
  score: { kind: "choice", points, shares: Object.fromEntries(opts.map(([, s], i) => [`o${i + 1}`, s ?? 0])) },
});
const unscored = (opts: string[]): InputSpec => ({ type: "choice", options: options(opts.map((o) => [o])) });
const banded = (points: number, expr: string, spec: string, unit = ""): ScoreRule => ({ kind: "bands", points, expr, bands: bands(spec, unit) });

const STAGES5 = (none: string, a: string, b: string, c: string, d: string): Opt[] => [[none, 0], [a, 0.25], [b, 0.5], [c, 0.75], [d, 1]];
const SDG_IMPACT = ["Low impact (1–2 SDGs)", "Moderate impact (3–5 SDGs)", "Significant impact (6–9 SDGs)", "High impact (10–13 SDGs)", "Very high impact (14–17 SDGs)"];
const COUNT_PROGRAMS = (unit: string): Opt[] => [["None", 0], [`1–3 ${unit}`, 0.25], [`4–6 ${unit}`, 0.5], [`7–10 ${unit}`, 0.75], [`More than 10 ${unit}`, 1]];
const FMO = "Facilities Management Office";
const FMO_SO = "Facilities Management / Sustainability Office";
const FMO_SS = "Facilities Management / Safety & Security Office";

const items: (Item & { group: string })[] = [
  // ---------- SI ----------
  { group: "SI", code: "1.1", name: "Type of higher education institution", owner: "Office of the Registrar / Academic Affairs", input: unscored(["Comprehensive", "Specialized higher education institution"]) },
  { group: "SI", code: "1.2", name: "Climate", owner: FMO, input: unscored(["Tropical wet", "Tropical wet and dry", "Semiarid", "Arid", "Mediterranean", "Humid subtropical", "Marine west coast / oceanic", "Humid continental", "Subarctic"]) },
  { group: "SI", code: "1.3", name: "Number of campus sites", owner: FMO, input: num("sites", true), evidence: true },
  { group: "SI", code: "1.4", name: "Campus setting", owner: FMO, input: unscored(["Rural", "Suburban", "Urban", "City center", "High-rise building area"]), evidence: true },
  { group: "SI", code: "1.5", name: "Total campus area", owner: FMO, unit: "m²", input: num("m²"), evidence: true, guidance: "Only areas used for academic activities; forests and fields count only when used for teaching, research or community engagement." },
  { group: "SI", code: "1.6", name: "Total campus ground floor area of buildings", owner: FMO, unit: "m²", input: num("m²") },
  { group: "SI", code: "1.7", name: "Total campus buildings area", owner: FMO, unit: "m²", input: num("m²"), evidence: true, guidance: "Total floor area of all buildings, ground and upper floors." },
  { group: "SI", code: "1.8", ref: "SI1", name: "Ratio of open space area to total area", owner: FMO, unit: "%", input: { type: "none" }, score: banded(200, "({1.5} - {1.6}) / {1.5} * 100", "≤1:.05 | >1-80:.25 | >80-90:.5 | >90-95:.75 | >95:1", "%"), evidence: true },
  { group: "SI", code: "1.9", ref: "SI2", name: "Area covered in forest vegetation", owner: FMO, unit: "m²", input: num("m²"), score: banded(100, "{1.9} / {1.5} * 100", "≤2:.05 | >2-10:.25 | >10-25:.5 | >25-35:.75 | >35:1", "%"), evidence: true, guidance: "Owned by the University and used for research, teaching or community engagement. Enter the area in m²; the share of the campus is computed." },
  { group: "SI", code: "1.10", ref: "SI3", name: "Area covered in planted vegetation", owner: FMO, unit: "m²", input: num("m²"), score: banded(200, "{1.10} / {1.5} * 100", "≤10:.05 | >10-20:.25 | >20-30:.5 | >30-50:.75 | >50:1", "%"), evidence: true, guidance: "Lawns, gardens, green roofs, indoor planting and vertical gardens, excluding forest. Enter the area in m²." },
  { group: "SI", code: "1.11", name: "Total number of regular students", owner: "Office of the Registrar", unit: "students", input: num("students", true), evidence: true, feeds: [{ kind: "template", profile: "student-count", measure: "students", label: "Registrar student count" }] },
  { group: "SI", code: "1.12", name: "Total number of online students", owner: "Office of the Registrar", unit: "students", input: num("students", true), feeds: [{ kind: "template", profile: "student-count", measure: "online", label: "Registrar student count (online)" }] },
  { group: "SI", code: "1.13", name: "Total number of academic and administrative staff", owner: "Office of the Vice Rector for Academic Affairs / Human Resources Department", unit: "staff", input: num("staff", true) },
  { group: "SI", code: "1.14", ref: "SI4", name: "Open space area per campus population", owner: FMO, unit: "m²/person", input: { type: "none" }, score: banded(200, `({1.5} - {1.6}) / ${POP}`, "≤10:.05 | >10-20:.25 | >20-40:.5 | >40-70:.75 | >70:1", "m²/person"), evidence: true },
  { group: "SI", code: "1.15", ref: "SI5", name: "Facilities for disabled persons, special needs and/or maternity care", owner: FMO, ...pick(100, STAGES5("None", "Policy is in place", "Facilities are in the planning stage", "Facilities are partially available and operational", "Facilities exist in all buildings and are fully operational")), evidence: true },
  { group: "SI", code: "1.16", ref: "SI6", name: "Security and safety facilities", owner: "Campus Security Office", ...pick(100, STAGES5("Passive security and safety system", "CCTV and emergency hotline available and functional", "CCTV, hotline, certified personnel, extinguishers and hydrants functional", "Fully functional; response time over 5 minutes", "Fully functional; response time under 5 minutes")), evidence: true },
  { group: "SI", code: "1.17", ref: "SI7", name: "Health infrastructure for students, academics and administrative staff", owner: "University Health Services / UST Hospital", ...pick(100, STAGES5("First aid is not available", "First aid, emergency room, clinic and personnel", "First aid, emergency room, clinic and certified personnel", "First aid, emergency room, clinic, hospital and certified personnel", "All of these, systemized and accessible to the public")), evidence: true },
  { group: "SI", code: "1.18", ref: "SI8", name: "Conservation of flora, fauna, wildlife and genetic resources", owner: "Sustainability Office / Facilities Management Office", ...pick(100, [["Conservation program is in preparation", 0.05], ["1%–25% implemented", 0.25], ["25%–50% implemented", 0.5], ["50%–75% implemented", 0.75], ["More than 75% implemented", 1]]), evidence: true },
  { group: "SI", code: "1.19", name: "Impact of Setting and Infrastructure programs on the SDGs", owner: "Sustainability Office", input: unscored(SDG_IMPACT), evidence: true },

  // ---------- EC ----------
  { group: "EC", code: "2.1", ref: "EC1", name: "Energy-efficient appliances usage", owner: FMO_SO, unit: "%", input: num("%"), score: banded(200, "{2.1}", "<1:.05 | 1-25:.25 | >25-50:.5 | >50-75:.75 | >75:1", "%"), evidence: true, guidance: "Energy-efficient appliances as a share of all appliances on campus." },
  { group: "EC", code: "2.2", name: "Total smart building area", owner: FMO_SO, unit: "m²", input: num("m²") },
  { group: "EC", code: "2.3", ref: "EC2", name: "Smart building implementation", owner: FMO_SO, unit: "%", input: { type: "none" }, score: banded(300, "{2.2} / {1.7} * 100", "<1:.05 | 1-25:.25 | >25-50:.5 | >50-75:.75 | >75:1", "%"), evidence: true },
  { group: "EC", code: "2.4", ref: "EC3", name: "Number of renewable energy sources on campus", owner: FMO_SO, ...pick(300, [["None", 0], ["1 source", 0.25], ["2 sources", 0.5], ["3 sources", 0.75], ["More than 3 sources", 1]]) },
  { group: "EC", code: "2.5", name: "Renewable energy produced in the year", owner: FMO_SO, unit: "kWh", input: num("kWh"), evidence: true, guidance: "All renewable sources together: biodiesel, clean biomass, solar, geothermal, wind, hydropower, CHP." },
  { group: "EC", code: "2.6", name: "Electricity usage per year", owner: FMO_SO, unit: "kWh", input: num("kWh"), evidence: true, guidance: "The last 12 months across the whole University, in kilowatt-hours." },
  { group: "EC", code: "2.7", ref: "EC4", name: "Electricity usage per campus population", owner: FMO_SO, unit: "kWh/person", input: { type: "none" }, score: banded(200, `{2.6} / ${POP}`, "≥2400:.05 | >1500-2400:.25 | >600-1500:.5 | ≥250-600:.75 | <250:1", "kWh") },
  { group: "EC", code: "2.8", ref: "EC5", name: "Ratio of renewable energy production to total energy usage", owner: FMO_SO, unit: "%", input: { type: "none" }, score: banded(200, "{2.5} / {2.6} * 100", "≤0.5:.05 | >0.5-1:.25 | >1-2:.5 | >2-25:.75 | >25:1", "%"), evidence: true },
  { group: "EC", code: "2.9", ref: "EC6", name: "Green building elements across all buildings", owner: FMO_SO, ...pick(200, [["None", 0], ["1 element", 0.25], ["2 elements", 0.5], ["3 elements", 0.75], ["More than 3 elements", 1]]), evidence: true },
  { group: "EC", code: "2.10", ref: "EC7", name: "Greenhouse gas emission reduction program", owner: FMO_SO, ...pick(200, STAGES5("None", "Program in preparation", "Addresses one scope (1, 2 or 3)", "Addresses two scopes", "Addresses all three scopes")), evidence: true },
  { group: "EC", code: "2.11", name: "Total carbon footprint (last 12 months)", owner: FMO_SO, unit: "t CO₂", input: num("t CO₂"), evidence: true, guidance: "Metric tons of CO₂, excluding flights and secondary sources such as food and clothing." },
  { group: "EC", code: "2.12", ref: "EC8", name: "Carbon footprint per campus population", owner: FMO_SO, unit: "t/person", input: { type: "none" }, score: banded(200, `{2.11} / ${POP}`, "≥2.05:.05 | >1.11-2.05:.25 | >0.42-1.11:.5 | >0.10-0.42:.75 | <0.10:1", "t") },
  { group: "EC", code: "2.13", ref: "EC9", name: "Innovative programs in energy and climate change", owner: "Office of Research and Innovation / Sustainability Office", ...pick(100, [["None", 0], ["1 program", 0.25], ["2 programs", 0.5], ["3 programs", 0.75], ["More than 3 programs", 1]]), evidence: true },
  { group: "EC", code: "2.14", ref: "EC10", name: "Impactful university programs on climate change", owner: "Sustainability Office / Simbahayan", ...pick(100, STAGES5("None", "Program in preparation", "Implemented with surrounding communities", "Implemented at the national level", "Implemented at the international level")), evidence: true },
  { group: "EC", code: "2.15", name: "Impact of Energy and Climate Change programs on the SDGs", owner: "Sustainability Office", input: unscored(SDG_IMPACT), evidence: true },

  // ---------- WS ----------
  { group: "WS", code: "3.1", ref: "WS1", name: "3R (Reduce, Reuse, Recycle) program for university waste", owner: FMO_SO, ...pick(200, STAGES5("None", "3R program in preparation", "1%–50% implemented", "More than 50%–75% implemented", "More than 75% implemented")), evidence: true },
  { group: "WS", code: "3.2", name: "Paper and plastic produced this year", owner: FMO_SO, unit: "t", input: num("t") },
  { group: "WS", code: "3.3", name: "Paper and plastic produced last year", owner: FMO_SO, unit: "t", input: num("t") },
  { group: "WS", code: "3.4", ref: "WS2", name: "Program to reduce paper and plastic use on campus", owner: "Sustainability Office", ...pick(300, COUNT_PROGRAMS("programs")), evidence: true },
  { group: "WS", code: "3.5", name: "Organic waste produced this year", owner: FMO_SO, unit: "t", input: num("t") },
  { group: "WS", code: "3.6", name: "Organic waste produced last year", owner: FMO_SO, unit: "t", input: num("t") },
  { group: "WS", code: "3.7", name: "Organic waste treated this year", owner: FMO_SO, unit: "t", input: num("t") },
  { group: "WS", code: "3.8", ref: "WS3", name: "Organic waste treatment", owner: FMO_SO, unit: "%", input: { type: "none" }, score: banded(300, "{3.7} / {3.5} * 100", "<1:0 | 1-35:.25 | >35-65:.5 | >65-85:.75 | >85:1", "% treated"), evidence: true, guidance: "Treated this year (3.7) as a share of produced this year (3.5); under 1% reads as open dumping." },
  { group: "WS", code: "3.9", name: "Inorganic waste produced this year", owner: FMO_SO, unit: "t", input: num("t") },
  { group: "WS", code: "3.10", name: "Inorganic waste produced last year", owner: FMO_SO, unit: "t", input: num("t") },
  { group: "WS", code: "3.11", name: "Inorganic waste treated this year", owner: FMO_SO, unit: "t", input: num("t") },
  { group: "WS", code: "3.12", ref: "WS4", name: "Inorganic waste treatment", owner: FMO_SO, unit: "%", input: { type: "none" }, score: banded(300, "{3.11} / {3.9} * 100", "<1:0 | 1-35:.25 | >35-65:.5 | >65-85:.75 | >85:1", "% treated"), evidence: true, guidance: "Treated this year (3.11) as a share of produced this year (3.9); under 1% reads as burned in open areas." },
  { group: "WS", code: "3.13", name: "Toxic waste produced this year", owner: "Sustainability Office / LESO", unit: "t", input: num("t") },
  { group: "WS", code: "3.14", name: "Toxic waste produced last year", owner: "Sustainability Office / LESO", unit: "t", input: num("t") },
  { group: "WS", code: "3.15", name: "Toxic waste treated this year", owner: "Sustainability Office / LESO", unit: "t", input: num("t") },
  { group: "WS", code: "3.16", ref: "WS5", name: "Toxic waste treatment", owner: "Sustainability Office / LESO", unit: "%", input: { type: "none" }, score: banded(300, "{3.15} / {3.13} * 100", "<1:0 | 1-35:.25 | >35-65:.5 | >65-85:.75 | >85:1", "% treated"), evidence: true, guidance: "Treated this year (3.15) as a share of produced this year (3.13). Separated, documented and handed to certified handlers." },
  { group: "WS", code: "3.17", ref: "WS6", name: "Sewage disposal", owner: FMO_SO, ...pick(300, STAGES5("Untreated into waterways", "Preliminary treatment", "Primary treatment", "Secondary treatment", "Tertiary treatment")), evidence: true },
  { group: "WS", code: "3.18", name: "Impact of Waste Management programs on the SDGs", owner: "Sustainability Office", input: unscored(SDG_IMPACT), evidence: true },

  // ---------- WR ----------
  { group: "WR", code: "4.1", ref: "WR1", name: "Area for water absorption besides forest and planted vegetation", owner: FMO_SO, unit: "m²", input: num("m²"), score: banded(100, "{4.1} / {1.5} * 100", "≤2:.05 | >2-10:.25 | >10-20:.5 | >20-40:.75 | >40:1", "%"), evidence: true, guidance: "Soil, grass, permeable paving and infiltration areas. Enter the area in m²." },
  { group: "WR", code: "4.2", ref: "WR2", name: "Water conservation program and implementation", owner: FMO_SO, ...pick(200, STAGES5("None", "Program in preparation", "1%–25% water conserved", "More than 25%–50% conserved", "More than 50% conserved")), evidence: true },
  { group: "WR", code: "4.3", ref: "WR3", name: "Water recycling program implementation", owner: FMO_SO, ...pick(200, STAGES5("None", "Program in preparation", "1%–25% water recycled", "More than 25%–50% recycled", "More than 50% recycled")), evidence: true },
  { group: "WR", code: "4.4", ref: "WR4", name: "Water-efficient appliances usage", owner: FMO_SO, unit: "%", input: num("%"), score: banded(200, "{4.4}", "<20:.05 | 20-40:.25 | >40-60:.5 | >60-80:.75 | >80:1", "%"), evidence: true, guidance: "Water-efficient taps, toilet flushes and fixtures as a share of all installed." },
  { group: "WR", code: "4.5", ref: "WR5", name: "Consumption of treated water", owner: FMO_SO, unit: "%", input: num("%"), score: banded(200, "{4.5}", "<1:0 | 1-25:.25 | >25-50:.5 | >50-75:.75 | >75:1", "%"), evidence: true, guidance: "Treated water as a share of all water the University uses." },
  { group: "WR", code: "4.6", ref: "WR6", name: "Water pollution control in campus area", owner: FMO_SO, ...pick(200, [["Policy and programs in the designing stage", 0.05], ["In the construction stage", 0.25], ["In early implementation", 0.5], ["Fully implemented, monitored occasionally", 0.75], ["Fully implemented, monitored regularly", 1]]), evidence: true },
  { group: "WR", code: "4.7", name: "Impact of Water Management programs on the SDGs", owner: "Sustainability Office", input: unscored(SDG_IMPACT), evidence: true },

  // ---------- TR ----------
  { group: "TR", code: "5.1", name: "Cars actively used and managed by the university", owner: FMO_SS, unit: "cars", input: num("cars", true) },
  { group: "TR", code: "5.2", name: "Cars entering the university daily", owner: FMO_SS, unit: "cars", input: num("cars", true) },
  { group: "TR", code: "5.3", name: "Motorcycles entering the university daily", owner: FMO_SS, unit: "motorcycles", input: num("motorcycles", true) },
  { group: "TR", code: "5.4", ref: "TR1", name: "Combustion-engine vehicles per campus population", owner: FMO_SS, unit: "per person", input: { type: "none" }, score: banded(200, `({5.1} + {5.2} + {5.3}) / ${POP}`, "≥1:0 | >0.5-1:.25 | >0.125-0.5:.5 | >0.045-0.125:.75 | <0.045:1") },
  { group: "TR", code: "5.5", ref: "TR2", name: "Shuttle services", owner: FMO_SS, ...pick(250, STAGES5("Possible but not provided by the university", "Provided and regular, but not free", "Provided; the university pays part of the cost", "Provided by the university, regular and free", "Provided by the university, zero-emission (or not applicable)")), evidence: true },
  { group: "TR", code: "5.6", name: "Shuttles operating in the university", owner: FMO_SS, unit: "shuttles", input: num("shuttles", true) },
  { group: "TR", code: "5.7", name: "Average passengers per shuttle trip", owner: FMO_SS, unit: "passengers", input: num("passengers") },
  { group: "TR", code: "5.8", name: "Shuttle trips per day", owner: FMO_SS, unit: "trips", input: num("trips", true) },
  { group: "TR", code: "5.9", ref: "TR3", name: "Zero Emission Vehicles (ZEV) availability on campus", owner: FMO_SS, ...pick(200, STAGES5("ZEV are not available", "ZEV use is not possible or practical", "Available, but not provided by the university", "Provided by the university and charged", "Provided by the university for free")), evidence: true },
  { group: "TR", code: "5.10", name: "Average Zero Emission Vehicles on campus per day", owner: FMO_SS, unit: "vehicles", input: num("vehicles") },
  { group: "TR", code: "5.11", ref: "TR4", name: "Zero Emission Vehicles per campus population", owner: FMO_SO, unit: "per person", input: { type: "none" }, score: banded(200, `{5.10} / ${POP}`, "≤0.002:.05 | >0.002-0.004:.25 | >0.004-0.008:.5 | >0.008-0.02:.75 | >0.02:1") },
  { group: "TR", code: "5.12", name: "Total ground parking area", owner: FMO_SS, unit: "m²", input: num("m²") },
  { group: "TR", code: "5.13", ref: "TR5", name: "Ratio of ground parking area to total campus area", owner: FMO_SS, unit: "%", input: { type: "none" }, score: banded(200, "{5.12} / {1.5} * 100", ">11:0 | >7-11:.25 | >4-7:.5 | >1-4:.75 | ≤1:1", "%") },
  { group: "TR", code: "5.14", ref: "TR6", name: "Program to limit or decrease parking area (last 3 years)", owner: FMO_SS, ...pick(200, STAGES5("None", "In preparation", "Less than 10% decrease", "10%–30% decrease", "More than 30% decrease, or at its limit")), evidence: true },
  { group: "TR", code: "5.15", ref: "TR7", name: "Initiatives to decrease private vehicles on campus", owner: FMO_SS, ...pick(200, [["No initiative", 0], ["1 initiative", 0.25], ["2 initiatives", 0.5], ["3 initiatives", 0.75], ["More than 3, or no longer required", 1]]), evidence: true },
  { group: "TR", code: "5.16", ref: "TR8", name: "Pedestrian paths on campus", owner: FMO_SS, ...pick(250, STAGES5("None", "Available", "Available and designed for safety", "Designed for safety and convenience", "Safe, convenient, and partly disabled-friendly")), evidence: true },
  { group: "TR", code: "5.17", name: "Approximate daily travel distance of vehicles inside the campus", owner: FMO_SS, unit: "km", input: num("km") },
  { group: "TR", code: "5.18", name: "Impact of Transportation programs on the SDGs", owner: FMO_SS, input: unscored(SDG_IMPACT), evidence: true },

  // ---------- ED ----------
  { group: "ED", code: "6.1", name: "Sustainability-related courses or subjects offered", owner: "Office of the Registrar / Academic Affairs", unit: "courses", input: num("courses", true), feeds: [{ kind: "template", profile: "course-offering", measure: "sustainability", label: "Course offering upload (sustainability keywords)" }] },
  { group: "ED", code: "6.2", name: "Total courses or subjects offered", owner: "Office of the Registrar / Academic Affairs", unit: "courses", input: num("courses", true), feeds: [{ kind: "template", profile: "course-offering", measure: "courses", label: "Course offering upload" }] },
  { group: "ED", code: "6.3", name: "Sustainability-related study programs offered", owner: "Academic Affairs / Curriculum Office", unit: "programs", input: num("programs", true) },
  { group: "ED", code: "6.4", ref: "ED1", name: "Ratio of sustainability courses to total courses", owner: "Academic Affairs / Curriculum Office", unit: "%", input: { type: "none" }, score: banded(200, "{6.1} / {6.2} * 100", "≤1:.05 | >1-5:.25 | >5-10:.5 | >10-20:.75 | >20:1", "%"), evidence: true },
  { group: "ED", code: "6.5", name: "Research funds dedicated to sustainability research", owner: "Office of Research and Innovation", unit: "USD", input: num("USD"), feeds: [{ kind: "template", profile: "research-funds", measure: "sustainability", label: "Research funds upload, in pesos" }], guidance: "In US dollars. The research funds upload totals pesos: convert before entering." },
  { group: "ED", code: "6.6", name: "Total research funds", owner: "Office of Research and Innovation", unit: "USD", input: num("USD"), feeds: [{ kind: "template", profile: "research-funds", measure: "total", label: "Research funds upload, in pesos" }], guidance: "In US dollars." },
  { group: "ED", code: "6.7", ref: "ED2", name: "Ratio of sustainability research funding to total research funding", owner: "Office of Research and Innovation", unit: "%", input: { type: "none" }, score: banded(200, "{6.5} / {6.6} * 100", "≤1:.05 | >1-10:.25 | >10-20:.5 | >20-40:.75 | >40:1", "%"), evidence: true },
  { group: "ED", code: "6.8", name: "Lecturers and researchers in one year", owner: "OVRII / Academic Affairs", unit: "people", input: num("people", true), feeds: [{ kind: "template", profile: "academic-staff", measure: "staff", label: "HR academic staff list" }] },
  { group: "ED", code: "6.9", name: "Scholarly publications on sustainability in one year", owner: "OVRII / Academic Affairs", unit: "publications", input: num("publications", true) },
  { group: "ED", code: "6.10", ref: "ED3", name: "Sustainability publications per lecturer and researcher", owner: "OVRII / Academic Affairs", input: { type: "none" }, score: banded(200, "{6.9} / {6.8}", "<0.5:0 | 0.5-1:.25 | >1-2:.5 | >2-3:.75 | >3:1"), evidence: true },
  { group: "ED", code: "6.11", ref: "ED4", name: "Sustainability-related events (yearly average, last 3 years)", owner: "Sustainability Office / Student Affairs", unit: "events", input: num("events"), score: banded(100, "{6.11}", "<1:0 | 1-5:.25 | >5-20:.5 | >20-50:.75 | >50:1"), evidence: true, feeds: [{ kind: "activities", kinds: ["Advocacy", "Event"], per: "average", label: "Activity register: advocacy and events" }] },
  { group: "ED", code: "6.12", ref: "ED5", name: "Sustainability activities organized by student organizations per year", owner: "Student Affairs / Office of Student Organizations", unit: "activities", input: num("activities", true), score: banded(150, "{6.12}", "<1:0 | 1-5:.25 | >5-10:.5 | >10-20:.75 | >20:1"), evidence: true, feeds: [{ kind: "activities", kinds: ["Service learning", "Community development", "Advocacy"], per: "year", label: "Activity register" }] },
  { group: "ED", code: "6.13", ref: "ED6", name: "Cultural activities on campus per year", owner: "Student Affairs / Campus Life Office", unit: "events", input: num("events", true), score: banded(100, "{6.13}", "<1:0 | 1-3:.25 | >3-6:.5 | >6-10:.75 | >10:1"), evidence: true },
  { group: "ED", code: "6.14", ref: "ED7", name: "Sustainability programs with international collaborations per year", owner: "Office of International Affairs", unit: "programs", input: num("programs", true), score: banded(100, "{6.14}", "<1:0 | 1-3:.25 | >3-6:.5 | >6-10:.75 | >10:1"), evidence: true },
  { group: "ED", code: "6.15", ref: "ED8", name: "Sustainability community services involving students per year", owner: "Community Engagement Office / Student Affairs", unit: "projects", input: num("projects", true), score: banded(100, "{6.15}", "<1:0 | 1-3:.25 | >3-6:.5 | >6-10:.75 | >10:1"), evidence: true, feeds: [{ kind: "activities", kinds: ["Community development", "Service learning"], per: "year", label: "Activity register: community development and service learning" }] },
  { group: "ED", code: "6.16", ref: "ED9", name: "Sustainability-related startups", owner: "Innovation & Entrepreneurship Center", unit: "startups", input: num("startups", true), score: banded(100, "{6.16}", "<1:0 | 1-5:.25 | >5-10:.5 | >10-15:.75 | >15:1"), evidence: true },
  { group: "ED", code: "6.17", name: "Graduates with green jobs (last 3 years)", owner: "Counselling and Career Center", unit: "graduates", input: num("graduates", true) },
  { group: "ED", code: "6.18", name: "Total graduates (last 3 years)", owner: "Office of the Registrar", unit: "graduates", input: num("graduates", true), feeds: [{ kind: "template", profile: "graduate-count", measure: "graduates", label: "Registrar graduate count" }] },
  { group: "ED", code: "6.19", ref: "ED10", name: "Percentage of graduates with green jobs (last 3 years)", owner: "Counselling and Career Center", unit: "%", input: { type: "none" }, score: banded(50, "{6.17} / {6.18} * 100", "≤1:.05 | >1-5:.25 | >5-10:.5 | >10-20:.75 | >20:1", "%"), evidence: true },
  { group: "ED", code: "6.20", name: "Impact of Education and Research programs on the SDGs", owner: "Sustainability Office", input: unscored(SDG_IMPACT), evidence: true },

  // ---------- GD ----------
  { group: "GD", code: "7.1", name: "Total university budget", owner: "Finance Office", unit: "USD", input: num("USD") },
  { group: "GD", code: "7.2", name: "University budget for sustainability efforts", owner: "Finance Office / Sustainability Office", unit: "USD", input: num("USD") },
  { group: "GD", code: "7.3", ref: "GD1", name: "Percentage of university budget for sustainability efforts", owner: "Finance Office", unit: "%", input: { type: "none" }, score: banded(200, "{7.2} / {7.1} * 100", "≤1:.05 | >1-5:.25 | >5-10:.5 | >10-15:.75 | >15:1", "%"), evidence: true },
  { group: "GD", code: "7.4", ref: "GD2", name: "University-run sustainability website", owner: "Sustainability Office / ICT", ...pick(200, STAGES5("Not available", "In progress or under construction", "Available and accessible", "Available, accessible, updated occasionally", "Available, accessible, updated regularly")), evidence: true },
  { group: "GD", code: "7.5", name: "Sustainability website address", owner: "Sustainability Office / ICT", input: { type: "text", max: 400 } },
  { group: "GD", code: "7.6", ref: "GD3", name: "Sustainability report", owner: "Sustainability Office", ...pick(100, STAGES5("Not available", "In preparation", "Available but not publicly accessible", "Accessible and published occasionally", "Accessible and published annually")), evidence: true },
  { group: "GD", code: "7.7", name: "Sustainability report address", owner: "Sustainability Office", input: { type: "text", max: 400 } },
  { group: "GD", code: "7.8", ref: "GD4", name: "Financial report", owner: "Finance Office", ...pick(100, STAGES5("Not available", "In preparation", "Available but not publicly accessible", "Accessible and published occasionally", "Accessible and published annually")), evidence: true },
  { group: "GD", code: "7.9", name: "Financial report address", owner: "Finance Office", input: { type: "text", max: 400 } },
  { group: "GD", code: "7.10", ref: "GD5", name: "Unit or office coordinating sustainability on campus", owner: "Sustainability Office", ...pick(100, STAGES5("Ad hoc or a task force", "Unit or office in development", "Established by decree, at an early stage", "Established by decree and operational", "Operational and leading the University’s sustainability work")), evidence: true },
  { group: "GD", code: "7.11", name: "Dedicated staff supporting sustainability coordination", owner: "Sustainability Office / VR", unit: "staff", input: num("staff", true) },
  { group: "GD", code: "7.12", ref: "GD6", name: "Use of ICT for sustainability planning, monitoring and evaluation", owner: "Information and Communications Technology", ...pick(50, STAGES5("None", "Planning stage", "Implemented", "Implemented and evaluated", "Implemented, evaluated and being improved")), evidence: true },
  { group: "GD", code: "7.13", ref: "GD7", name: "Policy on advanced digital technologies (AI, IoT)", owner: "ICT / VR / Legal & Compliance Office", ...pick(50, STAGES5("No policy", "Initial adoption in specific units", "Partial implementation", "Broad implementation", "Advanced, institution-wide and continuously improved")), evidence: true },
  { group: "GD", code: "7.14", name: "Compliance with data protection regulation (GDPR or equivalent)", owner: "Information and Communications Technology", input: unscored(["No policy or mechanism", "Framework in preparation", "Partially implemented", "Fully implemented and monitored", "Fully implemented, audited and communicated"]), evidence: true },
  { group: "GD", code: "7.15", name: "Total institutional leaders and deputy leaders", owner: "Human Resources Department", unit: "leaders", input: num("leaders", true) },
  { group: "GD", code: "7.16", name: "Women in leadership positions", owner: "Human Resources Department", unit: "leaders", input: num("leaders", true) },
  { group: "GD", code: "7.17", ref: "GD8", name: "Ratio of female leaders to total institutional leaders", owner: "Human Resources Department", unit: "%", input: { type: "none" }, score: banded(100, "{7.16} / {7.15} * 100", "≤5:0 | >5-20:.25 | >20-35:.5 | >35-50:.75 | >50:1", "%"), evidence: true },
  { group: "GD", code: "7.18", ref: "GD9", name: "Anti-corruption and integrity system", owner: "Legal & Compliance Office / Internal Audit Office", ...pick(50, STAGES5("None", "In the planning stage", "Implemented", "Implemented and evaluated", "Implemented, evaluated and being revised")), evidence: true },
  { group: "GD", code: "7.19", ref: "GD10", name: "Whistle-blowing and complaint system", owner: "Legal & Compliance Office / Internal Audit Office", ...pick(50, STAGES5("None", "In the planning stage", "Implemented", "Implemented and evaluated", "Implemented, evaluated and being revised")), evidence: true },
  { group: "GD", code: "7.20", ref: "GD11", name: "LMS-enabled digital literacy program for students and staff", owner: "Information and Communications Technology / Ed-tech / OVRAA", ...pick(50, STAGES5("None", "In the planning stage", "Implemented", "Implemented and evaluated", "Implemented, evaluated and being revised")), evidence: true },
  { group: "GD", code: "7.21", ref: "GD12", name: "Written code of ethics for leaders, staff and students", owner: "Legal & Compliance Office / OVRAA / VR", ...pick(50, STAGES5("No written code of ethics", "In preparation or draft", "Established but partial or not enforced", "Applies to all, implemented and monitored", "Applies to all, reviewed regularly and enforced")), evidence: true },
];

export function greenmetric2026(): MethodologyPack {
  const indicators: CatalogIndicator[] = items.map((it, i) => ({
    ...indicatorDefaults(),
    code: it.code,
    position: i + 1,
    group: it.group,
    ref: it.ref ?? null,
    name: it.name,
    guidance: it.guidance ?? "",
    unit: it.unit ?? null,
    input: it.input ?? { type: "none" },
    score: it.score ?? null,
    evidence: it.evidence ? { required: true } : {},
    ...ownersOf(it.owner),
    feeds: it.feeds ?? null,
  }));
  return {
    pack: 1,
    edition: {
      id: "greenmetric-2026",
      ranking: "greenmetric",
      year: 2026,
      label: "UI GreenMetric 2026",
      methodology: "UI GreenMetric Sustainable University Rankings 2026 guideline (v2)",
      period: "One year: calendar 2025 or a rolling 12 months",
      status: "Active",
      scale: 10000,
      aggregate: "sum",
      options: { digits: 0 },
      sources: ["2026_Guideline_UI-GreenMetric-SUR-eng-v2.pdf", "UI_GreenMetric_Department_Responsibility_Map with Tagging for Fr Rector.docx"],
      notes: "Submissions open February–June 2026; results in September 2026. Ties break on EC, then WS+TR, then ED, then SI+WR+GD.",
      opensOn: "2026-02-01",
      closesOn: "2026-06-30",
      years: [2025, 2026],
    },
    groups,
    indicators,
  };
}
