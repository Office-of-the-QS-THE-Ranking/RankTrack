"use server";

/*
 * Methodologies, imports and exports for the analytics engine. Files are opened in the Office's browser
 * (lib/analytics/tabular/browser.ts): workbooks arrive as their sheets' text and numbers, Word documents as their
 * text, and a template upload arrives as counts only, so student and staff rows never reach the server. Each import
 * keeps the file's name, size and SHA-256 with what came of it. Methodologies, profiles and template uploads need
 * rankings: manage; reading a unit's workbook, activity register, peer figures or case files needs rankings: edit;
 * exports need rankings: export.
 */
import { readState } from "@/lib/governance/server/store";
import type { Json } from "@/lib/supabase/database.types";
import { adminDb } from "@/lib/supabase/server";
import { csv, positioningBrief, baseline, movement, summarize } from "@/lib/analytics/brief";
import { gapMatrix } from "@/lib/analytics/gap";
import { readBenchmarks as readBenchmarkTable, isOwnName, type BenchmarkRead } from "@/lib/analytics/importers/benchmarks";
import { readEvidenceDoc, readWuriCase, isWuriTemplate } from "@/lib/analytics/importers/documents";
import { readRegister } from "@/lib/analytics/importers/register";
import { readTheWorkbook } from "@/lib/analytics/importers/the-workbook";
import { nextEdition, readPack, EDITION_STATUSES } from "@/lib/analytics/pack";
import type { Cell, Sheet } from "@/lib/analytics/tabular/xlsx";
import type { Profile, TemplateResult } from "@/lib/analytics/templates";
import { UNIVERSITY, type Catalog, type EditionStatus, type MethodologyPack } from "@/lib/analytics/types";
import { unitStandings } from "@/lib/analytics/units";
import { valueText } from "@/lib/analytics/format";
import { editionRow, groupRow, indicatorRow, readActions, readActivities, readAliases, readBenchmarks, readCampaigns, readEditionFacts, readProfiles, readSnapshots } from "@/lib/analytics/server/db";
import { catalogs, catalogOf, forgetCatalogs, reportFor } from "@/lib/analytics/server/load";
import { allowed, audit, fail, isViewer, refresh, type Result } from "@/lib/analytics/server/guard";

const text = (s: unknown, max: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, max) : "");
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/* ---------- What arrives from the browser ---------- */

interface FileMeta {
  fileName: string;
  sha256: string;
  bytes: number;
}

function readMeta(raw: Partial<FileMeta> | undefined): FileMeta | string {
  const fileName = text(raw?.fileName, 260);
  if (!fileName) return "The file has no name.";
  if (typeof raw?.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(raw.sha256)) return "The file couldn’t be fingerprinted. Choose it again.";
  const bytes = Number(raw.bytes);
  if (!Number.isInteger(bytes) || bytes < 0 || bytes > 200 * 1_048_576) return "The file’s size couldn’t be read.";
  return { fileName, sha256: raw.sha256, bytes };
}

const LIMITS = { sheets: 60, rows: 30_000, cols: 80, cell: 2000 };

/** Sheets as the browser read them: text, numbers and booleans only, within limits. */
function readSheets(raw: unknown): Sheet[] | string {
  if (!Array.isArray(raw) || raw.length > LIMITS.sheets) return "The workbook couldn’t be read. Choose it again.";
  let total = 0;
  const out: Sheet[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object" || typeof (s as Sheet).name !== "string" || !Array.isArray((s as Sheet).rows)) return "The workbook couldn’t be read.";
    const rows: Cell[][] = [];
    for (const r of (s as Sheet).rows) {
      if (++total > LIMITS.rows) return `The workbook has more than ${LIMITS.rows.toLocaleString("en-PH")} rows.`;
      if (!Array.isArray(r)) return "The workbook couldn’t be read.";
      rows.push(r.slice(0, LIMITS.cols).map((c) => (typeof c === "string" ? c.slice(0, LIMITS.cell) : typeof c === "number" && Number.isFinite(c) ? c : typeof c === "boolean" ? c : null)));
    }
    out.push({ name: (s as Sheet).name.slice(0, 120), rows });
  }
  return out;
}

