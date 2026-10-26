/*
 * What the header's panels and the phone menu list. Each panel opens with the photograph of the page it
 * leads to (the same one that page's hero rings in gold), its links filed in groups, and a closing strip
 * with one practical fact. Links that carry a preview change the panel's photograph and summary on hover.
 * Each link shows its icon in the panel; a link without one shows its preview's photograph instead.
 */
import type { IconName } from "@/components/ui/Icon";
import { RECOGNITION } from "@/lib/data";
import { familyOf, type Photo, type Reference } from "@/lib/reference";

export type MenuPreview = { title: string; text: string; photo: Photo };

export type MenuLink = {
  label: string;
  href: string;
  /** the full name, when the group heading shortens the label ("THE" + "Impact Rankings") */
  name?: string;
  note?: string;
  icon?: IconName;
  preview?: MenuPreview;
};

export type MenuGroup = { label?: string; color?: string; links: MenuLink[] };

export type Menu = {
  href: string;
  label: string;
  title: string;
  description: string;
  cta: string;
  photo: Photo;
  groups: MenuGroup[];
  strip: { text: string; link: { label: string; href: string } };
};

export const isExternal = (href: string) => !href.startsWith("/");

const storyPhoto = (ref: Reference, src: string): Photo => Object.values(ref.photos).find((p) => p.src === src) ?? { src, alt: "" };

const ranking = (icon: IconName, label: string, href: string, text: string, photo: Photo, name = label): MenuLink => ({
  label,
  name,
  href,
  icon,
  preview: { title: name, text, photo },
});

