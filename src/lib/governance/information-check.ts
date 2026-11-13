/*
 * Process Pipelines › Information › Check Integrity. An information pipeline has no settings to dry-run, so its check
 * reads what the pipeline depends on, live: each figure informationFlow() reads must come back (a figure that can't
 * be read is a source that is down), what it reads must be healthy and recent, and the workflow pipeline that governs
 * one of its stages is dry-run on its saved settings (pipeline-check.ts). Read only. The report has the same shape as
 * a workflow's (PipelineCheck); marks are src (sources), load (health), outs, and workflow:<key> for a governed stage.
 */
import type { Reference } from "@/lib/reference";
import { evidenceList } from "./records";
import type { InformationFlow } from "./pipeline-flow";
import { checkPipeline, worst, type CheckItem, type CheckStatus, type NodeMark, type PipelineCheck } from "./pipeline-check";
import type { GovernanceState, WorkflowKey } from "./types";

export const INFO_PIPELINES = {
  evidence: "Unit evidence",
  "data-requests": "Data requests",
  imports: "Data imports",
  methodology: "Methodologies",
  scores: "Scores & readiness",
  deadlines: "Ranking deadlines",
  "public-site": "Public website",
  assistant: "Assistant index",
  forms: "Digital forms",
  backups: "Recovery points",
} as const;
export type InfoPipeline = keyof typeof INFO_PIPELINES;

/** The figures each pipeline reads, by name: undefined in the flow means the read failed. */
const READS: Record<InfoPipeline, { label: string; read: (f: InformationFlow) => unknown }[]> = {
  evidence: [{ label: "Files read on the Review tab", read: (f) => f.files }],
  "data-requests": [
    { label: "Submitted values", read: (f) => f.values },
    { label: "Open data requests", read: (f) => f.campaigns },
  ],
  imports: [{ label: "Import history", read: (f) => f.imports }],
  methodology: [{ label: "Active methodology editions", read: (f) => f.editions }],
  scores: [
    { label: "Score snapshots", read: (f) => f.snapshots },
    { label: "Submitted values", read: (f) => f.values },
  ],
  deadlines: [{ label: "Deadline sources", read: (f) => f.deadlines }],
  "public-site": [{ label: "Published rankings, stories and documents", read: (f) => f.site }],
  assistant: [{ label: "Assistant index settings", read: (f) => f.index }],
  forms: [
    { label: "Open forms", read: (f) => f.forms },
    { label: "Form responses", read: (f) => f.responses },
  ],
  backups: [],
};

/** The workflow pipelines that decide a stage of each (the Information map opens them from that stage). */
export const GOVERNED: Partial<Record<InfoPipeline, WorkflowKey[]>> = {
  evidence: ["unit-submissions"],
  "public-site": ["publication"],
  backups: ["destructive"],
};

const DAY = 86_400_000;
const daysSince = (iso: string | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / DAY : Infinity);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-PH")} ${n === 1 ? one : many}`;

/** What each pipeline's own data says about its health. */
function health(key: InfoPipeline, f: InformationFlow | null, state: GovernanceState, now: Date, check: (s: CheckStatus, label: string, detail?: string) => void) {
  switch (key) {
    case "evidence": {
      const list = evidenceList(state);
      const review = list.filter((e) => e.status === "For review");
      const stale = review.filter((e) => daysSince(e.submitted, now) > 14);
      check("pass", `${plural(list.length, "record")} readable`);
      if (stale.length) check("warn", `${plural(stale.length, "submission")} waiting over 14 days`, stale.slice(0, 5).map((e) => e.id).join(", "));
      break;
    }
    case "data-requests":
      if (f?.values) check(f.values.review ? "warn" : "pass", f.values.review ? `${plural(f.values.review, "value")} waiting for review` : "No values waiting for review");
      break;
    case "imports":
      if (f?.imports) check(f.imports.count ? "pass" : "warn", f.imports.count ? `${plural(f.imports.count, "import")}, last ${f.imports.lastAt?.slice(0, 10) ?? "unknown"}` : "Nothing imported yet");
      break;
    case "methodology":
      if (f?.editions) {
        check(f.editions.active ? "pass" : "warn", f.editions.active ? `${plural(f.editions.active, "edition")} active` : "No methodology edition is active", f.editions.active ? undefined : "Scores can't be computed without one.");
        if (f.editions.active && !f.editions.indicators) check("warn", "The active editions have no indicators");
      }
      break;
    case "scores":
      if (f?.snapshots) check(f.snapshots.lastAt ? "pass" : "warn", f.snapshots.lastAt ? `Last computed ${f.snapshots.lastAt.slice(0, 10)}` : "No scores computed yet");
      break;
    case "deadlines":
      if (f?.deadlines) {
        const d = f.deadlines;
        if (!d.sources) check("warn", "No deadline sources are watched");
        else check(d.failed ? "fail" : "pass", d.failed ? `${plural(d.failed, "source")} failed the last read` : `${plural(d.sources, "source")} read without errors`);
        if (d.sources && daysSince(d.checkedAt, now) > 7) check("warn", "Not checked in the last 7 days", d.checkedAt ? `Last checked ${d.checkedAt.slice(0, 10)}.` : "Never checked.");
        if (d.waiting) check("warn", `${plural(d.waiting, "finding")} waiting to be applied or dismissed`);
      }
      break;
    case "public-site":
      if (f?.site) check("pass", `${plural(f.site.rankings, "ranking")}, ${plural(f.site.stories, "story", "stories")} and ${plural(f.site.documents, "document")} published`);
      break;
    case "assistant":
      if (f?.index) {
        const x = f.index;
        if (x.failed) check("fail", "The last index build failed");
        else if (!x.chunks) check("warn", "The index is empty", "The assistant can't answer from Hub content until it is built.");
        else check("pass", `${plural(x.chunks, "passage")} indexed`, x.builtAt ? `Built ${x.builtAt.slice(0, 10)}.` : undefined);
        if (x.paused) check("warn", "The assistant is paused");
      }
      break;
    case "forms":
      if (f) check("pass", `${plural(f.forms.open, "form")} open${f.responses ? `, ${plural(f.responses.count, "response")}` : ""}`);
      break;
    case "backups": {
      const b = state.backup;
      const last = b.points.filter((p) => p.status === "Completed").sort((x, y) => y.at.localeCompare(x.at))[0];
      if (!last) check("fail", "No recovery point exists");
      else {
        const minutes = (now.getTime() - Date.parse(last.at)) / 60_000;
        check(minutes > b.objectives.rpoMinutes ? "warn" : "pass", `Last point ${last.id}, ${Math.round(minutes / 60)} h ago`, minutes > b.objectives.rpoMinutes ? `Older than the ${b.objectives.rpoMinutes}-minute recovery point objective.` : undefined);
        if (!b.points.some((p) => p.status === "Completed" && p.file)) check("fail", "No recovery point holds Hub data", "A restore is impossible.");
      }
      const failed = b.points.filter((p) => p.status === "Failed").length;
      if (failed) check("warn", `${plural(failed, "backup")} failed`);
      const test = [...b.tests].sort((x, y) => y.at.localeCompare(x.at))[0];
      if (!test) check("warn", "No restore has been tested");
      else check(test.result === "Passed" ? "pass" : "fail", `Last restore test ${test.result.toLowerCase()}`, `${test.pointId}, ${test.at.slice(0, 10)}.`);
      break;
    }
  }
}

