/*
 * Methodology packs: one edition's catalog as a portable JSON document. The Methodology page imports and exports
 * them, and the seed migrations were generated from them (scripts/analytics). A pack comes from outside, so every
 * field is read defensively: unknown kinds are refused, formulas must parse and only name indicators in the pack,
 * shares stay within 0–1, and the result is a clean copy, never the input object.
 */
import { formulaProblem, refsOf } from "./expr";
import type { AggregateKind, Band, CatalogIndicator, Choice, Criterion, EditionStatus, EvidenceSpec, Feed, Group, InputSpec, MethodologyPack, Rollup, ScoreRule } from "./types";

export const AGGREGATE_KINDS: AggregateKind[] = ["sum", "the-impact", "best-per-group", "readiness", "results"];
export const EDITION_STATUSES: EditionStatus[] = ["Draft", "Active", "Closed", "Archived"];
const ROLLUPS: Rollup[] = ["office", "sum", "max", "latest"];
const INPUTS: InputSpec["type"][] = ["none", "number", "choice", "picks", "yesno", "text", "date", "result", "cases"];

export const EDITION_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
export const CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** Most indicators and groups one edition may hold. */
export const PACK_LIMITS = { indicators: 1500, groups: 120, options: 40, bands: 12, text: 4000, name: 400 };

class PackError extends Error {}

function fail(msg: string): never {
  throw new PackError(msg);
}

const obj = (v: unknown, what: string): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(`${what} must be an object.`));
const arr = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(`${what} must be a list.`));
const str = (v: unknown, what: string, max = PACK_LIMITS.name, empty = false): string => {
  if (typeof v !== "string") fail(`${what} must be text.`);
  const s = (v as string).trim();
  if (!empty && !s) fail(`${what} is empty.`);
  if (s.length > max) fail(`${what} is longer than ${max} characters.`);
  return s;
};
const optStr = (v: unknown, what: string, max = PACK_LIMITS.name) => (v === undefined || v === null || v === "" ? null : str(v, what, max));
const num = (v: unknown, what: string, min = -Infinity, max = Infinity): number => {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) fail(`${what} must be a number.`);
  if (n < min || n > max) fail(`${what} must be between ${min} and ${max}.`);
  return n;
};
const optNum = (v: unknown, what: string, min?: number, max?: number) => (v === undefined || v === null ? undefined : num(v, what, min, max));
const share = (v: unknown, what: string) => num(v, what, 0, 1);
const day = (v: unknown, what: string) => {
  if (v === undefined || v === null || v === "") return undefined;
  const s = str(v, what, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) fail(`${what} must be a date like 2026-03-15.`);
  return s;
};
const strs = (v: unknown, what: string, max = 60): string[] => (v === undefined || v === null ? [] : arr(v, what).slice(0, max).map((x, i) => str(x, `${what} ${i + 1}`)));

function choices(v: unknown, what: string): Choice[] {
  const list = arr(v, what);
  if (!list.length) fail(`${what} needs at least one option.`);
  if (list.length > PACK_LIMITS.options) fail(`${what} has more than ${PACK_LIMITS.options} options.`);
  const out = list.map((x, i) => {
    const o = obj(x, `${what} option ${i + 1}`);
    return { key: str(o.key, `${what} option ${i + 1} key`, 80), label: str(o.label, `${what} option ${i + 1} label`) };
  });
  if (new Set(out.map((o) => o.key)).size !== out.length) fail(`${what} repeats an option key.`);
  return out;
}

function input(v: unknown, what: string): InputSpec {
  const o = obj(v, what);
  const type = o.type as InputSpec["type"];
  if (!INPUTS.includes(type)) fail(`${what} has an unknown type “${String(o.type)}”.`);
  switch (type) {
    case "number":
      return {
        type,
        ...(o.unit !== undefined && o.unit !== null && { unit: str(o.unit, `${what} unit`, 40) }),
        ...(o.integer === true && { integer: true }),
        ...(o.min !== undefined && { min: num(o.min, `${what} minimum`) }),
        ...(o.max !== undefined && { max: num(o.max, `${what} maximum`) }),
      };
    case "choice":
    case "picks":
      return { type, options: choices(o.options, `${what} options`) };
    case "text":
      return { type, ...(o.max !== undefined && { max: num(o.max, `${what} length`, 1, PACK_LIMITS.text) }) };
    default:
      return { type } as InputSpec;
  }
}

