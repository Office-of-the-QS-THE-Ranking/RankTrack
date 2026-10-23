import { OFFICE_TEAM } from "./office";

/*
 * Single source of truth for the prototype.
 *
 * Figures marked `source: "proposal"` come from the Office's design proposal
 * (current positions, THE Impact movement, WURI Top 100 placements, readiness,
 * units engaged, actions required). Office staffing comes from the supplied
 * September 2026 profile in office.ts. Other unspecified records are sample data so the
 * screens can be reviewed at full density; replace it from the admin interface
 * before launch.
 */

export const AS_OF = "2026-10-15";
export const AS_OF_LABEL = "15 October 2026";
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

export type Direction = "up" | "down" | "steady" | "new";

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
  trend: "Improving" | "Stable" | "Declining" | "Critical";
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

const ind = (
  name: string,
  weight: string,
  current: number | null,
  target: number | null,
  trend: Indicator["trend"],
  status: EvidenceStatus,
  owner: string,
  definition: string,
  formula: string,
  history: number[],
  actions: string[],
  unit?: string,
): Indicator => ({ name, weight, current, target, trend, status, owner, definition, formula, history, actions, unit });

export const RANKINGS: Ranking[] = [
  {
    slug: "the-wur",
    short: "THE WUR",
    name: "THE World University Rankings",
    family: "THE",
    current: "1501+",
    previous: "1501+",
    target: "1201–1500",
    direction: "steady",
    readiness: 68,
    deadline: "2027-03-12",
    pending: 22,
    message: "Build research and international competitiveness",
    interpretation:
      "UST holds the 1501+ band. Research Quality has risen for four cycles, but low research income per academic and limited doctoral capacity keep the Research Environment and Teaching pillars short of the next band. Consolidating income reporting and growing internationally co-authored output are the two levers most likely to move the result.",
    measures: "Teaching, research environment, research quality, industry and international outlook",
    emphasis: ["Teaching", "Research Environment", "Research Quality", "Industry", "International Outlook"],
    menu: ["THE WUR Overview", "Teaching", "Research Environment", "Research Quality", "Industry", "International Outlook", "Institutional Data", "Action Plan"],
    history: [
      { year: 2022, hi: null, lo: null, label: "Not ranked" },
      { year: 2023, hi: 1501, lo: 1800, label: "1501+" },
      { year: 2024, hi: 1501, lo: 1800, label: "1501+" },
      { year: 2025, hi: 1501, lo: 1800, label: "1501+" },
      { year: 2026, hi: 1501, lo: 1800, label: "1501+" },
    ],
    indicators: [
      ind("Teaching", "29.5%", 18.4, 22.0, "Improving", "For review", "Office of the Vice-Rector for Academic Affairs", "Learning environment: reputation, staff-to-student ratio, doctorate-to-bachelor ratio, doctorates awarded and institutional income.", "Weighted composite of five metrics, normalised against all ranked institutions.", [15.1, 16.0, 17.2, 18.4], ["Confirm 2026 reporting value for doctorates awarded", "Reconcile staff headcount with HR records"]),
      ind("Research Environment", "29%", 9.8, 13.0, "Stable", "For review", "Office of the Vice-Rector for Research and Innovation", "Research reputation, research income and research productivity.", "Reputation survey share, income per academic staff (PPP) and papers per staff.", [9.1, 9.6, 9.9, 9.8], ["Submit research income ledger for 2025", "Map external grants to faculties"]),
      ind("Research Quality", "30%", 21.3, 26.0, "Improving", "Validated", "Research Center for the Natural and Applied Sciences", "Citation impact, research strength, research excellence and research influence.", "Field-weighted citation impact over five years of publications.", [17.6, 18.9, 20.2, 21.3], ["Increase share of outputs in indexed journals", "Clean author affiliation strings"]),
      ind("International Outlook", "7.5%", 34.2, 38.0, "Improving", "Validated", "Office of International Relations and Programs", "International students, international staff, international co-authorship and studies without borders.", "Proportions of international students and staff, and share of internationally co-authored papers.", [29.0, 30.8, 32.6, 34.2], ["Add co-authorship evidence for 2025"]),
      ind("Industry", "4%", 31.0, 36.0, "Stable", "Needs revision", "Office for Industry Linkages", "Industry income and patents citing university research.", "Research income from industry per academic staff, and patent citations.", [30.2, 31.4, 30.8, 31.0], ["Correct document reporting period for industry contracts"]),
    ],
    strengths: ["Steady growth in Research Quality over four cycles", "International Outlook above the Philippine median"],
    gaps: ["Research income per staff remains low", "Doctoral capacity limits the Teaching pillar"],
    opportunities: ["Consolidate research income reporting across faculties", "Grow internationally co-authored output through existing partnerships"],
    dataSources: ["THE institutional data portal (submitted by UST)", "Elsevier Scopus bibliometrics", "THE Academic Reputation Survey"],
    commonErrors: ["Staff counted by headcount instead of full-time equivalent", "Income reported in the wrong financial year", "Affiliation variants splitting UST outputs"],
    methodologyChanges: "WUR 3.0 (from the 2024 edition) added research strength, excellence and influence metrics and rebalanced the five pillars.",
    reportingPeriod: "Financial year 2025; publications 2020–2024",
    publicNote: "Ranked in the 1501+ band.",
  },
  {
    slug: "the-impact",
    short: "THE Impact",
    name: "THE Impact Ratings",
    family: "THE",
    current: "401–600",
    previous: "601–800",
    target: "301–400",
    direction: "up",
    readiness: 76,
    deadline: "2026-11-20",
    pending: 18,
    message: "Demonstrate mission-driven SDG impact",
    interpretation:
      "UST moved up from 601–800 to 401–600, carried by strong health evidence for SDG 3 and partnership evidence for SDG 17. The next gains depend on evidence quality rather than new activity: several policies still lack public URLs, and outreach evidence often stops at activity reports instead of verified beneficiary change.",
    measures: "SDG evidence across research, stewardship, outreach and teaching",
    emphasis: ["SDG 17", "Research", "Stewardship", "Outreach", "Teaching"],
    menu: ["Impact Overview", "SDG Dashboard", "SDG 17", "Research", "Stewardship", "Outreach", "Teaching", "Evidence", "Impact Stories"],
    history: [
      { year: 2022, hi: 801, lo: 1000, label: "801–1000" },
      { year: 2023, hi: 801, lo: 1000, label: "801–1000" },
      { year: 2024, hi: 601, lo: 800, label: "601–800" },
      { year: 2025, hi: 601, lo: 800, label: "601–800" },
      { year: 2026, hi: 401, lo: 600, label: "401–600" },
    ],
    indicators: [
      ind("SDG 17 Partnerships for the Goals", "22% (mandatory)", 68.0, 74.0, "Improving", "Validated", "Office of International Relations and Programs", "Relationships with other countries, best-practice sharing and publication of SDG data.", "Evidence-based scoring of policies, partnerships and SDG reporting.", [54, 59, 63, 68], ["Provide accessible public URL for the SDG report"]),
      ind("SDG 3 Good Health and Well-being", "26%", 71.4, 76.0, "Improving", "Validated", "Faculty of Medicine and Surgery", "Research on health, health outcomes of graduates, collaborations and health services.", "Bibliometric and evidence metrics, normalised.", [60, 64, 68, 71.4], ["Add beneficiary outcomes for community clinics"]),
      ind("SDG 4 Quality Education", "26%", 66.2, 72.0, "Stable", "For review", "College of Education", "Research on early-years and lifelong learning, proportion of graduates with teaching qualifications, lifelong learning measures.", "Bibliometric and evidence metrics, normalised.", [62, 64, 66, 66.2], ["Upload lifelong learning access policy"]),
      ind("SDG 11 Sustainable Cities and Communities", "26%", 58.7, 66.0, "Improving", "Needs revision", "College of Architecture", "Research on sustainable cities, support of arts and heritage, sustainable practices.", "Bibliometric and evidence metrics, normalised.", [49, 52, 56, 58.7], ["Correct document reporting period for heritage programme", "Respond to validation comment on public access"]),
    ],
    strengths: ["Upward movement from 601–800 to 401–600", "Strong health evidence base through UST Hospital and the Faculty of Medicine and Surgery"],
    gaps: ["Several policies lack public URLs", "Outcome evidence often stops at activity reports"],
    opportunities: ["Move more evidence up the impact ladder to verified beneficiary change", "Reuse SDG 3 evidence in QS Sustainability"],
    dataSources: ["THE Impact data portal (submitted by UST)", "Elsevier SDG-mapped publications", "Public evidence URLs"],
    commonErrors: ["Policy documents without approval dates", "Evidence outside the reporting year", "Links behind a login"],
    methodologyChanges: "Overall score uses SDG 17 plus the best three other SDGs; evidence must be publicly accessible where requested.",
    reportingPeriod: "Calendar year 2025",
    publicNote: "Moved from 601–800 to 401–600.",
  },
  {
    slug: "the-subject",
    short: "THE by Subject",
    name: "THE WUR by Subject",
    family: "THE",
    current: "Education 501–600",
    previous: "Education 601+",
    target: "Education 401–500",
    direction: "up",
    readiness: 61,
    deadline: "2027-03-12",
    pending: 12,
    message: "Scale disciplinary strengths",
    interpretation:
      "Education (501–600) and Medical and Health (601–800) are ranked. Life Sciences sits at 74% of the publication threshold, so targeted output support could add a third ranked subject within two cycles.",
    measures: "Discipline portfolio, ranking thresholds and field-specific development",
    emphasis: ["Global anchors", "Emerging strengths", "Development priorities", "Monitor"],
    menu: ["Subject Portfolio", "Education Studies", "Medical and Health", "Life Sciences", "Social Sciences", "Emerging Subjects", "Comparative Analysis", "Development Plans"],
    history: [
      { year: 2022, hi: null, lo: null, label: "Not ranked" },
      { year: 2023, hi: 601, lo: 800, label: "601+" },
      { year: 2024, hi: 601, lo: 800, label: "601+" },
      { year: 2025, hi: 501, lo: 600, label: "501–600" },
      { year: 2026, hi: 501, lo: 600, label: "501–600" },
    ],
    indicators: [
      ind("Education: Research Quality", "27.5%", 24.1, 28.0, "Improving", "Validated", "College of Education", "Citation impact and research excellence within Education.", "Subject-normalised citation metrics.", [19, 21, 23, 24.1], ["Tag education outputs consistently"]),
      ind("Medical and Health: Teaching", "28.5%", 22.8, 26.0, "Stable", "For review", "Faculty of Medicine and Surgery", "Teaching reputation and learning environment for Medical and Health.", "Subject-weighted teaching pillar.", [21, 22, 22.5, 22.8], ["Confirm clinical faculty FTE"]),
      ind("Life Sciences: Output threshold", "Eligibility", 74, 100, "Improving", "Not yet submitted", "College of Science", "Minimum publication volume for a subject to be ranked.", "Papers in the subject over five years versus the THE threshold.", [52, 60, 68, 74], ["Submit subject output list for review"], "% of threshold"),
    ],
    strengths: ["Education and Medical and Health ranked", "Clear threshold path for Life Sciences"],
    gaps: ["Output volume below threshold in several fields"],
    opportunities: ["Targeted publication support for near-threshold subjects"],
    dataSources: ["THE institutional data (subject splits)", "Scopus subject classification"],
    commonErrors: ["Staff assigned to the wrong subject", "Unmapped interdisciplinary outputs"],
    methodologyChanges: "Subject tables follow the WUR 3.0 pillars with subject-specific weights.",
    reportingPeriod: "Financial year 2025; publications 2020–2024",
    publicNote: "Education 501–600; Medical and Health 601–800.",
  },
  {
    slug: "qs-wur",
    short: "QS WUR",
    name: "QS World University Rankings",
    family: "QS",
    current: "951–1000",
    previous: "1001–1200",
    target: "801–850",
    direction: "up",
    readiness: 72,
    deadline: "2027-01-30",
    pending: 16,
    message: "Strengthen research influence while sustaining reputation",
    interpretation:
      "UST rose from 1001–1200 to 951–1000. Employer Reputation is the strongest indicator and the International Research Network improves every cycle, but Citations per Faculty (1.7 against a target of 3.0) remains the principal structural challenge and carries 20% of the weight.",
    measures: "Reputation, citations, employability and internationalization",
    emphasis: ["Academic Reputation", "Employer Reputation", "Citations per Faculty", "Faculty–Student Ratio", "Employment Outcomes", "International Faculty and Students", "International Research Network", "Sustainability"],
    menu: ["QS WUR Overview", "Academic Reputation", "Employer Reputation", "Research and Citations", "Faculty and Students", "Employment Outcomes", "Internationalization", "Sustainability", "Action Plan"],
    history: [
      { year: 2022, hi: 1001, lo: 1200, label: "1001–1200" },
      { year: 2023, hi: 1001, lo: 1200, label: "1001–1200" },
      { year: 2024, hi: 1001, lo: 1200, label: "1001–1200" },
      { year: 2025, hi: 1001, lo: 1200, label: "1001–1200" },
      { year: 2026, hi: 951, lo: 1000, label: "951–1000" },
    ],
    indicators: [
      ind("Academic Reputation", "30%", 12.6, 15.0, "Stable", "Validated", "Office of the Rector", "Survey of academics on the institutions producing the best work in their field.", "Weighted survey responses over five years.", [11.8, 12.2, 12.5, 12.6], ["Refresh the academic nominations list"]),
      ind("Employer Reputation", "15%", 41.5, 45.0, "Stable", "Validated", "Office for Career Services", "Survey of employers on the institutions producing the best graduates.", "Weighted survey responses over five years.", [39.0, 40.6, 41.2, 41.5], ["Submit employer contact list by 15 December"]),
      ind("Citations per Faculty", "20%", 1.7, 3.0, "Critical", "Validated", "Research Center for the Natural and Applied Sciences", "Citations to papers published by the institution, divided by faculty count.", "Five-year citations (excluding self-citations) ÷ faculty FTE, normalised by field.", [1.4, 1.5, 1.6, 1.7], ["Diagnose low-citation clusters", "Publish in indexed venues", "Grow international co-authorship"]),
      ind("Faculty–Student Ratio", "10%", 22.4, 25.0, "Declining", "For review", "Human Resource Department", "Academic staff per student, a proxy for teaching capacity.", "Faculty FTE ÷ student FTE, normalised.", [24.0, 23.6, 23.0, 22.4], ["Reconcile part-time faculty FTE"]),
      ind("Employment Outcomes", "5%", 58.0, 62.0, "Improving", "For review", "Office for Career Services", "Graduate employment rate and alumni impact.", "Employment rate and alumni outcomes index.", [52, 54, 56, 58], ["Confirm 2026 graduate tracer response rate"]),
      ind("International Faculty Ratio", "5%", 8.9, 12.0, "Stable", "Validated", "Human Resource Department", "Share of faculty who are international.", "International faculty FTE ÷ total faculty FTE.", [8.4, 8.8, 8.9, 8.9], ["Verify nationality records"]),
      ind("International Student Ratio", "5%", 6.1, 8.0, "Improving", "Validated", "Office of International Relations and Programs", "Share of students who are international.", "International students ÷ total students.", [4.8, 5.2, 5.6, 6.1], []),
      ind("International Research Network", "5%", 44.3, 50.0, "Improving", "Validated", "Office of the Vice-Rector for Research and Innovation", "Diversity of international research partnerships.", "Inclusiveness index over sustained co-authoring partner institutions.", [38, 40, 42, 44.3], ["Map partner institutions to active MOUs"]),
      ind("Sustainability", "5%", 47.0, 55.0, "Improving", "For review", "Office for Sustainability", "Social and environmental impact, drawn from QS Sustainability.", "Score inherited from QS Sustainability.", [38, 41, 44, 47], ["Reuse validated QS Sustainability evidence"]),
    ],
    strengths: ["Employer Reputation is the strongest indicator", "International Research Network rising each cycle"],
    gaps: ["Citations per Faculty is the principal structural challenge", "Faculty–Student Ratio drifting downward"],
    opportunities: ["Treat citations as an institutional process, not a rankings-office concern", "Use international partnerships to lift co-authored, cited output"],
    dataSources: ["QS Hub institutional data (submitted by UST)", "Elsevier Scopus", "QS Academic and Employer surveys"],
    commonErrors: ["Faculty FTE counting researchers without teaching duties", "Out-of-date employer contact lists", "Student counts from the wrong census date"],
    methodologyChanges: "From the 2024 edition: Employment Outcomes, International Research Network and Sustainability added; Academic Reputation and Faculty–Student Ratio weights reduced.",
    reportingPeriod: "Academic year 2025–2026; citations 2020–2025",
    publicNote: "Ranked 951–1000.",
  },
  {
    slug: "qs-sustainability",
    short: "QS Sustainability",
    name: "QS Sustainability Rankings",
    family: "QSS",
    current: "834",
    previous: "901–950",
    target: "701–750",
    direction: "up",
    readiness: 70,
    deadline: "2027-02-15",
    pending: 15,
    message: "Convert sustainability momentum into measurable outcomes",
    interpretation:
      "UST is ranked 834th, up from 901–950. Social Impact evidence is well documented; incomplete emissions data and governance documents without public links are holding back the Environmental Impact and Governance scores.",
    measures: "Environmental impact, social impact and governance",
    emphasis: ["Environmental Impact", "Social Impact", "Governance"],
    menu: ["Sustainability Overview", "Environmental Impact", "Social Impact", "Governance", "Research", "Education", "Operations", "Evidence and Policies"],
    history: [
      { year: 2022, hi: null, lo: null, label: "Not ranked" },
      { year: 2023, hi: 1001, lo: 1200, label: "1001+" },
      { year: 2024, hi: 901, lo: 950, label: "901–950" },
      { year: 2025, hi: 901, lo: 950, label: "901–950" },
      { year: 2026, hi: 834, lo: 834, label: "834" },
    ],
    indicators: [
      ind("Environmental Impact", "45%", 39.2, 46.0, "Improving", "For review", "Facilities Management Office", "Environmental sustainability, education and research.", "Sub-lenses on operations, environmental education and research.", [30, 33, 36, 39.2], ["Submit Scope 1 and 2 emissions", "Upload climate action plan"]),
      ind("Social Impact", "45%", 44.6, 50.0, "Improving", "Validated", "Office for Community Development (SIMBAHAYAN)", "Equality, knowledge exchange, educational impact, employability and health and wellbeing.", "Sub-lenses scored from data and public evidence.", [36, 39, 42, 44.6], ["Add beneficiary outcomes for outreach programmes"]),
      ind("Governance", "10%", 52.0, 60.0, "Stable", "Needs revision", "Office of the Secretary General", "Good governance, ethics, transparency and student representation.", "Evidence of policies and governance practices.", [48, 50, 52, 52], ["Upload approved anti-corruption policy", "Provide accessible public URL for financial reports"]),
    ],
    strengths: ["Social Impact evidence is well documented", "Clear upward trajectory since first entry"],
    gaps: ["Emissions data incomplete", "Governance evidence lacks public links"],
    opportunities: ["Share GreenMetric operational data with this ranking", "Publish governance documents in one public register"],
    dataSources: ["QS Hub sustainability survey", "Scopus sustainability research", "Public policy documents"],
    commonErrors: ["Emissions without a stated method", "Policies with no approval date"],
    methodologyChanges: "Three categories: Environmental Impact, Social Impact and Governance, with Governance at 10%.",
    reportingPeriod: "Calendar year 2025",
    publicNote: "Ranked 834th.",
  },
  {
    slug: "qs-subject",
    short: "QS by Subject",
    name: "QS WUR by Subject",
    family: "QS",
    current: "Medicine 701–850",
    previous: "Medicine 701–850",
    target: "Medicine 601–650",
    direction: "steady",
    readiness: 64,
    deadline: "2027-01-30",
    pending: 11,
    message: "Develop globally competitive disciplines",
    interpretation:
      "Medicine has held the 701–850 band for three editions. Pharmacy is at 82% of the QS threshold and is the most likely next ranked subject; reputation, more than output, limits the other candidates.",
    measures: "Academic and employer reputation, citations, H-index and international research network by subject",
    emphasis: ["Academic Reputation", "Employer Reputation", "Citations", "H-index", "International Research Network"],
    menu: ["Subject Portfolio", "Medicine", "Modern Languages", "Candidate Subjects", "Reputation", "Research Performance", "International Networks", "Development Plans"],
    history: [
      { year: 2022, hi: 601, lo: 700, label: "601–650" },
      { year: 2023, hi: 651, lo: 700, label: "651–700" },
      { year: 2024, hi: 701, lo: 850, label: "701–850" },
      { year: 2025, hi: 701, lo: 850, label: "701–850" },
      { year: 2026, hi: 701, lo: 850, label: "701–850" },
    ],
    indicators: [
      ind("Medicine: Academic Reputation", "40%", 18.0, 22.0, "Stable", "Validated", "Faculty of Medicine and Surgery", "Reputation among academics in medicine.", "Survey responses, subject-weighted.", [18, 18, 17.8, 18], []),
      ind("Medicine: Citations per paper", "15%", 55.0, 62.0, "Improving", "Validated", "Faculty of Medicine and Surgery", "Average citations per paper in medicine.", "Five-year citations ÷ papers.", [48, 50, 53, 55], []),
      ind("Medicine: H-index", "15%", 42.0, 48.0, "Improving", "For review", "Research Center for the Natural and Applied Sciences", "Productivity and impact of published work in the subject.", "Subject H-index, normalised.", [36, 38, 40, 42], ["Confirm author profile merges"]),
      ind("Pharmacy: distance to threshold", "Eligibility", 82, 100, "Improving", "Not yet submitted", "Faculty of Pharmacy", "Progress toward the papers and reputation thresholds for ranking.", "Current output ÷ QS threshold.", [64, 70, 77, 82], ["Submit subject output list"], "% of threshold"),
    ],
    strengths: ["Medicine sustained in the 701–850 band"],
    gaps: ["Candidate subjects below reputation thresholds"],
    opportunities: ["Pharmacy and Chemistry within reach of thresholds"],
    dataSources: ["QS Academic and Employer surveys", "Scopus subject data"],
    commonErrors: ["Outputs not mapped to the right subject area"],
    methodologyChanges: "Five indicators with subject-specific weights; International Research Network added in recent editions.",
    reportingPeriod: "Publications 2020–2025",
    publicNote: "Medicine 701–850.",
  },
  {
    slug: "greenmetric",
    short: "UI GreenMetric",
    name: "UI GreenMetric World University Rankings",
    family: "UI",
    current: "Baseline",
    previous: "Not ranked",
    target: "First ranked entry",
    direction: "new",
    readiness: 54,
    deadline: "2026-10-31",
    pending: 21,
    message: "Improve measurable campus sustainability",
    interpretation:
      "UST is in its baseline year, building the evidence for a first ranked entry. Education and Research and green-space data are validated; water data is not yet submitted and transportation figures cite the wrong year. Campus metering would serve GreenMetric, QS Sustainability and THE Impact at once.",
    measures: "Campus operations across energy, waste, water and transportation",
    emphasis: ["Setting and Infrastructure", "Energy and Climate Change", "Waste", "Water", "Transportation", "Education and Research"],
    menu: ["GreenMetric Overview", "Setting and Infrastructure", "Energy and Climate Change", "Waste", "Water", "Transportation", "Education and Research", "Campus Sustainability Map"],
    history: [
      { year: 2022, hi: null, lo: null, label: "Not ranked" },
      { year: 2023, hi: null, lo: null, label: "Not ranked" },
      { year: 2024, hi: null, lo: null, label: "Not ranked" },
      { year: 2025, hi: null, lo: null, label: "Baseline" },
      { year: 2026, hi: null, lo: null, label: "Baseline" },
    ],
    indicators: [
      ind("Setting and Infrastructure", "15%", 52, 65, "Stable", "Validated", "Facilities Management Office", "Campus area, open and green space, and sustainability budget.", "Ratios of green and forested area to campus area, plus budget share.", [0, 0, 48, 52], [], "% of category"),
      ind("Energy and Climate Change", "21%", 38, 55, "Improving", "For review", "Facilities Management Office", "Energy-efficient appliances, renewable energy, electricity use and carbon footprint.", "Per-capita electricity, renewable share and emissions programmes.", [0, 0, 31, 38], ["Upload metered electricity data for 2025"], "% of category"),
      ind("Waste", "18%", 46, 60, "Improving", "For review", "Facilities Management Office", "Recycling, toxic waste handling, organic and inorganic waste treatment, sewage disposal.", "Programme coverage and treated waste share.", [0, 0, 40, 46], ["Add treated waste tonnage"], "% of category"),
      ind("Water", "10%", 29, 50, "Critical", "Not yet submitted", "Facilities Management Office", "Water conservation, recycling, efficient appliances and treated water consumed.", "Programme implementation and recycled water share.", [0, 0, 24, 29], ["Submit water reuse data", "Document rainwater harvesting capacity"], "% of category"),
      ind("Transportation", "18%", 41, 55, "Stable", "Needs revision", "Office of the Secretary General", "Vehicles, shuttle services, zero-emission vehicle policy, parking and pedestrian paths.", "Ratios of vehicles to campus population and policy coverage.", [0, 0, 40, 41], ["Correct vehicle count reporting period"], "% of category"),
      ind("Education and Research", "18%", 57, 65, "Improving", "Validated", "Office of the Vice-Rector for Research and Innovation", "Sustainability courses, research funding, publications, events and student organisations.", "Ratios of sustainability courses and research to totals.", [0, 0, 50, 57], [], "% of category"),
    ],
    strengths: ["Education and Research evidence ready", "Green space data validated"],
    gaps: ["Water data not yet submitted", "Transportation figures from the wrong year"],
    opportunities: ["Metering would serve GreenMetric, QS Sustainability and THE Impact SDG 6, 7 and 13 at once"],
    dataSources: ["UI GreenMetric questionnaire (submitted by UST)", "Facilities records", "Public evidence"],
    commonErrors: ["Mixed units (litres and cubic metres)", "Campus area excluding off-site campuses"],
    methodologyChanges: "Six categories; evidence uploads required for most indicators.",
    reportingPeriod: "Calendar year 2025",
    publicNote: "Baseline year: building the evidence for a first ranked entry.",
  },
  {
    slug: "wuri",
    short: "WURI",
    name: "World's Universities with Real Impact",
    family: "WURI",
    current: "151–200",
    previous: "201–300",
    target: "101–150",
    direction: "up",
    readiness: 79,
    deadline: "2027-01-12",
    pending: 9,
    message: "Discover and scale Thomasian innovation",
    interpretation:
      "UST rose to 151–200 with Top 100 placements in 12 categories, the strongest showing across the portfolio. Programmes are well evidenced for social responsibility; documenting scalability and replication is the main gap for future submissions.",
    measures: "Innovation pipeline, category fit, impact and scalability",
    emphasis: ["Industrial Application", "Value Creation", "Social Responsibility", "Student Mobility and Openness"],
    menu: ["WURI Overview", "Innovation Pipeline", "WURI Categories", "Submitted Projects", "Recognized Innovations", "Impact and Scalability", "Mentorship and Engagement", "Submit an Innovation"],
    history: [
      { year: 2022, hi: 301, lo: 400, label: "301–400" },
      { year: 2023, hi: 201, lo: 300, label: "201–300" },
      { year: 2024, hi: 201, lo: 300, label: "201–300" },
      { year: 2025, hi: 201, lo: 300, label: "201–300" },
      { year: 2026, hi: 151, lo: 200, label: "151–200" },
    ],
    indicators: [
      ind("Industrial Application", "Dimension", 64, 70, "Improving", "Validated", "Office for Industry Linkages", "Innovations applied with industry partners.", "Panel evaluation of submitted programmes.", [52, 57, 61, 64], []),
      ind("Value Creation", "Dimension", 70, 74, "Improving", "Validated", "Office of the Vice-Rector for Research and Innovation", "Entrepreneurship, ethics and new value created.", "Panel evaluation of submitted programmes.", [60, 64, 68, 70], []),
      ind("Social Responsibility", "Dimension", 76, 80, "Improving", "For review", "Office for Community Development (SIMBAHAYAN)", "Programmes serving communities and the common good.", "Panel evaluation of submitted programmes.", [66, 70, 73, 76], ["Add beneficiary outcomes"]),
      ind("Student Mobility and Openness", "Dimension", 58, 66, "Stable", "Needs revision", "Office of International Relations and Programs", "Openness, mobility and global engagement of students.", "Panel evaluation of submitted programmes.", [55, 57, 58, 58], ["Respond to validation comment on mobility data"]),
    ],
    strengths: ["Top 100 placements in 12 categories", "Strong social responsibility programmes"],
    gaps: ["Few innovations documented with scalability evidence"],
    opportunities: ["Screen faculty projects early for future WURI categories"],
    dataSources: ["WURI submission dossier", "Programme evidence and outcome data"],
    commonErrors: ["Describing activities rather than outcomes", "No evidence of replication elsewhere"],
    methodologyChanges: "Programmes are evaluated by category within four dimensions.",
    reportingPeriod: "Programmes active 2024–2026",
    publicNote: "151–200, with Top 100 placements in 12 categories.",
  },
];

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

