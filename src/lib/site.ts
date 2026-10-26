/*
 * Content used only by the public website (src/components/site). Results, stories and units still come
 * from lib/data.ts; this file adds the pictures, short labels and plain-language copy around them.
 * Pictures are found photographs of the University (credited in the footer from lib/credits.json).
 */
import { DIMENSIONS, DIMENSION_NOTES, FAMILY, MATRIX, PIPELINE, RANKINGS, RANKING_GROUPS, rankingBySlug, type Ranking } from "./data";

export type Photo = { src: string; alt: string; pos?: string };

export const PHOTOS = {
  hero: { src: "/images/main-building-blue-hour.jpg", alt: "The Main Building of the University of Santo Tomas, lit at dusk", pos: "50% 50%" },
  day: { src: "/images/main-building-day.jpg", alt: "The clock tower of the Main Building framed by acacia branches", pos: "50% 30%" },
  aerial: { src: "/images/campus-aerial.jpg", alt: "The Main Building among the trees of the España campus, with Manila beyond", pos: "50% 50%" },
  field: { src: "/images/field-students.jpg", alt: "Students crossing the open field in front of the Main Building", pos: "40% 50%" },
  arch: {
    src: "/images/arch-of-centuries.jpg",
    alt: "The Arch of the Centuries, the gate brought from the first campus in Intramuros",
    pos: "50% 45%",
  },
  archAerial: { src: "/images/arch-aerial.jpg", alt: "The Arch of the Centuries among the campus gardens, seen from above", pos: "50% 50%" },
  benavides: {
    src: "/images/benavides.jpg",
    alt: "The monument to Miguel de Benavides, founder of the University, on the España campus",
    pos: "50% 22%",
  },
  carillon: { src: "/images/carillon.jpg", alt: "The UST Carillon beside a white colonnade on the España campus", pos: "60% 50%" },
  library: { src: "/images/library-1800s.jpg", alt: "Readers in the University library in the nineteenth century", pos: "50% 50%" },
  courtyard: {
    src: "/images/courtyard-1800s.jpg",
    alt: "Students around the fountain of the main courtyard in the nineteenth century",
    pos: "50% 50%",
  },
  cabinet: { src: "/images/physics-cabinet-1800s.jpg", alt: "The University's physics cabinet in the nineteenth century", pos: "50% 50%" },
  hospital: { src: "/images/hospital-2024.jpg", alt: "The UST Hospital on the España campus", pos: "50% 50%" },
  hospital1946: { src: "/images/hospital-1946.jpg", alt: "The facade of the 1946 UST Hospital building", pos: "50% 40%" },
  night: { src: "/images/main-building-night.jpg", alt: "Lamps reflected on a rain-wet walk behind the Main Building at night", pos: "50% 60%" },
  festive: { src: "/images/main-building-2019.jpg", alt: "The Main Building tower lit at night, with lanterns across the plaza", pos: "50% 40%" },
  map: { src: "/images/intramuros-1898-map.jpg", alt: "Map of Intramuros, the walled city of Manila, in 1898", pos: "50% 50%" },
} satisfies Record<string, Photo>;

/** A picture of the University's world beside each ranking (the list's photo bullets). */
export const RANKING_PHOTO: Record<string, Photo> = {
  "the-wur": PHOTOS.library,
  "the-impact": PHOTOS.hospital,
  "the-subject": PHOTOS.cabinet,
  "qs-wur": PHOTOS.day,
  "qs-sustainability": PHOTOS.night,
  "qs-subject": PHOTOS.hospital1946,
  greenmetric: PHOTOS.archAerial,
  wuri: PHOTOS.carillon,
};

/** The four ranking bodies, with the colour that identifies each beside its name. */
export const BODIES = RANKING_GROUPS.map((g) => {
  const rankings = g.slugs.map((s) => rankingBySlug(s)!);
  const family = rankings[0].family;
  const name = family === "THE" ? "Times Higher Education" : family === "QS" ? "QS Quacquarelli Symonds" : FAMILY[family].name;
  const short = family === "UI" ? "GreenMetric" : family;
  return {
    id: g.label
      .toLowerCase()
      .replace(/[^a-z]+/g, "-")
      .replace(/-+$/, ""),
    label: g.label,
    short,
    name,
    color: FAMILY[family].color,
    rankings,
  };
});

/** How a result moved between the last two editions, in words. */
export function movement(r: Ranking): string {
  if (r.direction === "up") return `Up from ${r.previous}`;
  if (r.direction === "down") return `Down from ${r.previous}`;
  if (r.direction === "new") return "Baseline year, building a first ranked entry";
  if (r.direction === "none") return "No result recorded yet";
  return `Held from the previous edition`;
}

/** "Education 501–600" → label "Education", figure "501–600"; "Baseline" stays whole. */
export function splitResult(current: string): { label?: string; value: string } {
  const m = current.match(/^(.*?)\s*(\d[\d–-]*\+?)$/);
  return m ? { label: m[1] || undefined, value: m[2] } : { value: current };
}

/** The results that rose in their latest editions, in the order the home page shows them. */
export const MOVERS = RANKINGS.filter((r) => r.direction === "up");

/** "Where your work counts": which rankings measure each kind of work (lib/data MATRIX). */
export const COUNTS = DIMENSIONS.map((dim) => ({
  dim,
  rankings: RANKINGS.filter((r) => MATRIX[r.slug]?.includes(dim)),
  note: DIMENSION_NOTES[dim],
}));
export const dimsOf = (slug: string) => DIMENSIONS.flatMap((d, i) => (MATRIX[slug]?.includes(d) ? [i] : []));

/** The six stages a contribution passes through, darkest to lightest. Counts are this cycle's (lib/data PIPELINE). */
export const STAGES = [
  {
    name: "Identify",
    text: "A college, centre or office spots work that answers an indicator: a policy, a programme, a measured result.",
    countLabel: "contributions identified",
    photo: PHOTOS.courtyard,
  },
  {
    name: "Submit",
    text: "The unit sends the evidence once, for the reporting period it covers, with its owner named.",
    countLabel: "pieces of evidence submitted",
    photo: PHOTOS.library,
  },
  {
    name: "Validate",
    text: "Reviewers check the period, the quality and the relevance, and return specific comments when something is missing.",
    countLabel: "validated by reviewers",
    photo: PHOTOS.cabinet,
  },
  {
    name: "Map",
    text: "Accepted evidence is mapped to every indicator it supports across the eight rankings, so no unit is asked twice.",
    countLabel: "mapped to indicators",
    photo: PHOTOS.aerial,
  },
  {
    name: "Report",
    text: "The Office compiles each institutional submission on the ranking body's own calendar, from October to March.",
    countLabel: "included in submissions",
    photo: PHOTOS.day,
  },
  {
    name: "Credit",
    text: "When a result is published, the Office measures what changed and names every unit whose evidence counted.",
    countLabel: "with results and impact measured",
    photo: PHOTOS.field,
  },
].map((s, i) => ({ ...s, count: PIPELINE[i].count }));

/** Short names for the folder tabs on the home page, by story slug; a story without one shows its kind. */
export const STORY_TAB: Record<string, string> = {};
