/*
 * Presentation mock data. None of these figures are UST's published results.
 * Applied by data.ts only when NEXT_PUBLIC_DEMO_DATA=1; leave the variable unset for real use.
 */
import type {
  ActionItem,
  Dimension,
  EvidenceItem,
  EvidenceStatus,
  Indicator,
  PlanStatus,
  Quadrant,
  RankPoint,
  Ranking,
  Requirement,
  Story,
  SubjectArea,
} from "./data";

export const DEMO_ON = process.env.NEXT_PUBLIC_DEMO_DATA === "1";

const YEARS = [2022, 2023, 2024, 2025, 2026];
const band = (s: string): RankPoint["hi"][] => {
  const [a, b] = s.split("–").map(Number);
  return [a, b ?? a];
};
const hist = (labels: string[]): RankPoint[] =>
  labels.map((label, i) => {
    const [hi, lo] = band(label);
    return { year: YEARS[i], hi, lo, label };
  });

/** [current, target, trend, status, five-year history] per indicator, in the order data.ts lists them. */
type IV = [number, number, Indicator["trend"], EvidenceStatus, number[]];

interface RankingDemo {
  current: string;
  previous: string;
  target: string;
  direction: Ranking["direction"];
  readiness: number;
  pending: number;
  interpretation: string;
  history: RankPoint[];
  values: IV[];
  strengths: string[];
  gaps: string[];
  opportunities: string[];
  publicNote: string;
}

