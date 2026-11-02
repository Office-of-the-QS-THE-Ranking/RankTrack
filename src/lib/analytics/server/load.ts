import "server-only";

/*
 * What the engine reads, gathered once per request: the catalogs (kept for a short while, since they change only
 * when the Office edits a methodology), and one edition's facts with the evidence records the links point at and the
 * previous edition's values for year-on-year checks. reportFor runs the engine on them.
 */
import { cache } from "react";
import { evidenceList } from "@/lib/governance/records";
import { readState } from "@/lib/governance/server/store";
import { computeEdition, academicYears } from "../engine";
import type { Catalog, EditionReport, EvidenceRef, Facts, ValueRow } from "../types";
import { readActivities, readBenchmarks, readCatalogs, readEditionFacts, readTemplateTotals } from "./db";

const TTL_MS = 30_000;
const g = globalThis as typeof globalThis & { __analyticsCatalogs?: { at: number; data: Promise<Catalog[]> } };

/** Every edition's catalog. Changes made here forget the copy at once; other servers see them within 30 s. */
export function catalogs(): Promise<Catalog[]> {
  const hit = g.__analyticsCatalogs;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = readCatalogs().catch((e) => {
    g.__analyticsCatalogs = undefined;
    throw e;
  });
  g.__analyticsCatalogs = { at: Date.now(), data };
  return data;
}

export function forgetCatalogs() {
  g.__analyticsCatalogs = undefined;
}

export const catalogOf = async (edition: string) => (await catalogs()).find((c) => c.edition.id === edition) ?? null;

/** The edition each ranking is collecting for now: its Active one, newest first. */
export async function activeEditions(): Promise<Map<string, Catalog>> {
  const out = new Map<string, Catalog>();
  for (const c of await catalogs()) if (c.edition.status === "Active" && (!out.has(c.edition.ranking) || out.get(c.edition.ranking)!.edition.year < c.edition.year)) out.set(c.edition.ranking, c);
  return out;
}

/** Evidence records from the governance store, as links see them. */
const evidenceRefs = cache(async (): Promise<EvidenceRef[]> => {
  const state = await readState();
  return evidenceList(state).map((e) => ({ id: e.id, title: e.title, unit: e.unitSlug, status: e.status, submitted: e.submitted }));
});

const templateTotals = cache(readTemplateTotals);

export interface Bundle {
  catalog: Catalog;
  facts: Facts;
  previous?: { label: string; values: ValueRow[] };
}

/** One edition's catalog and facts, once per request. */
export const bundleFor = cache(async (edition: string): Promise<Bundle | null> => {
  const all = await catalogs();
  const catalog = all.find((c) => c.edition.id === edition);
  if (!catalog) return null;
  const prev = all
    .filter((c) => c.edition.ranking === catalog.edition.ranking && c.edition.year < catalog.edition.year)
    .sort((a, b) => b.edition.year - a.edition.year)[0];
  const years = academicYears(catalog.edition.years);
  const [own, before, activities, bench, evidence, templates] = await Promise.all([
    readEditionFacts([edition]),
    prev ? readEditionFacts([prev.edition.id]) : Promise.resolve(null),
    readActivities(years.length ? years : undefined),
    readBenchmarks([catalog.edition.ranking]),
    evidenceRefs(),
    templateTotals(),
  ]);
  const facts: Facts = { ...own, activities, benchmarks: bench.benchmarks, peers: bench.peers, evidence, templates };
  return { catalog, facts, ...(prev && before && { previous: { label: prev.edition.label, values: before.values } }) };
});

/** One edition's report, once per request. */
export const reportFor = cache(async (edition: string): Promise<{ bundle: Bundle; report: EditionReport } | null> => {
  const bundle = await bundleFor(edition);
  if (!bundle) return null;
  return { bundle, report: computeEdition(bundle) };
});