/** The header's menus. Pictures, colours and facts are reference data; the wording is the site's own. */
export const allMenus = (ref: Reference): Menu[] => {
  const PHOTOS = ref.photos;
  return [
  {
    href: "/rankings",
    label: "Rankings",
    title: "Rankings & assessments",
    description: "Explore the frameworks shaping UST’s global standing in education, research and impact.",
    cta: "Explore all rankings",
    photo: PHOTOS.aerial,
    groups: [
      {
        label: "Times Higher Education",
        color: familyOf(ref, "THE").color,
        links: [
          ranking("rankings", "World University Rankings", "/rankings/the-wur",
            "Evaluates research-intensive universities across teaching, research, industry engagement and international outlook.",
            PHOTOS.library, "THE World University Rankings"),
          ranking("sustainability", "Impact Rankings", "/rankings/the-impact",
            "Assesses universities’ contributions to the United Nations Sustainable Development Goals through research, outreach and stewardship.",
            PHOTOS.hospital, "THE Impact Rankings"),
          ranking("flask", "Interdisciplinary Science Research Rankings",
            "https://www.timeshighereducation.com/world-university-rankings/interdisciplinary-science-rankings",
            "Examines universities’ commitment and contributions to science research that brings multiple disciplines together.",
            PHOTOS.cabinet, "THE Interdisciplinary Science Research Rankings"),
          ranking("education", "Online Learning Rankings",
            "https://www.timeshighereducation.com/world-university-rankings/online-learning-rankings-2024-results-announced",
            "Assesses online higher education through learning resources, student engagement, outcomes and the learning environment.",
            PHOTOS.field, "THE Online Learning Rankings"),
        ],
      },
      {
        label: "QS Quacquarelli Symonds",
        color: familyOf(ref, "QS").color,
        links: [
          ranking("globe", "World University Rankings", "/rankings/qs-wur",
            "A global comparison of universities across research, reputation, employability and international engagement.",
            PHOTOS.day, "QS World University Rankings"),
          ranking("pin", "Asia University Rankings", "https://www.topuniversities.com/asia-university-rankings",
            "A regional comparison of Asian universities, with indicators tailored to the region’s academic landscape.",
            PHOTOS["arch-aerial"], "QS Asia University Rankings"),
          ranking("recognition", "Stars Rating", "https://www.topuniversities.com/qs-stars",
            "A star-based assessment of university strengths, including teaching, employability, facilities and internationalisation.",
            PHOTOS.festive, "QS Stars Rating"),
        ],
      },
      {
        label: "Other assessments",
        links: [
          ranking("building", "AppliedHE Private University Rankings", "https://appliedhe.com/rankings/methodology/private-all-asia-2026/",
            "Compares private universities across teaching and learning, employability, research and internationalisation.",
            PHOTOS.benavides),
          ranking("data", "Clarivate Special Projects",
            "https://clarivate.com/academia-government/scientific-and-academic-research/research-funding-analytics/academia-government-consulting/",
            "Research analytics and tailored projects supporting institutional benchmarking, research assessment and strategic planning.",
            PHOTOS.map),
          ranking("innovation", "World University Rankings for Innovation (WURI)", "/rankings/wuri",
            "Recognises innovative education, research and engagement that make practical contributions to industry and society.",
            PHOTOS.carillon),
        ],
      },
    ],
    strip: {
      text: "Results are reported exactly as each ranking body publishes them.",
      link: { label: "Methodology disclaimer", href: "/about#disclaimer" },
    },
  },
  {
    href: "/impact",
    label: "Impact",
    title: "Impact",
    description: "Explore the stories and evidence behind UST’s impact.",
    cta: "Explore impact",
    photo: PHOTOS["arch-aerial"],
    groups: [
    ],
    strip: {
      text: "Every story names the units behind it and the rankings its evidence counts in.",
      link: { label: "All impact stories", href: "/impact#stories" },
    },
  },
  {
    href: "/recognition",
    label: "Recognition",
    title: "Recognition",
    description: "Meet the people and units advancing the University.",
    cta: "Explore recognition",
    photo: PHOTOS.field,
    groups: [
      {
        links: [
          { label: "Achievements", href: "/recognition#achievements", icon: "trend-up", note: "The results that rose in the latest editions" },
          { label: "Cycle awards", href: "/recognition#awards", icon: "recognition", note: `The ${ref.latestEdition} awards and the units that won them` },
          { label: "Contributing units", href: "/recognition#units", icon: "units", note: "Units ordered by the evidence reviewers accepted" },
          { label: "Evidence champions", href: "/recognition#champions", icon: "evidence", note: "Coordinators whose evidence is reused most widely" },
          { label: "Innovation", href: "/recognition#innovation", icon: "innovation", note: "Programmes documented for WURI and the showcase" },
          { label: "International", href: "/recognition#international", icon: "globe", note: "WURI placements and the mentorship network" },
          { label: "Archive", href: "/recognition#archive", icon: "archive", note: "Awards to units in earlier cycles" },
        ],
      },
    ],
    strip: {
      text: RECOGNITION.length
        ? `This cycle’s ${RECOGNITION.length} awards recognise evidence quality, outcomes and collaboration.`
        : "Awards recognise evidence quality, outcomes and collaboration, never the number of files uploaded.",
      link: { label: "See the awards", href: "/recognition#awards" },
    },
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    title: "Knowledge",
    description: "Find the methods, resources and standards behind the rankings.",
    cta: "Explore knowledge",
    photo: PHOTOS.library,
    groups: [
      {
        links: [
          { label: "Dictionary", href: "/knowledge#dictionary", icon: "knowledge", note: "One term, and every ranking it touches" },
          { label: "Methods", href: "/knowledge#methodologies", icon: "target", note: "What each ranking measures, in plain language" },
          { label: "Evidence standards", href: "/knowledge#standards", icon: "shield-check", note: "What counts as evidence, and what does not" },
          { label: "Calendar", href: "/knowledge#calendar", icon: "calendar", note: "When each ranking collects data" },
          { label: "Templates", href: "/knowledge#templates", icon: "clipboard", note: "The forms units fill in, and the training" },
          { label: "Questions", href: "/knowledge#faq", icon: "help", note: "The questions units ask most" },
          { label: "Policies", href: "/knowledge#policies", icon: "scroll", note: "The policies and frameworks behind the work" },
        ],
      },
    ],
    strip: {
      text: ref.calendar[0] ? `Next deadline: ${ref.calendar[0].items[0]}.` : "When each ranking collects data.",
      link: { label: "Open the calendar", href: "/knowledge#calendar" },
    },
  },
  {
    href: "/about",
    label: "About",
    title: "About the Office",
    description: ref.office.summary,
    cta: "Explore the Office",
    photo: PHOTOS.day,
    groups: [
      {
        links: [
          { label: "Purpose", href: "/about#mission", icon: "target", note: "Five functions under the Office of the Rector" },
          { label: "Vision and mission", href: "/about#vision", icon: "eye", note: "Shared responsibility and our 2030 aspiration" },
          { label: "Ranking portfolio", href: "/about#portfolio", icon: "rankings", note: "Ten ranking, rating and special-project frameworks" },
          { label: "Deliverables", href: "/about#deliverables", icon: "send", note: "Survey contacts, benchmarking and submissions" },
          { label: "Since 1611", href: "/about#since-1611", icon: "history", note: "From Intramuros to España" },
          { label: "How it works", href: "/about#process", icon: "workflow", note: "Data collection, quarterly KPI monitoring and review" },
          { label: "Team", href: "/about#team", icon: "users", note: "The people and reporting structure of the Office" },
          { label: "Data governance", href: "/about#governance", icon: "governance", note: "Reporting lines and stakeholder coordination" },
          { label: "Policies", href: "/about#privacy", icon: "shield", note: "Privacy, accessibility and method" },
          { label: "Contact", href: "/about#contact", icon: "mail", note: ref.office.location },
        ],
      },
    ],
    strip: {
      text: `Questions about a result or a submission go to ${ref.office.email}.`,
      link: { label: "Contact the Office", href: "/about#contact" },
    },
  },
  ];
};

/**
 * The menus as governance allows them: links to rankings the public website does not show are dropped,
 * the impact panel lists only published stories, and sections switched off in System Configuration leave
 * the header.
 */
export function governedMenus(ref: Reference, opts: {
  publicSlugs: string[];
  stories: { slug: string; title: string; unit: string; outcome: string; images: string[] }[];
  features: { impact: boolean; recognition: boolean; knowledge: boolean };
}): Menu[] {
  const off = new Set([!opts.features.impact && "/impact", !opts.features.recognition && "/recognition", !opts.features.knowledge && "/knowledge"].filter(Boolean));
  return allMenus(ref).filter((m) => !off.has(m.href)).map((m) => {
    if (m.href === "/rankings")
      return {
        ...m,
        groups: m.groups
          .map((g) => ({ ...g, links: g.links.filter((l) => !l.href.startsWith("/rankings/") || opts.publicSlugs.includes(l.href.slice("/rankings/".length))) }))
          .filter((g) => g.links.length),
      };
    if (m.href === "/impact")
      return {
        ...m,
        groups: [
          {
            label: "Latest stories",
            links: opts.stories.slice(0, 6).map((s) => ({
              label: s.title,
              href: `/impact/${s.slug}`,
              note: s.unit,
              preview: { title: s.title, text: s.outcome, photo: storyPhoto(ref, s.images[0]) },
            })),
          },
        ].filter((g) => g.links.length),
      };
    return m;
  });
}
