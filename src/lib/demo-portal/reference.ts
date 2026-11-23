/*
 * The portal demo's reference data: the same shape the Hub reads from Supabase (lib/reference.ts), written by hand.
 * Ranking names, families and methodology weights are the bodies' public ones; every result, readiness figure,
 * deadline and date below is SAMPLE DATA invented for the demo. Units, people and the Office profile are fictional.
 * Nothing here was copied from the production database. Pictures are omitted, so no page asks /media (R2) for one.
 */
import type { Indicator, Ranking, RankPoint } from "@/lib/data";
import type { DirectoryEntry, Reference } from "@/lib/reference";
import { demoDay } from "./clock";

const YEARS = [2022, 2023, 2024, 2025, 2026];

/** A five-year history of rank bands, e.g. ["801–1000", …]. Sample figures. */
function hist(labels: string[]): RankPoint[] {
  return labels.map((label, i) => {
    const [a, b] = label.split("–").map((x) => Number(x.replace(/[^0-9]/g, "")) || null);
    return { year: YEARS[i], hi: a, lo: b ?? a, label };
  });
}

/** An indicator with its public weight; current, target, history and status are sample data. */
function ind(name: string, weight: string, owner: string, current: number | null, target: number | null, status: Indicator["status"], trend: Indicator["trend"], history: number[], definition: string): Indicator {
  return { name, weight, current, target, trend, status, owner, definition, formula: "As defined in the ranking body's published methodology.", history, actions: [] };
}

const CCE = "College of Coastal Engineering";
const FCD = "Faculty of Civic Design";
const CIH = "College of Island Health";
const IRS = "Institute for River Studies";
const OCS = "Office for Campus Sustainability";
const OFFICE = "Office of Rankings (demo)";

/** Shared text for the sample rankings, so each reads as a whole without inventing claims about real results. */
function ranking(r: Pick<Ranking, "slug" | "short" | "name" | "family" | "current" | "previous" | "target" | "direction" | "readiness" | "deadline" | "pending" | "measures" | "indicators" | "history">): Ranking {
  return {
    ...r,
    message: `Sample data: ${r.short} figures in this demo are invented.`,
    interpretation: `Sample figures for the demo. ${r.short} is shown with its public methodology; the result, target and readiness are invented.`,
    emphasis: r.indicators.slice(0, 2).map((i) => i.name),
    menu: ["Overview", "Indicators", "Action plan", "Methodology"],
    strengths: ["Sample strength: steady evidence from partner units"],
    gaps: ["Sample gap: outcome figures still missing for two indicators"],
    opportunities: ["Sample opportunity: reuse validated evidence across rankings"],
    dataSources: ["Unit submissions in the Hub", "Institutional statistics (sample)"],
    commonErrors: ["Evidence without a date or a public link"],
    methodologyChanges: "See the ranking body's published methodology.",
    reportingPeriod: "Sample reporting period",
    publicNote: "Sample data.",
  };
}