const RANKS: Record<string, RankingDemo> = {
  "qs-wur": {
    current: "681–690",
    previous: "801–850",
    target: "601–650",
    direction: "up",
    readiness: 78,
    pending: 6,
    interpretation: "UST moved out of the 801–850 band on stronger employer reputation and international research network scores.",
    history: hist(["801–1000", "801–1000", "801–850", "801–850", "681–690"]),
    values: [
      [18.4, 22, "Improving", "Validated", [12.1, 13.5, 14.8, 16.2, 18.4]],
      [41.2, 45, "Improving", "Validated", [30.4, 33.1, 35.8, 38.6, 41.2]],
      [6.8, 9, "Stable", "For review", [5.9, 6.1, 6.4, 6.6, 6.8]],
      [24.5, 28, "Declining", "Needs revision", [29.8, 28.1, 26.9, 25.2, 24.5]],
      [55.3, 60, "Improving", "Validated", [44.0, 47.2, 50.1, 52.8, 55.3]],
      [8.1, 12, "Stable", "For review", [7.2, 7.5, 7.8, 8.0, 8.1]],
      [3.4, 6, "Stable", "Not yet submitted", [2.9, 3.0, 3.2, 3.3, 3.4]],
      [52.7, 58, "Improving", "Validated", [38.5, 42.0, 46.3, 49.9, 52.7]],
      [47.9, 55, "Improving", "For review", [21.0, 30.5, 38.2, 43.6, 47.9]],
    ],
    strengths: ["Employer reputation up 11 points in four editions", "International research network growing every year"],
    gaps: ["Faculty–student ratio slipping as enrolment grows", "Citations per faculty still below the band median"],
    opportunities: ["Count part-time faculty as FTE consistently", "Nominate more international employers for the QS survey"],
    publicNote: "UST's best QS World University Rankings result to date.",
  },
  "the-wur": {
    current: "1201–1500",
    previous: "1201–1500",
    target: "1001–1200",
    direction: "steady",
    readiness: 64,
    pending: 9,
    interpretation: "Held in band; research quality improved but teaching income data came in late.",
    history: hist(["1201–1500", "1201–1500", "1201–1500", "1201–1500", "1201–1500"]),
    values: [
      [22.6, 26, "Stable", "For review", [21.0, 21.4, 21.9, 22.3, 22.6]],
      [11.8, 15, "Improving", "Needs revision", [8.2, 9.0, 9.9, 10.9, 11.8]],
      [38.4, 45, "Improving", "Validated", [29.5, 31.8, 34.0, 36.1, 38.4]],
      [44.1, 48, "Stable", "Validated", [42.0, 42.8, 43.5, 43.9, 44.1]],
      [17.9, 22, "Improving", "Not yet submitted", [15.1, 15.8, 16.5, 17.2, 17.9]],
    ],
    strengths: ["Research quality up nine points since WUR 3.0"],
    gaps: ["Research income per staff under-reported", "Industry income evidence incomplete"],
    opportunities: ["Consolidate affiliation variants in Scopus"],
    publicNote: "",
  },
  "the-impact": {
    current: "401–600",
    previous: "601–800",
    target: "301–400",
    direction: "up",
    readiness: 82,
    pending: 4,
    interpretation: "SDG 3 and SDG 17 evidence lifted the overall score into the 401–600 band.",
    history: hist(["801–1000", "601–800", "601–800", "601–800", "401–600"]),
    values: [
      [71.4, 78, "Improving", "Validated", [52.0, 58.3, 62.1, 66.8, 71.4]],
      [68.9, 74, "Improving", "Validated", [49.5, 55.0, 60.2, 64.7, 68.9]],
      [62.3, 70, "Stable", "For review", [55.1, 57.4, 59.6, 61.0, 62.3]],
      [58.7, 66, "Improving", "Needs revision", [41.2, 46.8, 51.5, 55.3, 58.7]],
    ],
    strengths: ["SDG 3 ranked in the top 200 worldwide", "Partnership evidence now fully public"],
    gaps: ["SDG 11 heritage evidence missing approval dates"],
    opportunities: ["Add SDG 6 using Facilities water data"],
    publicNote: "Up a full band in the THE Impact Ratings.",
  },
  "the-subject": {
    current: "501–600",
    previous: "501–600",
    target: "401–500",
    direction: "steady",
    readiness: 58,
    pending: 7,
    interpretation: "Education ranked again; Life Sciences sits at 86% of the output threshold.",
    history: hist(["601–800", "501–600", "501–600", "501–600", "501–600"]),
    values: [
      [34.2, 40, "Improving", "For review", [26.0, 28.4, 30.5, 32.6, 34.2]],
      [29.8, 33, "Stable", "Validated", [28.1, 28.6, 29.0, 29.5, 29.8]],
      [86, 100, "Improving", "Not yet submitted", [61, 68, 74, 80, 86]],
    ],
    strengths: ["Education held in the 501–600 band"],
    gaps: ["Life Sciences short of the publication threshold"],
    opportunities: ["Map interdisciplinary outputs to Life Sciences"],
    publicNote: "",
  },
  "qs-sustainability": {
    current: "781–800",
    previous: "801–850",
    target: "701–750",
    direction: "steady",
    readiness: 71,
    pending: 5,
    interpretation: "Social impact remains the strongest pillar; environmental data improved with the new metering.",
    history: hist(["1001–1200", "901–950", "801–850", "801–850", "781–800"]),
    values: [
      [36.5, 45, "Improving", "For review", [22.0, 26.4, 30.1, 33.8, 36.5]],
      [58.2, 62, "Stable", "Validated", [52.4, 54.0, 55.9, 57.1, 58.2]],
      [49.0, 55, "Stable", "Validated", [45.3, 46.8, 47.5, 48.4, 49.0]],
    ],
    strengths: ["Social impact pillar above the Philippine average"],
    gaps: ["Scope 2 emissions baseline still estimated"],
    opportunities: ["Publish the sustainability policy with approval date"],
    publicNote: "",
  },
  "qs-subject": {
    current: "401–450",
    previous: "401–450",
    target: "351–400",
    direction: "steady",
    readiness: 66,
    pending: 6,
    interpretation: "Medicine stays in 401–450; Pharmacy is 12% short of the paper threshold.",
    history: hist(["451–500", "451–500", "401–450", "401–450", "401–450"]),
    values: [
      [42.7, 48, "Improving", "Validated", [35.2, 37.0, 39.1, 41.0, 42.7]],
      [51.3, 55, "Stable", "For review", [48.0, 49.2, 50.1, 50.8, 51.3]],
      [38.9, 44, "Improving", "Validated", [30.5, 32.8, 35.0, 37.1, 38.9]],
      [88, 100, "Improving", "Needs revision", [60, 69, 76, 82, 88]],
    ],
    strengths: ["Medicine academic reputation rising steadily"],
    gaps: ["Pharmacy paper count below the QS threshold"],
    opportunities: ["Encourage Pharmacy co-authorship with the Hospital"],
    publicNote: "",
  },
  greenmetric: {
    current: "97",
    previous: "112",
    target: "80",
    direction: "up",
    readiness: 88,
    pending: 2,
    interpretation: "Energy and transport improvements carried UST into the global top 100.",
    history: hist(["142", "128", "121", "112", "97"]),
    values: [
      [1050, 1200, "Stable", "Validated", [980, 1000, 1020, 1035, 1050]],
      [1520, 1750, "Improving", "Validated", [1150, 1260, 1350, 1440, 1520]],
      [1425, 1600, "Improving", "Validated", [1100, 1200, 1290, 1365, 1425]],
      [680, 800, "Stable", "For review", [610, 630, 650, 665, 680]],
      [1310, 1500, "Improving", "Validated", [900, 1020, 1140, 1230, 1310]],
      [1490, 1650, "Improving", "Validated", [1180, 1270, 1350, 1420, 1490]],
    ],
    strengths: ["First top-100 GreenMetric result", "Transport score up 46% since 2022"],
    gaps: ["Water recycling evidence thin"],
    opportunities: ["Rainwater harvesting at the new Sports Complex"],
    publicNote: "UST enters the UI GreenMetric global top 100.",
  },
  wuri: {
    current: "84",
    previous: "112",
    target: "60",
    direction: "up",
    readiness: 74,
    pending: 3,
    interpretation: "Four programmes placed in category Top 100s, led by Social Responsibility.",
    history: hist(["201", "176", "141", "112", "84"]),
    values: [
      [72, 80, "Improving", "Validated", [55, 60, 64, 68, 72]],
      [68, 78, "Improving", "For review", [50, 55, 60, 64, 68]],
      [84, 88, "Improving", "Validated", [66, 71, 76, 80, 84]],
      [61, 70, "Stable", "Needs revision", [56, 58, 59, 60, 61]],
    ],
    strengths: ["SIMBAHAYAN programmes recognised in Social Responsibility"],
    gaps: ["Outcome data for mobility programmes"],
    opportunities: ["Submit the Engineering flood-sensor programme"],
    publicNote: "Up 28 places in WURI.",
  },
};