/**
 * Check one information pipeline. `flow` is what informationFlow() read (null when the read failed, with `flowError`),
 * `readMs` how long that read took.
 */
export function checkInformation(
  key: InfoPipeline,
  flow: InformationFlow | null,
  flowError: string | undefined,
  readMs: number,
  state: GovernanceState,
  ref: Reference,
  viewerId: string,
  now = new Date(),
): PipelineCheck {
  const t0 = performance.now();
  const checks: CheckItem[] = [];
  const marks: NodeMark[] = [];

  // Sources: every figure the pipeline reads came back.
  const reads = READS[key];
  if (!flow) checks.push({ group: "sources", status: "fail", label: "The pipeline's figures could not be read", detail: flowError });
  else {
    for (const r of reads) {
      const ok = r.read(flow) !== undefined;
      checks.push({ group: "sources", status: ok ? "pass" : "fail", label: r.label, detail: ok ? `Read in ${Math.round(readMs)} ms` : "Could not be read: its table is missing or unreachable." });
    }
    checks.push({ group: "sources", status: "pass", label: "Hub store", detail: `Read in ${Math.round(readMs)} ms` });
  }
  marks.push({ node: "src", status: worst(checks.filter((c) => c.group === "sources").map((c) => c.status)) });

  // Health of what it reads.
  const before = checks.length;
  health(key, flow, state, now, (status, label, detail) => checks.push({ group: "freshness", status, label, ...(detail && { detail }) }));
  const healthStatus = worst(checks.slice(before).map((c) => c.status));
  marks.push({ node: "load", status: healthStatus });

  // The workflow pipelines that decide a stage, dry-run on their saved settings.
  let copies = 0;
  let actions = 0;
  let logged = 0;
  for (const id of GOVERNED[key] ?? []) {
    const wf = state.workflows.find((w) => w.id === id);
    if (!wf) {
      checks.push({ group: "governed", status: "fail", label: `${id} pipeline is missing` });
      continue;
    }
    const r = checkPipeline(state, ref, id, { enabled: wf.enabled, slaDays: wf.slaDays, separation: wf.separation, notify: wf.notify, steps: wf.steps }, viewerId, now);
    copies += r.stats[0]?.value ?? 0;
    actions += r.stats[1]?.value ?? 0;
    logged += r.logged.length;
    const fails = r.checks.filter((c) => c.status === "fail");
    const warns = r.checks.filter((c) => c.status === "warn");
    const passed = r.checks.length - fails.length - warns.length;
    checks.push({
      group: "governed",
      status: r.status,
      label: `${wf.name}: ${r.status === "fail" ? "integrity failed" : r.status === "warn" ? "passed with warnings" : "integrity OK"}`,
      detail: `${passed} of ${r.checks.length} tests passed${fails.length ? `. ${fails.map((c) => c.label).slice(0, 3).join("; ")}` : warns.length ? `. ${warns.map((c) => c.label).slice(0, 3).join("; ")}` : ""}`,
    });
    marks.push({ node: `workflow:${id}`, status: r.status, note: r.status === "pass" ? "Integrity OK" : `${fails.length || warns.length} ${r.status === "fail" ? "failed" : "warnings"}` });
  }

  const status = worst(checks.map((c) => c.status));
  if (status !== "fail") marks.push({ node: "outs", status });
  return {
    pipeline: key,
    subject: INFO_PIPELINES[key],
    at: now.toISOString(),
    ms: Math.round((performance.now() - t0 + readMs) * 10) / 10,
    status,
    checks,
    marks,
    logged: [],
    stats: [
      { label: "Figures read", value: flow ? reads.filter((r) => r.read(flow) !== undefined).length : 0 },
      { label: "Pipelines dry-run", value: (GOVERNED[key] ?? []).length },
      { label: "Copies of the Hub", value: copies },
      { label: "Engine actions run", value: actions },
      { label: "Entries it would log", value: logged },
    ],
  };
}