/* Executive dashboard dimension performance (0–100 index, sample). */
export const DIMENSION_SCORES: { dimension: Dimension; current: number; target: number }[] = [
  { dimension: "Research", current: 41, target: 55 },
  { dimension: "Reputation", current: 47, target: 52 },
  { dimension: "Employability", current: 62, target: 66 },
  { dimension: "Internationalization", current: 38, target: 48 },
  { dimension: "Sustainability", current: 56, target: 65 },
  { dimension: "Social impact", current: 71, target: 76 },
  { dimension: "Innovation", current: 64, target: 70 },
  { dimension: "Campus operations", current: 44, target: 58 },
];

export const SUMMARY = {
  frameworks: 8,
  readiness: 74,
  unitsEngaged: 42,
  unitsTotal: 51,
  actionsRequired: 14,
  missing: 9,
  revisions: 5,
};

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
  { slug: "engineering", name: "Faculty of Engineering", kind: "Faculty or college", coordinator: "Engr. M. Dela Cruz", assigned: 10, completed: 8, validated: 7, revisions: 1, rankingsServed: 4, assistance: false },
  { slug: "medicine", name: "Faculty of Medicine and Surgery", kind: "Faculty or college", coordinator: "Dr. A. Santos", assigned: 14, completed: 12, validated: 11, revisions: 1, rankingsServed: 5, assistance: false },
  { slug: "science", name: "College of Science", kind: "Faculty or college", coordinator: "Dr. R. Villanueva", assigned: 12, completed: 9, validated: 8, revisions: 0, rankingsServed: 4, assistance: false },
  { slug: "education", name: "College of Education", kind: "Faculty or college", coordinator: "Dr. L. Bautista", assigned: 9, completed: 7, validated: 6, revisions: 1, rankingsServed: 3, assistance: false },
  { slug: "pharmacy", name: "Faculty of Pharmacy", kind: "Faculty or college", coordinator: "Dr. C. Reyes", assigned: 8, completed: 5, validated: 5, revisions: 0, rankingsServed: 2, assistance: true },
  { slug: "architecture", name: "College of Architecture", kind: "Faculty or college", coordinator: "Ar. J. Mendoza", assigned: 7, completed: 4, validated: 3, revisions: 1, rankingsServed: 3, assistance: false },
  { slug: "nursing", name: "College of Nursing", kind: "Faculty or college", coordinator: "Dr. P. Garcia", assigned: 6, completed: 5, validated: 5, revisions: 0, rankingsServed: 2, assistance: false },
  { slug: "arts-letters", name: "Faculty of Arts and Letters", kind: "Faculty or college", coordinator: "Dr. E. Ramos", assigned: 7, completed: 6, validated: 5, revisions: 0, rankingsServed: 3, assistance: false },
  { slug: "cics", name: "College of Information and Computing Sciences", kind: "Faculty or college", coordinator: "Dr. K. Navarro", assigned: 6, completed: 3, validated: 3, revisions: 0, rankingsServed: 2, assistance: true },
  { slug: "rcnas", name: "Research Center for the Natural and Applied Sciences", kind: "Research centre", coordinator: "Dr. T. Aquino", assigned: 11, completed: 9, validated: 9, revisions: 0, rankingsServed: 6, assistance: false },
  { slug: "rcsse", name: "Research Center for Social Sciences and Education", kind: "Research centre", coordinator: "Dr. F. Soriano", assigned: 6, completed: 5, validated: 4, revisions: 1, rankingsServed: 3, assistance: false },
  { slug: "rccah", name: "Research Center for Culture, Arts and Humanities", kind: "Research centre", coordinator: "Dr. G. Lim", assigned: 4, completed: 3, validated: 3, revisions: 0, rankingsServed: 2, assistance: false },
  { slug: "fmo", name: "Facilities Management Office", kind: "Office", coordinator: "Engr. B. Castillo", assigned: 15, completed: 8, validated: 7, revisions: 1, rankingsServed: 4, assistance: true },
  { slug: "oirp", name: "Office of International Relations and Programs", kind: "Office", coordinator: "Ms. H. Tan", assigned: 9, completed: 8, validated: 8, revisions: 0, rankingsServed: 5, assistance: false },
  { slug: "simbahayan", name: "Office for Community Development (SIMBAHAYAN)", kind: "Office", coordinator: "Mr. D. Flores", assigned: 10, completed: 9, validated: 8, revisions: 1, rankingsServed: 4, assistance: false },
  { slug: "hrd", name: "Human Resource Department", kind: "Office", coordinator: "Ms. N. Pascual", assigned: 8, completed: 6, validated: 5, revisions: 1, rankingsServed: 4, assistance: false },
  { slug: "library", name: "Miguel de Benavides Library", kind: "Office", coordinator: "Ms. I. Ocampo", assigned: 4, completed: 4, validated: 4, revisions: 0, rankingsServed: 2, assistance: false },
  { slug: "careers", name: "Office for Career Services", kind: "Office", coordinator: "Mr. V. Salazar", assigned: 5, completed: 4, validated: 3, revisions: 0, rankingsServed: 2, assistance: false },
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