async function logImport(row: { kind: string; profile?: string | null; meta: FileMeta; rows: number; edition?: string | null; unit?: string | null; year?: string | null; summary: Record<string, unknown>; totals?: Record<string, number> | null; breakdowns?: unknown[] | null; by: string }) {
  const { data, error } = await adminDb()
    .from("analytics_imports")
    .insert({
      kind: row.kind,
      profile: row.profile ?? null,
      file_name: row.meta.fileName,
      sha256: row.meta.sha256,
      bytes: row.meta.bytes,
      rows: row.rows,
      edition_id: row.edition ?? null,
      unit_id: row.unit ?? null,
      academic_year: row.year ?? null,
      summary: row.summary as Json,
      totals: (row.totals ?? null) as Json,
      breakdowns: (row.breakdowns ?? null) as Json,
      by: row.by,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/* ---------- Methodology ---------- */

export async function updateEdition(input: { id: string; label?: string; period?: string; methodology?: string; status?: EditionStatus; opensOn?: string | null; closesOn?: string | null; years?: number[]; notes?: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const c = await catalogOf(String(input?.id));
  if (!c) return fail("That edition is no longer here.");
  const patch: Record<string, unknown> = { updated_by: viewer.id, updated_at: new Date().toISOString() };
  if (input.label !== undefined) {
    const l = text(input.label, 160);
    if (!l) return fail("Give the edition a name.");
    patch.label = l;
  }
  if (input.period !== undefined) patch.period = text(input.period, 200);
  if (input.methodology !== undefined) patch.methodology = text(input.methodology, 200);
  if (input.notes !== undefined) patch.notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 4000) : "";
  if (input.status !== undefined) {
    if (!EDITION_STATUSES.includes(input.status)) return fail("Choose a status.");
    patch.status = input.status;
  }
  for (const [k, col] of [["opensOn", "opens_on"], ["closesOn", "closes_on"]] as const) {
    const v = input[k];
    if (v === undefined) continue;
    if (v !== null && v !== "" && !isDay(v)) return fail("Choose a date.");
    patch[col] = v || null;
  }
  if (input.years !== undefined) patch.years = [...new Set((input.years ?? []).filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100))].sort().slice(0, 10);
  const { error } = await adminDb().from("analytics_editions").update(patch as never).eq("id", c.edition.id);
  if (error) return fail("The edition couldn’t be saved.");
  forgetCatalogs();
  await audit(viewer, "analytics.edition", { type: "Edition", id: c.edition.id, label: c.edition.label }, JSON.stringify(patch).slice(0, 600), [], "Configuration");
  refresh();
  return { ok: true, message: input.status && input.status !== c.edition.status ? `${c.edition.label} is ${input.status.toLowerCase()}.` : "Edition saved." };
}

const packOf = (c: Catalog): MethodologyPack => ({ pack: 1, edition: { ...c.edition }, groups: c.groups, indicators: c.indicators });

async function writePack(pack: MethodologyPack, by: string, status: EditionStatus) {
  const db = adminDb();
  const { error: e1 } = await db.from("analytics_editions").upsert(editionRow({ ...pack.edition, status } as Parameters<typeof editionRow>[0], by), { onConflict: "id" });
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await db.from("analytics_groups").upsert(pack.groups.map((g) => groupRow(pack.edition.id, g)), { onConflict: "edition_id,code" });
  if (e2) throw new Error(e2.message);
  for (let i = 0; i < pack.indicators.length; i += 300) {
    const { error } = await db.from("analytics_indicators").upsert(pack.indicators.slice(i, i + 300).map((x) => indicatorRow(pack.edition.id, x)), { onConflict: "edition_id,code" });
    if (error) throw new Error(error.message);
  }
}

/** The same methodology for another year, as a draft with no facts. */
export async function cloneEdition(input: { id: string; year: number }): Promise<Result<{ id: string }>> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const c = await catalogOf(String(input?.id));
  if (!c) return fail("That edition is no longer here.");
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || year === c.edition.year) return fail("Choose another year.");
  const all = await catalogs();
  if (all.some((x) => x.edition.ranking === c.edition.ranking && x.edition.year === year)) return fail(`${c.edition.ranking} already has a ${year} edition.`);
  const next = nextEdition(packOf(c), year);
  if (all.some((x) => x.edition.id === next.edition.id)) return fail(`An edition ${next.edition.id} already exists.`);
  try {
    await writePack(readPack(JSON.parse(JSON.stringify(next))), viewer.id, "Draft");
  } catch {
    return fail("The new edition couldn’t be created.");
  }
  forgetCatalogs();
  await audit(viewer, "analytics.edition.clone", { type: "Edition", id: next.edition.id, label: next.edition.label }, `From ${c.edition.label}`, [], "Configuration");
  refresh();
  return { ok: true, message: `${next.edition.label} created as a draft.`, data: { id: next.edition.id } };
}

export async function deleteEdition(input: { id: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const c = await catalogOf(String(input?.id));
  if (!c) return fail("That edition is no longer here.");
  const facts = await readEditionFacts([c.edition.id]);
  if (facts.values.length || facts.links.length || facts.cases.length) return fail("This edition holds values, links or cases. Archive it instead.");
  const { error } = await adminDb().from("analytics_editions").delete().eq("id", c.edition.id);
  if (error) return fail("The edition couldn’t be removed.");
  forgetCatalogs();
  await audit(viewer, "analytics.edition.delete", { type: "Edition", id: c.edition.id, label: c.edition.label }, "Removed with its catalog", [], "Configuration");
  refresh();
  return { ok: true, message: `${c.edition.label} removed.` };
}

/**
 * An indicator's details and rules. The changed indicator is checked in its whole edition by readPack, so a formula
 * that reads a missing code, a band out of range or an unknown option is refused before anything is saved.
 */
export async function updateIndicator(input: { edition: string; code: string; patch: Record<string, unknown> }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const c = await catalogOf(String(input?.edition));
  if (!c) return fail("That edition is no longer here.");
  const ind = c.indicators.find((i) => i.code === input.code);
  if (!ind) return fail("That indicator is no longer here.");
  const p = input.patch && typeof input.patch === "object" ? input.patch : {};
  const allowedKeys = ["name", "ref", "guidance", "unit", "owners", "ownerLabels", "evidence", "rollup", "input", "score", "feeds", "tags", "group", "parent"];
  const next = { ...ind, ...Object.fromEntries(Object.entries(p).filter(([k]) => allowedKeys.includes(k))) };
  const state = await readState();
  if (Array.isArray(next.owners)) next.owners = next.owners.filter((o) => typeof o === "string" && state.units.some((u) => u.id === o));
  let checked: MethodologyPack;
  try {
    checked = readPack(JSON.parse(JSON.stringify({ ...packOf(c), indicators: c.indicators.map((i) => (i.code === ind.code ? next : i)) })));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "That change isn’t valid.");
  }
  const clean = checked.indicators.find((i) => i.code === ind.code)!;
  const { error } = await adminDb().from("analytics_indicators").update(indicatorRow(c.edition.id, { ...clean, position: ind.position })).eq("edition_id", c.edition.id).eq("code", ind.code);
  if (error) return fail("The indicator couldn’t be saved.");
  forgetCatalogs();
  await audit(viewer, "analytics.indicator", { type: "Indicator", id: `${c.edition.id}:${ind.code}`, label: `${ind.ref ?? ind.code} ${ind.name}` }, `Changed ${Object.keys(p).filter((k) => allowedKeys.includes(k)).join(", ")}`, [], "Configuration");
  refresh();
  return { ok: true, message: "Indicator saved." };
}

