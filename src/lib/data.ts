import { OFFICE_TEAM } from "./office";
import { DEMO_ON, demo, withDemo } from "./demo";

/*
 * The Hub's reference structure: the ranking frameworks the Office tracks (pillars, indicators, weights,
 * definitions, data sources), the dimensions they measure, the units that take part and the dictionary.
 * UST's own results, readiness, evidence and stories start empty and arrive through the Hub. Deadlines,
 * indicator owners and the calendar are defaults for the Office to confirm. Office staffing comes from the
 * September 2026 profile in office.ts.
 */

export const CYCLE = "2026–2027";
export const CYCLES = ["2026–2027", "2025–2026", "2024–2025"];
export const LATEST_EDITION = 2026;

export type FamilyKey = "THE" | "QS" | "QSS" | "UI" | "WURI";

/*
 * Ranking-family accents from the proposal: THE red, QS purple, QS Sustainability blue-green,
 * GreenMetric green, WURI orange. Lightness was tuned so every neighbouring pair stays apart for
 * colour-blind readers (validated: adjacent CVD ΔE >= 13, all >= 3:1 on white). Family colour is
 * never the only cue: it always sits beside the ranking's name.
 */
export const FAMILY: Record<FamilyKey, { name: string; color: string; soft: string; band: string }> = {
  THE: { name: "Times Higher Education", color: "#C42A2A", soft: "#FBEBEA", band: "#C42A2A" },
  QS: { name: "QS Quacquarelli Symonds", color: "#5B3DC2", soft: "#EFEBFA", band: "#5B3DC2" },
  QSS: {
    name: "QS Sustainability",
    color: "#1A8DB3",
    soft: "#E4F3F8",
    band: "linear-gradient(90deg, #0E9488 0%, #1A8DB3 55%, #2E6BD1 100%)",
  },
  UI: { name: "UI GreenMetric", color: "#1E6630", soft: "#E6F0E8", band: "#1E6630" },
  WURI: { name: "World's Universities with Real Impact", color: "#E2711D", soft: "#FCEEE3", band: "#E2711D" },
};

/** Navigation grouping from the proposal's Rankings menu. */
export const RANKING_GROUPS: { label: string; slugs: string[] }[] = [
  { label: "THE Rankings", slugs: ["the-wur", "the-impact", "the-subject"] },
  { label: "QS Rankings", slugs: ["qs-wur", "qs-sustainability", "qs-subject"] },
  { label: "UI GreenMetric", slugs: ["greenmetric"] },
  { label: "WURI", slugs: ["wuri"] },
];

/** "none": no result recorded yet. */
export type Direction = "up" | "down" | "steady" | "new" | "none";

export interface RankPoint {
  year: number;
  /** Best (lowest) rank in the band */
  hi: number | null;
  /** Worst (highest) rank in the band */
  lo: number | null;
  label: string;
}

export interface Indicator {
  name: string;
  weight: string;
  current: number | null;
  target: number | null;
  unit?: string;
  trend: "Improving" | "Stable" | "Declining" | "Critical" | "No data";
  status: EvidenceStatus;
  owner: string;
  definition: string;
  formula: string;
  history: number[];
  actions: string[];
}

export interface Ranking {
  slug: string;
  short: string;
  name: string;
  family: FamilyKey;
  current: string;
  previous: string;
  target: string;
  direction: Direction;
  readiness: number;
  deadline: string;
  pending: number;
  message: string;
  /** Executive interpretation shown first on the ranking's Overview tab. */
  interpretation: string;
  measures: string;
  emphasis: string[];
  menu: string[];
  history: RankPoint[];
  indicators: Indicator[];
  strengths: string[];
  gaps: string[];
  opportunities: string[];
  dataSources: string[];
  commonErrors: string[];
  methodologyChanges: string;
  reportingPeriod: string;
  publicNote: string;
}

export type EvidenceStatus =
  | "Validated"
  | "For review"
  | "Needs revision"
  | "Not yet submitted"
  | "Not applicable";

/** An indicator as its framework defines it; UST's values arrive with each cycle's data. */
const ind = (name: string, weight: string, owner: string, definition: string, formula: string, unit?: string): Indicator => ({
  name,
  weight,
  current: null,
  target: null,
  trend: "No data",
  status: "Not yet submitted",
  owner,
  definition,
  formula,
  history: [],
  actions: [],
  unit,
});