function bands(v: unknown, what: string): Band[] {
  const list = arr(v, what);
  if (list.length < 2 || list.length > PACK_LIMITS.bands) fail(`${what} needs 2 to ${PACK_LIMITS.bands} bands.`);
  return list.map((x, i) => {
    const o = obj(x, `${what} band ${i + 1}`);
    const b: Band = { label: str(o.label, `${what} band ${i + 1} label`, 200), share: share(o.share, `${what} band ${i + 1} share`) };
    if (o.min !== undefined) b.min = num(o.min, `${what} band ${i + 1} minimum`);
    if (o.max !== undefined) b.max = num(o.max, `${what} band ${i + 1} maximum`);
    if (o.minIncl === true) b.minIncl = true;
    if (o.maxIncl === true) b.maxIncl = true;
    if (b.min !== undefined && b.max !== undefined && b.min > b.max) fail(`${what} band ${i + 1} starts above where it ends.`);
    return b;
  });
}

function criteria(v: unknown, what: string): Criterion[] {
  const list = arr(v, what);
  if (!list.length) fail(`${what} needs at least one criterion.`);
  return list.map((x, i) => {
    const o = obj(x, `${what} criterion ${i + 1}`);
    const max = num(o.max, `${what} criterion ${i + 1} maximum`, 1, 1000);
    return {
      key: str(o.key, `${what} criterion ${i + 1} key`, 60),
      label: str(o.label, `${what} criterion ${i + 1} label`),
      group: str(o.group, `${what} criterion ${i + 1} group`),
      max,
      levels: arr(o.levels ?? [], `${what} criterion ${i + 1} levels`).map((y, j) => {
        const l = obj(y, `${what} criterion ${i + 1} level ${j + 1}`);
        return {
          label: str(l.label, `${what} level label`),
          min: num(l.min, `${what} level minimum`, 0, max),
          max: num(l.max, `${what} level maximum`, 0, max),
          hint: str(l.hint ?? "", `${what} level hint`, 600, true),
        };
      }),
    };
  });
}

function sharesOf(v: unknown, what: string): Record<string, number> {
  const o = obj(v, what);
  return Object.fromEntries(Object.entries(o).slice(0, PACK_LIMITS.options).map(([k, x]) => [k, share(x, `${what} “${k}”`)]));
}

function rule(v: unknown, what: string): ScoreRule | null {
  if (v === undefined || v === null) return null;
  const o = obj(v, what);
  const points = num(o.points, `${what} points`, 0, 100000);
  const expr = (k: string) => {
    const e = str(o[k], `${what} formula`, 600);
    const problem = formulaProblem(e);
    if (problem) fail(`${what} formula: ${problem}`);
    return e;
  };
  switch (o.kind) {
    case "bands":
      return { kind: "bands", points, expr: expr("expr"), bands: bands(o.bands, `${what} bands`) };
    case "choice":
      return { kind: "choice", points, shares: sharesOf(o.shares, `${what} shares`) };
    case "claim": {
      const ex = obj(o.existence ?? {}, `${what} existence`);
      return {
        kind: "claim",
        points,
        existence: {
          ...(ex.yes !== undefined && { yes: share(ex.yes, `${what} existence`) }),
          ...(ex.shares !== undefined && { shares: sharesOf(ex.shares, `${what} existence shares`) }),
          ...(ex.sum === true && { sum: true }),
          ...(ex.each !== undefined && { each: share(ex.each, `${what} existence per option`) }),
          ...(ex.cap !== undefined && { cap: share(ex.cap, `${what} existence cap`) }),
        },
        evidence: num(o.evidence ?? 1, `${what} evidence points`, 0, 10),
        public: num(o.public ?? 1, `${what} public points`, 0, 10),
        ...(o.dates !== undefined && { dates: num(o.dates, `${what} date points`, 0, 10) }),
      };
    }
    case "ratio":
      return { kind: "ratio", points, expr: expr("expr"), ...(o.better === "lower" && { better: "lower" as const }) };
    case "external":
      return { kind: "external", points };
    case "dated":
      return {
        kind: "dated",
        points,
        steps: arr(o.steps, `${what} steps`).map((x, i) => {
          const s = obj(x, `${what} step ${i + 1}`);
          return { until: day(s.until, `${what} step ${i + 1} date`) ?? fail(`${what} step ${i + 1} needs a date.`), share: share(s.share, `${what} step ${i + 1} share`) };
        }),
        later: share(o.later ?? 0, `${what} later share`),
      };
    case "rubric":
      return { kind: "rubric", points, criteria: criteria(o.criteria, `${what} criteria`) };
    default:
      return fail(`${what} has an unknown scoring kind “${String(o.kind)}”.`);
  }
}