export const ACTIONS: ActionItem[] = [
  { id: "A-114", action: "Submit water reuse data", ranking: "greenmetric", unit: "Facilities Management Office", due: "2026-10-24", status: "Not started" },
  { id: "A-112", action: "Validate publication data", ranking: "qs-wur", unit: "Office of the Vice-Rector for Research and Innovation", due: "2026-10-28", status: "For review" },
  { id: "A-109", action: "Upload SDG policy", ranking: "the-impact", unit: "Office of the Secretary General", due: "2026-11-02", status: "Needs revision" },
  { id: "A-107", action: "Confirm 2026 reporting value for doctorates awarded", ranking: "the-wur", unit: "Office of the Vice-Rector for Academic Affairs", due: "2026-11-06", status: "Not started" },
  { id: "A-105", action: "Add beneficiary outcomes for community clinics", ranking: "the-impact", unit: "Faculty of Medicine and Surgery", due: "2026-11-09", status: "For review" },
  { id: "A-104", action: "Correct document reporting period", ranking: "greenmetric", unit: "Office of the Secretary General", due: "2026-10-27", status: "Needs revision" },
  { id: "A-101", action: "Provide accessible public URL for the SDG report", ranking: "the-impact", unit: "Office of International Relations and Programs", due: "2026-11-12", status: "Needs revision" },
  { id: "A-099", action: "Respond to validation comment on mobility data", ranking: "wuri", unit: "Office of International Relations and Programs", due: "2026-11-16", status: "Needs revision" },
  { id: "A-097", action: "Submit Scope 1 and 2 emissions", ranking: "qs-sustainability", unit: "Facilities Management Office", due: "2026-12-04", status: "Not started" },
  { id: "A-095", action: "Reconcile part-time faculty FTE", ranking: "qs-wur", unit: "Human Resource Department", due: "2026-12-10", status: "For review" },
];

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