const BASE_RANKINGS: Ranking[] = [
  {
    slug: "the-wur",
    short: "THE WUR",
    name: "THE World University Rankings",
    family: "THE",
    current: "",
    previous: "",
    target: "",
    direction: "none",
    readiness: 0,
    deadline: "2027-03-12",
    pending: 0,
    message: "Build research and international competitiveness",
    interpretation: "",
    measures: "Teaching, research environment, research quality, industry and international outlook",
    emphasis: ["Teaching", "Research Environment", "Research Quality", "Industry", "International Outlook"],
    menu: ["THE WUR Overview", "Teaching", "Research Environment", "Research Quality", "Industry", "International Outlook", "Institutional Data", "Action Plan"],
    history: [],
    indicators: [
      ind("Teaching", "29.5%", "Office of the Vice-Rector for Academic Affairs", "Learning environment: reputation, staff-to-student ratio, doctorate-to-bachelor ratio, doctorates awarded and institutional income.", "Weighted composite of five metrics, normalised against all ranked institutions."),
      ind("Research Environment", "29%", "Office of the Vice-Rector for Research and Innovation", "Research reputation, research income and research productivity.", "Reputation survey share, income per academic staff (PPP) and papers per staff."),
      ind("Research Quality", "30%", "Research Center for the Natural and Applied Sciences", "Citation impact, research strength, research excellence and research influence.", "Field-weighted citation impact over five years of publications."),
      ind("International Outlook", "7.5%", "Office of International Relations and Programs", "International students, international staff, international co-authorship and studies without borders.", "Proportions of international students and staff, and share of internationally co-authored papers."),
      ind("Industry", "4%", "Office for Industry Linkages", "Industry income and patents citing university research.", "Research income from industry per academic staff, and patent citations."),
    ],
    strengths: [],
    gaps: [],
    opportunities: [],
    dataSources: ["THE institutional data portal (submitted by UST)", "Elsevier Scopus bibliometrics", "THE Academic Reputation Survey"],
    commonErrors: ["Staff counted by headcount instead of full-time equivalent", "Income reported in the wrong financial year", "Affiliation variants splitting UST outputs"],
    methodologyChanges: "WUR 3.0 (from the 2024 edition) added research strength, excellence and influence metrics and rebalanced the five pillars.",
    reportingPeriod: "Financial year 2025; publications 2020–2024",
    publicNote: "",
  },
  {
    slug: "the-impact",
    short: "THE Impact",
    name: "THE Impact Ratings",
    family: "THE",
    current: "",
    previous: "",
    target: "",
    direction: "none",
    readiness: 0,
    deadline: "2026-11-20",
    pending: 0,
    message: "Demonstrate mission-driven SDG impact",
    interpretation: "",
    measures: "SDG evidence across research, stewardship, outreach and teaching",
    emphasis: ["SDG 17", "Research", "Stewardship", "Outreach", "Teaching"],
    menu: ["Impact Overview", "SDG Dashboard", "SDG 17", "Research", "Stewardship", "Outreach", "Teaching", "Evidence", "Impact Stories"],
    history: [],
    indicators: [
      ind("SDG 17 Partnerships for the Goals", "22% (mandatory)", "Office of International Relations and Programs", "Relationships with other countries, best-practice sharing and publication of SDG data.", "Evidence-based scoring of policies, partnerships and SDG reporting."),
      ind("SDG 3 Good Health and Well-being", "26%", "Faculty of Medicine and Surgery", "Research on health, health outcomes of graduates, collaborations and health services.", "Bibliometric and evidence metrics, normalised."),
      ind("SDG 4 Quality Education", "26%", "College of Education", "Research on early-years and lifelong learning, proportion of graduates with teaching qualifications, lifelong learning measures.", "Bibliometric and evidence metrics, normalised."),
      ind("SDG 11 Sustainable Cities and Communities", "26%", "College of Architecture", "Research on sustainable cities, support of arts and heritage, sustainable practices.", "Bibliometric and evidence metrics, normalised."),
    ],
    strengths: [],
    gaps: [],
    opportunities: [],
    dataSources: ["THE Impact data portal (submitted by UST)", "Elsevier SDG-mapped publications", "Public evidence URLs"],
    commonErrors: ["Policy documents without approval dates", "Evidence outside the reporting year", "Links behind a login"],
    methodologyChanges: "Overall score uses SDG 17 plus the best three other SDGs; evidence must be publicly accessible where requested.",
    reportingPeriod: "Calendar year 2025",
    publicNote: "",
  },
  {
    slug: "the-subject",
    short: "THE by Subject",
    name: "THE WUR by Subject",
    family: "THE",
    current: "",
    previous: "",
    target: "",
    direction: "none",
    readiness: 0,
    deadline: "2027-03-12",
    pending: 0,
    message: "Scale disciplinary strengths",
    interpretation: "",
    measures: "Discipline portfolio, ranking thresholds and field-specific development",
    emphasis: ["Global anchors", "Emerging strengths", "Development priorities", "Monitor"],
    menu: ["Subject Portfolio", "Education Studies", "Medical and Health", "Life Sciences", "Social Sciences", "Emerging Subjects", "Comparative Analysis", "Development Plans"],
    history: [],
    indicators: [
      ind("Education: Research Quality", "27.5%", "College of Education", "Citation impact and research excellence within Education.", "Subject-normalised citation metrics."),
      ind("Medical and Health: Teaching", "28.5%", "Faculty of Medicine and Surgery", "Teaching reputation and learning environment for Medical and Health.", "Subject-weighted teaching pillar."),
      ind("Life Sciences: Output threshold", "Eligibility", "College of Science", "Minimum publication volume for a subject to be ranked.", "Papers in the subject over five years versus the THE threshold.", "% of threshold"),
    ],
    strengths: [],
    gaps: [],
    opportunities: [],
    dataSources: ["THE institutional data (subject splits)", "Scopus subject classification"],
    commonErrors: ["Staff assigned to the wrong subject", "Unmapped interdisciplinary outputs"],
    methodologyChanges: "Subject tables follow the WUR 3.0 pillars with subject-specific weights.",
    reportingPeriod: "Financial year 2025; publications 2020–2024",
    publicNote: "",
  },
  {
    slug: "qs-wur",
    short: "QS WUR",
    name: "QS World University Rankings",
    family: "QS",
    current: "",
    previous: "",
    target: "",
    direction: "none",
    readiness: 0,
    deadline: "2027-01-30",
    pending: 0,
    message: "Strengthen research influence while sustaining reputation",
    interpretation: "",
    measures: "Reputation, citations, employability and internationalization",
    emphasis: ["Academic Reputation", "Employer Reputation", "Citations per Faculty", "Faculty–Student Ratio", "Employment Outcomes", "International Faculty and Students", "International Research Network", "Sustainability"],
    menu: ["QS WUR Overview", "Academic Reputation", "Employer Reputation", "Research and Citations", "Faculty and Students", "Employment Outcomes", "Internationalization", "Sustainability", "Action Plan"],
    history: [],
    indicators: [
      ind("Academic Reputation", "30%", "Office of the Rector", "Survey of academics on the institutions producing the best work in their field.", "Weighted survey responses over five years."),
      ind("Employer Reputation", "15%", "Office for Career Services", "Survey of employers on the institutions producing the best graduates.", "Weighted survey responses over five years."),
      ind("Citations per Faculty", "20%", "Research Center for the Natural and Applied Sciences", "Citations to papers published by the institution, divided by faculty count.", "Five-year citations (excluding self-citations) ÷ faculty FTE, normalised by field."),
      ind("Faculty–Student Ratio", "10%", "Human Resource Department", "Academic staff per student, a proxy for teaching capacity.", "Faculty FTE ÷ student FTE, normalised."),
      ind("Employment Outcomes", "5%", "Office for Career Services", "Graduate employment rate and alumni impact.", "Employment rate and alumni outcomes index."),
      ind("International Faculty Ratio", "5%", "Human Resource Department", "Share of faculty who are international.", "International faculty FTE ÷ total faculty FTE."),
      ind("International Student Ratio", "5%", "Office of International Relations and Programs", "Share of students who are international.", "International students ÷ total students."),
      ind("International Research Network", "5%", "Office of the Vice-Rector for Research and Innovation", "Diversity of international research partnerships.", "Inclusiveness index over sustained co-authoring partner institutions."),
      ind("Sustainability", "5%", "Office for Sustainability", "Social and environmental impact, drawn from QS Sustainability.", "Score inherited from QS Sustainability."),
    ],
    strengths: [],
    gaps: [],
    opportunities: [],
    dataSources: ["QS Hub institutional data (submitted by UST)", "Elsevier Scopus", "QS Academic and Employer surveys"],
    commonErrors: ["Faculty FTE counting researchers without teaching duties", "Out-of-date employer contact lists", "Student counts from the wrong census date"],
    methodologyChanges: "From the 2024 edition: Employment Outcomes, International Research Network and Sustainability added; Academic Reputation and Faculty–Student Ratio weights reduced.",
    reportingPeriod: "Academic year 2025–2026; citations 2020–2025",
    publicNote: "",
  },
  {
    slug: "qs-sustainability",
    short: "QS Sustainability",
    name: "QS Sustainability Rankings",
    family: "QSS",
    current: "",
    previous: "",
    target: "",
    direction: "none",
    readiness: 0,
    deadline: "2027-02-15",
    pending: 0,
    message: "Convert sustainability momentum into measurable outcomes",
    interpretation: "",
    measures: "Environmental impact, social impact and governance",
    emphasis: ["Environmental Impact", "Social Impact", "Governance"],
    menu: ["Sustainability Overview", "Environmental Impact", "Social Impact", "Governance", "Research", "Education", "Operations", "Evidence and Policies"],
    history: [],
    indicators: [
      ind("Environmental Impact", "45%", "Facilities Management Office", "Environmental sustainability, education and research.", "Sub-lenses on operations, environmental education and research."),
      ind("Social Impact", "45%", "Office for Community Development (SIMBAHAYAN)", "Equality, knowledge exchange, educational impact, employability and health and wellbeing.", "Sub-lenses scored from data and public evidence."),
      ind("Governance", "10%", "Office of the Secretary General", "Good governance, ethics, transparency and student representation.", "Evidence of policies and governance practices."),
    ],
    strengths: [],
    gaps: [],
    opportunities: [],
    dataSources: ["QS Hub sustainability survey", "Scopus sustainability research", "Public policy documents"],
    commonErrors: ["Emissions without a stated method", "Policies with no approval date"],
    methodologyChanges: "Three categories: Environmental Impact, Social Impact and Governance, with Governance at 10%.",
    reportingPeriod: "Calendar year 2025",
    publicNote: "",
  },
  {
    slug: "qs-subject",
    short: "QS by Subject",
    name: "QS WUR by Subject",
    family: "QS",
    current: "",
    previous: "",
    target: "",
    direction: "none",
    readiness: 0,
    deadline: "2027-01-30",
    pending: 0,
    message: "Develop globally competitive disciplines",
    interpretation: "",
    measures: "Academic and employer reputation, citations, H-index and international research network by subject",
    emphasis: ["Academic Reputation", "Employer Reputation", "Citations", "H-index", "International Research Network"],
    menu: ["Subject Portfolio", "Medicine", "Modern Languages", "Candidate Subjects", "Reputation", "Research Performance", "International Networks", "Development Plans"],
    history: [],
    indicators: [
      ind("Medicine: Academic Reputation", "40%", "Faculty of Medicine and Surgery", "Reputation among academics in medicine.", "Survey responses, subject-weighted."),
      ind("Medicine: Citations per paper", "15%", "Faculty of Medicine and Surgery", "Average citations per paper in medicine.", "Five-year citations ÷ papers."),
      ind("Medicine: H-index", "15%", "Research Center for the Natural and Applied Sciences", "Productivity and impact of published work in the subject.", "Subject H-index, normalised."),
      ind("Pharmacy: distance to threshold", "Eligibility", "Faculty of Pharmacy", "Progress toward the papers and reputation thresholds for ranking.", "Current output ÷ QS threshold.", "% of threshold"),
    ],
    strengths: [],
    gaps: [],
    opportunities: [],
    dataSources: ["QS Academic and Employer surveys", "Scopus subject data"],
    commonErrors: ["Outputs not mapped to the right subject area"],
    methodologyChanges: "Five indicators with subject-specific weights; International Research Network added in recent editions.",
    reportingPeriod: "Publications 2020–2025",
    publicNote: "",
  },
  {
    slug: "greenmetric",
    short: "UI GreenMetric",
    name: "UI GreenMetric World University Rankings",
    family: "UI",
    current: "",
    previous: "",
    target: "",
    direction: "none",
    readiness: 0,
    deadline: "2026-10-31",
    pending: 0,
    message: "Improve measurable campus sustainability",
    interpretation: "",
    measures: "Campus operations across energy, waste, water and transportation",
    emphasis: ["Setting and Infrastructure", "Energy and Climate Change", "Waste", "Water", "Transportation", "Education and Research"],
    menu: ["GreenMetric Overview", "Setting and Infrastructure", "Energy and Climate Change", "Waste", "Water", "Transportation", "Education and Research", "Campus Sustainability Map"],
    history: [],
    indicators: [
      ind("Setting and Infrastructure", "15%", "Facilities Management Office", "Campus area, open and green space, and sustainability budget.", "Ratios of green and forested area to campus area, plus budget share.", "% of category"),
      ind("Energy and Climate Change", "21%", "Facilities Management Office", "Energy-efficient appliances, renewable energy, electricity use and carbon footprint.", "Per-capita electricity, renewable share and emissions programmes.", "% of category"),
      ind("Waste", "18%", "Facilities Management Office", "Recycling, toxic waste handling, organic and inorganic waste treatment, sewage disposal.", "Programme coverage and treated waste share.", "% of category"),
      ind("Water", "10%", "Facilities Management Office", "Water conservation, recycling, efficient appliances and treated water consumed.", "Programme implementation and recycled water share.", "% of category"),
      ind("Transportation", "18%", "Office of the Secretary General", "Vehicles, shuttle services, zero-emission vehicle policy, parking and pedestrian paths.", "Ratios of vehicles to campus population and policy coverage.", "% of category"),
      ind("Education and Research", "18%", "Office of the Vice-Rector for Research and Innovation", "Sustainability courses, research funding, publications, events and student organisations.", "Ratios of sustainability courses and research to totals.", "% of category"),
    ],
    strengths: [],
    gaps: [],
    opportunities: [],
    dataSources: ["UI GreenMetric questionnaire (submitted by UST)", "Facilities records", "Public evidence"],
    commonErrors: ["Mixed units (litres and cubic metres)", "Campus area excluding off-site campuses"],
    methodologyChanges: "Six categories; evidence uploads required for most indicators.",
    reportingPeriod: "Calendar year 2025",
    publicNote: "",
  },
  {
    slug: "wuri",
    short: "WURI",
    name: "World's Universities with Real Impact",
    family: "WURI",
    current: "",
    previous: "",
    target: "",
    direction: "none",
    readiness: 0,
    deadline: "2027-01-12",
    pending: 0,
    message: "Discover and scale Thomasian innovation",
    interpretation: "",
    measures: "Innovation pipeline, category fit, impact and scalability",
    emphasis: ["Industrial Application", "Value Creation", "Social Responsibility", "Student Mobility and Openness"],
    menu: ["WURI Overview", "Innovation Pipeline", "WURI Categories", "Submitted Projects", "Recognized Innovations", "Impact and Scalability", "Mentorship and Engagement", "Submit an Innovation"],
    history: [],
    indicators: [
      ind("Industrial Application", "Dimension", "Office for Industry Linkages", "Innovations applied with industry partners.", "Panel evaluation of submitted programmes."),
      ind("Value Creation", "Dimension", "Office of the Vice-Rector for Research and Innovation", "Entrepreneurship, ethics and new value created.", "Panel evaluation of submitted programmes."),
      ind("Social Responsibility", "Dimension", "Office for Community Development (SIMBAHAYAN)", "Programmes serving communities and the common good.", "Panel evaluation of submitted programmes."),
      ind("Student Mobility and Openness", "Dimension", "Office of International Relations and Programs", "Openness, mobility and global engagement of students.", "Panel evaluation of submitted programmes."),
    ],
    strengths: [],
    gaps: [],
    opportunities: [],
    dataSources: ["WURI submission dossier", "Programme evidence and outcome data"],
    commonErrors: ["Describing activities rather than outcomes", "No evidence of replication elsewhere"],
    methodologyChanges: "Programmes are evaluated by category within four dimensions.",
    reportingPeriod: "Programmes active 2024–2026",
    publicNote: "",
  },
];