/**
 * A methodology pack (JSON) into the catalog: a new edition is created as given (a draft unless the pack says
 * otherwise); an existing one is updated, and indicators the pack no longer has are removed only when nothing was
 * recorded against them.
 */
export async function importPack(input: { text: string; meta: Partial<FileMeta> }): Promise<Result<{ id: string; added: number; updated: number; removed: number; kept: string[] }>> {
  const viewer = await allowed(["rankings", "manage"], undefined, "upload");
  if (!isViewer(viewer)) return viewer;
  const meta = readMeta(input?.meta);
  if (typeof meta === "string") return fail(meta);
  if (typeof input.text !== "string" || input.text.length > 8 * 1_048_576) return fail("That file is too large for a methodology pack.");
  let pack: MethodologyPack;
  try {
    pack = readPack(JSON.parse(input.text));
  } catch (e) {
    return fail(e instanceof SyntaxError ? "That file isn’t JSON." : e instanceof Error ? e.message : "That file isn’t a methodology pack.");
  }
  const { data: framework } = await adminDb().from("ranking_frameworks").select("slug").eq("slug", pack.edition.ranking).maybeSingle();
  if (!framework) return fail(`The pack is for “${pack.edition.ranking}”, which isn’t a ranking the Hub tracks.`);
  const existing = await catalogOf(pack.edition.id);
  const clash = (await catalogs()).find((c) => c.edition.ranking === pack.edition.ranking && c.edition.year === pack.edition.year && c.edition.id !== pack.edition.id);
  if (clash) return fail(`${clash.edition.label} already covers ${pack.edition.ranking} ${pack.edition.year}.`);
  let removed = 0;
  const kept: string[] = [];
  try {
    await writePack(pack, viewer.id, existing?.edition.status ?? pack.edition.status ?? "Draft");
    if (existing) {
      const codes = new Set(pack.indicators.map((i) => i.code));
      const gone = existing.indicators.filter((i) => !codes.has(i.code)).map((i) => i.code);
      if (gone.length) {
        const facts = await readEditionFacts([existing.edition.id]);
        const used = new Set([...facts.values.map((v) => v.code), ...facts.links.map((l) => l.code), ...facts.cases.map((x) => x.category)]);
        const free = gone.filter((code) => !used.has(code));
        kept.push(...gone.filter((code) => used.has(code)));
        if (free.length) {
          const { error } = await adminDb().from("analytics_indicators").delete().eq("edition_id", existing.edition.id).in("code", free);
          if (error) throw new Error(error.message);
          removed = free.length;
        }
      }
    }
  } catch {
    return fail("The pack couldn’t be saved. Nothing in it was applied twice; try again.");
  }
  const added = existing ? pack.indicators.filter((i) => !existing.indicators.some((x) => x.code === i.code)).length : pack.indicators.length;
  const updated = pack.indicators.length - added;
  await logImport({ kind: "pack", meta, rows: pack.indicators.length, edition: pack.edition.id, summary: { added, updated, removed, kept }, by: viewer.id });
  forgetCatalogs();
  await audit(viewer, "analytics.pack.import", { type: "Edition", id: pack.edition.id, label: pack.edition.label }, `${meta.fileName}: ${added} added, ${updated} updated, ${removed} removed${kept.length ? `, ${kept.length} kept (have data)` : ""}`, [], "Configuration");
  refresh();
  return { ok: true, message: existing ? `${pack.edition.label} updated.` : `${pack.edition.label} added as ${(pack.edition.status ?? "Draft").toLowerCase()}.`, data: { id: pack.edition.id, added, updated, removed, kept } };
}

export async function exportPack(input: { edition: string }): Promise<Result<{ name: string; text: string }>> {
  const viewer = await allowed(["rankings", "export"], undefined, "export");
  if (!isViewer(viewer)) return viewer;
  const c = await catalogOf(String(input?.edition));
  if (!c) return fail("That edition is no longer here.");
  const { updatedAt: _a, updatedBy: _b, ...edition } = c.edition;
  void _a;
  void _b;
  const pack: MethodologyPack = { pack: 1, edition, groups: c.groups, indicators: c.indicators };
  await audit(viewer, "analytics.pack.export", { type: "Edition", id: c.edition.id, label: c.edition.label }, `${c.indicators.length} indicators`, [], "Export");
  return { ok: true, message: "Pack ready.", data: { name: `${c.edition.id}.json`, text: `${JSON.stringify(pack, null, 2)}\n` } };
}

/* ---------- Template profiles and aliases ---------- */

const PROFILE_KEY = /^[a-z0-9][a-z0-9-]{1,47}$/;