export const EVIDENCE: EvidenceItem[] = [
  {
    id: "EV-2041",
    title: "Rainwater harvesting and greywater reuse, Engineering complex",
    unit: "Faculty of Engineering",
    unitSlug: "engineering",
    type: "Operational data",
    period: "January–December 2025",
    submitted: "2026-09-18",
    submittedBy: "Engr. M. Dela Cruz",
    status: "Validated",
    stage: 3,
    level: 3,
    mappedTo: ["UI GreenMetric · Water", "QS Sustainability · Environmental Impact", "THE Impact · SDG 6"],
    sdgs: [6, 11, 13],
    summary: "Metered capture and reuse of rainwater and treated greywater for grounds and toilet flushing in the Engineering complex.",
    result: "4,820 m³ reused in 2025, 18% of the complex's non-potable demand",
    beneficiaries: "About 9,000 students and staff using the complex",
    files: ["water-reuse-2025.xlsx", "metering-certificate.pdf"],
    comments: [
      { by: "R. Manalo", role: "Reviewer, Office of QS/THE Rankings", date: "2026-09-24", text: "Accepted. Metering certificate confirms the 2025 period. Mapped to three rankings." },
    ],
  },
  {
    id: "EV-2038",
    title: "Solar photovoltaic array, Roque Ruaño Building",
    unit: "Faculty of Engineering",
    unitSlug: "engineering",
    type: "Operational data",
    period: "January–December 2025",
    submitted: "2026-09-12",
    submittedBy: "Engr. M. Dela Cruz",
    status: "Validated",
    stage: 4,
    level: 2,
    mappedTo: ["UI GreenMetric · Energy and Climate Change", "QS Sustainability · Environmental Impact", "THE Impact · SDG 7", "WURI · Industrial Application"],
    sdgs: [7, 13],
    summary: "Rooftop photovoltaic installation designed and monitored with students in the electrical engineering programme.",
    result: "212 MWh generated in 2025",
    beneficiaries: "Building occupants; 140 students in design and monitoring",
    files: ["pv-generation-2025.csv", "commissioning-report.pdf"],
    comments: [
      { by: "R. Manalo", role: "Reviewer, Office of QS/THE Rankings", date: "2026-09-15", text: "Accepted and included in the WURI dossier." },
    ],
  },
  {
    id: "EV-2019",
    title: "Sustainability content in engineering curricula",
    unit: "Faculty of Engineering",
    unitSlug: "engineering",
    type: "Teaching and course data",
    period: "Academic year 2025–2026",
    submitted: "2026-09-05",
    submittedBy: "Dr. S. Uy",
    status: "Validated",
    stage: 3,
    level: 2,
    mappedTo: ["UI GreenMetric · Education and Research", "THE Impact · SDG 4", "QS Sustainability · Environmental Impact"],
    sdgs: [4, 13],
    summary: "Inventory of courses with sustainability learning outcomes across seven engineering programmes.",
    result: "38 courses with assessed sustainability outcomes",
    beneficiaries: "About 6,500 engineering students",
    files: ["course-inventory-2025.xlsx"],
    comments: [
      { by: "J. Dizon", role: "Reviewer, Office of QS/THE Rankings", date: "2026-09-11", text: "Accepted. Syllabi sampled and confirmed." },
    ],
  },
  {
    id: "EV-2052",
    title: "Industry-funded research contracts, 2025",
    unit: "Faculty of Engineering",
    unitSlug: "engineering",
    type: "Financial data",
    period: "Financial year 2025",
    submitted: "2026-10-03",
    submittedBy: "Dr. S. Uy",
    status: "Needs revision",
    stage: 1,
    level: 2,
    mappedTo: ["THE WUR · Industry"],
    sdgs: [9],
    summary: "Ledger of research contracts funded by industry partners.",
    result: "₱18.6 million in industry research income",
    beneficiaries: "Partner firms and 22 faculty researchers",
    files: ["industry-contracts-2025.xlsx"],
    comments: [
      { by: "R. Manalo", role: "Reviewer, Office of QS/THE Rankings", date: "2026-10-07", text: "Three contracts are dated FY2024. Please correct the reporting period or remove them, and attach the signed contract summaries." },
    ],
  },
  {
    id: "EV-2057",
    title: "Flood-resilience design studio with Barangay 455",
    unit: "Faculty of Engineering",
    unitSlug: "engineering",
    type: "Narrative and outcomes",
    period: "June 2025–March 2026",
    submitted: "2026-10-09",
    submittedBy: "Engr. P. Lacson",
    status: "For review",
    stage: 1,
    level: 3,
    mappedTo: ["THE Impact · SDG 11", "WURI · Social Responsibility"],
    sdgs: [11, 13],
    summary: "Students and faculty co-designed drainage improvements with residents of a flood-prone barangay in Sampaloc.",
    result: "Two drainage retrofits completed; flood duration on two streets reduced from hours to minutes",
    beneficiaries: "About 1,200 residents",
    files: ["studio-report.pdf", "barangay-resolution.pdf", "photos.zip"],
    comments: [],
  },
  {
    id: "EV-2060",
    title: "Internationally co-authored publications, 2025",
    unit: "College of Science",
    unitSlug: "science",
    type: "Research output",
    period: "Calendar year 2025",
    submitted: "2026-10-10",
    submittedBy: "Dr. R. Villanueva",
    status: "For review",
    stage: 1,
    level: 2,
    mappedTo: ["QS WUR · International Research Network", "THE WUR · International Outlook"],
    sdgs: [17],
    summary: "List of 2025 publications with at least one international co-author, with DOIs.",
    result: "61 papers with partners in 19 countries",
    beneficiaries: "Research community",
    files: ["coauthored-2025.csv"],
    comments: [],
  },
  {
    id: "EV-2063",
    title: "Community clinic outcomes, Sampaloc",
    unit: "Faculty of Medicine and Surgery",
    unitSlug: "medicine",
    type: "Narrative and outcomes",
    period: "Calendar year 2025",
    submitted: "2026-10-11",
    submittedBy: "Dr. A. Santos",
    status: "For review",
    stage: 1,
    level: 4,
    mappedTo: ["THE Impact · SDG 3", "QS Sustainability · Social Impact", "WURI · Social Responsibility"],
    sdgs: [3, 10],
    summary: "Free primary-care clinics run with UST Hospital in partner barangays.",
    result: "3,400 consultations; hypertension control rate among enrolled patients up from 41% to 63%",
    beneficiaries: "1,150 enrolled patients",
    files: ["clinic-outcomes-2025.pdf"],
    comments: [],
  },
  {
    id: "EV-2066",
    title: "Lifelong learning access policy",
    unit: "College of Education",
    unitSlug: "education",
    type: "Policy",
    period: "Approved 2024, in force 2025",
    submitted: "2026-10-12",
    submittedBy: "Dr. L. Bautista",
    status: "For review",
    stage: 1,
    level: 1,
    mappedTo: ["THE Impact · SDG 4"],
    sdgs: [4],
    summary: "Policy opening short courses and library access to the public.",
    result: "Policy approved by the Academic Senate",
    beneficiaries: "Public learners",
    files: ["lifelong-learning-policy.pdf"],
    comments: [],
  },
  {
    id: "EV-2031",
    title: "Heritage conservation programme, Arch of the Centuries",
    unit: "College of Architecture",
    unitSlug: "architecture",
    type: "Narrative and outcomes",
    period: "Calendar year 2025",
    submitted: "2026-09-02",
    submittedBy: "Ar. J. Mendoza",
    status: "Needs revision",
    stage: 1,
    level: 1,
    mappedTo: ["THE Impact · SDG 11"],
    sdgs: [11],
    summary: "Documentation and conservation of heritage structures on campus.",
    result: "Condition survey of four heritage structures",
    beneficiaries: "Campus community and visitors",
    files: ["conservation-report.pdf"],
    comments: [
      { by: "J. Dizon", role: "Reviewer, Office of QS/THE Rankings", date: "2026-09-10", text: "Report covers 2023–2025. Please isolate 2025 activities and add a public URL." },
    ],
  },
];

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

