/*
 * Shared pieces of the methodology pack builders: the band notation the GreenMetric guideline prints, the map from
 * the office names methodologies and responsibility maps use to the Directory's units, and the SQL that seeds packs
 * into the catalog tables. See docs/analytics-engine.md.
 */
import type { Band, CatalogIndicator, MethodologyPack } from "../../src/lib/analytics/types";

/**
 * Bands as the guideline prints them, one per "|": "≤1:.05 | >1-80:.25 | >80-90:.5 | >90-95:.75 | >95:1".
 * ≤a and <a cap from above, ≥a and >a open from below, a-b is inclusive at both ends, >a-b excludes a, ≥a-<b
 * excludes b. Each band's label is the threshold as written, with the unit after it.
 */
export function bands(spec: string, unit = ""): Band[] {
  return spec.split("|").map((part) => {
    const [range, shareText] = part.trim().split(":");
    const share = Number(shareText);
    if (!Number.isFinite(share)) throw new Error(`Band “${part}” has no share.`);
    const r = range.trim();
    const u = unit ? ` ${unit}` : "";
    const label = `${r.replace(/-/g, " – ")}${u}`.replace(/^(\d)/, "$1");
    let m: RegExpExecArray | null;
    if ((m = /^≤\s*(-?[\d.]+)$/.exec(r))) return { label, max: Number(m[1]), maxIncl: true, share };
    if ((m = /^<\s*(-?[\d.]+)$/.exec(r))) return { label, max: Number(m[1]), share };
    if ((m = /^≥\s*(-?[\d.]+)$/.exec(r))) return { label, min: Number(m[1]), minIncl: true, share };
    if ((m = /^>\s*(-?[\d.]+)$/.exec(r))) return { label, min: Number(m[1]), share };
    if ((m = /^≥\s*([\d.]+)\s*-\s*<\s*([\d.]+)$/.exec(r))) return { label, min: Number(m[1]), minIncl: true, max: Number(m[2]), share };
    if ((m = /^≥\s*([\d.]+)\s*-\s*([\d.]+)$/.exec(r))) return { label, min: Number(m[1]), minIncl: true, max: Number(m[2]), maxIncl: true, share };
    if ((m = /^>\s*([\d.]+)\s*-\s*([\d.]+)$/.exec(r))) return { label, min: Number(m[1]), max: Number(m[2]), maxIncl: true, share };
    if ((m = /^([\d.]+)\s*-\s*([\d.]+)$/.exec(r))) return { label, min: Number(m[1]), minIncl: true, max: Number(m[2]), maxIncl: true, share };
    if ((m = /^=\s*([\d.]+)$/.exec(r))) return { label: `${m[1]}${u}`, min: Number(m[1]), minIncl: true, max: Number(m[1]), maxIncl: true, share };
    throw new Error(`Band “${r}” isn’t in a notation the builder reads.`);
  });
}

/**
 * Office names as methodologies, letters and responsibility maps write them, to the Directory's org_units ids
 * (checked against the live directory on 2026-11-01). Names with no unit in the Directory stay as labels.
 */
export const OFFICE_UNITS: [RegExp, string][] = [
  [/registrar/i, "a12"],
  [/academic affairs|ovraa|curriculum/i, "vraa"],
  [/facilities management|\bfmo\b/i, "fmo"],
  [/health service|clinic/i, "a30"],
  [/\bleso\b|laboratory equipment/i, "a36"],
  [/research and innovation|ovrii|ovrri|research office/i, "vrri"],
  [/simbahayan|community (engagement|development)/i, "simbahayan"],
  [/student affairs|student organi[sz]ations|campus life|\bosa\b/i, "a11"],
  [/international (affairs|relations)|\boirp\b/i, "oirp"],
  [/innovation (&|and) entrepreneurship|tomasinno|\btic\b/i, "a33"],
  [/career/i, "careers"],
  [/finance/i, "a06"],
  [/information and communications technology|\bict\b/i, "a32"],
  [/human resource|\bhrd?\b/i, "hrd"],
  [/ed-?tech|educational technology/i, "a26"],
  [/internal audit/i, "internal-audit"],
  [/secretary general|\bosg\b/i, "secgen"],
  [/alumni/i, "a14"],
  [/faculty evaluation|\bofed\b/i, "a28"],
  [/property custodian/i, "a41"],
  [/purchasing/i, "a44"],
  [/\bcited\b|innovative teaching/i, "a34"],
  [/\bccpet\b|conservation of cultural property/i, "a34x"],
  [/\brccah\b|culture, arts/i, "rccah"],
  [/\brcnas\b|natural and applied sciences/i, "rcnas"],
  [/\brcssed?\b|social sciences and education/i, "rcsse"],
  [/^vr$|office of the vice[- ]rector$|\bovr\b/i, "a02"],
  [/grants, endowments/i, "a29"],
  [/\brector\b/i, "rector"],
];

