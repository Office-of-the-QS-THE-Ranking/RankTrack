/*
 * The analytics engine: one edition's catalog and facts in, its report out. For each indicator it resolves the
 * University's value from the Office's figure and the units' contributions, grades the evidence linked to it,
 * scores it in two tiers (claimed: everything submitted; secured: only what the Office validated), checks how ready
 * it is to submit, and suggests values from the activity register and template uploads. Groups, the headline
 * figure (aggregate.ts), the fix list (risk.ts) and data checks (quality.ts) follow from those.
 */
import { addPoints, aggregate, ZERO } from "./aggregate";
import { refsOf } from "./expr";
import { isFolderLink } from "./links";
import { collective } from "./owners";
import { qualityIssues } from "./quality";
import { fixesOf } from "./risk";
import { NO_GRADE, rubricMax, score, type Grade, type RuleContext, type Tier } from "./rules";
import type {
  Activity,
  Catalog,
  CatalogIndicator,
  Check,
  EditionReport,
  EvidenceRef,
  Facts,
  GroupReport,
  IndicatorReport,
  IndicatorState,
  LinkRow,
  Points,
  Value,
  ValueRow,
  ValueStatus,
} from "./types";
import { OWN, UNIVERSITY } from "./types";

type TierName = "claimed" | "secured";

const IN_TIER: Record<TierName, ValueStatus[]> = { claimed: ["For review", "Validated"], secured: ["Validated"] };

const latest = (rows: ValueRow[]) => [...rows].sort((a, b) => b.at.localeCompare(a.at))[0];

/** A policy's dates, from whichever answer gives both. */
const datesOf = (rows: ValueRow[]): Pick<Value, "created" | "reviewed"> => {
  const r = rows.find((x) => x.value.created && x.value.reviewed) ?? rows.find((x) => x.value.created || x.value.reviewed);
  return r ? { ...(r.value.created && { created: r.value.created }), ...(r.value.reviewed && { reviewed: r.value.reviewed }) } : {};
};

/** The share an option is worth under the indicator's rule, to pick the units' strongest answer. */
function optionShare(ind: CatalogIndicator, key: string) {
  const r = ind.score;
  if (r?.kind === "choice") return r.shares[key] ?? 0;
  if (r?.kind === "claim") return r.existence.shares?.[key] ?? 1;
  return 0;
}

/** Several units' answers to one question, as the University's: any yes, every option picked, the strongest choice. */
function mergeAnswers(ind: CatalogIndicator, rows: ValueRow[]): Value {
  const t = ind.input.type;
  if (t === "yesno") return { yes: rows.some((r) => r.value.yes === true), ...datesOf(rows) };
  if (t === "picks") {
    const picks = [...new Set(rows.flatMap((r) => r.value.picks ?? []))];
    return { picks, yes: picks.length > 0 || rows.some((r) => r.value.yes === true), ...datesOf(rows) };
  }
  if (t === "choice") {
    const best = [...rows].filter((r) => r.value.choice !== undefined).sort((a, b) => optionShare(ind, b.value.choice!) - optionShare(ind, a.value.choice!))[0];
    return best ? { ...best.value, ...datesOf(rows) } : latest(rows).value;
  }
  return latest(rows).value;
}

function resolve(ind: CatalogIndicator, rows: ValueRow[], tier: TierName): { value: Value | null; rows: ValueRow[] } {
  const ok = rows.filter((r) => IN_TIER[tier].includes(r.status));
  const office = ok.find((r) => r.unit === UNIVERSITY);
  if (office) return { value: office.value, rows: [office] };
  const units = ok.filter((r) => r.unit !== UNIVERSITY);
  if (!units.length) return { value: null, rows: [] };
  if (ind.input.type === "number") {
    const nums = units.filter((r) => typeof r.value.num === "number");
    if (!nums.length) return { value: null, rows: [] };
    if (ind.rollup === "sum") return { value: { num: nums.reduce((s, r) => s + r.value.num!, 0) }, rows: nums };
    if (ind.rollup === "max") {
      const top = [...nums].sort((a, b) => b.value.num! - a.value.num!)[0];
      return { value: top.value, rows: [top] };
    }
    const last = latest(nums);
    return { value: last.value, rows: [last] };
  }
  return { value: mergeAnswers(ind, units), rows: units };
}