export const ENGINEERING_REQUIREMENTS: Requirement[] = [
  { id: "R-01", title: "Water reuse volumes and metering", ranking: "greenmetric", indicator: "Water", due: "2026-09-30", status: "Validated", template: "GM-Water-2026.xlsx", evidenceId: "EV-2041" },
  { id: "R-02", title: "Renewable energy generation", ranking: "greenmetric", indicator: "Energy and Climate Change", due: "2026-09-30", status: "Validated", template: "GM-Energy-2026.xlsx", evidenceId: "EV-2038" },
  { id: "R-03", title: "Industry research income", ranking: "the-wur", indicator: "Industry", due: "2026-10-20", status: "Needs revision", template: "THE-Income-2026.xlsx", evidenceId: "EV-2052" },
  { id: "R-04", title: "Community engagement outcomes", ranking: "the-impact", indicator: "SDG 11", due: "2026-10-31", status: "For review", template: "Impact-Story-2026.docx", evidenceId: "EV-2057" },
  { id: "R-05", title: "Faculty FTE and qualifications", ranking: "qs-wur", indicator: "Faculty–Student Ratio", due: "2026-08-29", status: "Validated", template: "QS-Faculty-2026.xlsx" },
  { id: "R-06", title: "Internationally co-authored papers", ranking: "qs-wur", indicator: "International Research Network", due: "2026-08-29", status: "Validated", template: "Coauthorship-2026.csv" },
  { id: "R-07", title: "Sustainability courses offered", ranking: "greenmetric", indicator: "Education and Research", due: "2026-09-15", status: "Validated", template: "GM-Courses-2026.xlsx" },
  { id: "R-08", title: "Patents and utility models", ranking: "wuri", indicator: "Industrial Application", due: "2026-09-15", status: "Validated", template: "WURI-IP-2026.xlsx" },
  { id: "R-09", title: "Graduate employment, engineering programmes", ranking: "qs-wur", indicator: "Employment Outcomes", due: "2026-08-15", status: "Validated", template: "Tracer-2026.xlsx" },
  { id: "R-10", title: "Scope 2 emissions for engineering buildings", ranking: "qs-sustainability", indicator: "Environmental Impact", due: "2026-11-30", status: "Not yet submitted", template: "QSS-Emissions-2026.xlsx" },
];

