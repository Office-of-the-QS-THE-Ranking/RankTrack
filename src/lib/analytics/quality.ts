/*
 * Data checks on an edition, the kind a validator would catch: impossible percentages, denominators of zero, units
 * that don't match the indicator's, values that moved a lot since the last edition, folder links, private Drive
 * files where the body counts public evidence, evidence dated outside the period, and indicators no unit supplies.
 */
import { collective } from "./owners";
import { evaluate, refsOf } from "./expr";
import { isDriveLink, isFolderLink } from "./links";
import type { Catalog, CatalogIndicator, Facts, IndicatorReport, Issue, ValueRow } from "./types";

/** Unit words a note may use that contradict the indicator's unit. */
const UNIT_SLIPS: { unit: RegExp; wrong: RegExp; text: string }[] = [
  { unit: /^kwh$/i, wrong: /\b(?:kilowatts?|kw)\b(?!\s*-?\s*h)/i, text: "kWh (energy), not kW (power)" },
  { unit: /^m²$|^m2$/i, wrong: /\b(?:hectares?|ha|square\s+feet|sq\.?\s*ft)\b/i, text: "square metres" },
  { unit: /^usd$/i, wrong: /\b(?:php|pesos?|₱)\b|₱/i, text: "US dollars (convert from pesos)" },
  { unit: /^tons?$|^metric tons?$/i, wrong: /\b(?:kg|kilograms?|pounds?|lbs?)\b/i, text: "tons" },
  { unit: /^m³$|^m3$/i, wrong: /\b(?:liters?|litres?|gallons?)\b/i, text: "cubic metres" },
];

const pctLike = (i: CatalogIndicator) => i.unit === "%" || (i.score?.kind === "bands" && /\*\s*100\s*$/.test(i.score.expr));

const label = (i: CatalogIndicator) => `${i.ref ?? i.code} ${i.name}`;

const fmt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-PH") : String(Math.round(n * 100) / 100));