export const RANKINGS: Ranking[] = BASE_RANKINGS.map(withDemo);

export const rankingBySlug = (slug: string) => RANKINGS.find((r) => r.slug === slug);

/* Dimensions measured by each ranking (Rankings Overview matrix). */
export const DIMENSIONS = [
  "Research",
  "Teaching and learning",
  "Reputation",
  "Employability",
  "Internationalization",
  "Sustainability",
  "Social impact",
  "Innovation",
  "Campus operations",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const MATRIX: Record<string, Dimension[]> = {
  "qs-wur": ["Research", "Teaching and learning", "Reputation", "Employability", "Internationalization", "Sustainability"],
  "the-wur": ["Research", "Teaching and learning", "Reputation", "Internationalization", "Innovation"],
  "the-impact": ["Research", "Teaching and learning", "Sustainability", "Social impact", "Innovation", "Campus operations"],
  "qs-sustainability": ["Research", "Employability", "Sustainability", "Social impact", "Campus operations"],
  greenmetric: ["Research", "Teaching and learning", "Sustainability", "Innovation", "Campus operations"],
  wuri: ["Research", "Internationalization", "Sustainability", "Social impact", "Innovation"],
  "the-subject": ["Research", "Teaching and learning", "Reputation", "Internationalization"],
  "qs-subject": ["Research", "Reputation", "Employability", "Internationalization"],
};

export const DIMENSION_NOTES: Record<Dimension, string> = {
  Research: "Publications, citations and research income feed every framework, so one clean research record serves all eight.",
  "Teaching and learning": "Staff ratios, doctorates and sustainability courses count in THE, QS, THE Impact and GreenMetric.",
  Reputation: "Academic and employer surveys carry the most weight in QS and THE, overall and by subject.",
  Employability: "Graduate outcomes count in QS overall, QS by Subject and the social side of QS Sustainability.",
  Internationalization: "International staff, students and co-authorship count in five frameworks.",
  Sustainability: "Environmental and social evidence is shared between THE Impact, QS Sustainability, GreenMetric and WURI.",
  "Social impact": "Community outcomes support THE Impact SDGs, QS Sustainability and WURI social responsibility.",
  Innovation: "Industry income, patents and new programmes count in THE, THE Impact, GreenMetric and WURI.",
  "Campus operations": "Energy, water, waste and transport data serve GreenMetric, QS Sustainability and THE Impact.",
};

/* Executive dashboard dimension performance (0–100 index), once the Office scores each dimension. */
export const DIMENSION_SCORES: { dimension: Dimension; current: number; target: number }[] = DEMO_ON ? demo.dimensionScores : [];

/* Units */
export type UnitKind = "Faculty or college" | "Research centre" | "Office";
export interface Unit {
  slug: string;
  name: string;
  kind: UnitKind;
  coordinator: string;
  assigned: number;
  completed: number;
  validated: number;
  revisions: number;
  rankingsServed: number;
  assistance: boolean;
}

export const UNITS: Unit[] = [
  { slug: "engineering", name: "Faculty of Engineering", kind: "Faculty or college", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "medicine", name: "Faculty of Medicine and Surgery", kind: "Faculty or college", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "science", name: "College of Science", kind: "Faculty or college", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "education", name: "College of Education", kind: "Faculty or college", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "pharmacy", name: "Faculty of Pharmacy", kind: "Faculty or college", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "architecture", name: "College of Architecture", kind: "Faculty or college", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "nursing", name: "College of Nursing", kind: "Faculty or college", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "arts-letters", name: "Faculty of Arts and Letters", kind: "Faculty or college", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "cics", name: "College of Information and Computing Sciences", kind: "Faculty or college", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "rcnas", name: "Research Center for the Natural and Applied Sciences", kind: "Research centre", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "rcsse", name: "Research Center for Social Sciences and Education", kind: "Research centre", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "rccah", name: "Research Center for Culture, Arts and Humanities", kind: "Research centre", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "fmo", name: "Facilities Management Office", kind: "Office", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "oirp", name: "Office of International Relations and Programs", kind: "Office", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "simbahayan", name: "Office for Community Development (SIMBAHAYAN)", kind: "Office", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "hrd", name: "Human Resource Department", kind: "Office", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "library", name: "Miguel de Benavides Library", kind: "Office", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
  { slug: "careers", name: "Office for Career Services", kind: "Office", coordinator: "", assigned: 0, completed: 0, validated: 0, revisions: 0, rankingsServed: 0, assistance: false },
];

/* Required actions (Action center) */
export interface ActionItem {
  id: string;
  action: string;
  ranking: string;
  unit: string;
  due: string;
  status: EvidenceStatus | "Not started";
}

export const ACTIONS: ActionItem[] = DEMO_ON ? demo.actions : [];

/* Evidence items (shared by validation queue and faculty portal) */
export interface EvidenceItem {
  id: string;
  title: string;
  unit: string;
  unitSlug: string;
  type: string;
  period: string;
  submitted: string;
  submittedBy: string;
  status: EvidenceStatus;
  stage: number; // 0 Received … 5 Result achieved
  /** Rung on the impact evidence ladder, 1 Activity documented … 5 Long-term impact established. */
  level: 1 | 2 | 3 | 4 | 5;
  mappedTo: string[];
  sdgs: number[];
  summary: string;
  result: string;
  beneficiaries: string;
  files: string[];
  comments: { by: string; role: string; date: string; text: string }[];
}

export const STAGES = ["Received", "Under review", "Accepted", "Included in final submission", "Result achieved"] as const;

export const EVIDENCE: EvidenceItem[] = DEMO_ON ? demo.evidence : [];

/* Engineering portal requirements */
export interface Requirement {
  id: string;
  title: string;
  ranking: string;
  indicator: string;
  due: string;
  status: EvidenceStatus;
  template: string;
  evidenceId?: string;
}

export const ENGINEERING_REQUIREMENTS: Requirement[] = DEMO_ON ? demo.requirements : [];

/* Impact stories arrive through the Hub's proposal workflow. Each follows the proposal's showcase format:
   challenge → Thomasian response → implementation → measurable outcome → beneficiaries →
   SDG/ranking alignment → replication guidance. Only "Published" stories reach the public view. */
export const IMPACT_THEMES = [
  "SDG Stories",
  "Research Impact",
  "Community Transformation",
  "Campus Sustainability",
  "Thomasian Innovations",
  "International Partnerships",
  "Replicable Practices",
] as const;
export type ImpactTheme = (typeof IMPACT_THEMES)[number];

export interface Story {
  slug: string;
  title: string;
  unit: string;
  kind: "SDG story" | "Innovation" | "Campus sustainability" | "Research" | "Partnership";
  state: "Published" | "In review" | "Draft";
  year: number;
  themes: ImpactTheme[];
  sdgs: number[];
  rankings: string[];
  challenge: string;
  response: string;
  implementation: string;
  beneficiaries: string;
  outcome: string;
  outcomeFigure: string;
  outcomeLabel: string;
  evidence: string;
  replication: string;
  lessons: string;
  images: string[];
  /** When it reached the public website. */
  postedAt?: string;
  /** Set for stories written as posts in the Office's composer: their own text and pictures. */
  post?: StoryPost;
}

/** A picture in a post: an upload served from /media/…, or one of the Hub's own photographs. Size 0 when unknown. */
export interface StoryPicture {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface StoryPost {
  id: string;
  subtitle: string;
  /** The editor's rich text (lib/rich-text.ts), or plain text where a blank line starts a paragraph. */
  body: string;
  /** Without the #. */
  hashtags: string[];
  layout: "cover" | "feature" | "split" | "essay" | "banner" | "gallery" | "magazine" | "alternate";
  thumbnail: StoryPicture | null;
  photos: StoryPicture[];
}

export const STORIES: Story[] = DEMO_ON ? demo.stories : [];

export const storyBySlug = (slug: string) => STORIES.find((s) => s.slug === slug);
export const PUBLISHED_STORIES = STORIES.filter((s) => s.state === "Published");


export const SDG_COLORS: Record<number, string> = {
  1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21", 6: "#26BDE2",
  7: "#FCC30B", 8: "#A21942", 9: "#FD6925", 10: "#DD1367", 11: "#FD9D24", 12: "#BF8B2E",
  13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B", 16: "#00689D", 17: "#19486A",
};

export const SDG_NAMES: Record<number, string> = {
  1: "No Poverty", 2: "Zero Hunger", 3: "Good Health and Well-being", 4: "Quality Education",
  5: "Gender Equality", 6: "Clean Water and Sanitation", 7: "Affordable and Clean Energy",
  8: "Decent Work and Economic Growth", 9: "Industry, Innovation and Infrastructure",
  10: "Reduced Inequalities", 11: "Sustainable Cities and Communities",
  12: "Responsible Consumption and Production", 13: "Climate Action", 14: "Life Below Water",
  15: "Life on Land", 16: "Peace, Justice and Strong Institutions", 17: "Partnerships for the Goals",
};

/* SDG tiles (THE Impact): every goal at zero until its evidence arrives. */
export const SDG_TILES = Array.from({ length: 17 }, (_, i) => ({
  sdg: i + 1,
  readiness: 0,
  submitted: 0,
  validated: 0,
  units: 0,
  outputs: 0,
  policies: 0,
  beneficiaries: "To be documented",
  outcomes: 0,
  submittedForRating: false,
})).map((t) => (DEMO_ON ? demo.sdgTile(t) : t));

export const IMPACT_LADDER = [
  { step: "Activity documented", count: 0 },
  { step: "Output measured", count: 0 },
  { step: "Outcome demonstrated", count: 0 },
  { step: "Beneficiary change verified", count: 0 },
  { step: "Long-term impact established", count: 0 },
].map((l, i) => (DEMO_ON ? { ...l, count: demo.ladder[i] } : l));

export const PIPELINE = [
  { step: "Identify contribution", count: 0 },
  { step: "Submit evidence", count: 0 },
  { step: "Validate data", count: 0 },
  { step: "Map to indicators", count: 0 },
  { step: "Include in submission", count: 0 },
  { step: "Measure result and impact", count: 0 },
].map((l, i) => (DEMO_ON ? { ...l, count: demo.pipeline[i] } : l));

export const WURI_PIPELINE = [
  { step: "Ideas identified", count: 0 },
  { step: "Screened", count: 0 },
  { step: "Developed", count: 0 },
  { step: "Evidence strengthened", count: 0 },
  { step: "Submitted", count: 0 },
  { step: "Recognized", count: 0 },
  { step: "Replicated", count: 0 },
].map((l, i) => (DEMO_ON ? { ...l, count: demo.wuriPipeline[i] } : l));

/* WURI's categories, which units propose innovations under. */
export const WURI_CATEGORIES = [
  "Entrepreneurial Spirit", "Ethical Value", "Crisis Management", "Student Support and Engagement",
  "Leadership", "Social Responsibility", "Industrial Application", "Value Creation",
  "Culture", "Openness", "Global Collaboration", "Student Mobility",
];

/** The WURI categories where UST placed in the Top 100, from the official result letter. */
export const WURI_PLACEMENTS: string[] = DEMO_ON ? demo.wuriPlacements : [];

/* Broad subject areas carry the discipline colours on subject pages (validated categorical slots,
   always shown with the subject's name). */
export const SUBJECT_AREAS = {
  "Life sciences and medicine": "#1BAF7A",
  "Natural sciences": "#2A78D6",
  "Engineering and technology": "#EB6834",
  "Social sciences and management": "#EDA100",
  "Arts and humanities": "#E87BA4",
} as const;
export type SubjectArea = keyof typeof SUBJECT_AREAS;

export type Quadrant = "Global anchors" | "Emerging strengths" | "Development priorities" | "Monitor";
export const QUADRANT_NOTES: Record<Quadrant, string> = {
  "Global anchors": "Already internationally ranked and competitive",
  "Emerging strengths": "Near or recently entering a ranking threshold",
  "Development priorities": "Has potential but needs targeted intervention",
  Monitor: "Insufficient current evidence or output",
};

export const SUBJECT_PORTFOLIO: { quadrant: Quadrant; subjects: { name: string; note: string; area: SubjectArea }[] }[] = (
  ["Global anchors", "Emerging strengths", "Development priorities", "Monitor"] as Quadrant[]
).map((quadrant) => ({ quadrant, subjects: DEMO_ON ? demo.subjects[quadrant] : [] }));

export const GREENMETRIC_PANELS = [
  { name: "Setting and Infrastructure", metrics: [["Green-space share", "—", "—"], ["Sustainability budget", "—", "—"]] },
  { name: "Energy and Climate Change", metrics: [["Electricity per person", "—", "—"], ["Renewable share", "—", "—"]] },
  { name: "Waste", metrics: [["Waste treated", "—", "—"], ["Recycling programme", "—", "—"]] },
  { name: "Water", metrics: [["Water recycled", "—", "—"], ["Efficient fixtures", "—", "—"]] },
  { name: "Transportation", metrics: [["Zero-emission vehicles", "—", "—"], ["Pedestrian path share", "—", "—"]] },
  { name: "Education and Research", metrics: [["Sustainability courses", "—", "—"], ["Sustainability publications", "—", "—"]] },
].map((p, i) => (DEMO_ON ? { ...p, metrics: demo.greenmetric[i] } : p));

export const QSS_PILLARS = [
  { name: "Environmental Impact", weight: "45%", lenses: ["Environmental sustainability", "Environmental education", "Environmental research"], offices: ["Facilities Management Office", "Office for Sustainability"], policies: 0, outcomes: 0, status: "Not yet submitted" as EvidenceStatus },
  { name: "Social Impact", weight: "45%", lenses: ["Equality", "Knowledge exchange", "Impact of education", "Employability and outcomes", "Health and wellbeing"], offices: ["SIMBAHAYAN", "Office for Career Services", "UST Hospital"], policies: 0, outcomes: 0, status: "Not yet submitted" as EvidenceStatus },
  { name: "Governance", weight: "10%", lenses: ["Good governance"], offices: ["Office of the Secretary General"], policies: 0, outcomes: 0, status: "Not yet submitted" as EvidenceStatus },
].map((p, i) => (DEMO_ON ? { ...p, policies: demo.qss[i][0], outcomes: demo.qss[i][1], status: demo.qss[i][2] } : p));

export const RESEARCH_FUNNEL = [
  { step: "Research capacity", value: "—", note: "faculty with research load" },
  { step: "Publications", value: "—", note: "outputs in 2025" },
  { step: "Indexed outputs", value: "—", note: "in Scopus" },
  { step: "International collaboration", value: "—", note: "co-authored abroad" },
  { step: "Citations", value: "—", note: "citations per faculty score" },
  { step: "QS impact", value: "—", note: "of the overall weight" },
].map((f, i) => (DEMO_ON ? { ...f, value: demo.funnel[i] } : f));

/** Awards the Office gives units for their contribution in a cycle. */
export const RECOGNITION: { award: string; unit: string; reason: string }[] = DEMO_ON ? demo.recognition : [];

export const CALENDAR = [
  { month: "Oct", items: ["UI GreenMetric questionnaire closes 31 Oct"] },
  { month: "Nov", items: ["THE Impact data collection closes 20 Nov"] },
  { month: "Dec", items: ["QS employer and academic lists due 15 Dec"] },
  { month: "Jan", items: ["WURI dossier due 12 Jan", "QS Hub data submission closes 30 Jan"] },
  { month: "Feb", items: ["QS Sustainability survey closes 15 Feb"] },
  { month: "Mar", items: ["THE WUR and subject data closes 12 Mar"] },
];

export interface DictionaryEntry {
  term: string;
  definition: string;
  links: { ranking: string; indicator: string }[];
}

export const DICTIONARY: DictionaryEntry[] = [
  { term: "Citations", definition: "Times other publications cite UST outputs, usually over five years and normalised by field.", links: [{ ranking: "QS WUR", indicator: "Citations per Faculty" }, { ranking: "QS by Subject", indicator: "Citations per paper" }, { ranking: "THE WUR", indicator: "Research Quality: citation impact" }, { ranking: "THE by Subject", indicator: "Research Quality" }, { ranking: "QS Sustainability", indicator: "Environmental research" }, { ranking: "WURI", indicator: "Evidence of impact" }] },
  { term: "H-index", definition: "The largest number h of papers that each have at least h citations.", links: [{ ranking: "QS by Subject", indicator: "H-index" }] },
  { term: "Faculty FTE", definition: "Full-time equivalent academic staff; part-time staff count as fractions.", links: [{ ranking: "QS WUR", indicator: "Faculty–Student Ratio, Citations per Faculty" }, { ranking: "THE WUR", indicator: "Teaching: staff-to-student ratio" }] },
  { term: "International co-authorship", definition: "Share of publications with at least one author at an institution in another country.", links: [{ ranking: "THE WUR", indicator: "International Outlook" }, { ranking: "QS WUR", indicator: "International Research Network" }, { ranking: "THE Impact", indicator: "SDG 17" }] },
  { term: "Employer reputation", definition: "Survey of employers naming institutions that produce excellent graduates.", links: [{ ranking: "QS WUR", indicator: "Employer Reputation" }, { ranking: "QS by Subject", indicator: "Employer Reputation" }] },
  { term: "Research income", definition: "External research funding received in the financial year, converted at purchasing-power parity.", links: [{ ranking: "THE WUR", indicator: "Research Environment" }, { ranking: "THE WUR", indicator: "Industry" }] },
  { term: "Water recycled", definition: "Volume of treated or harvested water reused on campus in the reporting year.", links: [{ ranking: "UI GreenMetric", indicator: "Water" }, { ranking: "QS Sustainability", indicator: "Environmental sustainability" }, { ranking: "THE Impact", indicator: "SDG 6" }] },
  { term: "Carbon emissions", definition: "Scope 1 and 2 greenhouse-gas emissions in tonnes of CO₂ equivalent.", links: [{ ranking: "UI GreenMetric", indicator: "Energy and Climate Change" }, { ranking: "QS Sustainability", indicator: "Environmental sustainability" }, { ranking: "THE Impact", indicator: "SDG 13" }] },
  { term: "Beneficiaries", definition: "People or communities whose situation changed because of a programme, with how the change was verified.", links: [{ ranking: "THE Impact", indicator: "Outreach metrics" }, { ranking: "QS Sustainability", indicator: "Social Impact" }, { ranking: "WURI", indicator: "Social Responsibility" }] },
  { term: "Public evidence URL", definition: "A link anyone can open without signing in, pointing to the approved document.", links: [{ ranking: "THE Impact", indicator: "All evidence-based metrics" }, { ranking: "QS Sustainability", indicator: "Governance" }] },
  { term: "Graduate employment", definition: "Share of graduates employed or in further study within a set period after graduation.", links: [{ ranking: "QS WUR", indicator: "Employment Outcomes" }, { ranking: "QS Sustainability", indicator: "Employability and outcomes" }] },
  { term: "Innovation programme", definition: "A programme or practice with documented novelty, outcomes and potential to scale.", links: [{ ranking: "WURI", indicator: "All categories" }, { ranking: "THE WUR", indicator: "Industry: patents" }] },
];

export const REPORT_TYPES = [
  { name: "Executive summary", note: "Positions, readiness and top risks on two pages." },
  { name: "Management Review report", note: "Quarterly review with action-plan progress." },
  { name: "Indicator report", note: "Every indicator with value, target, trend and owner." },
  { name: "Unit compliance report", note: "Assignments, completion and revisions by unit." },
  { name: "Evidence gap report", note: "Missing and revision-required evidence by deadline." },
  { name: "Historical performance report", note: "Five-year trajectory for each ranking." },
];

export type PlanStatus = "On track" | "At risk" | "Not started" | "Complete";
export const ACTION_PLAN: { action: string; kpi: string; owner: string; timeline: string; progress: number; status: PlanStatus }[] = DEMO_ON ? demo.plan : [];

/** Peer positions beside UST's in QS WUR, for the comparison panel. */
export const COMPARISON: { name: string; value: string; own: boolean }[] = DEMO_ON ? demo.comparison : [];

export const NOTIFICATIONS: { text: string; when: string; href: string }[] = DEMO_ON ? demo.notifications : [];

export const UNIT_NOTIFICATIONS: { text: string; when: string; href: string }[] = DEMO_ON ? demo.unitNotifications : [];

export function daysUntil(iso: string, from = new Date().toISOString().slice(0, 10)) {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(iso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

/** "15 October 2026": the date the Hub's figures are current as of (System Configuration, site.asOf). */
export const formatAsOf = (iso: string) => formatDate(iso, { day: "numeric", month: "long", year: "numeric" });

export const nearestDeadline = () =>
  [...RANKINGS].sort((a, b) => a.deadline.localeCompare(b.deadline))[0];

/** Readable text colour on a coloured fill (WCAG relative luminance). */
export function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.179 ? "#15130F" : "#FFFFFF";
}

export const unitBySlug = (slug: string) => UNITS.find((u) => u.slug === slug);
export const unitByName = (name: string) => UNITS.find((u) => u.name === name);

/** Readiness wording follows "progress, not pressure": no unit or ranking is called failing. */
export function readinessLevel(pct: number): { label: string; tone: "ok" | "revise" | "missing" } {
  if (pct >= 85) return { label: "Ready", tone: "ok" };
  if (pct >= 70) return { label: "On track", tone: "ok" };
  if (pct >= 60) return { label: "Needs attention", tone: "revise" };
  return { label: "Early stage", tone: "missing" };
}

export const EVIDENCE_LEVELS = IMPACT_LADDER.map((l) => l.step);

/** Named roles from the office profile dated 19 September 2026. */
export const TEAM = OFFICE_TEAM;

export const rankingsInGroup = (label: string) =>
  (RANKING_GROUPS.find((g) => g.label === label)?.slugs ?? []).map((s) => rankingBySlug(s)!).filter(Boolean);

export const groupOf = (slug: string) => RANKING_GROUPS.find((g) => g.slugs.includes(slug))?.label ?? "Rankings";