/* Impact stories (sample content for layout review). Each follows the proposal's showcase format:
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
}

export const STORIES: Story[] = [
  {
    slug: "water-reuse",
    title: "Rain into reuse on the España campus",
    unit: "Faculty of Engineering with the Facilities Management Office",
    kind: "Campus sustainability",
    state: "Published",
    year: 2025,
    themes: ["Campus Sustainability", "SDG Stories", "Replicable Practices"],
    sdgs: [6, 11, 13],
    rankings: ["UI GreenMetric", "QS Sustainability", "THE Impact"],
    challenge: "Monsoon rain flooded the campus while grounds and toilets ran on potable water.",
    response: "Engineering students and facilities staff installed metered rainwater capture and greywater treatment in one complex.",
    implementation: "Tanks and a greywater treatment line went in during 2024. Students take monthly meter readings and keep the maintenance log with Facilities staff.",
    beneficiaries: "About 9,000 students and staff",
    outcome: "18% of the complex's non-potable water now comes from reuse.",
    outcomeFigure: "18%",
    outcomeLabel: "of non-potable demand met by reuse",
    evidence: "Meter logs for 2025 and a third-party metering certificate.",
    replication: "Design files, maintenance schedule and metering template are available to partner universities.",
    lessons: "Start with metering. A reliable baseline made the result credible to three rankings at once.",
    images: ["/images/main-building-night.jpg", "/images/arch-of-centuries.jpg", "/images/main-building-front.jpg"],
  },
  {
    slug: "community-clinics",
    title: "Clinics that follow the patient home",
    unit: "Faculty of Medicine and Surgery with UST Hospital",
    kind: "SDG story",
    state: "Published",
    year: 2025,
    themes: ["SDG Stories", "Community Transformation", "Research Impact"],
    sdgs: [3, 10],
    rankings: ["THE Impact", "QS Sustainability", "WURI"],
    challenge: "Hypertension went untreated in nearby barangays because follow-up visits were too far.",
    response: "Free monthly clinics with home follow-up by medical and nursing students.",
    implementation: "Clinic days run monthly in partner barangays. Between visits, student pairs follow up enrolled patients at home under faculty supervision.",
    beneficiaries: "1,150 enrolled patients in partner barangays",
    outcome: "Blood-pressure control among enrolled patients rose from 41% to 63%.",
    outcomeFigure: "63%",
    outcomeLabel: "blood-pressure control, up from 41%",
    evidence: "De-identified clinic records reviewed by the Research Ethics Committee.",
    replication: "Clinic protocol and follow-up checklist shared under an open licence.",
    lessons: "Measure an outcome patients care about, such as blood-pressure control, not the number of consultations.",
    images: ["/images/hospital-1946.jpg", "/images/hospital-2024.jpg", "/images/benavides.jpg"],
  },
  {
    slug: "heritage-library",
    title: "Four centuries of books, opened",
    unit: "Miguel de Benavides Library",
    kind: "SDG story",
    state: "Published",
    year: 2025,
    themes: ["SDG Stories", "Replicable Practices"],
    sdgs: [4, 11],
    rankings: ["THE Impact", "QS Sustainability"],
    challenge: "Rare holdings were closed to researchers outside the University.",
    response: "Digitisation and a public reading programme for heritage collections.",
    implementation: "Heritage titles are digitised with conservation-grade handling, and a reading room opens to the public by appointment.",
    beneficiaries: "Researchers and public readers",
    outcome: "Heritage titles available to read online and on request.",
    outcomeFigure: "1611",
    outcomeLabel: "the year the collection began",
    evidence: "Public catalogue records and visitor logs.",
    replication: "Digitisation workflow and handling guide for heritage libraries.",
    lessons: "An access policy only counts as evidence when it has a public URL.",
    images: ["/images/library-1800s.jpg", "/images/courtyard-1800s.jpg", "/images/physics-cabinet-1800s.jpg"],
  },
  {
    slug: "science-kits",
    title: "A physics cabinet for every public school",
    unit: "College of Science with the College of Education",
    kind: "Innovation",
    state: "Published",
    year: 2026,
    themes: ["Thomasian Innovations", "Community Transformation", "Replicable Practices"],
    sdgs: [4, 10],
    rankings: ["WURI", "THE Impact"],
    challenge: "Partner public schools taught physics without apparatus.",
    response: "Low-cost experiment kits built by science majors, with teacher training by education students.",
    implementation: "Science majors build the kits from locally sourced parts. Education students co-teach the first lessons with partner teachers.",
    beneficiaries: "Teachers and students in partner public schools",
    outcome: "Kits and training delivered to partner schools in Manila.",
    outcomeFigure: "SDG 4",
    outcomeLabel: "quality education",
    evidence: "Delivery receipts, training attendance and lesson observations.",
    replication: "Kit bill of materials and lesson plans are open for any university to reuse.",
    lessons: "Pair the object with teacher training. In the pilot, kits delivered alone went unused.",
    images: ["/images/physics-cabinet-1800s.jpg", "/images/carillon.jpg", "/images/library-1800s.jpg"],
  },
  {
    slug: "solar-array",
    title: "Sunlight on the Roque Ruaño Building",
    unit: "Faculty of Engineering",
    kind: "Innovation",
    state: "Published",
    year: 2025,
    themes: ["Campus Sustainability", "Thomasian Innovations"],
    sdgs: [7, 13],
    rankings: ["UI GreenMetric", "QS Sustainability", "THE Impact", "WURI"],
    challenge: "Campus electricity came entirely from the grid, and students had no live installation to learn from.",
    response: "A rooftop photovoltaic array designed and monitored with electrical engineering students.",
    implementation: "Students modelled the array, joined commissioning and now publish a monthly generation report.",
    beneficiaries: "Building occupants; 140 students in design and monitoring",
    outcome: "212 MWh generated in 2025.",
    outcomeFigure: "212 MWh",
    outcomeLabel: "generated in 2025",
    evidence: "Generation logs and the commissioning report.",
    replication: "Monitoring dashboard template and teaching modules.",
    lessons: "Building the monitoring into coursework kept the data complete all year.",
    images: ["/images/main-building-2019.jpg", "/images/main-building-front.jpg", "/images/carillon.jpg"],
  },
  {
    slug: "coauthorship",
    title: "Research with partners in nineteen countries",
    unit: "College of Science with the Office of International Relations and Programs",
    kind: "Partnership",
    state: "Published",
    year: 2025,
    themes: ["International Partnerships", "Research Impact"],
    sdgs: [17],
    rankings: ["QS WUR", "THE WUR", "THE Impact"],
    challenge: "Most UST papers came from single-institution teams, which limited their reach and citations.",
    response: "Seed grants and visiting fellowships that pair UST researchers with partner universities abroad.",
    implementation: "Thirty-eight joint projects funded since 2023, each with a co-supervised student.",
    beneficiaries: "UST researchers and partner institutions",
    outcome: "61 papers in 2025 with partners in 19 countries.",
    outcomeFigure: "61",
    outcomeLabel: "internationally co-authored papers in 2025",
    evidence: "Publication list with DOIs, checked against Scopus.",
    replication: "Seed-grant guidelines and a template partnership agreement.",
    lessons: "Small grants tied to a shared student kept partnerships going beyond a single paper.",
    images: ["/images/benavides.jpg", "/images/library-1800s.jpg", "/images/arch-of-centuries.jpg"],
  },
  {
    slug: "flood-resilience",
    title: "Streets that drain in minutes, not hours",
    unit: "Faculty of Engineering with Barangay 455",
    kind: "SDG story",
    state: "In review",
    year: 2026,
    themes: ["Community Transformation", "SDG Stories", "Replicable Practices"],
    sdgs: [11, 13],
    rankings: ["THE Impact", "WURI"],
    challenge: "Two streets in a flood-prone Sampaloc barangay stayed under water for hours after heavy rain.",
    response: "Students and faculty co-designed drainage retrofits with residents in a design studio.",
    implementation: "Residents mapped the flooding; the studio designed two retrofits that the barangay built with its own budget.",
    beneficiaries: "About 1,200 residents",
    outcome: "Flood duration on two streets fell from hours to minutes.",
    outcomeFigure: "2",
    outcomeLabel: "drainage retrofits built by the barangay",
    evidence: "Studio report, barangay resolution and before-and-after photographs.",
    replication: "Studio brief and a community flood-mapping toolkit for engineering schools.",
    lessons: "Designing with residents produced a plan the barangay was willing to fund.",
    images: ["/images/main-building-night.jpg", "/images/courtyard-1800s.jpg", "/images/arch-of-centuries.jpg"],
  },
];

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

/* SDG tiles (THE Impact) – sample */
export const SDG_TILES = Array.from({ length: 17 }, (_, i) => {
  const n = i + 1;
  const seed = [62, 38, 88, 81, 57, 64, 52, 49, 55, 61, 74, 41, 58, 22, 31, 66, 92][i];
  return {
    sdg: n,
    readiness: seed,
    submitted: Math.round(seed / 4),
    validated: Math.round(seed / 5.5),
    units: Math.max(1, Math.round(seed / 14)),
    outputs: Math.round(seed * 1.6),
    policies: Math.round(seed / 18),
    beneficiaries: seed > 60 ? `${Math.round(seed * 47).toLocaleString()}` : "To be documented",
    outcomes: Math.round(seed / 20),
    submittedForRating: [3, 4, 11, 17].includes(n),
  };
});