export function demoRankings(): Ranking[] {
  return [
    ranking({
      slug: "the-wur", short: "THE WUR", name: "THE World University Rankings", family: "THE",
      current: "1001–1200", previous: "1201–1500", target: "801–1000", direction: "up", readiness: 64, deadline: demoDay(19), pending: 7,
      measures: "Teaching, research environment, research quality, international outlook and industry.",
      history: hist(["1201–1500", "1201–1500", "1201–1500", "1201–1500", "1001–1200"]),
      indicators: [
        ind("Teaching", "29.5%", FCD, 21.4, 25, "For review", "Improving", [18, 19, 19.6, 20.2, 21.4], "The learning environment."),
        ind("Research Environment", "29%", IRS, 14.8, 18, "Needs revision", "Stable", [14, 14.2, 14.5, 14.6, 14.8], "Volume, income and reputation."),
        ind("Research Quality", "30%", IRS, 31.2, 36, "Validated", "Improving", [24, 26, 28, 29.5, 31.2], "Citation impact, strength, excellence and influence."),
        ind("International Outlook", "7.5%", CCE, 48.5, 52, "Validated", "Stable", [46, 47, 47.5, 48, 48.5], "Staff, students and co-authorship."),
        ind("Industry", "4%", CCE, 36.9, 42, "Not yet submitted", "No data", [33, 34, 35, 36, 36.9], "Income and patents."),
      ],
    }),
    ranking({
      slug: "the-impact", short: "THE Impact", name: "THE Impact Rankings", family: "THE",
      current: "401–600", previous: "601–800", target: "301–400", direction: "up", readiness: 71, deadline: demoDay(33), pending: 5,
      measures: "Universities' contribution to the UN Sustainable Development Goals.",
      history: hist(["601–800", "601–800", "601–800", "601–800", "401–600"]),
      indicators: [
        ind("SDG 17 Partnerships for the Goals", "22%", OFFICE, 58, 65, "For review", "Improving", [44, 48, 51, 55, 58], "Mandatory for every submission."),
        ind("SDG 3 Good Health and Well-being", "26%", CIH, 62, 70, "Validated", "Improving", [50, 54, 57, 60, 62], "One of the three best SDGs counted."),
        ind("SDG 11 Sustainable Cities and Communities", "26%", FCD, 55, 62, "Needs revision", "Stable", [52, 53, 54, 55, 55], "One of the three best SDGs counted."),
        ind("SDG 14 Life Below Water", "26%", CCE, 49, 58, "For review", "Improving", [38, 41, 44, 47, 49], "One of the three best SDGs counted."),
      ],
    }),
    ranking({
      slug: "qs-wur", short: "QS WUR", name: "QS World University Rankings", family: "QS",
      current: "751–760", previous: "801–850", target: "651–700", direction: "up", readiness: 58, deadline: demoDay(47), pending: 9,
      measures: "Reputation, research, internationalisation, employment and sustainability.",
      history: hist(["801–1000", "801–1000", "801–850", "801–850", "751–760"]),
      indicators: [
        ind("Academic Reputation", "30%", OFFICE, 12.1, 15, "Not yet submitted", "Stable", [11, 11.5, 11.8, 12, 12.1], "Global academic survey."),
        ind("Employer Reputation", "15%", OFFICE, 24.6, 28, "Validated", "Improving", [20, 21, 22.5, 23.8, 24.6], "Global employer survey."),
        ind("Faculty Student", "10%", FCD, 18.3, 20, "For review", "Stable", [18, 18.1, 18.2, 18.3, 18.3], "Academic staff per student."),
        ind("Citations per Faculty", "20%", IRS, 6.4, 9, "Needs revision", "Declining", [7.1, 6.9, 6.7, 6.5, 6.4], "Citations normalised by faculty size."),
        ind("International Research Network", "5%", IRS, 33.8, 38, "Validated", "Improving", [27, 29, 31, 32.5, 33.8], "Breadth of international research partnerships."),
        ind("Employment Outcomes", "5%", CCE, 41.2, 45, "For review", "Improving", [36, 38, 39, 40, 41.2], "Graduate employment and alumni impact."),
        ind("Sustainability", "5%", OCS, 52.5, 60, "Validated", "Improving", [40, 44, 47, 50, 52.5], "From the QS Sustainability ranking."),
      ],
    }),
    ranking({
      slug: "qs-sustainability", short: "QS Sustainability", name: "QS Sustainability Rankings", family: "QSS",
      current: "651–700", previous: "701–750", target: "551–600", direction: "up", readiness: 67, deadline: demoDay(61), pending: 4,
      measures: "Environmental impact, social impact and governance.",
      history: hist(["801–850", "751–800", "751–800", "701–750", "651–700"]),
      indicators: [
        ind("Environmental Impact", "45%", OCS, 46, 55, "For review", "Improving", [35, 38, 41, 44, 46], "Sustainable institutions, education and research."),
        ind("Social Impact", "45%", CIH, 51, 58, "Validated", "Improving", [42, 45, 47, 49, 51], "Equality, knowledge exchange, employability, health."),
        ind("Governance", "10%", OFFICE, 39, 50, "Not yet submitted", "No data", [30, 32, 35, 37, 39], "Good governance practices."),
      ],
    }),
    ranking({
      slug: "greenmetric", short: "UI GreenMetric", name: "UI GreenMetric World University Rankings", family: "UI",
      current: "214", previous: "239", target: "180", direction: "up", readiness: 76, deadline: demoDay(84), pending: 3,
      measures: "Campus sustainability: setting, energy, waste, water, transport and education.",
      history: hist(["301", "288", "262", "239", "214"]),
      indicators: [
        ind("Setting and Infrastructure", "15%", OCS, 1050, 1200, "Validated", "Stable", [980, 1000, 1020, 1040, 1050], "Campus setting and green space."),
        ind("Energy and Climate Change", "21%", OCS, 1325, 1500, "For review", "Improving", [1100, 1150, 1210, 1280, 1325], "Energy efficiency and renewables."),
        ind("Waste", "18%", OCS, 1200, 1350, "Validated", "Improving", [1000, 1050, 1100, 1150, 1200], "Recycling and waste treatment."),
        ind("Water", "10%", CCE, 700, 800, "Needs revision", "Stable", [650, 670, 680, 690, 700], "Water conservation and reuse."),
        ind("Transportation", "18%", OCS, 1100, 1300, "Not yet submitted", "No data", [950, 1000, 1040, 1080, 1100], "Low-carbon transport policies."),
        ind("Education and Research", "18%", IRS, 1250, 1400, "Validated", "Improving", [1050, 1100, 1150, 1200, 1250], "Sustainability courses and research."),
      ],
    }),
    ranking({
      slug: "wuri", short: "WURI", name: "World University Rankings for Innovation", family: "WURI",
      current: "Top 300", previous: "Top 400", target: "Top 200", direction: "up", readiness: 52, deadline: demoDay(112), pending: 6,
      measures: "Innovative programmes: industrial application, value creation, social responsibility and student support.",
      history: hist(["400", "400", "400", "400", "300"]),
      indicators: [
        ind("Industrial Application", "Category", CCE, null, null, "For review", "No data", [], "Programmes applied with industry."),
        ind("Value Creation", "Category", FCD, null, null, "Not yet submitted", "No data", [], "Start-ups, entrepreneurship and value created."),
        ind("Social Responsibility", "Category", CIH, null, null, "Validated", "No data", [], "Ethics, community service and inclusion."),
        ind("Student Support and Engagement", "Category", OFFICE, null, null, "Not yet submitted", "No data", [], "Support and engagement for students."),
      ],
    }),
  ];
}