export function withDemo(r: Ranking): Ranking {
  const d = RANKS[r.slug];
  if (!DEMO_ON || !d) return r;
  const { values, ...rest } = d;
  return {
    ...r,
    ...rest,
    indicators: r.indicators.map((ind, i) => {
      const v = values[i];
      if (!v) return ind;
      const [current, target, trend, status, history] = v;
      return { ...ind, current, target, trend, status, history, actions: status === "Validated" ? [] : [`Confirm ${ind.name} figures with the owner office`] };
    }),
  };
}

const unitName: Record<string, string> = {
  engineering: "Faculty of Engineering",
  medicine: "Faculty of Medicine and Surgery",
  science: "College of Science",
  education: "College of Education",
  pharmacy: "Faculty of Pharmacy",
  architecture: "College of Architecture",
  nursing: "College of Nursing",
  cics: "College of Information and Computing Sciences",
  rcnas: "Research Center for the Natural and Applied Sciences",
  fmo: "Facilities Management Office",
  oirp: "Office of International Relations and Programs",
  simbahayan: "Office for Community Development (SIMBAHAYAN)",
  careers: "Office for Career Services",
  library: "Miguel de Benavides Library",
};

const ev = (
  n: number,
  unitSlug: string,
  title: string,
  type: string,
  status: EvidenceStatus,
  stage: number,
  level: EvidenceItem["level"],
  mappedTo: string[],
  sdgs: number[],
  summary: string,
  result: string,
  beneficiaries: string,
  submitted: string,
): EvidenceItem => ({
  id: `EV-${String(n).padStart(4, "0")}`,
  title,
  unit: unitName[unitSlug],
  unitSlug,
  type,
  period: "2025",
  submitted,
  submittedBy: `${unitName[unitSlug].split(" ").slice(-1)[0]} coordinator`,
  status,
  stage,
  level,
  mappedTo,
  sdgs,
  summary,
  result,
  beneficiaries,
  files: [`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf`],
  comments:
    status === "Needs revision"
      ? [{ by: "Rankings Office", role: "Validator", date: submitted, text: "Please add the approval date and a public link." }]
      : [],
});

