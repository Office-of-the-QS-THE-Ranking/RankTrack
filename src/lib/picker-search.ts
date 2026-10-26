const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Academic units listed at https://www.ust.edu.ph/academics/faculties-colleges-institutes-and-schools/.
 * Keep familiar names alongside generated initials, which cannot infer AB or AMV. */
export const UNIT_ALIASES: Record<string, string[]> = {
  "college of accountancy": ["amv", "coa", "amv coa", "amv accountancy", "accountancy"],
  "college of architecture": ["arch", "archi", "arki", "architecture"],
  "faculty of arts and letters": ["ab", "artlets", "arts and letters", "fal"],
  "faculty of civil law": ["law", "civil law", "fcl"],
  "college of commerce and business administration": ["commerce", "cba", "ccba"],
  "college of education": ["educ", "coe", "education"],
  "faculty of engineering": ["eng", "engg", "eng g", "foe", "engineering"],
  "college of fine arts and design": ["cfad", "fine arts"],
  "graduate school": ["gs", "grad school"],
  "graduate school of law": ["gsl", "gs law"],
  "college of information and computing sciences": ["cics", "iics", "ics"],
  "institute of information and computing sciences": ["cics", "iics", "ics"],
  "faculty of medicine and surgery": ["fms", "med", "medicine"],
  "conservatory of music": ["music", "com"],
  "college of nursing": ["nurs", "con", "nursing"],
  "faculty of pharmacy": ["pharma", "pha", "fop", "pharmacy"],
  "institute of physical education and athletics": ["ipea", "pe"],
  "college of rehabilitation sciences": ["crs", "rehab"],
  "college of science": ["sci", "cos", "science"],
  "college of tourism and hospitality management": ["cthm", "cthtm", "tourism", "hospitality"],
  "faculty of canon law": ["canon law", "fcanl"],
  "faculty of philosophy": ["phil", "philo", "philosophy"],
  "faculty of sacred theology": ["fst", "theo", "theology"],
  "senior high school": ["shs", "senior high"],
  "junior high school": ["jhs", "junior high", "ust hs"],
  "education high school": ["ehs", "educ hs", "educ high"],
};
const CONNECTORS = new Set(["of", "and", "the", "for", "in", "to", "at", "on"]);

/** Include both common acronym styles: CICS omits connectors; FOP keeps "of". */
function abbreviations(text: string): string[] {
  const words = text.split(" ").filter(Boolean);
  return [
    ...Object.entries(UNIT_ALIASES).filter(([name]) => text === name || text.endsWith(` ${name}`)).flatMap(([, aliases]) => aliases),
    ...(words.length > 1 ? [words.map((word) => word[0]).join(""), words.filter((word) => !CONNECTORS.has(word)).map((word) => word[0]).join("")] : []),
  ];
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[b.length];
}

/** Lower scores are closer; unrelated options are omitted. Match words in any order. */
export function pickerSearchScore(label: string, query: string): number {
  const text = normalize(label);
  const q = normalize(query).slice(0, 120);
  if (!q || text === q) return 0;
  const shortQuery = q.replace(/^ust /, "");
  const abbreviation = shortQuery.split(" ").every((word) => word.length === 1) ? shortQuery.replace(/ /g, "") : shortQuery;
  const aliases = abbreviations(text).map((alias) => alias.replace(/^ust /, ""));
  if (aliases.some((alias) => alias === abbreviation)) return 1;
  if (abbreviation.length >= 2 && aliases.some((alias) => alias.startsWith(abbreviation))) return 2;
  if (text.startsWith(q)) return 1;
  if (text.includes(q)) return 2;
  const words = text.split(" ");
  let score = 3;
  for (const token of q.split(" ")) {
    if (words.some((word) => word.startsWith(token))) continue;
    const nearest = Math.min(...words.map((word) => distance(token, word)));
    if (token.length < 3 || nearest > (token.length >= 7 ? 2 : 1)) return Infinity;
    score += nearest;
  }
  return score;
}