function cleanProfile(raw: unknown): Profile | string {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const key = typeof p.key === "string" ? p.key.trim() : "";
  if (!PROFILE_KEY.test(key)) return "The profile key may use lowercase letters, digits and hyphens.";
  const name = text(p.name, 120);
  if (!name) return "Give the profile a name.";
  const kind = p.kind === "pairs" ? "pairs" : "rows";
  const strs = (v: unknown, max = 30) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 120)).slice(0, max) : []);
  const where = (v: unknown) =>
    Array.isArray(v)
      ? v.slice(0, 8).flatMap((w) => {
          if (!w || typeof w !== "object" || typeof (w as { column?: unknown }).column !== "string") return [];
          const o = w as Record<string, unknown>;
          if (typeof o.match === "string") {
            try {
              new RegExp(o.match, "i");
            } catch {
              return [];
            }
          }
          return [{ column: String(o.column).slice(0, 120), ...(Array.isArray(o.in) && { in: strs(o.in) }), ...(Array.isArray(o.notIn) && { notIn: strs(o.notIn) }), ...(typeof o.match === "string" && { match: o.match.slice(0, 300) }), ...(typeof o.empty === "boolean" && { empty: o.empty }) }];
        })
      : [];
  const measures = Array.isArray(p.measures)
    ? p.measures.slice(0, 20).flatMap((m) => {
        const o = (m ?? {}) as Record<string, unknown>;
        const op = ["count", "distinct", "sum", "fte"].includes(String(o.op)) ? (o.op as "count" | "distinct" | "sum" | "fte") : null;
        const k = typeof o.key === "string" && PROFILE_KEY.test(o.key) ? o.key : null;
        if (!op || !k) return [];
        if (op !== "count" && typeof o.column !== "string") return [];
        return [{ key: k, label: text(o.label, 120) || k, op, ...(typeof o.column === "string" && { column: o.column.slice(0, 120) }), ...(typeof o.full === "number" && o.full > 0 && { full: o.full }), ...(Array.isArray(o.where) && { where: where(o.where) }) }];
      })
    : [];
  const pairs = Array.isArray(p.pairs) ? p.pairs.slice(0, 40).flatMap((x) => (x && typeof x === "object" && typeof (x as { label?: unknown }).label === "string" && typeof (x as { key?: unknown }).key === "string" && PROFILE_KEY.test((x as { key: string }).key) ? [{ label: (x as { label: string }).label.slice(0, 200), key: (x as { key: string }).key }] : [])) : [];
  const headers = strs(p.headers, 12);
  if (kind === "rows" && (!headers.length || !measures.length)) return "A profile needs the headers that identify the template and at least one measure.";
  if (kind === "pairs" && !pairs.length) return "A label-and-figure profile needs at least one label.";
  const minCell = Math.max(1, Math.min(50, Math.round(Number(p.minCell) || 5)));
  return {
    key,
    name,
    ...(typeof p.owner === "string" && p.owner && { owner: p.owner }),
    description: text(p.description, 600),
    kind,
    headers,
    ...(Array.isArray(p.skip) && { skip: where(p.skip) }),
    measures,
    dimensions: strs(p.dimensions, 6),
    minCell,
    ...(pairs.length && { pairs }),
  };
}

export async function saveProfile(input: { profile: unknown }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const p = cleanProfile(input?.profile);
  if (typeof p === "string") return fail(p);
  if (p.owner && !(await readState()).units.some((u) => u.id === p.owner)) return fail("Choose the unit that keeps the data.");
  const { key, name, owner, description, ...spec } = p;
  const { count } = await adminDb().from("analytics_profiles").select("key", { count: "exact", head: true });
  const { error } = await adminDb().from("analytics_profiles").upsert({ key, name, owner_unit: owner ?? null, description, spec: spec as unknown as Json, updated_by: viewer.id, updated_at: new Date().toISOString(), position: (count ?? 0) + 1 }, { onConflict: "key" });
  if (error) return fail("The profile couldn’t be saved.");
  await audit(viewer, "analytics.profile", { type: "Template profile", id: key, label: name }, `${spec.measures.length || spec.pairs?.length || 0} measures`, [], "Configuration");
  refresh();
  return { ok: true, message: "Profile saved." };
}

export async function deleteProfile(input: { key: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const key = typeof input?.key === "string" ? input.key : "";
  const { data: row } = await adminDb().from("analytics_profiles").select("name").eq("key", key).maybeSingle();
  if (!row) return fail("That profile is no longer here.");
  await adminDb().from("analytics_profiles").delete().eq("key", key);
  await audit(viewer, "analytics.profile.delete", { type: "Template profile", id: key, label: row.name }, "Removed; earlier uploads keep their counts", [], "Configuration");
  refresh();
  return { ok: true, message: "Profile removed." };
}

export async function saveAlias(input: { alias: string; unit: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const alias = text(input?.alias, 60).toUpperCase();
  if (!alias) return fail("Type the name as the files write it.");
  if (!(await readState()).units.some((u) => u.id === input.unit && u.status === "Active")) return fail("Choose a unit.");
  const { error } = await adminDb().from("analytics_aliases").upsert({ alias, unit_id: input.unit }, { onConflict: "alias" });
  if (error) return fail("The alias couldn’t be saved.");
  await audit(viewer, "analytics.alias", { type: "Unit alias", id: alias, label: alias }, input.unit, [], "Configuration");
  refresh();
  return { ok: true, message: `${alias} now means that unit.` };
}

export async function deleteAlias(input: { alias: string }): Promise<Result> {
  const viewer = await allowed(["rankings", "manage"]);
  if (!isViewer(viewer)) return viewer;
  const alias = typeof input?.alias === "string" ? input.alias : "";
  await adminDb().from("analytics_aliases").delete().eq("alias", alias);
  await audit(viewer, "analytics.alias.delete", { type: "Unit alias", id: alias, label: alias }, "Removed", [], "Configuration");
  refresh();
  return { ok: true, message: "Alias removed." };
}

/* ---------- Imports ---------- */

/**
 * A template upload's counts, computed in the browser under the named profile. They are checked against the profile
 * (only its measures, only its dimensions, finite non-negative numbers) and small breakdown cells are dropped again
 * here, so nothing that could single out a person is ever stored.
 */
export async function importTemplate(input: { profile: string; year?: string; result: TemplateResult; meta: Partial<FileMeta> }): Promise<Result<{ id: string }>> {
  const viewer = await allowed(["rankings", "manage"], undefined, "upload");
  if (!isViewer(viewer)) return viewer;
  const meta = readMeta(input?.meta);
  if (typeof meta === "string") return fail(meta);
  const profile = (await readProfiles()).find((p) => p.key === input.profile);
  if (!profile) return fail("That template profile is no longer here.");
  const r = input.result;
  if (!r || typeof r !== "object" || r.profile !== profile.key) return fail("The counts don’t match the profile. Read the file again.");
  const keys = new Set(profile.kind === "pairs" ? (profile.pairs ?? []).map((p) => p.key) : profile.measures.map((m) => m.key));
  const counts = new Set(profile.measures.filter((m) => m.op === "count" || m.op === "distinct").map((m) => m.key));
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e13;
  const totals: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.totals ?? {})) if (keys.has(k) && finite(v)) totals[k] = v as number;
  if (!Object.keys(totals).length) return fail("Nothing in the file matched the profile’s measures.");
  const breakdowns = (Array.isArray(r.breakdowns) ? r.breakdowns : [])
    .filter((b) => b && profile.dimensions.includes(b.dimension) && Array.isArray(b.cells))
    .map((b) => {
      let suppressed = Number.isInteger(b.suppressed) && b.suppressed >= 0 ? b.suppressed : 0;
      const cells = b.cells
        .slice(0, 500)
        .map((c) => ({ value: text(c?.value, 120), counts: Object.fromEntries(Object.entries(c?.counts ?? {}).filter(([k, v]) => keys.has(k) && finite(v))) as Record<string, number> }))
        .filter((c) => {
          const small = [...counts].some((k) => (c.counts[k] ?? 0) > 0 && (c.counts[k] ?? 0) < profile.minCell);
          if (small) suppressed++;
          return c.value && !small;
        });
      return { dimension: b.dimension, cells, suppressed };
    });
  const year = typeof input.year === "string" && /^(\d{4})-(\d{4})$/.test(input.year) ? input.year : null;
  const rows = Number.isInteger(r.rows) && r.rows >= 0 ? r.rows : 0;
  let importId: string;
  try {
    importId = await logImport({ kind: "template", profile: profile.key, meta, rows, year, summary: { sheet: text(r.sheet, 120), skipped: Number.isInteger(r.skipped) ? r.skipped : 0 }, totals, breakdowns, by: viewer.id });
  } catch {
    return fail("The counts couldn’t be saved. Try again in a moment.");
  }
  await audit(viewer, "analytics.template", { type: "Template upload", id: importId, label: `${profile.name}: ${meta.fileName}` }, `${rows} rows counted in the browser; ${Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(", ")}; no rows stored`.slice(0, 600));
  refresh();
  return { ok: true, message: `${profile.name}: ${rows.toLocaleString("en-PH")} rows counted. Only the counts were kept.`, data: { id: importId } };
}

