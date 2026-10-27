import type { IconName } from "@/components/ui/Icon";
import type { Indicator, Ranking } from "@/lib/data";

/** The indicator that most needs a dedicated diagnostic: a critical trend first, else the widest gap. */
export function criticalIndicator(r: Ranking): Indicator | undefined {
  const crit = r.indicators.find((i) => i.trend === "Critical");
  if (crit) return crit;
  return [...r.indicators]
    .filter((i) => i.current !== null && i.target)
    .sort((a, b) => (a.current as number) / (a.target as number) - (b.current as number) / (b.target as number))[0];
}

export type FocusTarget =
  | { kind: "tab"; tab: string }
  | { kind: "indicator"; indicator: Indicator }
  | { kind: "link"; href: string }
  | { kind: "anchor"; id: string };

const SPECIAL: Record<string, FocusTarget> = {
  "Action Plan": { kind: "tab", tab: "Action Plan" },
  "Development Plans": { kind: "tab", tab: "Action Plan" },
  Evidence: { kind: "tab", tab: "Evidence" },
  "Evidence and Policies": { kind: "tab", tab: "Evidence" },
  "Institutional Data": { kind: "tab", tab: "Indicators" },
  "Impact Stories": { kind: "link", href: "/admin/publications/stories" },
  "Submit an Innovation": { kind: "link", href: "/portal/innovation" },
  "Mentorship and Engagement": { kind: "link", href: "/admin/recognition#international" },
  "Innovation Pipeline": { kind: "anchor", id: "wuri-pipeline" },
  "WURI Categories": { kind: "anchor", id: "wuri-categories" },
  "Submitted Projects": { kind: "anchor", id: "wuri-initiatives" },
  "Recognized Innovations": { kind: "anchor", id: "wuri-categories" },
  "Impact and Scalability": { kind: "anchor", id: "wuri-initiatives" },
  "SDG Dashboard": { kind: "anchor", id: "sdg-board" },
  "Subject Portfolio": { kind: "anchor", id: "subject-portfolio" },
  "Emerging Subjects": { kind: "anchor", id: "subject-portfolio" },
  "Social Sciences": { kind: "anchor", id: "subject-portfolio" },
  "Modern Languages": { kind: "anchor", id: "subject-portfolio" },
  "Candidate Subjects": { kind: "anchor", id: "subject-threshold" },
  "Comparative Analysis": { kind: "anchor", id: "subject-compare" },
  "International Networks": { kind: "anchor", id: "subject-indicators" },
  "Campus Sustainability Map": { kind: "anchor", id: "campus-map" },
  Internationalization: { kind: "anchor", id: "qs-trends" },
  "Research and Citations": { kind: "anchor", id: "research-funnel" },
};

const ALIASES: Record<string, string> = {
  "Faculty and Students": "Faculty–Student",
  "Education Studies": "Education:",
  "Medical and Health": "Medical and Health:",
  "Life Sciences": "Life Sciences:",
  Medicine: "Medicine: Academic",
  Reputation: "Medicine: Academic",
  "Research Performance": "Citations per paper",
};

/** Resolves an item of a ranking's own menu (proposal §5) to something on the page. */
export function resolveFocus(r: Ranking, label: string): FocusTarget {
  if (/Overview$/.test(label)) return { kind: "tab", tab: "Overview" };
  const exact = r.indicators.find((i) => i.name === label);
  if (exact) return { kind: "indicator", indicator: exact };
  const alias = ALIASES[label];
  if (alias) {
    const hit = r.indicators.find((i) => i.name.includes(alias));
    if (hit) return { kind: "indicator", indicator: hit };
  }
  if (SPECIAL[label]) return SPECIAL[label];
  const partial = r.indicators.find((i) => i.name.startsWith(label));
  if (partial) return { kind: "indicator", indicator: partial };
  if (r.slug === "the-impact") return { kind: "anchor", id: "sdg-board" };
  if (r.slug === "qs-sustainability") return { kind: "anchor", id: "qss-connections" };
  return { kind: "tab", tab: "Indicators" };
}

/** Action panel icon by the verb that starts the action. */
export function actionIcon(text: string): IconName {
  const t = text.toLowerCase();
  if (t.startsWith("upload") || t.startsWith("submit")) return "upload";
  if (t.startsWith("confirm") || t.startsWith("verify") || t.startsWith("validate")) return "check-circle";
  if (t.startsWith("add")) return "plus";
  if (t.startsWith("correct") || t.startsWith("reconcile") || t.startsWith("clean")) return "pen";
  if (t.includes("url") || t.includes("link")) return "link";
  if (t.startsWith("respond")) return "comment";
  if (t.startsWith("map") || t.startsWith("tag")) return "target";
  return "arrow";
}
