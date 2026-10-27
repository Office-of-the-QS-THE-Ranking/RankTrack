import "server-only";

/*
 * What the public website may show, decided by governance: rankings that are tracked, marked public and
 * whose results dataset is Public; stories that passed the publication workflow while the stories dataset
 * is Public and Publications is switched on; published research articles and reports; active units from the
 * directory; and the public sections
 * System Configuration has switched on.
 */
import { cache } from "react";
import { DEMO_ON, demo } from "@/lib/demo";
import { calendarMonths, calendarOf } from "@/lib/calendar";
import { bodies, counts, movers } from "@/lib/reference";
import type { HubData } from "../hub-types";
import { publishedDocuments } from "./documents";
import { hub } from "./hub";

export const siteData = cache(async () => {
  const h = await hub();
  const ref = h.ref;
  const rankings = h.publicRankings;
  // Stories published through the workflow may arrive without photographs: they borrow the campus courtyard.
  // A post has no outcome figure; its subtitle stands where the figure's label would.
  const stories = h.publishedStories.map((s) =>
    s.images.length ? s : { ...s, images: ref.photos.courtyard ? [ref.photos.courtyard.src] : [], ...(s.post ? {} : { outcomeFigure: s.outcomeFigure || "—", outcomeLabel: s.outcomeLabel || s.outcome }) },
  );
  const pub = (slug: string) => rankings.find((r) => r.slug === slug);
  const calendar = calendarOf(rankings, h.state.config.calendar);
  const today = new Date().toISOString().slice(0, 10);
  // Presentation data stands in only while nothing real is published (lib/demo.ts).
  const published = publishedDocuments(h.state);
  const documents = published.length || !DEMO_ON || !h.feature("public-publications") ? published : demo.documents;
  return {
    rankings,
    isPublic: (slug: string) => !!pub(slug),
    ranking: pub,
    bodies: bodies(ref).map((b) => ({ ...b, rankings: b.rankings.flatMap((r) => (pub(r.slug) ? [pub(r.slug)!] : [])) })).filter((b) => b.rankings.length),
    movers: movers(ref).flatMap((r) => (pub(r.slug) ? [pub(r.slug)!] : [])),
    counts: counts(ref).map((c) => ({ ...c, rankings: c.rankings.filter((r) => !!pub(r.slug)) })),
    boardUnits: h.activeUnits.filter((u) => u.rankingsServed > 0).sort((a, b) => b.rankingsServed - a.rankingsServed || b.validated - a.validated).slice(0, 10),
    unitsEngaged: h.activeUnits.filter((u) => u.completed > 0).length,
    units: h.activeUnits,
    stories,
    story: (slug: string) => stories.find((s) => s.slug === slug),
    /** Research articles and reports the Office published, newest first. */
    articles: documents.filter((d) => d.kind === "article"),
    reports: documents.filter((d) => d.kind === "report"),
    dictionary: h.dictionary,
    features: { publications: h.feature("public-publications"), recognition: h.feature("public-recognition"), knowledge: h.feature("public-knowledge") },
    privacy: h.privacy,
    notice: h.site.noticeOn ? h.site.notice : "",
    asOf: h.site.asOf,
    currentCycle: h.currentCycle,
    calendar,
    /** What is still to close, as months of lines: the website's calendar and its menu. */
    calendarMonths: calendarMonths(calendar.filter((c) => c.due >= today)),
    ref,
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
    calendar: site.calendar,
    deadlineDesk: null,
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