function evidence(v: unknown): EvidenceSpec {
  if (v === undefined || v === null) return {};
  const o = obj(v, "Evidence");
  return {
    ...(o.required === true && { required: true }),
    ...(o.public === true && { public: true }),
    ...(o.policyDates === true && { policyDates: true }),
    ...(typeof o.note === "string" && o.note.trim() && { note: o.note.trim().slice(0, PACK_LIMITS.text) }),
  };
}

function feeds(v: unknown, what: string): Feed[] | null {
  if (v === undefined || v === null) return null;
  const list = arr(v, what).slice(0, 8).map((x, i): Feed => {
    const o = obj(x, `${what} ${i + 1}`);
    const label = optStr(o.label, `${what} ${i + 1} label`) ?? undefined;
    if (o.kind === "activities")
      return {
        kind: "activities",
        ...(o.kinds !== undefined && { kinds: strs(o.kinds, `${what} kinds`) }),
        ...(o.tags !== undefined && { tags: strs(o.tags, `${what} tags`) }),
        ...(o.measure === "beneficiaries" && { measure: "beneficiaries" as const }),
        ...((o.per === "year" || o.per === "average") && { per: o.per }),
        ...(label && { label }),
      };
    if (o.kind === "template") return { kind: "template", profile: str(o.profile, `${what} profile`, 60), measure: str(o.measure, `${what} measure`, 60), ...(label && { label }) };
    return fail(`${what} ${i + 1} has an unknown kind.`);
  });
  return list.length ? list : null;
}