const EVIDENCE: EvidenceItem[] = [
  ev(1, "engineering", "Flood early-warning sensor network for Sampaloc", "Programme", "Validated", 4, 4, ["WURI · Industrial Application", "THE Impact · SDG 11 Sustainable Cities and Communities"], [11, 13], "IoT river-level sensors with SMS alerts for six barangays.", "Average warning lead time rose from 20 to 95 minutes.", "14,200 residents", "2026-08-12"),
  ev(2, "engineering", "Industry-funded research contracts FY2025", "Dataset", "For review", 1, 2, ["THE WUR · Industry"], [9], "Contracts and income from 23 industry partners.", "₱48.6M industry research income.", "", "2026-09-30"),
  ev(3, "medicine", "Community diabetes screening programme", "Programme", "Validated", 5, 5, ["THE Impact · SDG 3 Good Health and Well-being", "QS Sustainability · Social Impact"], [3], "Monthly screening and follow-up in Manila district health centres.", "HbA1c control improved for 61% of enrolled patients.", "3,850 patients", "2026-07-21"),
  ev(4, "medicine", "International co-authored publications 2020–2024", "Dataset", "Validated", 3, 2, ["QS WUR · International Research Network", "THE WUR · International Outlook"], [17], "Scopus export of co-authored outputs.", "412 papers with 38 countries.", "", "2026-06-02"),
  ev(5, "science", "Pasig River microplastics monitoring", "Research", "For review", 1, 3, ["THE Impact · SDG 17 Partnerships for the Goals"], [6, 14], "Quarterly sampling with DENR and two partner universities.", "First public microplastics baseline for the river.", "Pasig River communities", "2026-10-03"),
  ev(6, "education", "Teacher upskilling for public schools", "Programme", "Validated", 4, 4, ["THE Impact · SDG 4 Quality Education"], [4], "Blended training in science pedagogy for DepEd teachers.", "Learner science scores up 14% in partner schools.", "620 teachers", "2026-05-18"),
  ev(7, "architecture", "Intramuros heritage documentation", "Research", "Needs revision", 1, 2, ["THE Impact · SDG 11 Sustainable Cities and Communities"], [11], "Measured drawings of 18 heritage structures.", "", "Intramuros Administration", "2026-09-14"),
  ev(8, "pharmacy", "Medicinal plant formulation patents", "Patent", "Needs revision", 1, 2, ["QS by Subject · Pharmacy: distance to threshold"], [3], "Two patent filings from lagundi and sambong research.", "", "", "2026-09-22"),
  ev(9, "fmo", "Campus energy metering and solar output 2025", "Dataset", "Validated", 4, 3, ["UI GreenMetric · Energy and Climate Change", "QS Sustainability · Environmental Impact"], [7, 13], "Sub-metered electricity and 1.2 MW rooftop solar output.", "Electricity per person down 9%.", "", "2026-08-30"),
  ev(10, "fmo", "Water recycling and rainwater harvesting", "Dataset", "For review", 1, 2, ["UI GreenMetric · Water"], [6], "Volumes treated and reused in 2025.", "", "", "2026-10-10"),
  ev(11, "oirp", "International faculty and student census", "Dataset", "Validated", 3, 1, ["QS WUR · International Faculty Ratio", "QS WUR · International Student Ratio"], [17], "FTE census as at 31 August 2025.", "", "", "2026-06-20"),
  ev(12, "simbahayan", "Tahanan livelihood and housing programme", "Programme", "Validated", 5, 5, ["WURI · Social Responsibility", "THE Impact · SDG 17 Partnerships for the Goals"], [1, 8, 11], "Housing and livelihood support with Gawad Kalinga.", "Household income up 32% after two years.", "410 families", "2026-07-02"),
  ev(13, "careers", "Graduate employment tracer 2025", "Survey", "For review", 1, 3, ["QS WUR · Employment Outcomes"], [8], "Tracer of the 2024 graduating class.", "91% employed or in further study within a year.", "6,900 graduates", "2026-10-15"),
  ev(14, "nursing", "Barangay health worker training", "Programme", "Not yet submitted", 0, 1, ["THE Impact · SDG 3 Good Health and Well-being"], [3], "", "", "", "2026-10-20"),
  ev(15, "cics", "Open-source LGU records system", "Innovation", "Validated", 3, 3, ["WURI · Value Creation"], [9, 16], "Records system adopted by three municipalities.", "Permit processing time cut by half.", "3 LGUs", "2026-08-08"),
  ev(16, "library", "Open-access repository usage", "Dataset", "Validated", 3, 2, ["THE Impact · SDG 17 Partnerships for the Goals"], [4, 17], "Downloads of theses and journals on the UST repository.", "1.3M downloads from 141 countries.", "", "2026-07-11"),
];