export const IMPACT_LADDER = [
  { step: "Activity documented", count: 214 },
  { step: "Output measured", count: 156 },
  { step: "Outcome demonstrated", count: 88 },
  { step: "Beneficiary change verified", count: 41 },
  { step: "Long-term impact established", count: 12 },
];

export const PIPELINE = [
  { step: "Identify contribution", count: 312 },
  { step: "Submit evidence", count: 268 },
  { step: "Validate data", count: 221 },
  { step: "Map to indicators", count: 204 },
  { step: "Include in submission", count: 176 },
  { step: "Measure result and impact", count: 63 },
];

export const WURI_PIPELINE = [
  { step: "Ideas identified", count: 48 },
  { step: "Screened", count: 31 },
  { step: "Developed", count: 22 },
  { step: "Evidence strengthened", count: 17 },
  { step: "Submitted", count: 14 },
  { step: "Recognized", count: 12 },
  { step: "Replicated", count: 5 },
];

/* Sample category names for the WURI Top 100 display; confirm against the official result letter. */
export const WURI_CATEGORIES = [
  "Entrepreneurial Spirit", "Ethical Value", "Crisis Management", "Student Support and Engagement",
  "Leadership", "Social Responsibility", "Industrial Application", "Value Creation",
  "Culture", "Openness", "Global Collaboration", "Student Mobility",
];

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