/** A unit's THE data-collection workbook into an edition, as the unit's values (for review) and evidence links. */
export async function importWorkbook(input: { edition: string; unit: string; sheets: unknown; meta: Partial<FileMeta> }): Promise<Result<{ values: number; links: number; unplaced: string[] }>> {
  const viewer = await allowed(["rankings", "edit"], undefined, "upload");
  if (!isViewer(viewer)) return viewer;
  const meta = readMeta(input?.meta);
  if (typeof meta === "string") return fail(meta);
  const c = await catalogOf(String(input.edition));
  if (!c) return fail("Choose an edition.");
  if (c.edition.status === "Archived") return fail("That edition is archived.");
  const state = await readState();
  const unit = typeof input.unit === "string" && state.units.some((u) => u.id === input.unit && u.status === "Active" && u.kind !== "University") ? input.unit : null;
  if (!unit) return fail("Choose the unit that sent the workbook.");
  const sheets = readSheets(input.sheets);
  if (typeof sheets === "string") return fail(sheets);
  const read = readTheWorkbook(sheets, c.indicators);
  if (!read.sheets) return fail("That workbook has no SDG sheets in the data-collection format.");
  const db = adminDb();
  let importId: string;
  try {
    importId = await logImport({ kind: "workbook", meta, rows: read.values.length + read.links.length, edition: c.edition.id, unit, summary: { values: read.values.length, links: read.links.length, unplaced: read.unplaced.slice(0, 200) }, by: viewer.id });
  } catch {
    return fail("The workbook couldn’t be recorded. Try again in a moment.");
  }
  const now = new Date().toISOString();
  if (read.values.length) {
    const { data, error } = await db
      .from("analytics_values")
      .upsert(
        read.values.map((v) => ({ edition_id: c.edition.id, indicator_code: v.code, unit_id: unit, value: v.value as Json, note: `From ${meta.fileName}`.slice(0, 2000), source: "import", source_ref: importId, status: "For review", entered_by: viewer.id, entered_at: now, reviewed_by: null, reviewed_at: null, review_note: null })),
        { onConflict: "edition_id,indicator_code,unit_id" },
      )
      .select("id, value, status");
    if (error) return fail("The workbook’s values couldn’t be saved.");
    if (data?.length) await db.from("analytics_value_history").insert(data.map((d) => ({ value_id: d.id, by: viewer.id, action: "imported", value: d.value, status: d.status, note: meta.fileName })));
  }
  let links = 0;
  for (const l of read.links) {
    const { error } = await db.from("analytics_links").insert({ edition_id: c.edition.id, indicator_code: l.code, unit_id: unit, url: l.url, label: l.label, ...(l.public !== undefined && { public: l.public }), added_by: viewer.id });
    if (!error) links++;
  }
  const name = state.units.find((u) => u.id === unit)?.name ?? unit;
  await audit(viewer, "analytics.workbook", { type: "Workbook import", id: importId, label: `${meta.fileName} · ${name}` }, `${read.values.length} values, ${links} links into ${c.edition.label}${read.unplaced.length ? `; ${read.unplaced.length} rows not placed` : ""}`);
  refresh();
  return { ok: true, message: `${read.values.length} values and ${links} links from ${name}, for review.`, data: { values: read.values.length, links, unplaced: read.unplaced } };
}