/** A pack, checked and copied clean; throws a message fit for a toast when something is wrong. */
export function readPack(raw: unknown): MethodologyPack {
  const p = obj(raw, "The pack");
  if (p.pack !== 1) fail("This isn’t a methodology pack (version 1).");
  const e = obj(p.edition, "The edition");
  const id = str(e.id, "The edition id", 64);
  if (!EDITION_ID.test(id)) fail("The edition id may use lowercase letters, digits and hyphens, like greenmetric-2027.");
  const aggregate = e.aggregate as AggregateKind;
  if (!AGGREGATE_KINDS.includes(aggregate)) fail(`The edition’s aggregate “${String(e.aggregate)}” isn’t one the Hub knows.`);
  const status = e.status === undefined ? undefined : (e.status as EditionStatus);
  if (status !== undefined && !EDITION_STATUSES.includes(status)) fail("The edition status isn’t one the Hub knows.");
  const options = e.options === undefined ? {} : obj(e.options, "The edition options");
  const edition: MethodologyPack["edition"] = {
    id,
    ranking: str(e.ranking, "The ranking", 60),
    year: num(e.year, "The year", 2000, 2100),
    label: str(e.label, "The edition label", 160),
    methodology: str(e.methodology ?? "", "The methodology", 200, true),
    period: str(e.period ?? "", "The period", 200, true),
    scale: num(e.scale ?? 100, "The scale", 1, 1_000_000),
    aggregate,
    options: Object.fromEntries(Object.entries(options).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))),
    sources: strs(e.sources, "The sources", 40),
    notes: str(e.notes ?? "", "The notes", PACK_LIMITS.text, true),
    ...(day(e.opensOn, "The opening date") && { opensOn: day(e.opensOn, "The opening date") }),
    ...(day(e.closesOn, "The closing date") && { closesOn: day(e.closesOn, "The closing date") }),
    ...(e.years !== undefined && { years: arr(e.years, "The years").slice(0, 10).map((y, i) => num(y, `Year ${i + 1}`, 2000, 2100)) }),
    ...(status && { status }),
  };

  const groupsIn = arr(p.groups, "The groups");
  if (!groupsIn.length || groupsIn.length > PACK_LIMITS.groups) fail(`An edition needs 1 to ${PACK_LIMITS.groups} groups.`);
  const groups: Group[] = groupsIn.map((x, i) => {
    const g = obj(x, `Group ${i + 1}`);
    const code = str(g.code, `Group ${i + 1} code`, 64);
    if (!CODE.test(code)) fail(`Group code “${code}” may use letters, digits, dots and hyphens.`);
    return {
      code,
      position: i + 1,
      name: str(g.name, `Group ${code} name`),
      points: g.points === undefined || g.points === null ? null : num(g.points, `Group ${code} points`, 0, 1_000_000),
      weight: g.weight === undefined || g.weight === null ? null : share(g.weight, `Group ${code} weight`),
      mandatory: g.mandatory === true,
    };
  });
  if (new Set(groups.map((g) => g.code)).size !== groups.length) fail("Two groups share a code.");
  const groupCodes = new Set(groups.map((g) => g.code));

  const indIn = arr(p.indicators, "The indicators");
  if (indIn.length > PACK_LIMITS.indicators) fail(`An edition holds at most ${PACK_LIMITS.indicators} indicators.`);
  const indicators: CatalogIndicator[] = indIn.map((x, i) => {
    const o = obj(x, `Indicator ${i + 1}`);
    const code = str(o.code, `Indicator ${i + 1} code`, 64);
    if (!CODE.test(code)) fail(`Indicator code “${code}” may use letters, digits, dots and hyphens.`);
    const what = `Indicator ${code}`;
    const group = str(o.group, `${what} group`, 64);
    if (!groupCodes.has(group)) fail(`${what} sits in group “${group}”, which the pack doesn’t have.`);
    const rollup = (o.rollup ?? "office") as Rollup;
    if (!ROLLUPS.includes(rollup)) fail(`${what} has an unknown rollup.`);
    return {
      code,
      position: i + 1,
      group,
      parent: optStr(o.parent, `${what} parent`, 64),
      ref: optStr(o.ref, `${what} label`, 32),
      name: str(o.name, `${what} name`),
      guidance: str(o.guidance ?? "", `${what} guidance`, PACK_LIMITS.text, true),
      unit: optStr(o.unit, `${what} unit`, 40),
      input: input(o.input ?? { type: "none" }, `${what} input`),
      score: rule(o.score, what),
      evidence: evidence(o.evidence),
      owners: strs(o.owners, `${what} owners`, 20),
      ownerLabels: strs(o.ownerLabels, `${what} owner names`, 20),
      rollup,
      feeds: feeds(o.feeds, `${what} feeds`),
      tags: strs(o.tags, `${what} tags`, 20),
    };
  });
  const codes = new Set<string>();
  for (const ind of indicators) {
    if (codes.has(ind.code)) fail(`Two indicators share the code ${ind.code}.`);
    codes.add(ind.code);
  }
  for (const ind of indicators) {
    const r = ind.score;
    if (r && (r.kind === "bands" || r.kind === "ratio")) for (const c of refsOf(r.expr)) if (!codes.has(c)) fail(`Indicator ${ind.code}’s formula reads {${c}}, which the pack doesn’t have.`);
    if (ind.parent && !codes.has(ind.parent) && !groupCodes.has(ind.parent)) ind.parent = null;
    if (r && (r.kind === "choice" || (r.kind === "claim" && r.existence.shares)) && (ind.input.type === "choice" || ind.input.type === "picks")) {
      const keys = new Set(ind.input.options.map((o) => o.key));
      const shares = r.kind === "choice" ? r.shares : r.existence.shares!;
      for (const k of Object.keys(shares)) if (!keys.has(k)) fail(`Indicator ${ind.code} scores an option “${k}” it doesn’t offer.`);
    }
  }
  return { pack: 1, edition, groups, indicators };
}

/** A pack's problem as a sentence, or null. */
export function packProblem(raw: unknown): string | null {
  try {
    readPack(raw);
    return null;
  } catch (e) {
    return e instanceof PackError ? e.message : "That file isn’t a methodology pack.";
  }
}

/** The same methodology for another year: a new id, the year moved on, dates and evidence years moved with it. */
export function nextEdition(pack: MethodologyPack, year: number): MethodologyPack {
  const shift = year - pack.edition.year;
  const moveDay = (d?: string) => (d ? `${Number(d.slice(0, 4)) + shift}${d.slice(4)}` : undefined);
  const id = pack.edition.id.replace(/\d{4}$/, String(year));
  return {
    ...pack,
    edition: {
      ...pack.edition,
      id: id === pack.edition.id ? `${pack.edition.id}-${year}` : id,
      year,
      label: pack.edition.label.replace(String(pack.edition.year), String(year)),
      ...(pack.edition.opensOn && { opensOn: moveDay(pack.edition.opensOn) }),
      ...(pack.edition.closesOn && { closesOn: moveDay(pack.edition.closesOn) }),
      ...(pack.edition.years && { years: pack.edition.years.map((y) => y + shift) }),
      status: "Draft",
    },
  };
}
