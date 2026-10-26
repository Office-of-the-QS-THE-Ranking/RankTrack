import "server-only";

/*
 * What the public website may show, decided by governance: rankings that are tracked, marked public and
 * whose results dataset is Public; stories that passed the publication workflow while the stories dataset
 * is Public and the library is switched on; active units from the directory; and the public sections
 * System Configuration has switched on.
 */
import { cache } from "react";
import { BODIES, COUNTS, MOVERS, PHOTOS } from "@/lib/site";
import type { HubData } from "../hub-types";
import { hub } from "./hub";

export const siteData = cache(async () => {
  const h = await hub();
  const rankings = h.publicRankings;
  // Stories published through the workflow may arrive without photographs: they borrow the campus courtyard.
  // A post has no outcome figure; its subtitle stands where the figure's label would.
  const stories = h.publishedStories.map((s) =>
    s.images.length ? s : { ...s, images: [PHOTOS.courtyard.src], ...(s.post ? {} : { outcomeFigure: s.outcomeFigure || "—", outcomeLabel: s.outcomeLabel || s.outcome }) },
  );
  const pub = (slug: string) => rankings.find((r) => r.slug === slug);
  return {
    rankings,
    isPublic: (slug: string) => !!pub(slug),
    ranking: pub,
    bodies: BODIES.map((b) => ({ ...b, rankings: b.rankings.flatMap((r) => (pub(r.slug) ? [pub(r.slug)!] : [])) })).filter((b) => b.rankings.length),
    movers: MOVERS.flatMap((r) => (pub(r.slug) ? [pub(r.slug)!] : [])),
    counts: COUNTS.map((c) => ({ ...c, rankings: c.rankings.filter((r) => !!pub(r.slug)) })),
    boardUnits: h.activeUnits.filter((u) => u.rankingsServed > 0).sort((a, b) => b.rankingsServed - a.rankingsServed || b.validated - a.validated).slice(0, 10),
    unitsEngaged: h.activeUnits.filter((u) => u.completed > 0).length,
    units: h.activeUnits,
    stories,
    story: (slug: string) => stories.find((s) => s.slug === slug),
    dictionary: h.dictionary,
    features: { impact: h.feature("public-impact"), recognition: h.feature("public-recognition"), knowledge: h.feature("public-knowledge") },
    privacy: h.privacy,
    notice: h.site.noticeOn ? h.site.notice : "",
    asOf: h.site.asOf,
  };
});

export type SiteData = Awaited<ReturnType<typeof siteData>>;

/** The public search index's data: public rankings, published stories, active units and the dictionary. */
export async function publicHub(): Promise<HubData> {
  const h = await hub();
  const site = await siteData();
  return {
    activeSlugs: site.rankings.map((r) => r.slug),
    publicSlugs: site.rankings.map((r) => r.slug),
    deadlines: Object.fromEntries(site.rankings.map((r) => [r.slug, r.deadline])),
    bodies: h.state.config.bodies.map((b) => ({ key: b.key, name: b.name, short: b.short, enabled: b.enabled })),
    units: site.units,
    evidence: [],
    stories: site.stories.map(({ post: _post, ...s }) => s),
    dictionary: site.dictionary,
    cycles: [],
    currentCycle: h.currentCycle,
    periods: [],
    uploads: h.uploads,
    dashboard: h.dashboard,
    site: h.site,
    notices: [],
    requirements: [],
    values: {},
    publishedReports: [],
    templates: [],
  };
}