const RELEVANCE = { specific: 1, general: 0.5, "not relevant": 0 } as const;

/**
 * The best evidence an indicator has. Claimed: every link that wasn't judged irrelevant (unassessed counts as
 * specific) whose evidence record wasn't returned. Secured: links the Office assessed, on validated records.
 */
function grade(links: LinkRow[], evidence: Map<string, EvidenceRef>, tier: TierName): Grade {
  const usable = links.filter((l) => {
    if (l.relevance === "not relevant") return false;
    const rec = l.evidenceId ? evidence.get(l.evidenceId) : undefined;
    if (l.evidenceId && !rec) return false;
    if (tier === "claimed") return rec?.status !== "Needs revision";
    return !!l.relevance && (!rec || rec.status === "Validated");
  });
  if (!usable.length) return NO_GRADE;
  return {
    any: true,
    relevance: Math.max(...usable.map((l) => (l.relevance ? RELEVANCE[l.relevance] : 1))),
    public: usable.some((l) => l.public === true || (l.evidenceId ? evidence.get(l.evidenceId)?.public === true : false)),
  };
}

/** The academic years an edition's calendar years touch: 2025 → 2024-2025 and 2025-2026. */
export function academicYears(years: number[] | undefined): string[] {
  if (!years?.length) return [];
  return [...new Set(years.flatMap((y) => [`${y - 1}-${y}`, `${y}-${y + 1}`]))];
}

function feedValues(ind: CatalogIndicator, facts: Facts, years: string[]): { value: number; from: string }[] {
  const out: { value: number; from: string }[] = [];
  // Figures accepted from evidence are offered for the indicator that takes a number, as the page states them.
  if (ind.input.type === "number") for (const f of facts.findings ?? []) if (f.code === ind.code) out.push({ value: f.value, from: f.from });
  for (const f of ind.feeds ?? []) {
    if (f.kind === "activities") {
      const acts = facts.activities.filter(
        (a: Activity) => (!years.length || years.includes(a.year)) && (!f.kinds?.length || f.kinds.includes(a.kind)) && (!f.tags?.length || f.tags.some((t) => a.tags.includes(t))),
      );
      const measure = (list: Activity[]) => (f.measure === "beneficiaries" ? list.reduce((s, a) => s + (a.beneficiaries ?? 0), 0) : list.length);
      const byYear = [...new Set(acts.map((a) => a.year))].sort();
      const value =
        f.per === "year" && byYear.length
          ? measure(acts.filter((a) => a.year === byYear[byYear.length - 1]))
          : f.per === "average" && byYear.length
            ? Math.round((measure(acts) / byYear.length) * 10) / 10
            : measure(acts);
      const which = f.per === "year" && byYear.length ? ` (${byYear[byYear.length - 1].replace("-", "–")})` : f.per === "average" && byYear.length ? ` (average of ${byYear.length} years)` : "";
      if (acts.length) out.push({ value, from: `${f.label ?? `Activity register${f.kinds?.length ? `: ${f.kinds.join(", ").toLowerCase()}` : ""}`}${which}` });
    } else {
      const v = facts.templates[f.profile]?.[f.measure];
      if (typeof v === "number") out.push({ value: v, from: f.label ?? `Template upload: ${f.profile}` });
    }
  }
  return out;
}

const answeredValue = (v: Value | null) =>
  !!v && (v.num !== undefined || v.choice !== undefined || !!v.picks?.length || v.yes !== undefined || !!v.text?.trim() || !!v.date);

export interface EngineInput {
  catalog: Catalog;
  facts: Facts;
  /** The previous edition of the same ranking, for year-on-year checks. */
  previous?: { label: string; values: ValueRow[] };
}