export function qualityIssues({
  catalog,
  facts,
  reports,
  previous,
}: {
  catalog: Catalog;
  facts: Facts;
  reports: Record<string, IndicatorReport>;
  previous?: { label: string; values: ValueRow[] };
}): Issue[] {
  const { edition, indicators } = catalog;
  const out: Issue[] = [];
  const byCode = new Map(indicators.map((i) => [i.code, i]));
  const values = facts.values.filter((v) => v.edition === edition.id);
  const missingOffices = new Map<string, string[]>();

  for (const ind of indicators) {
    const r = reports[ind.code];
    if (!r) continue;
    if (r.computed !== null) {
      if (pctLike(ind) && r.computed > 100.0001) out.push({ code: ind.code, level: "error", kind: "range", text: `${label(ind)} works out above 100% (${fmt(r.computed)}%). Check its inputs.` });
      if (r.computed < 0) out.push({ code: ind.code, level: "error", kind: "range", text: `${label(ind)} works out negative (${fmt(r.computed)}). Check its inputs.` });
    }
    // Every input is there but the formula still can't be computed: a denominator is zero.
    const rule = ind.score;
    if (rule && (rule.kind === "bands" || rule.kind === "ratio") && r.computed === null) {
      const refs = refsOf(rule.expr);
      const present = refs.every((c) => {
        const v = reports[c]?.value?.num;
        return typeof v === "number" || (reports[c]?.computed ?? null) !== null;
      });
      if (refs.length && present && evaluate(rule.expr, (c) => reports[c]?.value?.num ?? reports[c]?.computed ?? null) === null)
        out.push({ code: ind.code, level: "error", kind: "zero", text: `${label(ind)} divides by zero. One of ${refs.map((c) => byCode.get(c)?.ref ?? c).join(", ")} is 0.` });
    }
    if (ind.input.type === "number") {
      const n = r.value?.num;
      if (typeof n === "number") {
        if (ind.input.min !== undefined && n < ind.input.min) out.push({ code: ind.code, level: "error", kind: "range", text: `${label(ind)} is below ${ind.input.min}.` });
        if (ind.input.max !== undefined && n > ind.input.max) out.push({ code: ind.code, level: "error", kind: "range", text: `${label(ind)} is above ${ind.input.max}.` });
        if (ind.input.integer && !Number.isInteger(n)) out.push({ code: ind.code, level: "warn", kind: "range", text: `${label(ind)} should be a whole number.` });
      }
    }
    if (ind.unit) {
      for (const row of values.filter((v) => v.code === ind.code && v.note)) {
        const slip = UNIT_SLIPS.find((s) => s.unit.test(ind.unit!) && s.wrong.test(row.note));
        if (slip) out.push({ code: ind.code, level: "warn", kind: "unit", text: `${label(ind)}: the note mentions another unit. Report it in ${slip.text}.` });
      }
    }
    if (!ind.owners.length && ind.input.type !== "none" && ind.input.type !== "result") {
      const named = ind.ownerLabels.filter((l) => !collective(l));
      if (named.length) for (const l of named) missingOffices.set(l, [...(missingOffices.get(l) ?? []), ind.code]);
      else if (!ind.ownerLabels.length) out.push({ code: ind.code, level: "info", kind: "owner", text: `No unit supplies ${label(ind)}.` });
    }
  }
  // Offices the methodology names that the Directory doesn't have: one note each, not one per indicator.
  for (const [office, codes] of missingOffices)
    out.push({ level: "info", kind: "owner", text: `${codes.length} ${codes.length === 1 ? "indicator names" : "indicators name"} “${office}”, which isn’t in the Directory (${codes.slice(0, 4).join(", ")}${codes.length > 4 ? "…" : ""}). Add it there or choose a unit.` });

  // Year on year: a value that moved by more than half since the last edition deserves a second look.
  if (previous) {
    const before = new Map<string, number>();
    for (const v of previous.values) if (typeof v.value.num === "number" && v.status !== "Needs revision") before.set(`${v.code}|${v.unit}`, v.value.num);
    for (const v of values) {
      const was = before.get(`${v.code}|${v.unit}`);
      const now = v.value.num;
      if (typeof now !== "number" || was === undefined || was === 0) continue;
      const change = (now - was) / Math.abs(was);
      if (Math.abs(change) > 0.5) {
        const ind = byCode.get(v.code);
        out.push({
          code: v.code,
          level: "warn",
          kind: "change",
          text: `${ind ? label(ind) : v.code} changed by ${change > 0 ? "+" : ""}${Math.round(change * 100)}% since ${previous.label} (${fmt(was)} → ${fmt(now)}).`,
        });
      }
    }
  }

  const links = facts.links.filter((l) => l.edition === edition.id);
  const uses = new Map<string, Set<string>>();
  for (const l of links) {
    const ind = byCode.get(l.code);
    if (!ind) continue;
    if (l.url) {
      uses.set(l.url, (uses.get(l.url) ?? new Set()).add(l.code));
      if (isFolderLink(l.url)) out.push({ code: l.code, level: "warn", kind: "folder", text: `${label(ind)} links to a folder. Link one self-contained file or page.` });
      else if (ind.evidence.public && isDriveLink(l.url) && l.public !== true)
        out.push({ code: l.code, level: "warn", kind: "private", text: `${label(ind)}: “${l.label || "a Drive file"}” isn’t marked public. Share it to anyone with the link, or publish it.` });
    }
    if (edition.years?.length && l.year && !edition.years.includes(l.year))
      out.push({ code: l.code, level: "warn", kind: "period", text: `${label(ind)}: “${l.label || l.url}” is from ${l.year}, outside ${edition.years.join("–")}.` });
  }
  for (const codes of uses.values())
    if (codes.size > 6) out.push({ level: "info", kind: "reuse", text: `One link is used for ${codes.size} indicators (${[...codes].slice(0, 4).join(", ")}…). The body reads one piece of evidence per indicator: make sure it answers each.` });

  const order = { error: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level] || (a.code ?? "").localeCompare(b.code ?? "", undefined, { numeric: true }));
}