export const SUBJECT_PORTFOLIO: { quadrant: Quadrant; subjects: { name: string; note: string; area: SubjectArea }[] }[] = [
  { quadrant: "Global anchors", subjects: [{ name: "Medicine", note: "QS 701–850", area: "Life sciences and medicine" }, { name: "Education", note: "THE 501–600", area: "Social sciences and management" }, { name: "Medical and Health", note: "THE 601–800", area: "Life sciences and medicine" }] },
  { quadrant: "Emerging strengths", subjects: [{ name: "Pharmacy and Pharmacology", note: "82% of QS threshold", area: "Life sciences and medicine" }, { name: "Life Sciences", note: "74% of THE threshold", area: "Natural sciences" }, { name: "Modern Languages", note: "Reputation rising", area: "Arts and humanities" }] },
  { quadrant: "Development priorities", subjects: [{ name: "Engineering and Technology", note: "Output growing", area: "Engineering and technology" }, { name: "Computer Science", note: "Needs citations", area: "Engineering and technology" }, { name: "Business and Economics", note: "Needs reputation", area: "Social sciences and management" }] },
  { quadrant: "Monitor", subjects: [{ name: "Architecture", note: "Insufficient output", area: "Engineering and technology" }, { name: "Law", note: "Insufficient output", area: "Social sciences and management" }, { name: "Arts and Humanities", note: "Evidence gap", area: "Arts and humanities" }] },
];

export const GREENMETRIC_PANELS = [
  { name: "Setting and Infrastructure", metrics: [["Green-space share", "38%", "45%"], ["Sustainability budget", "2.1%", "3.0%"]] },
  { name: "Energy and Climate Change", metrics: [["Electricity per person", "612 kWh", "550 kWh"], ["Renewable share", "6.4%", "12%"]] },
  { name: "Waste", metrics: [["Waste treated", "54%", "70%"], ["Recycling programme", "Partial", "Full"]] },
  { name: "Water", metrics: [["Water recycled", "18%", "30%"], ["Efficient fixtures", "41%", "65%"]] },
  { name: "Transportation", metrics: [["Zero-emission vehicles", "4", "12"], ["Pedestrian path share", "62%", "75%"]] },
  { name: "Education and Research", metrics: [["Sustainability courses", "214", "260"], ["Sustainability publications", "131", "160"]] },
];

export const QSS_PILLARS = [
  { name: "Environmental Impact", weight: "45%", lenses: ["Environmental sustainability", "Environmental education", "Environmental research"], offices: ["Facilities Management Office", "Office for Sustainability"], policies: 6, outcomes: 4, status: "For review" as EvidenceStatus },
  { name: "Social Impact", weight: "45%", lenses: ["Equality", "Knowledge exchange", "Impact of education", "Employability and outcomes", "Health and wellbeing"], offices: ["SIMBAHAYAN", "Office for Career Services", "UST Hospital"], policies: 9, outcomes: 11, status: "Validated" as EvidenceStatus },
  { name: "Governance", weight: "10%", lenses: ["Good governance"], offices: ["Office of the Secretary General"], policies: 4, outcomes: 1, status: "Needs revision" as EvidenceStatus },
];

export const RESEARCH_FUNNEL = [
  { step: "Research capacity", value: "1,040", note: "faculty with research load" },
  { step: "Publications", value: "1,486", note: "outputs in 2025" },
  { step: "Indexed outputs", value: "912", note: "in Scopus" },
  { step: "International collaboration", value: "36%", note: "co-authored abroad" },
  { step: "Citations", value: "1.7", note: "citations per faculty score" },
  { step: "QS impact", value: "20%", note: "of the overall weight" },
];

export const RECOGNITION = [
  { award: "Most reusable evidence", unit: "Faculty of Engineering", reason: "Three validated items used across four rankings" },
  { award: "Best outcome evidence", unit: "Faculty of Medicine and Surgery", reason: "Verified patient outcomes for SDG 3" },
  { award: "Strongest cross-unit collaboration", unit: "Office for Community Development (SIMBAHAYAN)", reason: "Seven units on one outreach dossier" },
  { award: "Earliest complete submission", unit: "Miguel de Benavides Library", reason: "All requirements validated by 1 September" },
  { award: "Most improved documentation", unit: "College of Architecture", reason: "Revision rate down by half" },
  { award: "Most promising innovation", unit: "College of Science", reason: "Physics kits shortlisted for WURI" },
  { award: "Best impact story", unit: "Miguel de Benavides Library", reason: "Four centuries of books, opened, published with replication guidance" },
];

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
export const ACTION_PLAN: { action: string; kpi: string; owner: string; timeline: string; progress: number; status: PlanStatus }[] = [
  { action: "Increase international co-authorship", kpi: "% internationally co-authored papers", owner: "Office of the Vice-Rector for Research and Innovation", timeline: "2026–2028", progress: 45, status: "On track" },
  { action: "Citations per Faculty diagnostic", kpi: "Field-weighted citation impact", owner: "Research Center for the Natural and Applied Sciences", timeline: "2026–2027", progress: 30, status: "At risk" },
  { action: "Employer list renewal", kpi: "Valid employer contacts submitted", owner: "Office for Career Services", timeline: "Oct–Dec 2026", progress: 70, status: "On track" },
  { action: "Public evidence register", kpi: "% of evidence with public URL", owner: "Office of QS/THE Rankings", timeline: "2026–2027", progress: 55, status: "On track" },
  { action: "Campus metering programme", kpi: "Buildings with water and energy meters", owner: "Facilities Management Office", timeline: "2026–2028", progress: 25, status: "At risk" },
];

export const COMPARISON = [
  { name: "UST", value: "951–1000", own: true },
  { name: "Philippine university A", value: "401–450", own: false },
  { name: "Philippine university B", value: "531–540", own: false },
  { name: "Philippine university C", value: "851–900", own: false },
  { name: "ASEAN median (ranked)", value: "761–770", own: false },
];

export const NOTIFICATIONS = [
  { text: "College of Science submitted internationally co-authored publications", when: "2 hours ago", href: "/admin/contribute?item=EV-2060" },
  { text: "UI GreenMetric questionnaire closes in 16 days", when: "Today", href: "/admin/rankings/greenmetric" },
  { text: "Faculty of Medicine and Surgery submitted clinic outcomes", when: "Yesterday", href: "/admin/contribute?item=EV-2063" },
];

export const UNIT_NOTIFICATIONS = [
  { text: "A reviewer asked for a revision on industry-funded research contracts", when: "8 Oct", href: "/portal/feedback" },
  { text: "Rainwater harvesting evidence now counts in three rankings", when: "24 Sep", href: "/portal/history" },
  { text: "UI GreenMetric questionnaire closes in 16 days", when: "Today", href: "/portal/requirements" },
];

export function daysUntil(iso: string, from = AS_OF) {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(iso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

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

/** Office team by role (names appear only where the sample data already uses them). */
/** Named roles from the office profile dated 19 September 2026. */
export const TEAM = OFFICE_TEAM;

export const rankingsInGroup = (label: string) =>
  (RANKING_GROUPS.find((g) => g.label === label)?.slugs ?? []).map((s) => rankingBySlug(s)!).filter(Boolean);

export const groupOf = (slug: string) => RANKING_GROUPS.find((g) => g.slugs.includes(slug))?.label ?? "Rankings";
