/*
 * The fix list: what would add the most points, on the edition's own scale, most first. Missing values, evidence
 * that isn't linked or public, policies without dates, and the next band up for banded indicators.
 */
import type { Catalog, CatalogIndicator, Check, Fix, IndicatorReport } from "./types";

const name = (i: CatalogIndicator) => `${i.ref ?? i.code} ${i.name}`;

const TITLE: Partial<Record<Check["key"], (i: CatalogIndicator) => string>> = {
  value: (i) => (i.input.type === "none" ? `Complete the inputs for ${name(i)}` : i.input.type === "cases" ? `File a case for ${name(i)}` : `Enter ${name(i)}`),
  evidence: (i) => `Link evidence for ${name(i)}`,
  relevant: (i) => `Find specific evidence for ${name(i)}`,
  public: (i) => `Make the evidence public for ${name(i)}`,
  dates: (i) => `Add the policy dates for ${name(i)}`,
};

const MAX_FIXES = 60;

export function fixesOf(catalog: Catalog, reports: Record<string, IndicatorReport>): Fix[] {
  const out: Fix[] = [];
  for (const ind of catalog.indicators) {
    const r = reports[ind.code];
    if (!r || !ind.score || r.state === "Not applicable") continue;
    for (const c of r.checks) {
      if (c.ok || !c.gain || c.gain <= 0 || !TITLE[c.key]) continue;
      out.push({ code: ind.code, title: TITLE[c.key]!(ind), gain: c.gain, kind: c.key === "value" ? "missing" : c.key, owners: ind.owners });
    }
    const next = r.band?.next;
    if (next && next.gain > 0) {
      const target = ind.input.type === "choice" ? (ind.input.options.find((o) => o.key === next.label)?.label ?? next.label) : next.label;
      out.push({ code: ind.code, title: `Reach the next band for ${name(ind)}: ${target}`, gain: next.gain, kind: "band", owners: ind.owners });
    }
  }
  return out.sort((a, b) => b.gain - a.gain || a.code.localeCompare(b.code, undefined, { numeric: true })).slice(0, MAX_FIXES);
}
