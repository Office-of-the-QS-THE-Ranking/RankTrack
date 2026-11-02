/*
 * QS World University Rankings by Subject 2026, from the fact file QS sends each institution: five broad subject
 * areas and their 55 narrow subjects, each with the indicator weights QS publishes for its area. QS computes the
 * scores itself from its surveys and Scopus, so the edition holds results only: the ranks and scores the Office
 * records from the fact file each year, compared with peers.
 */
import type { CatalogIndicator, Group, MethodologyPack } from "../../src/lib/analytics/types";
import { indicatorDefaults } from "./shared";

const AREAS: { code: string; name: string; weights: [number, number, number, number, number]; subjects: string[]; owner: string[] }[] = [
  {
    code: "AH",
    name: "Arts & Humanities",
    weights: [60, 20, 5, 7.5, 7.5],
    owner: ["arts-letters", "rccah"],
    subjects: ["Archaeology", "Architecture / Built Environment", "Art & Design", "Classics & Ancient History", "English Language & Literature", "History", "History of Art", "Linguistics", "Modern Languages", "Music", "Performing Arts", "Philosophy", "Theology, Divinity & Religious Studies"],
  },
  {
    code: "ET",
    name: "Engineering & Technology",
    weights: [40, 30, 10, 10, 10],
    owner: ["engineering", "cics"],
    subjects: ["Computer Science & Information Systems", "Data Science and Artificial Intelligence", "Engineering - Chemical", "Engineering - Civil & Structural", "Engineering - Electrical & Electronic", "Engineering - Mechanical, Aeronautical & Manufacturing", "Engineering - Mineral & Mining", "Petroleum Engineering"],
  },
  {
    code: "LS",
    name: "Life Sciences & Medicine",
    weights: [40, 20, 20, 10, 10],
    owner: ["medicine", "pharmacy", "nursing"],
    subjects: ["Agriculture & Forestry", "Anatomy & Physiology", "Biological Sciences", "Dentistry", "Medicine", "Nursing", "Pharmacy & Pharmacology", "Psychology", "Veterinary Science"],
  },
  {
    code: "NS",
    name: "Natural Sciences",
    weights: [40, 20, 10, 15, 15],
    owner: ["science", "rcnas"],
    subjects: ["Chemistry", "Earth & Marine Sciences", "Environmental Sciences", "Geography", "Geology", "Geophysics", "Materials Science", "Mathematics", "Physics & Astronomy"],
  },
  {
    code: "SS",
    name: "Social Sciences & Management",
    weights: [30, 50, 5, 7.5, 7.5],
    owner: ["c12", "c19", "education", "c04", "c20"],
    subjects: ["Accounting & Finance", "Anthropology", "Business & Management Studies", "Communication & Media Studies", "Development Studies", "Economics & Econometrics", "Education", "Hospitality & Leisure Management", "Law", "Library & Information Management", "Marketing", "Politics & International Studies", "Social Policy & Administration", "Sociology", "Sports-related Subjects", "Statistics & Operational Research"],
  },
];

/** "Engineering - Chemical" → engineering-chemical: the key results are recorded under ("medicine:rank"). */
export const subjectKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const INDICATORS = ["Academic Reputation", "Employer Reputation", "Citations per Paper", "H-Index", "International Research Network"];

export function qsSubject2026(): MethodologyPack {
  const base = indicatorDefaults();
  const groups: Group[] = AREAS.map((a, i) => ({ code: a.code, position: i + 1, name: a.name, points: null, weight: null, mandatory: false }));
  const indicators: CatalogIndicator[] = [];
  for (const a of AREAS) {
    const weights = INDICATORS.map((n, i) => `${n} ${a.weights[i]}%`).join(", ");
    indicators.push({ ...base, code: subjectKey(a.name), position: indicators.length + 1, group: a.code, name: `${a.name} (broad area)`, guidance: `Broad-area weights: ${weights}.`, input: { type: "result" }, owners: a.owner, tags: ["broad"] });
    for (const s of a.subjects)
      indicators.push({ ...base, code: subjectKey(s), position: indicators.length + 1, group: a.code, parent: subjectKey(a.name), name: s, guidance: `Weights follow the subject’s own mix in the fact file; the broad area’s are ${weights}.`, input: { type: "result" }, owners: a.owner });
  }
  return {
    pack: 1,
    edition: {
      id: "qs-subject-2026",
      ranking: "qs-subject",
      year: 2026,
      label: "QS by Subject 2026",
      methodology: "QS World University Rankings by Subject 2026 fact file",
      period: "Reputation surveys and Scopus publications 2020–2024",
      status: "Closed",
      scale: 100,
      aggregate: "results",
      options: {},
      sources: ["QS Subject Rankings - 2026 - Fact file (1).pdf", "QS World University Rankings by Subject - Medicine - 2026 - Certificate (1).pdf"],
      notes: "Published 25 March 2026. To be ranked in a subject: teach it, pass the reputation threshold, and pass the subject’s five-year Scopus paper threshold.",
      years: [2026],
    },
    groups,
    indicators,
  };
}