/** Fictional units: the Office that runs the Hub, five contributing units and one that has just joined (empty). */
export const DEMO_DIRECTORY: DirectoryEntry[] = [
  { key: "RANKINGS-OFFICE", parentKey: null, category: "Administrative Office", name: OFFICE, emails: ["rankings.office@demo.invalid"] },
  { key: "CCE", parentKey: null, category: "Academic", name: CCE, emails: ["cce@demo.invalid"] },
  { key: "FCD", parentKey: null, category: "Academic", name: FCD, emails: ["fcd@demo.invalid"] },
  { key: "CIH", parentKey: null, category: "Academic", name: CIH, emails: ["cih@demo.invalid"] },
  { key: "CNM", parentKey: null, category: "Academic", name: "College of New Media", emails: ["cnm@demo.invalid"] },
  { key: "IRS", parentKey: null, category: "Research Center", name: IRS, emails: ["irs@demo.invalid"] },
  { key: "OCS", parentKey: null, category: "Administrative Office", name: OCS, emails: ["ocs@demo.invalid"] },
];

const SDG_NAMES: Record<number, string> = {
  1: "No Poverty", 2: "Zero Hunger", 3: "Good Health and Well-being", 4: "Quality Education", 5: "Gender Equality",
  6: "Clean Water and Sanitation", 7: "Affordable and Clean Energy", 8: "Decent Work and Economic Growth",
  9: "Industry, Innovation and Infrastructure", 10: "Reduced Inequalities", 11: "Sustainable Cities and Communities",
  12: "Responsible Consumption and Production", 13: "Climate Action", 14: "Life Below Water", 15: "Life on Land",
  16: "Peace, Justice and Strong Institutions", 17: "Partnerships for the Goals",
};

const SDG_COLORS: Record<number, string> = {
  1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21", 6: "#26BDE2", 7: "#FCC30B", 8: "#A21942", 9: "#FD6925",
  10: "#DD1367", 11: "#FD9D24", 12: "#BF8B2E", 13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B", 16: "#00689D", 17: "#19486A",
};