/** An activity register (SIMBAHAYAN's format) into the activity register; activities already there are skipped. */
export async function importRegister(input: { sheets: unknown; meta: Partial<FileMeta> }): Promise<Result<{ added: number; skipped: number; unknown: string[]; partners: number }>> {
  const viewer = await allowed(["rankings", "edit"], undefined, "upload");
  if (!isViewer(viewer)) return viewer;
  const meta = readMeta(input?.meta);
  if (typeof meta === "string") return fail(meta);
  const sheets = readSheets(input?.sheets);
  if (typeof sheets === "string") return fail(sheets);
  const state = await readState();
  // Aliases first, then the Directory's own codes (ENG, SCI…) and names.
  const aliases = { ...Object.fromEntries(state.units.filter((u) => u.status === "Active").flatMap((u) => [[u.code, u.id], [u.name, u.id]])), ...(await readAliases()) };
  const read = readRegister(sheets, aliases);
  if (!read.sheets.length) return fail("No sheet looks like an activity register (a kind and an academic year in its name, with Academic Unit and Project Title columns).");
  const years = [...new Set(read.activities.map((a) => a.year))];
  const existing = await readActivities(years);
  const key = (a: { year: string; kind: string; title: string; unit?: string; unitLabel: string }) => `${a.year}|${a.kind}|${a.title.toLowerCase()}|${a.unit ?? a.unitLabel.toLowerCase()}`;
  const seen = new Set(existing.map(key));
  const fresh = read.activities.filter((a) => {
    const k = key(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let importId: string;
  try {
    importId = await logImport({ kind: "register", meta, rows: read.activities.length, summary: { added: fresh.length, skipped: read.activities.length - fresh.length, unknownUnits: read.unknownUnits, sheets: read.sheets, partners: read.partners.slice(0, 300) }, by: viewer.id });
  } catch {
    return fail("The register couldn’t be recorded. Try again in a moment.");
  }
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await adminDb()
      .from("analytics_activities")
      .insert(
        fresh.slice(i, i + 500).map((a) => ({
          unit_id: a.unit ?? null,
          unit_label: a.unitLabel,
          kind: a.kind,
          academic_year: a.year,
          title: a.title,
          proponent: a.proponent,
          community: a.community,
          proposal_ref: a.proposalRef ?? null,
          report_ref: a.reportRef ?? null,
          reported: a.reported,
          source: "import",
          source_ref: importId,
          added_by: viewer.id,
        })),
      );
    if (error) return fail("Some activities couldn’t be saved. The ones before them were.");
  }
  await audit(viewer, "analytics.register", { type: "Activity register import", id: importId, label: meta.fileName }, `${fresh.length} added, ${read.activities.length - fresh.length} already there${read.unknownUnits.length ? `; units not matched: ${read.unknownUnits.join(", ")}` : ""}`);
  refresh();
  return { ok: true, message: `${fresh.length} activities added${read.activities.length - fresh.length ? `, ${read.activities.length - fresh.length} already there` : ""}.`, data: { added: fresh.length, skipped: read.activities.length - fresh.length, unknown: read.unknownUnits, partners: read.partners.length } };
}

/** Peer figures from a table (a portal export or the Office's own sheet), for one ranking. */
export async function importBenchmarks(input: { ranking: string; year: number; sheets: unknown; meta: Partial<FileMeta> }): Promise<Result<{ figures: number; peers: number }>> {
  const viewer = await allowed(["rankings", "edit"], undefined, "upload");
  if (!isViewer(viewer)) return viewer;
  const meta = readMeta(input?.meta);
  if (typeof meta === "string") return fail(meta);
  const { data: framework } = await adminDb().from("ranking_frameworks").select("slug").eq("slug", String(input.ranking)).maybeSingle();
  if (!framework) return fail("Choose a ranking.");
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("Choose the year the figures are for.");
  const sheets = readSheets(input.sheets);
  if (typeof sheets === "string") return fail(sheets);
  const read: BenchmarkRead = readBenchmarkTable(sheets, year);
  if (!read.rows.length) return fail("No figures found. The table needs an Institution column and a column per figure (or Metric and Value columns).");
  const db = adminDb();
  const { peers } = await readBenchmarks([]);
  const byName = new Map(peers.map((p) => [p.name.toLowerCase(), p.id]));
  let newPeers = 0;
  for (const name of read.institutions.filter((n) => !isOwnName(n) && !byName.has(n.toLowerCase()))) {
    const first = read.rows.find((r) => r.institution === name)!;
    const { data, error } = await db.from("analytics_peers").insert({ name, country: first.country, band: first.band, added_by: viewer.id }).select("id").single();
    if (!error && data) {
      byName.set(name.toLowerCase(), data.id);
      newPeers++;
    }
  }
  let importId: string;
  try {
    importId = await logImport({ kind: "benchmarks", meta, rows: read.rows.length, summary: { ranking: framework.slug, year, institutions: read.institutions.length, metrics: read.metrics, skipped: read.skipped }, by: viewer.id });
  } catch {
    return fail("The figures couldn’t be recorded. Try again in a moment.");
  }
  const rows = read.rows
    .map((r) => ({ ranking_slug: framework.slug, year: r.year, peer_id: r.own ? "" : (byName.get(r.institution.toLowerCase()) ?? null), metric: r.metric.slice(0, 120), value: r.value ?? null, label: r.label ?? null, source: "import", note: meta.fileName.slice(0, 300), entered_by: viewer.id }))
    .filter((r): r is typeof r & { peer_id: string } => r.peer_id !== null);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("analytics_benchmarks").upsert(rows.slice(i, i + 500), { onConflict: "ranking_slug,year,peer_id,metric" });
    if (error) return fail("Some figures couldn’t be saved.");
  }
  await audit(viewer, "analytics.benchmarks", { type: "Benchmark import", id: importId, label: meta.fileName }, `${rows.length} figures, ${newPeers} new peers, ${framework.slug} ${year}`);
  refresh();
  return { ok: true, message: `${rows.length} figures saved${newPeers ? `, ${newPeers} new peers` : ""}.`, data: { figures: rows.length, peers: newPeers } };
}

/** The indicator and the figures each GreenMetric evidence file gives, for the Office to confirm one by one. */
export async function readEvidenceDocs(input: { edition: string; docs: { name: string; text: string }[] }): Promise<Result<{ docs: (ReturnType<typeof readEvidenceDoc> & { name: string; known: boolean; title: string })[] }>> {
  const viewer = await allowed(["rankings", "edit"], undefined, "upload");
  if (!isViewer(viewer)) return viewer;
  const c = await catalogOf(String(input?.edition));
  if (!c) return fail("Choose an edition.");
  const docs = (Array.isArray(input.docs) ? input.docs : []).slice(0, 150).filter((d) => typeof d?.name === "string" && typeof d.text === "string");
  if (!docs.length) return fail("Choose the evidence files.");
  const out = docs.map((d) => {
    const r = readEvidenceDoc(d.text.slice(0, 400_000), d.name.slice(0, 260));
    const ind = r.code ? c.indicators.find((i) => i.code === r.code) : undefined;
    return { ...r, name: d.name.slice(0, 260), known: !!ind && ind.input.type === "number", title: ind ? `${ind.ref ?? ind.code} ${ind.name}` : r.title };
  });
  return { ok: true, message: `${out.length} files read.`, data: { docs: out } };
}

/** WURI case files into an edition's cases, with what each left blank. */
export async function importCases(input: { edition: string; docs: { name: string; text: string; sha256: string; bytes: number }[] }): Promise<Result<{ added: number; skipped: string[] }>> {
  const viewer = await allowed(["rankings", "edit"], undefined, "upload");
  if (!isViewer(viewer)) return viewer;
  const c = await catalogOf(String(input?.edition));
  if (!c) return fail("Choose an edition.");
  const categories = c.indicators.filter((i) => i.input.type === "cases").map((i) => i.code);
  if (!categories.length) return fail("That edition doesn’t take cases.");
  const docs = (Array.isArray(input.docs) ? input.docs : []).slice(0, 100).filter((d) => typeof d?.name === "string" && typeof d.text === "string");
  const existing = (await readEditionFacts([c.edition.id])).cases;
  const skipped: string[] = [];
  let added = 0;
  for (const d of docs) {
    if (!isWuriTemplate(d.text)) {
      skipped.push(`${d.name}: not a WURI case template`);
      continue;
    }
    const r = readWuriCase(d.text.slice(0, 400_000), categories);
    if (!r.title || !r.category) {
      skipped.push(`${d.name}: no ${r.title ? "category" : "programme name"}`);
      continue;
    }
    if (existing.some((x) => x.category === r.category && x.title.toLowerCase() === r.title.toLowerCase())) {
      skipped.push(`${d.name}: already filed`);
      continue;
    }
    const { error } = await adminDb().from("analytics_cases").insert({ edition_id: c.edition.id, category: r.category, title: r.title, abstract: r.abstract, source: "import", source_ref: d.name.slice(0, 260), checks: r.checks as unknown as Json, added_by: viewer.id });
    if (error) skipped.push(`${d.name}: couldn’t be saved`);
    else {
      added++;
      existing.push({ id: "", edition: c.edition.id, category: r.category, title: r.title, abstract: "", source: "import", checks: [], by: "", at: "" });
    }
  }
  const meta = docs[0] ? readMeta({ fileName: docs.length > 1 ? `${docs.length} case files` : docs[0].name, sha256: typeof docs[0].sha256 === "string" ? docs[0].sha256 : "", bytes: docs.reduce((s, d) => s + (Number(d.bytes) || 0), 0) }) : "No files";
  if (typeof meta !== "string") await logImport({ kind: "cases", meta, rows: docs.length, edition: c.edition.id, summary: { added, skipped }, by: viewer.id }).catch(() => null);
  await audit(viewer, "analytics.cases", { type: "WURI cases", id: c.edition.id, label: c.edition.label }, `${added} cases added${skipped.length ? `, ${skipped.length} skipped` : ""}`);
  refresh();
  return { ok: true, message: `${added} ${added === 1 ? "case" : "cases"} added${skipped.length ? `, ${skipped.length} skipped` : ""}.`, data: { added, skipped } };
}

/* ---------- Exports ---------- */

export async function exportIndicators(input: { edition: string }): Promise<Result<{ name: string; text: string }>> {
  const viewer = await allowed(["rankings", "export"], undefined, "export");
  if (!isViewer(viewer)) return viewer;
  const r = await reportFor(String(input?.edition));
  if (!r) return fail("That edition is no longer here.");
  const { catalog, facts } = r.bundle;
  const state = await readState();
  const unitName = (id: string) => (id === UNIVERSITY ? "University" : (state.units.find((u) => u.id === id)?.name ?? id));
  const rows: (string | number | null)[][] = [["Code", "Label", "Indicator", "Group", "Owners", "State", "Value", "Computed", "Claimed", "Secured", "Max", "Readiness %", "Links", "Public links", "Last updated"]];
  for (const ind of catalog.indicators) {
    const rep = r.report.indicators[ind.code];
    const links = facts.links.filter((l) => l.code === ind.code);
    rows.push([
      ind.code,
      ind.ref,
      ind.name,
      catalog.groups.find((g) => g.code === ind.group)?.name ?? ind.group,
      [...ind.owners.map(unitName), ...ind.ownerLabels].join("; "),
      rep.state,
      valueText(ind.input, rep.value, ind.unit),
      rep.computed,
      rep.points ? Math.round(rep.points.claimed * 100) / 100 : null,
      rep.points ? Math.round(rep.points.secured * 100) / 100 : null,
      rep.points?.max ?? null,
      Math.round(rep.readiness * 100),
      links.length,
      links.filter((l) => l.public).length,
      rep.updatedAt ?? null,
    ]);
  }
  await audit(viewer, "analytics.export.indicators", { type: "Edition", id: catalog.edition.id, label: catalog.edition.label }, `${catalog.indicators.length} rows, CSV`, [], "Export");
  return { ok: true, message: "Exported.", data: { name: `${catalog.edition.id}-indicators.csv`, text: csv(rows) } };
}

export async function exportBrief(input: { edition: string }): Promise<Result<{ name: string; text: string }>> {
  const viewer = await allowed(["rankings", "export"], undefined, "export");
  if (!isViewer(viewer)) return viewer;
  const r = await reportFor(String(input?.edition));
  if (!r) return fail("That edition is no longer here.");
  const { catalog } = r.bundle;
  const state = await readState();
  const [{ benchmarks, peers }, campaigns, actions, snapshots] = await Promise.all([readBenchmarks([catalog.edition.ranking]), readCampaigns(), readActions([catalog.edition.id]), readSnapshots([catalog.edition.id])]);
  const today = new Date().toISOString().slice(0, 10);
  const mine = campaigns.filter((c) => c.edition === catalog.edition.id);
  const standings = mine.filter((c) => c.status === "Open").flatMap((c) => unitStandings(c, r.bundle.facts, r.report, today));
  const textOut = positioningBrief({
    title: `${catalog.edition.label}: positioning brief`,
    catalog,
    report: r.report,
    benchmarks,
    peerBand: new Map(peers.map((p) => [p.id, p.band])),
    unitName: (id) => state.units.find((u) => u.id === id)?.name ?? id,
    standings,
    actions,
    snapshot: baseline(snapshots, new Date()),
    campaignsDue: mine.filter((c) => c.status === "Open").map((c) => ({ title: `${c.code} ${c.title}`, due: c.due })),
    today,
  });
  await audit(viewer, "analytics.export.brief", { type: "Edition", id: catalog.edition.id, label: catalog.edition.label }, "Positioning brief, Markdown", [], "Export");
  return { ok: true, message: "Brief ready.", data: { name: `${catalog.edition.id}-brief.md`, text: textOut } };
}

export async function exportGap(input: { ranking: string }): Promise<Result<{ name: string; text: string }>> {
  const viewer = await allowed(["rankings", "export"], undefined, "export");
  if (!isViewer(viewer)) return viewer;
  const ranking = String(input?.ranking);
  const { benchmarks, peers } = await readBenchmarks([ranking]);
  const cat = (await catalogs()).filter((c) => c.edition.ranking === ranking).sort((a, b) => b.edition.year - a.edition.year)[0] ?? null;
  const gap = gapMatrix(ranking, benchmarks, new Map(peers.map((p) => [p.id, p.band])), cat);
  const state = await readState();
  const rows: (string | number | null)[][] = [["Metric", "Year", "University", "Philippines median", "Gap %", "ASEAN median", "Gap %", "Aspirational median", "Gap %", "Owners"]];
  for (const g of gap)
    rows.push([g.label, g.year, g.ownLabel ?? g.own, g.medians.Philippines?.value ?? null, g.gaps.Philippines ?? null, g.medians.ASEAN?.value ?? null, g.gaps.ASEAN ?? null, g.medians.Aspirational?.value ?? null, g.gaps.Aspirational ?? null, g.owners.map((o) => state.units.find((u) => u.id === o)?.name ?? o).join("; ")]);
  await audit(viewer, "analytics.export.gap", { type: "Ranking", id: ranking, label: ranking }, `${gap.length} rows, CSV`, [], "Export");
  return { ok: true, message: "Gap matrix ready.", data: { name: `${ranking}-gap-matrix.csv`, text: csv(rows) } };
}

/** The quarterly review: what moved since about a quarter ago, the action items, and the risks. */
export async function exportQuarterly(input: { edition: string }): Promise<Result<{ name: string; text: string }>> {
  const viewer = await allowed(["rankings", "export"], undefined, "export");
  if (!isViewer(viewer)) return viewer;
  const r = await reportFor(String(input?.edition));
  if (!r) return fail("That edition is no longer here.");
  const { catalog } = r.bundle;
  const [snapshots, actions] = await Promise.all([readSnapshots([catalog.edition.id]), readActions([catalog.edition.id])]);
  const base = baseline(snapshots, new Date());
  const moved = movement(catalog, summarize(r.report), base?.summary ?? null);
  const state = await readState();
  const rows: (string | number | null)[][] = [[`${catalog.edition.label}: quarterly review`, base ? `Compared with ${base.at.slice(0, 10)}` : "No snapshot a quarter old yet"], [], ["Movement", "Before", "Now", "Change"]];
  for (const m of moved) rows.push([m.label, m.before, m.now, m.delta]);
  rows.push([], ["Action", "Indicator", "Owner", "Due", "Status", "Progress %"]);
  for (const a of actions) rows.push([a.action, a.code ?? "", a.owner ? (state.units.find((u) => u.id === a.owner)?.name ?? a.owner) : "", a.due ?? "", a.status, a.progress]);
  rows.push([], ["Risk", "Detail"]);
  for (const i of r.report.issues.filter((x) => x.level !== "info").slice(0, 40)) rows.push([i.level === "error" ? "Error" : "Warning", i.text]);
  for (const f of r.report.fixes.slice(0, 10)) rows.push(["Opportunity", `${f.title} (+${Math.round(f.gain * 100) / 100})`]);
  await audit(viewer, "analytics.export.quarterly", { type: "Edition", id: catalog.edition.id, label: catalog.edition.label }, "Quarterly review, CSV", [], "Export");
  return { ok: true, message: "Quarterly review ready.", data: { name: `${catalog.edition.id}-quarterly.csv`, text: csv(rows) } };
}