export function computeEdition({ catalog, facts, previous }: EngineInput): EditionReport {
  const { edition, groups, indicators } = catalog;
  const byCode = new Map(indicators.map((i) => [i.code, i]));
  const rowsOf = new Map<string, ValueRow[]>();
  for (const r of facts.values.filter((v) => v.edition === edition.id)) rowsOf.set(r.code, [...(rowsOf.get(r.code) ?? []), r]);
  const linksOf = new Map<string, LinkRow[]>();
  for (const l of facts.links.filter((x) => x.edition === edition.id)) linksOf.set(l.code, [...(linksOf.get(l.code) ?? []), l]);
  const evidence = new Map(facts.evidence.map((e) => [e.id, e]));
  const years = academicYears(edition.years);

  const resolved = new Map<string, Record<TierName, { value: Value | null; rows: ValueRow[] }>>();
  const resolvedOf = (ind: CatalogIndicator) => {
    let r = resolved.get(ind.code);
    if (!r) {
      const rows = rowsOf.get(ind.code) ?? [];
      r = { claimed: resolve(ind, rows, "claimed"), secured: resolve(ind, rows, "secured") };
      resolved.set(ind.code, r);
    }
    return r;
  };

  // Numbers other formulas read: an entered number, or what another formula computes. Cycles read as missing.
  const computedMemo: Record<TierName, Map<string, number | null>> = { claimed: new Map(), secured: new Map() };
  const visiting = new Set<string>();
  const numberOf = (tier: TierName) => (code: string): number | null => {
    const ind = byCode.get(code);
    if (!ind) return null;
    if (ind.input.type === "number") {
      const n = resolvedOf(ind)[tier].value?.num;
      if (typeof n === "number") return n;
    }
    const rule = ind.score;
    if (rule && (rule.kind === "bands" || rule.kind === "ratio") && !(ind.input.type === "number" && refsOf(rule.expr).includes(code))) {
      const memo = computedMemo[tier];
      if (memo.has(code)) return memo.get(code)!;
      if (visiting.has(code)) return null;
      visiting.add(code);
      const res = score(rule, ruleContext(ind));
      visiting.delete(code);
      computedMemo.claimed.set(code, res.computed);
      computedMemo.secured.set(code, res.securedComputed);
      return memo.get(code)!;
    }
    return null;
  };

  const peersFor = (code: string) => {
    const rows = facts.benchmarks.filter((b) => b.ranking === edition.ranking && b.metric === code && b.peer !== OWN && typeof b.value === "number");
    const year = Math.max(0, ...rows.map((b) => b.year));
    return rows.filter((b) => b.year === year).map((b) => b.value!);
  };
  const publishedFor = (code: string) => {
    const own = facts.benchmarks
      .filter((b) => b.ranking === edition.ranking && b.metric === code && b.peer === OWN && typeof b.value === "number" && b.year <= edition.year)
      .sort((a, b) => b.year - a.year)[0];
    return own ? own.value! : null;
  };
  const casesFor = (ind: CatalogIndicator) => {
    if (ind.score?.kind !== "rubric") return [];
    const max = rubricMax(ind.score) || 1;
    return facts.cases
      .filter((c) => c.edition === edition.id && c.category === ind.code)
      .map((c) => {
        const rs = facts.reviews.filter((r) => r.caseId === c.id);
        return rs.length ? rs.reduce((s, r) => s + r.total, 0) / rs.length / max : null;
      })
      .filter((x): x is number => x !== null)
      .sort((a, b) => b - a);
  };

  function ruleContext(ind: CatalogIndicator): RuleContext {
    const r = resolvedOf(ind);
    const links = linksOf.get(ind.code) ?? [];
    const tier = (t: TierName): Tier => ({ value: r[t].value, lookup: numberOf(t), grade: grade(links, evidence, t) });
    return { claimed: tier("claimed"), secured: tier("secured"), peers: peersFor(ind.code), published: publishedFor(ind.code), cases: casesFor(ind) };
  }

  const reports: Record<string, IndicatorReport> = {};
  for (const ind of indicators) {
    const rows = rowsOf.get(ind.code) ?? [];
    const links = linksOf.get(ind.code) ?? [];
    const r = resolvedOf(ind);
    const rule = ind.score;
    const ctx = ruleContext(ind);
    const result = rule ? score(rule, ctx) : null;
    const na = rows.some((x) => x.status === "Not applicable") && !r.claimed.value;
    const max = rule?.points ?? 0;
    const points: Points | null =
      rule && result
        ? na
          ? { max, secured: 0, claimed: 0, open: 0, lost: max }
          : {
              max,
              claimed: result.claimed,
              secured: Math.min(result.secured, result.claimed),
              open: result.open ? max : 0,
              lost: result.open ? 0 : Math.max(0, max - result.claimed),
            }
        : null;

    const t = ind.input.type;
    const cases = facts.cases.filter((c) => c.edition === edition.id && c.category === ind.code);
    const reviewed = cases.filter((c) => facts.reviews.some((x) => x.caseId === c.id));
    let state: IndicatorState;
    if (na) state = "Not applicable";
    else if (t === "cases") state = reviewed.length ? "Validated" : cases.length ? "For review" : "Not started";
    else if (t === "result") state = ctx.published !== null ? "Validated" : "Not started";
    else if (t === "none") state = result?.securedComputed != null ? "Validated" : result?.computed != null ? "For review" : "Not started";
    else if (r.secured.value && answeredValue(r.secured.value)) state = "Validated";
    else if (r.claimed.value && answeredValue(r.claimed.value)) state = "For review";
    else if (rows.some((x) => x.status === "Needs revision")) state = "Needs revision";
    else state = "Not started";

    // Evidence, public and date gains are offered once the question is answered; until then it is open as a whole.
    const claimRule = rule?.kind === "claim" && result && !result.open ? rule : null;
    const parts = claimRule ? 1 + claimRule.evidence + claimRule.public + (claimRule.dates ?? 0) : 1;
    const per = (n: number) => (claimRule ? (max * n) / parts : 0);
    const checks: Check[] = [];
    if (!na) {
      if (t === "cases") {
        checks.push({ key: "value", label: "A case is filed", ok: cases.length > 0, ...(points?.open && { gain: points.open }) });
        checks.push({ key: "validated", label: "A case is reviewed", ok: reviewed.length > 0 });
      } else if (t === "result") {
        checks.push({ key: "value", label: "Result recorded", ok: ctx.published !== null });
      } else if (t === "none") {
        if (rule) checks.push({ key: "value", label: "Inputs complete", ok: result?.computed != null, ...(points?.open && { gain: points.open }) });
      } else {
        checks.push({ key: "value", label: "Value entered", ok: answeredValue(r.claimed.value), ...(points?.open && { gain: points.open }) });
        checks.push({ key: "validated", label: "Validated", ok: answeredValue(r.secured.value) });
      }
      if (ind.evidence.required) {
        checks.push({ key: "evidence", label: "Evidence linked", ok: ctx.claimed.grade.any, ...(claimRule && !ctx.claimed.grade.any && { gain: per(claimRule.evidence) }) });
        checks.push({ key: "relevant", label: "Evidence assessed", ok: ctx.secured.grade.any, ...(claimRule && ctx.claimed.grade.relevance === 0.5 && { gain: per(claimRule.evidence * 0.5) }) });
      }
      if (ind.evidence.public) checks.push({ key: "public", label: "Evidence is public", ok: ctx.claimed.grade.public, ...(claimRule && !ctx.claimed.grade.public && { gain: per(claimRule.public) }) });
      if (links.length) checks.push({ key: "single", label: "One self-contained item each", ok: links.every((l) => l.selfContained !== false && !(l.url && isFolderLink(l.url))) });
      if (ind.evidence.policyDates) {
        const v = r.claimed.value;
        checks.push({ key: "dates", label: "Policy dates given", ok: !!(v?.created && v?.reviewed), ...(claimRule?.dates && !(v?.created && v?.reviewed) && { gain: per(claimRule.dates) }) });
      }
      const dated = links.filter((l) => l.year);
      if (edition.years?.length && dated.length) checks.push({ key: "period", label: "Within the period", ok: dated.every((l) => edition.years!.includes(l.year!)) });
      if (t !== "none" && t !== "result") checks.push({ key: "owner", label: "A unit supplies it", ok: ind.owners.length > 0 || ind.ownerLabels.some(collective) });
    }
    // Whether a unit supplies it is setup, not readiness: it shows in the checks but doesn't count toward the score.
    const counted = checks.filter((c) => c.key !== "owner");
    const readiness = na ? 1 : counted.length ? counted.filter((c) => c.ok).length / counted.length : 1;
    const contributors = [...new Set([...r.claimed.rows.map((x) => x.unit), ...links.map((l) => l.unit)].filter((u) => u !== UNIVERSITY))];
    const stamps = [...rows.map((x) => x.reviewedAt ?? x.at), ...links.map((l) => l.assessedAt ?? l.at)].sort();
    reports[ind.code] = {
      code: ind.code,
      value: r.claimed.value,
      computed: result?.computed ?? null,
      band: result?.band ?? null,
      points,
      readiness,
      checks,
      state,
      contributors,
      links: links.length,
      suggested: feedValues(ind, facts, years),
      ...(stamps.length && { updatedAt: stamps[stamps.length - 1] }),
    };
  }

  // Readiness weighs each indicator by what it is worth; unscored items count as the average scored one.
  const scoredMax = indicators.filter((i) => i.score).map((i) => i.score!.points);
  const unscoredWeight = scoredMax.length ? scoredMax.reduce((s, x) => s + x, 0) / scoredMax.length : 1;
  const weightOf = (i: CatalogIndicator) => (reports[i.code].state === "Not applicable" ? 0 : (i.score?.points ?? unscoredWeight) || unscoredWeight);
  const weighted = (list: CatalogIndicator[]) => {
    const w = list.reduce((s, i) => s + weightOf(i), 0);
    return w ? list.reduce((s, i) => s + weightOf(i) * reports[i.code].readiness, 0) / w : 0;
  };

  const groupReports: GroupReport[] = [...groups]
    .sort((a, b) => a.position - b.position)
    .map((g) => {
      const list = indicators.filter((i) => i.group === g.code);
      const scored = list.filter((i) => reports[i.code].points);
      return {
        code: g.code,
        name: g.name,
        points: scored.length ? scored.reduce((s, i) => addPoints(s, reports[i.code].points!), ZERO) : null,
        readiness: Math.round(weighted(list) * 1000) / 10,
        indicators: list.length,
        done: list.filter((i) => reports[i.code].state === "Validated" || reports[i.code].state === "Not applicable").length,
      };
    });

  const readiness = Math.round(weighted(indicators) * 1000) / 10;
  const list = indicators.map((i) => reports[i.code]);
  const total = aggregate(edition.aggregate, { edition, groups: groupReports, indicators: list, readiness, benchmarks: facts.benchmarks });
  const values = facts.values.filter((v) => v.edition === edition.id);
  return {
    edition: edition.id,
    indicators: reports,
    groups: groupReports,
    total,
    readiness,
    fixes: fixesOf(catalog, reports),
    issues: qualityIssues({ catalog, facts, reports, previous }),
    counts: {
      indicators: indicators.length,
      scored: indicators.filter((i) => i.score).length,
      withValue: list.filter((r) => r.state !== "Not started").length,
      validated: list.filter((r) => r.state === "Validated").length,
      links: facts.links.filter((l) => l.edition === edition.id).length,
      revisions: values.filter((v) => v.status === "Needs revision").length,
    },
  };
}