/** The units a responsibility line names ("Facilities Management / Sustainability Office"), and the names left over. */
export function ownersOf(line: string): { owners: string[]; ownerLabels: string[] } {
  // Offices are separated by slashes; commas and "and" belong to names ("Office of Planning and Quality Management").
  const parts = line.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  const owners: string[] = [];
  const ownerLabels: string[] = [];
  for (const p of parts) {
    const hit = OFFICE_UNITS.find(([re]) => re.test(p))?.[1];
    // CCPET has no unit of its own in the Directory yet.
    if (hit && hit !== "a34x") {
      if (!owners.includes(hit)) owners.push(hit);
    } else if (!ownerLabels.includes(p)) ownerLabels.push(p);
  }
  return { owners, ownerLabels };
}

export const indicatorDefaults = (): Pick<CatalogIndicator, "parent" | "ref" | "guidance" | "unit" | "evidence" | "owners" | "ownerLabels" | "rollup" | "feeds" | "tags" | "score"> => ({
  parent: null,
  ref: null,
  guidance: "",
  unit: null,
  evidence: {},
  owners: [],
  ownerLabels: [],
  rollup: "office",
  feeds: null,
  tags: [],
  score: null,
});

const text = (s: string | null | undefined) => (s === null || s === undefined ? "null" : `'${s.replace(/'/g, "''")}'`);
const json = (v: unknown) => {
  const s = JSON.stringify(v ?? null);
  if (s.includes("$j$")) throw new Error("A pack holds the quote marker.");
  return `$j$${s}$j$::jsonb`;
};
const textArray = (xs: string[]) => (xs.length ? `array[${xs.map(text).join(", ")}]::text[]` : "'{}'::text[]");

/**
 * The SQL that puts packs into the catalog tables. It upserts and never deletes, so running a newer build over a live
 * database can't remove an indicator (and with it the values recorded against it); an edition's status, which the
 * Office manages, is set only when the edition is new.
 */
export function packsSql(packs: MethodologyPack[]): string {
  const out: string[] = [];
  for (const p of packs) {
    const e = p.edition;
    out.push(`-- ${e.label}: ${p.groups.length} groups, ${p.indicators.length} indicators`);
    out.push(
      `insert into public.analytics_editions (id, ranking_slug, year, label, methodology, period, status, scale, aggregate, options, sources, notes, opens_on, closes_on, years, updated_by, updated_at) values (${[
        text(e.id),
        text(e.ranking),
        e.year,
        text(e.label),
        text(e.methodology),
        text(e.period),
        text(e.status ?? "Draft"),
        e.scale,
        text(e.aggregate),
        json(e.options),
        textArray(e.sources),
        text(e.notes),
        e.opensOn ? text(e.opensOn) : "null",
        e.closesOn ? text(e.closesOn) : "null",
        e.years?.length ? `array[${e.years.join(", ")}]::integer[]` : "'{}'::integer[]",
        "'system'",
        "now()",
      ].join(", ")})\non conflict (id) do update set label = excluded.label, methodology = excluded.methodology, period = excluded.period, scale = excluded.scale, aggregate = excluded.aggregate, options = excluded.options, sources = excluded.sources, notes = excluded.notes, opens_on = excluded.opens_on, closes_on = excluded.closes_on, years = excluded.years, updated_by = excluded.updated_by, updated_at = excluded.updated_at;`,
    );
    out.push(
      `insert into public.analytics_groups (edition_id, code, position, name, points, weight, mandatory) values\n${p.groups
        .map((g) => `  (${text(e.id)}, ${text(g.code)}, ${g.position}, ${text(g.name)}, ${g.points ?? "null"}, ${g.weight ?? "null"}, ${g.mandatory})`)
        .join(",\n")}\non conflict (edition_id, code) do update set position = excluded.position, name = excluded.name, points = excluded.points, weight = excluded.weight, mandatory = excluded.mandatory;`,
    );
    for (let i = 0; i < p.indicators.length; i += 200) {
      const chunk = p.indicators.slice(i, i + 200);
      out.push(
        `insert into public.analytics_indicators (edition_id, code, position, group_code, parent_code, ref, name, guidance, unit, input, score, evidence, owners, owner_labels, rollup, feeds, tags) values\n${chunk
          .map(
            (x) =>
              `  (${[
                text(e.id),
                text(x.code),
                x.position,
                text(x.group),
                text(x.parent),
                text(x.ref),
                text(x.name),
                text(x.guidance),
                text(x.unit),
                json(x.input),
                x.score ? json(x.score) : "null",
                json(x.evidence),
                textArray(x.owners),
                textArray(x.ownerLabels),
                text(x.rollup),
                x.feeds ? json(x.feeds) : "null",
                textArray(x.tags),
              ].join(", ")})`,
          )
          .join(",\n")}\non conflict (edition_id, code) do update set position = excluded.position, group_code = excluded.group_code, parent_code = excluded.parent_code, ref = excluded.ref, name = excluded.name, guidance = excluded.guidance, unit = excluded.unit, input = excluded.input, score = excluded.score, evidence = excluded.evidence, owners = excluded.owners, owner_labels = excluded.owner_labels, rollup = excluded.rollup, feeds = excluded.feeds, tags = excluded.tags;`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}
