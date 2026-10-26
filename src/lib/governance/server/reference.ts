import "server-only";

/*
 * The Hub's reference data from Supabase (lib/reference.ts describes it). Read at most once a minute: the Office
 * edits it in Supabase and the Hub picks the change up within that time. When a refresh fails, the last copy
 * read stays in use; with none, the error surfaces like any database outage. Pictures are objects in the R2
 * public bucket, served by the Hub's own /media/… route. The units' official arms (unit_emblems) come with it.
 */
import { cache } from "react";
import { alert } from "@/lib/alerts";
import { adminDb } from "@/lib/supabase/server";
import { withDemo } from "@/lib/demo";
import type { Ranking } from "@/lib/data";
import type { Photo, Reference } from "@/lib/reference";

const TTL_MS = 60_000;
const g = globalThis as typeof globalThis & { __hubReference?: { at: number; ref: Reference } };

/** Where the Hub serves an object of the R2 public bucket. */
export const assetSrc = (path: string) => `/media/${path}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Rows<T extends readonly unknown[]> = { [K in keyof T]: T[K] extends { data: infer D } ? NonNullable<D> : never };

function rows<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error || r.data === null) throw new Error(`Reference data could not be read: ${r.error?.message ?? "no rows"}`);
  return r.data;
}

async function load(): Promise<Reference> {
  const db = adminDb();
  const [settings, families, frameworks, indicators, results, dimensions, terms, links, calendar, office, entries, assets, stages, sdgs, lists, directory, emblems] = await Promise.all([
    db.from("site_settings").select("latest_edition").single(),
    db.from("ranking_families").select("*").order("position"),
    db.from("ranking_frameworks").select("*").order("position"),
    db.from("ranking_indicators").select("*").order("ranking_slug").order("position"),
    db.from("ranking_results").select("*").order("year"),
    db.from("ranking_dimensions").select("*").order("position"),
    db.from("dictionary_terms").select("*").order("position"),
    db.from("dictionary_links").select("*").order("position"),
    db.from("calendar_items").select("*").order("position"),
    db.from("office_profile").select("*").single(),
    db.from("office_entries").select("*").order("section").order("position"),
    db.from("media_assets").select("*").order("position"),
    db.from("site_process_stages").select("*").order("position"),
    db.from("sdg_goals").select("*").order("number"),
    db.from("reference_lists").select("*").order("list").order("position"),
    db.from("unit_directory").select("*").order("position"),
    db.from("unit_emblems").select("unit_key, file_path, form, width, height"),
  ]).then((all) => all.map((r) => rows(r as { data: unknown; error: { message: string } | null })) as never as Rows<typeof all>);

  const photoOf = (key: string | null): Photo | undefined => {
    const a = key ? assets.find((x) => x.key === key) : undefined;
    return a && { src: assetSrc(a.path), alt: a.alt, pos: a.focus ?? undefined, width: a.width ?? undefined, height: a.height ?? undefined };
  };
  const list = (name: string) => lists.filter((l) => l.list === name);
  const section = (name: string) => entries.filter((e) => e.section === name);

  const rankings: Ranking[] = frameworks.map((f) =>
    withDemo({
      slug: f.slug,
      short: f.short,
      name: f.name,
      family: f.family,
      current: f.current_result,
      previous: f.previous_result,
      target: f.target_result,
      direction: f.direction as Ranking["direction"],
      readiness: 0,
      deadline: f.default_deadline,
      pending: 0,
      message: f.message,
      interpretation: f.interpretation,
      measures: f.measures,
      emphasis: f.emphasis,
      menu: f.menu,
      history: results.filter((h) => h.ranking_slug === f.slug).map((h) => ({ year: h.year, hi: h.best, lo: h.worst, label: h.label })),
      indicators: indicators
        .filter((i) => i.ranking_slug === f.slug)
        .map((i) => ({
          name: i.name,
          weight: i.weight,
          current: null,
          target: null,
          unit: i.unit ?? undefined,
          trend: "No data",
          status: "Not yet submitted",
          owner: i.owner,
          definition: i.definition,
          formula: i.formula,
          history: [],
          actions: [],
          lenses: i.lenses,
          offices: i.offices,
          metrics: i.metrics,
        })),
      strengths: f.strengths,
      gaps: f.gaps,
      opportunities: f.opportunities,
      dataSources: f.data_sources,
      commonErrors: f.common_errors,
      methodologyChanges: f.methodology_changes,
      reportingPeriod: f.reporting_period,
      publicNote: f.public_note,
    }),
  );

  const groups: Reference["groups"] = [];
  for (const f of frameworks) {
    const group = groups.find((x) => x.label === f.group_label);
    if (group) group.slugs.push(f.slug);
    else groups.push({ label: f.group_label, slugs: [f.slug] });
  }

  const months: Reference["calendar"] = [];
  for (const c of [...calendar].sort((a, b) => a.position - b.position)) {
    const month = months.find((m) => m.month === c.month);
    if (month) month.items.push(c.item);
    else months.push({ month: c.month, items: [c.item] });
  }
  // Keep the collection year's order (October first) whatever order the rows were added in.
  const start = months.length ? MONTHS.indexOf(months[0].month) : 0;
  months.sort((a, b) => ((MONTHS.indexOf(a.month) - start + 12) % 12) - ((MONTHS.indexOf(b.month) - start + 12) % 12));

  return {
    latestEdition: settings.latest_edition,
    families: Object.fromEntries(families.map((f) => [f.key, { key: f.key, name: f.name, body: f.body, color: f.color, soft: f.soft, band: f.band }])),
    groups,
    rankings,
    dimensions: dimensions.map((d) => d.name),
    dimensionNotes: Object.fromEntries(dimensions.map((d) => [d.name, d.note])),
    matrix: Object.fromEntries(frameworks.map((f) => [f.slug, f.dimensions])),
    rankingPhoto: Object.fromEntries(frameworks.flatMap((f) => (photoOf(f.photo) ? [[f.slug, photoOf(f.photo)!]] : []))),
    dictionary: terms.map((t) => ({
      term: t.term,
      definition: t.definition,
      links: links.filter((l) => l.term === t.term).map((l) => ({ ranking: l.ranking, indicator: l.indicator })),
    })),
    calendar: months,
    office: {
      name: office.name,
      reportsTo: office.reports_to,
      profileDate: office.profile_date,
      location: office.location,
      landmark: office.landmark,
      phone: office.phone,
      email: office.email,
      street: office.street,
      city: office.city,
      vision: office.vision,
      mission: office.mission,
      summary: office.summary,
      functions: section("function").map((e) => e.title),
      objectives: section("objective").map((e) => ({ title: e.title, text: e.body })),
      deliverables: section("deliverable").map((e) => ({ title: e.title, text: e.body })),
      workplan: section("workplan").map((e) => ({ title: e.title, owners: e.owners ?? "", timing: e.timing ?? "" })),
      team: section("team").map((e) => ({ role: e.title, who: e.person ?? "", focus: e.body })),
      portfolio: section("portfolio").map((e) => ({ name: e.title, href: e.href ?? "" })),
    },
    photos: Object.fromEntries(assets.filter((a) => a.kind === "photo").map((a) => [a.key, photoOf(a.key)!])),
    credits: assets
      .filter((a) => a.kind === "photo" && a.title)
      .map((a) => ({ key: a.key, title: a.title!, creator: a.creator ?? "", license: a.license ?? "", page: a.source_page ?? "", via: a.via ?? "" })),
    process: stages.map((s) => ({ name: s.name, text: s.body, countLabel: s.count_label, photo: photoOf(s.photo)! })),
    sdgNames: Object.fromEntries(sdgs.map((s) => [s.number, s.name])),
    sdgColors: Object.fromEntries(sdgs.map((s) => [s.number, s.color])),
    sdgIcons: Object.fromEntries(sdgs.flatMap((s) => (photoOf(s.icon) ? [[s.number, photoOf(s.icon)!.src]] : []))),
    impactThemes: list("impact-theme").map((l) => l.value),
    wuriCategories: list("wuri-category").map((l) => l.value),
    reportTypes: list("report-type").map((l) => ({ name: l.value, note: l.note ?? "" })),
    quadrantNotes: Object.fromEntries(list("subject-quadrant").map((l) => [l.value, l.note ?? ""])),
    subjectAreas: Object.fromEntries(list("subject-area").map((l) => [l.value, l.color ?? "#6B6B6B"])),
    ladderSteps: list("impact-ladder").map((l) => l.value),
    pipelineSteps: list("contribution-pipeline").map((l) => l.value),
    wuriPipelineSteps: list("wuri-pipeline").map((l) => l.value),
    researchFunnel: list("research-funnel").map((l) => ({ step: l.value, note: l.note ?? "" })),
    directory: directory.map((d) => ({ key: d.key, parentKey: d.parent_key, category: d.category, name: d.name, emails: d.emails })),
    emblems: Object.fromEntries(
      emblems.map((e) => [e.unit_key, { key: e.unit_key, src: assetSrc(e.file_path), form: e.form as "shield" | "seal", width: e.width, height: e.height }]),
    ),
  };
}

const loading = globalThis as typeof globalThis & { __hubReferenceLoad?: Promise<Reference> | null };

/** One reload at a time per instance, however many requests find the copy expired together. */
function reload(): Promise<Reference> {
  return (loading.__hubReferenceLoad ??= load()
    .then((ref) => {
      g.__hubReference = { at: Date.now(), ref };
      return ref;
    })
    .finally(() => {
      loading.__hubReferenceLoad = null;
    }));
}

/**
 * Read through the one-minute cache. An expired copy is served at once while one reload runs behind it; only an
 * instance with no copy yet waits. When a reload fails the last copy stays in use and is tried again in a minute;
 * with none, the error surfaces like any database outage.
 */
async function loadReference(): Promise<Reference> {
  const held = g.__hubReference;
  if (held && Date.now() - held.at < TTL_MS) return held.ref;
  if (!held) return reload();
  void reload().catch((e: unknown) => {
    void alert("reference-data", `Reference data could not be refreshed; serving the last copy: ${(e as Error).message}`);
    g.__hubReference = { at: Date.now(), ref: held.ref };
  });
  return held.ref;
}

/** The reference data for this request. */
export const reference = cache(loadReference);
