/*
 * Data quality checks and duplicate detection over the records the Hub holds. Pure functions, so the
 * console can show results and the server can enforce them with the same logic.
 */
import type { DuplicateDecision, EvidenceRecord, QualityRule } from "./types";

export interface RuleResult {
  rule: QualityRule;
  failures: { id: string; label: string; why: string }[];
  status: "Passing" | "Warning" | "Failing" | "Off";
}

interface StoryLike {
  slug: string;
  title: string;
  state: string;
  replication: string;
  /** Posts are free text, with no replication field to check. */
  post?: unknown;
}

const YEARS = /\b(19|20)\d{2}\b/g;

/** Evidence must speak to the 2025 reporting window; 2024 is accepted only for corrections, 2026 for academic years that run into it. */
function periodProblem(period: string): string | null {
  const years = (period.match(YEARS) ?? []).map(Number);
  if (!years.length) return "No year in the reporting period";
  if (!years.includes(2025)) return `Covers ${years.join("–")}, outside the 2025 window`;
  const out = years.filter((y) => y < 2024 || y > 2026);
  return out.length ? `Includes ${out.join(", ")}, outside the cycle window` : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function bigrams(s: string) {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Dice similarity on letter pairs, ignoring spacing and punctuation ("grey water" = "greywater"). */
export function similarity(a: string, b: string) {
  const x = bigrams(norm(a));
  const y = bigrams(norm(b));
  let both = 0;
  let total = 0;
  for (const [g, n] of x) {
    both += Math.min(n, y.get(g) ?? 0);
    total += n;
  }
  for (const n of y.values()) total += n;
  return total ? (2 * both) / total : 0;
}

export interface DuplicatePair {
  key: string;
  a: EvidenceRecord;
  b: EvidenceRecord;
  score: number;
  decision?: DuplicateDecision;
}

/** Pairs of submissions from the same unit whose titles are near-identical. */
export function findDuplicates(evidence: EvidenceRecord[], decisions: DuplicateDecision[], threshold = 0.86): DuplicatePair[] {
  const out: DuplicatePair[] = [];
  const live = evidence.filter((e) => e.status !== "Not applicable" || decisions.some((d) => d.key.includes(e.id)));
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const [a, b] = [live[i], live[j]].sort((p, q) => p.id.localeCompare(q.id));
      if (a.unitSlug !== b.unitSlug) continue;
      const score = similarity(a.title, b.title);
      if (score < threshold) continue;
      const key = `${a.id}|${b.id}`;
      out.push({ key, a, b, score, decision: decisions.find((d) => d.key === key) });
    }
  return out.sort((p, q) => q.score - p.score);
}

export function runRules(rules: QualityRule[], evidence: EvidenceRecord[], stories: StoryLike[], decisions: DuplicateDecision[]): RuleResult[] {
  const open = evidence.filter((e) => e.status !== "Not applicable");
  const dupes = findDuplicates(evidence, decisions).filter((d) => !d.decision);
  return rules.map((rule) => {
    let failures: RuleResult["failures"] = [];
    switch (rule.check) {
      case "period":
        failures = open.flatMap((e) => {
          const why = periodProblem(e.period);
          return why ? [{ id: e.id, label: e.title, why }] : [];
        });
        break;
      case "files":
        failures = open.filter((e) => !e.files.length).map((e) => ({ id: e.id, label: e.title, why: "No file or URL attached" }));
        break;
      case "beneficiaries":
        failures = open
          .filter((e) => e.type === "Narrative and outcomes" && !e.beneficiaries.trim())
          .map((e) => ({ id: e.id, label: e.title, why: "Beneficiaries not stated" }));
        break;
      case "mapped":
        failures = open.filter((e) => !e.mappedTo.length).map((e) => ({ id: e.id, label: e.title, why: "Not mapped to any indicator" }));
        break;
      case "duplicates":
        failures = dupes.map((d) => ({ id: d.b.id, label: d.b.title, why: `${Math.round(d.score * 100)}% match with ${d.a.id}` }));
        break;
      case "replication":
        failures = stories
          .filter((s) => s.state === "Published" && !s.post && !s.replication.trim())
          .map((s) => ({ id: s.slug, label: s.title, why: "No replication guidance" }));
        break;
      case "external":
        failures = Array.from({ length: rule.externalFailures ?? 0 }, (_, i) => ({ id: `${rule.id}-${i + 1}`, label: rule.name, why: "Reported by the source system" }));
        break;
    }
    const status: RuleResult["status"] = !rule.enabled ? "Off" : !failures.length ? "Passing" : rule.severity === "Error" ? "Failing" : "Warning";
    return { rule, failures, status };
  });
}

/** 0–100: share of enabled checks passing, errors weighing double. */
export function qualityScore(results: RuleResult[]) {
  const on = results.filter((r) => r.status !== "Off");
  if (!on.length) return 100;
  const weight = (r: RuleResult) => (r.rule.severity === "Error" ? 2 : 1);
  const total = on.reduce((n, r) => n + weight(r), 0);
  const good = on.reduce((n, r) => n + (r.status === "Passing" ? weight(r) : 0), 0);
  return Math.round((good / total) * 100);
}