const REQUIREMENTS: Requirement[] = [
  { id: "REQ-ENG-1", title: "Industry research income FY2025", ranking: "the-wur", indicator: "Industry", due: "2026-11-30", status: "For review", template: "Income template", evidenceId: "EV-0002" },
  { id: "REQ-ENG-2", title: "WURI programme dossier", ranking: "wuri", indicator: "Industrial Application", due: "2027-01-12", status: "Validated", template: "WURI dossier", evidenceId: "EV-0001" },
  { id: "REQ-ENG-3", title: "Faculty FTE by department", ranking: "qs-wur", indicator: "Faculty–Student Ratio", due: "2026-12-15", status: "Not yet submitted", template: "FTE census" },
];

const story = (s: Omit<Story, "lessons" | "evidence" | "replication"> & Partial<Story>): Story => ({
  evidence: "Validated in the Hub with public links.",
  replication: "Partner with a local government unit and start with one pilot site.",
  lessons: "Agree outcome measures with the community before starting.",
  ...s,
});

const STORIES: Story[] = [
  story({ slug: "flood-sensors", postedAt: "2026-09-18T01:30:00.000Z", title: "Sensors that buy Sampaloc an hour", unit: unitName.engineering, kind: "Innovation", state: "Published", year: 2026, themes: ["Thomasian Innovations", "Community Transformation"], sdgs: [11, 13], rankings: ["wuri", "the-impact"], challenge: "Flash floods reach homes along the Estero de Sampaloc with little warning.", response: "Engineering students built low-cost river-level sensors that text residents.", implementation: "Twelve sensors across six barangays, maintained with the LGU.", beneficiaries: "14,200 residents", outcome: "Warning lead time rose from 20 to 95 minutes.", outcomeFigure: "95 min", outcomeLabel: "average warning lead time", images: ["/media/site/photos/field-students.jpg", "/media/site/photos/campus-aerial.jpg"] }),
  story({ slug: "diabetes-screening", postedAt: "2026-08-27T03:10:00.000Z", title: "Screening that follows patients home", unit: unitName.medicine, kind: "SDG story", state: "Published", year: 2026, themes: ["SDG Stories", "Research Impact"], sdgs: [3], rankings: ["the-impact", "qs-sustainability"], challenge: "Many diabetic patients in Manila go years without a diagnosis.", response: "Medical faculty and students run monthly screening with home follow-up.", implementation: "Four district health centres, one patient registry.", beneficiaries: "3,850 patients", outcome: "61% of enrolled patients reached HbA1c control.", outcomeFigure: "61%", outcomeLabel: "patients with controlled blood sugar", images: ["/media/site/photos/hospital-2024.jpg", "/media/site/photos/hospital-1946.jpg"] }),
  story({ slug: "tahanan", postedAt: "2025-11-12T02:00:00.000Z", title: "Tahanan: homes and livelihoods together", unit: unitName.simbahayan, kind: "Partnership", state: "Published", year: 2025, themes: ["Community Transformation", "International Partnerships"], sdgs: [1, 8, 11], rankings: ["wuri", "the-impact"], challenge: "Relocated families lost both housing security and income.", response: "SIMBAHAYAN paired housing with livelihood training.", implementation: "Five communities with Gawad Kalinga.", beneficiaries: "410 families", outcome: "Household income up 32% after two years.", outcomeFigure: "+32%", outcomeLabel: "household income", images: ["/media/site/photos/arch-of-centuries.jpg", "/media/site/photos/courtyard-1800s.jpg"] }),
  story({ slug: "solar-campus", postedAt: "2026-06-03T06:45:00.000Z", title: "A campus that makes its own power", unit: unitName.fmo, kind: "Campus sustainability", state: "Published", year: 2026, themes: ["Campus Sustainability"], sdgs: [7, 13], rankings: ["greenmetric", "qs-sustainability"], challenge: "Electricity was the largest source of campus emissions.", response: "Rooftop solar and building-level metering.", implementation: "1.2 MW across nine rooftops.", beneficiaries: "Whole campus", outcome: "Electricity per person down 9% in a year.", outcomeFigure: "−9%", outcomeLabel: "electricity per person", images: ["/media/site/photos/main-building-day.jpg", "/media/site/photos/arch-aerial.jpg"] }),
  story({ slug: "teacher-upskilling", title: "Better science classes in public schools", unit: unitName.education, kind: "SDG story", state: "In review", year: 2026, themes: ["SDG Stories", "Replicable Practices"], sdgs: [4], rankings: ["the-impact"], challenge: "Public school science teachers had little access to training.", response: "Blended pedagogy courses with classroom coaching.", implementation: "620 DepEd teachers in two divisions.", beneficiaries: "620 teachers", outcome: "Learner science scores up 14%.", outcomeFigure: "+14%", outcomeLabel: "learner science scores", images: ["/media/site/photos/benavides.jpg"] }),
];