/** A plain tile in each goal's colour with its number, inline, so no picture is fetched (the Hub's icons live in R2). */
const sdgTile = (n: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="6" fill="${SDG_COLORS[n]}"/><text x="32" y="43" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${n}</text></svg>`,
  )}`;

export function demoReference(): Reference {
  const rankings = demoRankings();
  return {
    latestEdition: 2026,
    families: {
      THE: { key: "THE", name: "Times Higher Education", body: "THE", color: "#7A1F3D", soft: "#F4E6EB", band: "#7A1F3D" },
      QS: { key: "QS", name: "QS Quacquarelli Symonds", body: "QS", color: "#1F4E8C", soft: "#E5EDF7", band: "#1F4E8C" },
      QSS: { key: "QSS", name: "QS Sustainability", body: "QS", color: "#2E7D6B", soft: "#E3F2EE", band: "#2E7D6B" },
      UI: { key: "UI", name: "UI GreenMetric", body: "UI", color: "#3F7E44", soft: "#E8F2E8", band: "#3F7E44" },
      WURI: { key: "WURI", name: "WURI", body: "WURI", color: "#8A5A00", soft: "#F6EEDC", band: "#8A5A00" },
    },
    groups: [
      { label: "Times Higher Education", slugs: ["the-wur", "the-impact"] },
      { label: "QS", slugs: ["qs-wur", "qs-sustainability"] },
      { label: "UI GreenMetric", slugs: ["greenmetric"] },
      { label: "WURI", slugs: ["wuri"] },
    ],
    rankings,
    dimensions: ["Research", "Teaching", "Sustainability", "Partnerships", "Innovation"],
    dimensionNotes: {},
    matrix: {
      "the-wur": ["Research", "Teaching"],
      "the-impact": ["Sustainability", "Partnerships"],
      "qs-wur": ["Research", "Teaching", "Partnerships"],
      "qs-sustainability": ["Sustainability"],
      greenmetric: ["Sustainability"],
      wuri: ["Innovation", "Partnerships"],
    },
    rankingPhoto: {},
    dictionary: [
      { term: "Evidence", definition: "A document, dataset or link that shows a unit's work, sent for review.", links: [] },
      { term: "Validated", definition: "Accepted by the Office's last review step; it now counts toward the rankings.", links: [] },
      { term: "Readiness", definition: "Share of a ranking's required evidence that has been validated (sample figures in this demo).", links: [] },
    ],
    calendar: [],
    office: {
      name: OFFICE,
      reportsTo: "Office of the President (sample)",
      profileDate: demoDay(-30),
      location: "Main Building, Room 101 (sample)",
      landmark: "Beside the sample quadrangle",
      phone: "+00 0000 0000",
      email: "rankings.office@demo.invalid",
      street: "1 Sample Street",
      city: "Sample City",
      vision: "Sample vision statement for the demo.",
      mission: "Sample mission statement for the demo.",
      summary: "A fictional office used to demonstrate the portal.",
      purpose: "To show how the portal works, with sample data.",
      functions: [],
      objectives: [],
      deliverables: [],
      workplan: [],
      team: [],
      coordination: [],
      policies: [],
      faq: [],
    },
    photos: {},
    credits: [],
    process: [],
    sdgNames: SDG_NAMES,
    sdgColors: SDG_COLORS,
    sdgIcons: Object.fromEntries(Object.keys(SDG_NAMES).map((n) => [Number(n), sdgTile(Number(n))])),
    storyThemes: ["Thomasian Innovations", "Community", "Campus sustainability"],
    articleTypes: ["Journal article", "Conference paper"],
    insightTypes: ["Policy brief", "Annual report"],
    wuriCategories: rankings.find((r) => r.slug === "wuri")!.indicators.map((i) => i.name),
    reportTypes: [],
    quadrantNotes: {},
    subjectAreas: {},
    ladderSteps: ["Activity documented", "Output recorded", "Outcome measured", "Impact evidenced", "Long-term impact established"],
    pipelineSteps: ["Received", "Under review", "Accepted", "Included in final submission", "Result achieved"],
    wuriPipelineSteps: ["Proposed", "Documented", "Submitted"],
    researchFunnel: [],
    directory: DEMO_DIRECTORY,
    emblems: {},
    deadlineSources: [],
  };
}