const SDG_DATA: Record<number, [number, number, number, number]> = {
  // readiness, submitted, validated, units
  3: [86, 14, 11, 5], 4: [78, 10, 8, 3], 11: [64, 9, 5, 4], 17: [90, 18, 15, 7],
  6: [42, 4, 1, 2], 7: [70, 6, 4, 1], 13: [58, 7, 4, 3], 1: [48, 5, 3, 2], 8: [55, 6, 4, 2],
};

export const demo = {
  evidence: EVIDENCE,
  requirements: REQUIREMENTS,
  stories: STORIES,
  sdgTile: <T extends { sdg: number }>(t: T): T => {
    const d = SDG_DATA[t.sdg];
    if (!d) return t;
    const [readiness, submitted, validated, units] = d;
    return { ...t, readiness, submitted, validated, units, outputs: submitted * 6, policies: Math.ceil(validated / 3), outcomes: validated, beneficiaries: `${(validated * 870).toLocaleString("en-US")} people`, submittedForRating: [3, 4, 11, 17].includes(t.sdg) };
  },
  ladder: [42, 31, 19, 11, 5],
  pipeline: [64, 52, 41, 36, 28, 12],
  wuriPipeline: [38, 26, 17, 12, 8, 4, 2],
  wuriPlacements: ["Social Responsibility", "Industrial Application", "Value Creation", "Crisis Management"],
  dimensionScores: [
    ["Research", 58, 70], ["Teaching and learning", 62, 70], ["Reputation", 47, 60], ["Employability", 71, 78], ["Internationalization", 39, 55],
    ["Sustainability", 74, 80], ["Social impact", 81, 85], ["Innovation", 52, 65], ["Campus operations", 69, 75],
  ].map(([dimension, current, target]) => ({ dimension: dimension as Dimension, current: current as number, target: target as number })),
  actions: [
    { id: "A-01", action: "Re-submit faculty FTE with part-time staff as fractions", ranking: "qs-wur", unit: "Human Resource Department", due: "2026-12-15", status: "Needs revision" },
    { id: "A-02", action: "Add approval dates to heritage policies", ranking: "the-impact", unit: unitName.architecture, due: "2026-11-15", status: "Not started" },
    { id: "A-03", action: "Upload water recycling volumes", ranking: "greenmetric", unit: unitName.fmo, due: "2026-10-31", status: "For review" },
    { id: "A-04", action: "Confirm industry income figures", ranking: "the-wur", unit: unitName.engineering, due: "2026-11-30", status: "For review" },
    { id: "A-05", action: "Graduate tracer response-rate note", ranking: "qs-wur", unit: unitName.careers, due: "2026-12-01", status: "Validated" },
  ] satisfies ActionItem[],
  subjects: {
    "Global anchors": [{ name: "Medicine", note: "QS 401–450", area: "Life sciences and medicine" }, { name: "Education", note: "THE 501–600", area: "Social sciences and management" }],
    "Emerging strengths": [{ name: "Pharmacy", note: "88% of QS threshold", area: "Life sciences and medicine" }, { name: "Life Sciences", note: "86% of THE threshold", area: "Natural sciences" }],
    "Development priorities": [{ name: "Engineering", note: "Rising citations", area: "Engineering and technology" }, { name: "Architecture", note: "Reputation building", area: "Arts and humanities" }],
    Monitor: [{ name: "Computer Science", note: "Output growing", area: "Engineering and technology" }],
  } as Record<Quadrant, { name: string; note: string; area: SubjectArea }[]>,
  greenmetric: [
    [["Green-space share", "62%", "65%"], ["Sustainability budget", "₱84M", "₱100M"]],
    [["Electricity per person", "412 kWh", "380 kWh"], ["Renewable share", "18%", "25%"]],
    [["Waste treated", "71%", "80%"], ["Recycling programme", "Campus-wide", "Campus-wide"]],
    [["Water recycled", "22%", "30%"], ["Efficient fixtures", "64%", "80%"]],
    [["Zero-emission vehicles", "14", "25"], ["Pedestrian path share", "58%", "65%"]],
    [["Sustainability courses", "186", "220"], ["Sustainability publications", "241", "300"]],
  ],
  qss: [[14, 9, "For review"], [22, 17, "Validated"], [6, 4, "Validated"]] as [number, number, EvidenceStatus][],
  funnel: ["1,840", "3,212", "1,064", "412", "22.4", "20%"],
  recognition: [
    { award: "Most improved unit", unit: unitName.fmo, reason: "Energy and transport data that lifted GreenMetric into the top 100." },
    { award: "Impact champion", unit: unitName.simbahayan, reason: "Tahanan programme recognised in WURI Social Responsibility." },
    { award: "Evidence excellence", unit: unitName.medicine, reason: "Every SDG 3 submission validated on first review." },
  ],
  plan: [
    { action: "Raise international co-authorship", kpi: "Co-authored papers 412 → 500", owner: "OVRRI", timeline: "Jun 2027", progress: 62, status: "On track" },
    { action: "Clean faculty FTE reporting", kpi: "One FTE source for QS and THE", owner: "HRD", timeline: "Dec 2026", progress: 35, status: "At risk" },
    { action: "Public evidence links for all SDGs", kpi: "100% of SDG evidence public", owner: "Rankings Office", timeline: "Nov 2026", progress: 88, status: "On track" },
    { action: "Pharmacy publication push", kpi: "Reach the QS paper threshold", owner: unitName.pharmacy, timeline: "Mar 2027", progress: 20, status: "Not started" },
    { action: "Water recycling baseline", kpi: "Metered reuse volumes", owner: unitName.fmo, timeline: "Oct 2026", progress: 100, status: "Complete" },
  ] satisfies { action: string; kpi: string; owner: string; timeline: string; progress: number; status: PlanStatus }[],
  comparison: [
    { name: "University of the Philippines", value: "335", own: false },
    { name: "Ateneo de Manila University", value: "481–490", own: false },
    { name: "De La Salle University", value: "601–610", own: false },
    { name: "University of Santo Tomas", value: "681–690", own: true },
  ],
  notifications: [
    { text: "Facilities uploaded water recycling volumes for review", when: "2026-10-23", href: "/admin/validation" },
    { text: "Career Services submitted the 2025 graduate tracer", when: "2026-10-15", href: "/admin/validation" },
    { text: "UI GreenMetric questionnaire closes in 7 days", when: "2026-10-24", href: "/admin/rankings/greenmetric" },
  ],
  unitNotifications: [
    { text: "Your industry income evidence is under review", when: "2026-10-01", href: "/portal" },
    { text: "Faculty FTE by department is due 15 Dec", when: "2026-10-20", href: "/portal" },
  ],
};
