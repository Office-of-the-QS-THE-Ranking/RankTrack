"use client";

/*
 * Process Pipelines › Information: how data enters the Hub, is transformed and lands, drawn as the Workflow tab's
 * node maps (PipelineFrame). Top to bottom: the source and what it carries, how it is extracted (with where it is
 * kept beside it), the numbered stages that transform it (a gold diamond where a person decides, a square where the
 * Hub does the work) with what is held back beside them, where it is loaded, and the parts of the Hub that read it.
 * Read only: these flows have no settings of their own; a stage that a workflow pipeline governs opens it.
 * Live figures come from informationFlow() (app/actions/process-pipelines.ts) and the console's health.
 * INFO mirrors the code; keep it in step with: Unit evidence: app/actions/evidence.ts, lib/review (docs/evidence-review.md),
 * engine/records.ts. Data requests, imports, methodologies, scores: lib/analytics (docs/analytics-engine.md). Ranking
 * deadlines: server/deadline-check.ts, engine/deadlines.ts. Public website: server/site.ts, server/media.ts.
 * Assistant index: lib/assistant/server/sources.ts, index-builder.ts. Digital forms: lib/forms (docs/digital-forms.md).
 * Recovery points: engine/backup.ts, server/db/backups.ts.
 * Check Integrity reads each pipeline's sources live and dry-runs the workflows that govern it (information-check.ts).
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { checkInformationPipeline } from "@/app/actions/pipeline-check";
import { informationFlow } from "@/app/actions/process-pipelines";
import { Icon, type IconName } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import type { Health } from "@/lib/governance/console-types";
import type { InformationFlow } from "@/lib/governance/pipeline-flow";
import type { WorkflowKey } from "@/lib/governance/types";
import { Hint, fmtAgo, useConsole } from "../ui";
import { Canvas, HubOuts, Node, PipelineFrame, outEdges, useIntegrity, type Edge, type Out } from "./PipelineStudio";

export type InfoKey = "evidence" | "data-requests" | "imports" | "methodology" | "scores" | "deadlines" | "public-site" | "assistant" | "forms" | "backups";

/** What a figure is read from: the pipelines' own counts (once loaded), the console's health and the time since. */
interface Figures {
  flow: InformationFlow | null;
  health: Health;
  ago: (iso?: string) => string;
}
type Fig = (f: Figures) => string | undefined;

const count = (n: number | undefined, word: string) => (n === undefined ? undefined : `${n.toLocaleString("en-PH")} ${word}`);
/** A count beside a held-back node: shown only when something is there. */
const some = (n: number | undefined) => (n ? n.toLocaleString("en-PH") : undefined);

interface Stage {
  key: string;
  title: string;
  sub: string;
  /** A person decides here; otherwise the Hub does the work. */
  person?: boolean;
  items: string[];
  fig?: Fig;
  /** The workflow pipeline that sets who decides this stage. */
  workflow?: WorkflowKey;
}

/** Beside the stages: what is held back or kept out, branching from a stage (or the extract, or another such node). */
interface Held {
  key: string;
  from: string;
  icon: IconName;
  title: string;
  sub: string;
  stop?: boolean;
  fig?: Fig;
}

interface Spot {
  icon: IconName;
  title: string;
  sub: string;
  fig?: Fig;
  stop?: boolean;
}

interface InfoSpec {
  name: string;
  short: string;
  icon: IconName;
  about: string;
  source: { icon: IconName; title: string; from: { icon: IconName; text: string }[]; fig?: Fig };
  carries: string[];
  extract: Spot & { items: string[] };
  /** Beside the extract: where it is kept, or what happens to what can't be read. */
  beside?: Spot;
  stages: Stage[];
  held?: Held[];
  load: Spot & { items?: string[] };
  /** `pipe` opens another information pipeline instead of the part's page. */
  outs: (Out & { pipe?: InfoKey })[];
  /** The figure beside its name in the stack. */
  list?: Fig;
}

const INFO: Record<InfoKey, InfoSpec> = {
  evidence: {
    name: "Unit evidence",
    short: "Unit evidence",
    icon: "evidence",
    about: "What a unit submits, from the upload to the rankings, the dashboards and the public website.",
    source: {
      icon: "building",
      title: "Coordinators",
      from: [
        { icon: "upload", text: "Portal · Submit evidence" },
        { icon: "undo", text: "Reply to a revision" },
      ],
      fig: (f) => count(f.health.evidence.total, "records"),
    },
    carries: ["Title", "Kind", "Period", "Files or links", "SDGs", "Indicators"],
    extract: {
      icon: "upload",
      title: "Uploaded",
      sub: "Numbered EV-0000",
      items: ["Files go straight to private storage", "Types and sizes set in System Configuration"],
    },
    beside: { icon: "lock", title: "Private storage", sub: "Never public" },
    stages: [
      {
        key: "read",
        title: "Read",
        sub: "In the reviewer's browser",
        items: ["PDF text, then OCR for scans", "Word, slides and sheets", "Text kept by the file's SHA-256"],
        fig: (f) => count(f.flow?.files?.read, "files read"),
      },
      {
        key: "match",
        title: "Matched",
        sub: "Rules: same file, same result",
        items: ["Indicators the pages support", "Figures, years and SDGs", "Copies of other submissions", "Reviewer AI, if on: a second opinion"],
      },
      {
        key: "review",
        title: "Review steps",
        sub: "Unit submissions pipeline",
        person: true,
        items: ["Accepting links it to the indicator", "Figures offered, never filled in"],
        fig: (f) => count(f.health.evidence.review, "waiting"),
        workflow: "unit-submissions",
      },
    ],
    held: [
      { key: "walls", from: "read", icon: "lock", title: "Kept out", sub: "Page text never reaches the chat" },
      { key: "revise", from: "review", icon: "undo", title: "Needs revision", sub: "Unit told what to change", stop: true, fig: (f) => some(f.health.evidence.revise) },
      { key: "again", from: "revise", icon: "refresh", title: "Resubmitted", sub: "Back to step 1" },
    ],
    load: {
      icon: "check",
      title: "Validated",
      sub: "After the last step",
      items: ["Linked to its indicators", "Merit comes from these only"],
      fig: (f) => count(f.health.evidence.validated, "validated"),
    },
    outs: [
      { part: "engine", does: "Points secured, readiness", pipe: "scores", then: [{ icon: "dashboard", text: "Dashboard and ranking pages" }] },
      { part: "recognition", does: "Merit for the unit", then: [{ icon: "recognition", text: "Honours and medals" }] },
      { part: "units", does: "Their unit's progress" },
      { part: "public", does: "Units board, Recognition", pipe: "public-site" },
    ],
    list: (f) => some(f.health.evidence.review),
  },
  "data-requests": {
    name: "Data requests",
    short: "Data requests",
    icon: "inbox",
    about: "Figures the Rankings Office asks units for, from their answers to the scores.",
    source: {
      icon: "building",
      title: "Units",
      from: [
        { icon: "inbox", text: "Rankings › Data requests: the Office asks" },
        { icon: "send", text: "Portal › Data requests: units answer" },
      ],
      fig: (f) => count(f.flow?.campaigns?.open, "open"),
    },
    carries: ["Value", "Note", "Evidence", "Not applicable"],
    extract: {
      icon: "send",
      title: "Sent",
      sub: "A draft until sent",
      items: ["Each unit answers the indicators it owns", "The Office never answers for a unit"],
    },
    beside: { icon: "clock", title: "Reminders", sub: "Daily, then escalated" },
    stages: [
      { key: "check", title: "Checked", sub: "Against the indicator", items: ["Ranges, units, options and dates", "Every change kept in its history"] },
      { key: "validate", title: "Validated", sub: "Rankings Office", person: true, items: ["Validate, or return with a note"], fig: (f) => count(f.flow?.values?.review, "to validate") },
      { key: "rollup", title: "Rolled up", sub: "Into the University's figure", items: ["Sum, highest or latest", "The Office's own figure wins"] },
    ],
    held: [
      { key: "returned", from: "validate", icon: "undo", title: "Returned", sub: "Note required", stop: true, fig: (f) => some(f.flow?.values?.revise) },
      { key: "told", from: "returned", icon: "bell", title: "Unit", sub: "Told what to fix" },
    ],
    load: { icon: "check", title: "Validated values", sub: "Per edition, indicator and unit", items: ["Only these count as secured"], fig: (f) => count(f.flow?.values?.validated, "validated") },
    outs: [
      { part: "engine", does: "Scored on the next read", pipe: "scores" },
      { part: "requests", does: "Who still owes what" },
      { part: "audit", does: "Every send and decision" },
    ],
    list: (f) => some(f.flow?.values?.review),
  },
  imports: {
    name: "Data imports",
    short: "Data imports",
    icon: "upload",
    about: "The Office's files read into the analytics engine: workbooks, registers, benchmarks, cases and templates.",
    source: {
      icon: "folder",
      title: "Office files",
      from: [
        { icon: "research", text: "THE data-collection workbook" },
        { icon: "list", text: "Activity register" },
        { icon: "trend-up", text: "Benchmark tables" },
        { icon: "pen", text: "WURI case files" },
        { icon: "users", text: "Registrar, HR and FMO templates" },
      ],
    },
    carries: [".xlsx", ".csv", ".docx", ".zip"],
    extract: {
      icon: "upload",
      title: "Read in the browser",
      sub: "Rankings › Data imports",
      items: ["Only sheets, text or counts are sent", "60 MB a file"],
      fig: (f) => (f.flow?.imports ? (f.flow.imports.lastAt ? `Last ${f.ago(f.flow.imports.lastAt).toLowerCase()}` : "None yet") : undefined),
    },
    beside: { icon: "scroll", title: "Import log", sub: "SHA-256, rows, totals", fig: (f) => count(f.flow?.imports?.count, "files") },
    stages: [
      { key: "match", title: "Matched", sub: "Names to the Directory", items: ["Unit names through aliases", "Santo Tomas rows become UST's own"] },
      { key: "count", title: "Counted", sub: "Templates: counts only", items: ["Rows counted by the template's profile", "Small cells dropped"] },
      { key: "recheck", title: "Checked again", sub: "On the server", items: ["Totals rechecked", "Small cells dropped again"] },
    ],
    held: [{ key: "personal", from: "count", icon: "lock", title: "Personal rows", sub: "Never stored" }],
    load: { icon: "check", title: "Loaded", sub: "For review", items: ["Values and evidence links", "Activities, without duplicates", "Peers and benchmarks", "WURI cases"] },
    outs: [
      { part: "engine", does: "Suggested beside indicators", pipe: "scores", then: [{ icon: "check", text: "The Office validates" }] },
      { part: "rankings", does: "Peer gaps and activities" },
      { part: "audit", does: "Logged with the file's SHA-256" },
    ],
  },
  methodology: {
    name: "Methodologies",
    short: "Methodologies",
    icon: "layers",
    about: "Each ranking's methodology, kept as data: the indicators the engine scores and units answer.",
    source: {
      icon: "globe",
      title: "Ranking bodies",
      from: [
        { icon: "research", text: "Published methodology" },
        { icon: "folder", text: "UST Dashboard folder" },
      ],
    },
    carries: ["Groups", "Indicators", "Formulas", "Bands", "Weights", "Owners"],
    extract: {
      icon: "layers",
      title: "Pack built",
      sub: "One edition as portable JSON",
      items: ["Seed builder, or Methodology › Import", "Start another year from the last"],
    },
    stages: [
      { key: "check", title: "Checked", sub: "Before anything is saved", items: ["Codes unique", "Formulas parse and resolve", "Shares between 0 and 1"] },
      { key: "status", title: "Made active", sub: "Rankings Office", person: true, items: ["Draft, Active, Closed or Archived", "Units see it once Active"] },
    ],
    held: [{ key: "refused", from: "check", icon: "x-circle", title: "Refused", sub: "Nothing imported", stop: true }],
    load: {
      icon: "check",
      title: "Edition",
      sub: "Groups and indicators",
      fig: (f) => (f.flow?.editions ? `${f.flow.editions.active} active · ${f.flow.editions.indicators.toLocaleString("en-PH")} indicators` : undefined),
    },
    outs: [
      { part: "rankings", does: "Indicators and Methodology tabs" },
      { part: "requests", does: "Each unit's own indicators" },
      { part: "submissions", does: "Review rules learn its words" },
      { part: "engine", does: "Scored by its rules", pipe: "scores" },
    ],
  },
  scores: {
    name: "Scores & readiness",
    short: "Scores & readiness",
    icon: "activity",
    about: "The analytics engine: an edition's facts scored against its methodology. Reports are computed, never stored, except as snapshots.",
    source: {
      icon: "data",
      title: "Facts",
      from: [
        { icon: "check", text: "Values sent and validated" },
        { icon: "link", text: "Evidence links" },
        { icon: "list", text: "Activities" },
        { icon: "trend-up", text: "Benchmarks" },
        { icon: "pen", text: "Reviewed cases" },
      ],
    },
    carries: ["Active edition", "Catalog", "Facts"],
    extract: { icon: "refresh", title: "Computed", sub: "When a page asks", items: ["Kept for 60 seconds", "Cleared by any change"] },
    beside: { icon: "calendar", title: "Weekly snapshot", sub: "Daily round", fig: (f) => (f.flow?.snapshots ? (f.flow.snapshots.lastAt ? f.ago(f.flow.snapshots.lastAt) : "None yet") : undefined) },
    stages: [
      { key: "score", title: "Scored", sub: "Each indicator by its rule", items: ["Bands, claims, ratios and rubrics", "A missing input gives no result"] },
      { key: "sum", title: "Added up", sub: "The ranking's own way", items: ["GreenMetric's sum, THE Impact's weights", "Best per group, or readiness only"] },
      { key: "quality", title: "Checked", sub: "Data quality", items: ["Impossible values, unit slips", "Folder and private links", "The fixes worth most"] },
    ],
    held: [{ key: "claimed", from: "score", icon: "clock", title: "Claimed", sub: "Not secured until validated" }],
    load: { icon: "check", title: "Summaries", sub: "One per ranking", items: ["Points claimed and secured", "Readiness and items to go"] },
    outs: [
      { part: "rankings", does: "Scorecard, indicators, action plan" },
      { part: "dashboard", does: "Readiness" },
      { part: "units", does: "Their unit's items" },
      { part: "reports", does: "CSV, brief, quarterly report" },
    ],
  },
  deadlines: {
    name: "Ranking deadlines",
    short: "Ranking deadlines",
    icon: "deadline",
    about: "The ranking bodies' dates, read from their public pages every day. The check never changes a date itself.",
    source: { icon: "globe", title: "Ranking bodies' websites", from: [{ icon: "globe", text: "Each body's public page" }], fig: (f) => count(f.flow?.deadlines.sources, "sources") },
    carries: ["Deadline", "Survey windows", "Portal dates"],
    extract: {
      icon: "download",
      title: "Read daily",
      sub: "Daily round",
      items: ["Public pages only; never signs in", "Names itself; 15 seconds a page"],
      fig: (f) => (f.flow ? (f.flow.deadlines.checkedAt ? f.ago(f.flow.deadlines.checkedAt) : "Not yet") : undefined),
    },
    beside: { icon: "x-circle", title: "Unreadable", sub: "Reported, not worked around", stop: true, fig: (f) => some(f.flow?.deadlines.failed) },
    stages: [
      { key: "read", title: "Read by rule", sub: "Each source's own", items: ["A table, a sentence or a watch", "A changed page found by its hash"] },
      { key: "compare", title: "Compared", sub: "With the Hub's dates", items: ["A different date becomes a finding", "The Rankings Office is told"] },
      { key: "apply", title: "Applied", sub: "On the ranking's page", person: true, items: ["Apply or dismiss"], fig: (f) => (f.flow?.deadlines.waiting ? count(f.flow.deadlines.waiting, "waiting") : undefined) },
    ],
    held: [{ key: "dismissed", from: "apply", icon: "ban", title: "Dismissed", sub: "The Hub's date stays" }],
    load: { icon: "check", title: "Ranking calendar", sub: "Deadlines and other dates" },
    outs: [
      { part: "dashboard", does: "Next deadline" },
      { part: "knowledge", does: "Countdown and calendar" },
      { part: "public", does: "Public calendar", pipe: "public-site" },
    ],
    list: (f) => some(f.flow?.deadlines.waiting),
  },
  "public-site": {
    name: "Public website",
    short: "Public website",
    icon: "globe",
    about: "What the public website shows, and the gates governance puts in front of it.",
    source: {
      icon: "dashboard",
      title: "The Hub",
      from: [
        { icon: "rankings", text: "Published results" },
        { icon: "newspaper", text: "Stories, articles and reports" },
        { icon: "units", text: "Units and honours" },
        { icon: "about", text: "The Office's profile" },
      ],
    },
    carries: ["Results", "Stories", "Documents", "Units", "Calendar"],
    extract: { icon: "eye", title: "Read on each visit", sub: "Only what governance allows", items: ["Drafts and internal files stay out"] },
    stages: [
      { key: "approve", title: "Publication approval", sub: "Publishing pipeline", person: true, items: ["Stories, articles and reports"], workflow: "publication" },
      { key: "gate", title: "Gated", sub: "Governance decides", items: ["Ranking tracked and marked public", "Its dataset classified Public", "The section switched on"] },
      { key: "media", title: "Media copied", sub: "To the public bucket", items: ["Pictures re-encoded, metadata stripped", "Removed when no longer public"] },
    ],
    held: [{ key: "kept", from: "gate", icon: "lock", title: "Kept out", sub: "Evidence files, drafts, internal" }],
    load: {
      icon: "check",
      title: "Public pages",
      sub: "For every visitor",
      fig: (f) => (f.flow ? `${f.flow.site.rankings} rankings · ${f.flow.site.stories + f.flow.site.documents} publications` : undefined),
    },
    outs: [
      { part: "site-home", does: "Results, movers, units board" },
      { part: "site-rankings", does: "Each result as published" },
      { part: "site-publications", does: "Stories, articles, reports" },
      { part: "site-recognition", does: "Honours" },
      { part: "assistant", does: "Reads the same gates", pipe: "assistant" },
    ],
  },
  assistant: {
    name: "Assistant index",
    short: "Assistant index",
    icon: "agentic",
    about: "What the assistant may know: the Hub's own content, cut into passages and indexed for search.",
    source: {
      icon: "globe",
      title: "Hub content",
      from: [
        { icon: "globe", text: "What the public website shows" },
        { icon: "knowledge", text: "Knowledge Base" },
        { icon: "about", text: "About the Office" },
      ],
    },
    carries: ["Rankings", "Stories", "Documents", "Dictionary", "Policies", "Calendar"],
    extract: {
      icon: "refresh",
      title: "Collected",
      sub: "Daily round, or Rebuild",
      items: ["The public website's own gates"],
      fig: (f) => (f.flow?.index ? (f.flow.index.failed ? "Failed" : f.flow.index.builtAt ? f.ago(f.flow.index.builtAt) : "Not built") : undefined),
    },
    stages: [
      { key: "split", title: "Split", sub: "Into passages", items: ["Each keeps its link and who may read it"] },
      { key: "embed", title: "Embedded", sub: "Only passages that changed", items: ["Picks up tomorrow if time runs out"] },
    ],
    held: [{ key: "kept", from: "split", icon: "lock", title: "Kept out", sub: "Drafts, evidence, form answers, unit files" }],
    load: { icon: "check", title: "Search index", sub: "Passages, by who may read them", fig: (f) => count(f.flow?.index?.chunks, "passages") },
    outs: [{ part: "assistant", does: "Answers, citing the pages", then: [{ icon: "lock", text: "Internal passages by permission" }] }],
  },
  forms: {
    name: "Digital forms",
    short: "Digital forms",
    icon: "clipboard",
    about: "Responses to the Hub's forms, from the responder to sign-off and analytics.",
    source: {
      icon: "users",
      title: "Responders",
      from: [
        { icon: "link", text: "Form link" },
        { icon: "education", text: "Student Portal" },
        { icon: "users", text: "Team copies" },
      ],
      fig: (f) => count(f.flow?.forms.open, "open forms"),
    },
    carries: ["Answers", "People", "Budget", "Privacy consent"],
    extract: { icon: "send", title: "Submitted", sub: "Privacy consent first", items: ["Checked field by field"], fig: (f) => count(f.flow?.responses?.count, "responses") },
    beside: { icon: "data", title: "Kept apart", sub: "Outside the governance store" },
    stages: [
      { key: "signoff", title: "Signed off", sub: "The form's own stages", person: true, items: ["Noted, endorsed, approved", "Each waits for the one before"] },
      { key: "sum", title: "Summed up", sub: "Field by field", items: ["Bars, sums and months", "Totals over time"] },
    ],
    held: [{ key: "returned", from: "signoff", icon: "undo", title: "Returned or declined", sub: "The chain ends", stop: true }],
    load: { icon: "check", title: "Responses", sub: "With their review" },
    outs: [
      { part: "forms", does: "Responses and analytics", then: [{ icon: "download", text: "CSV export" }] },
      { part: "students", does: "Proposals and reports" },
    ],
  },
  backups: {
    name: "Recovery points",
    short: "Recovery points",
    icon: "hard-drive",
    about: "Copies of the governance store, kept so the Hub can be restored.",
    source: { icon: "data", title: "Governance store", from: [{ icon: "hard-drive", text: "Backups · Run backup" }] },
    carries: ["Accounts", "Roles", "Directory", "Records", "Configuration"],
    extract: { icon: "copy", title: "Snapshot", sub: "Numbered RP-0000", items: ["Audit trail and sign-ins left out"], fig: (f) => (f.health.backup.lastAt ? f.ago(f.health.backup.lastAt) : "None yet") },
    stages: [
      { key: "pack", title: "Packed", sub: "Compressed", items: ["Its SHA-256 recorded"] },
      { key: "store", title: "Stored", sub: "Private storage", items: ["Kept for the retention period", "Checked before any restore"] },
    ],
    load: { icon: "check", title: "Recovery point", sub: "In the catalogue" },
    outs: [
      { part: "backup", does: "Verify, test, restore", then: [{ icon: "shield-check", text: "A restore needs a second approver" }] },
      { part: "audit", does: "Never rolled back" },
    ],
  },
};

const ORDER = Object.keys(INFO) as InfoKey[];

export function InformationStudio({ onWorkflow }: { onWorkflow: (key: WorkflowKey) => void }) {
  const { data } = useConsole();
  const [id, setId] = useState<InfoKey>("evidence");
  const [flow, setFlow] = useState<InformationFlow | null>(null);
  const spec = INFO[id];

  useEffect(() => {
    let live = true;
    void informationFlow().then((r) => {
      if (!live) return;
      if (r.ok) setFlow(r.flow);
      else toast(r.message, "error");
    });
    return () => {
      live = false;
    };
  }, []);

  const figures: Figures = { flow, health: data.health, ago: (iso) => fmtAgo(iso, data.now) };
  const fig = (f?: Fig) => f?.(figures) || undefined;

  /* The map's edges, and the order a test run reaches its nodes in. */
  const { edges, stages } = useMemo(() => {
    const e: Edge[] = [{ from: "src", to: "extract" }];
    const st: string[][] = [["src"]];
    if (spec.beside) e.push({ from: "extract", to: "beside", kind: "side" });
    st.push(["extract", ...(spec.beside ? ["beside"] : [])]);
    let prev = "extract";
    for (const s of spec.stages) {
      e.push({ from: prev, to: s.key });
      st.push([s.key]);
      prev = s.key;
    }
    e.push({ from: prev, to: "load" });
    st.push(["load"]);
    for (const h of spec.held ?? []) e.push({ from: h.from, to: h.key, kind: "reject" });
    outEdges("load", spec.outs, e, st);
    return { edges: e, stages: st };
  }, [spec]);

  // Marks: src (sources read), load (health), outs, and workflow:<key> on the stage that workflow decides.
  const integrity = useIntegrity({
    stages,
    sig: id,
    check: () => checkInformationPipeline(id),
    nodesOf: (node) =>
      node.startsWith("workflow:")
        ? spec.stages.filter((s) => s.workflow === node.slice(9)).map((s) => s.key)
        : node === "outs"
          ? spec.outs.flatMap((o) => [`out-${o.part}`, ...(o.then ?? []).map((_, i) => `then-${o.part}-${i}`)])
          : [node],
  });
  const { reached, flow: lit, mark } = integrity;

  const pick = (next: InfoKey) => {
    if (next === id) return;
    integrity.reset();
    setId(next);
  };

  const n = spec.stages.length;
  const stageRow = 4; // rows: source, what it carries, extract, then the stages
  const loadRow = stageRow + n;
  const outs: Out[] = spec.outs.map(({ pipe, ...o }) => (pipe ? { ...o, open: () => pick(pipe) } : o));

  const map = (
    <div className="pp-map" role="group" aria-label={`${spec.name} pipeline`} data-fx="off">
      <header className="pp-map__bar">
        <h3>
          {spec.name}
          <Hint text={spec.about} />
        </h3>
      </header>

      <Canvas edges={edges} lit={(e) => reached(e.from) && reached(e.to) && e.kind !== "reject"} layoutKey={`${id}|${flow?.at ?? ""}`}>
        <div className="pp-grid" style={{ "--n": n } as CSSProperties} key={id}>
          {/* Source */}
          <Node id="src" row={1} flow={lit("src")} mark={mark("src")} icon={spec.source.icon} title={spec.source.title} figure={fig(spec.source.fig)}>
            <ul className="pp-from">
              {spec.source.from.map((f) => (
                <li key={f.text}>
                  <Icon name={f.icon} size={13} /> {f.text}
                </li>
              ))}
            </ul>
          </Node>

          <div className="pp-sends" style={{ gridRow: 2 }} aria-label="Carries">
            {spec.carries.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>

          {/* Extract */}
          <Node id="extract" row={3} flow={lit("extract")} icon={spec.extract.icon} title={spec.extract.title} sub={spec.extract.sub} figure={fig(spec.extract.fig)}>
            <ul className="pp-checks">
              {spec.extract.items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Node>
          {spec.beside && (
            <Node id="beside" row={3} side small flow={lit("beside")} icon={spec.beside.icon} title={spec.beside.title} sub={spec.beside.sub} figure={fig(spec.beside.fig)} tone={spec.beside.stop ? "stop" : undefined} />
          )}

          {/* Transform */}
          {spec.stages.map((s, i) => (
            <Node
              key={s.key}
              id={s.key}
              row={stageRow + i}
              flow={lit(s.key)}
              mark={mark(s.key)}
              icon={spec.icon}
              step={{ n: i + 1, person: s.person }}
              title={s.title}
              sub={s.sub}
              figure={fig(s.fig)}
              onOpen={s.workflow ? () => onWorkflow(s.workflow!) : undefined}
            >
              <ul className="pp-checks">
                {s.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Node>
          ))}
          {!!spec.held?.length && (
            <div className="pp-branch" style={{ gridRow: `${stageRow} / span ${n}` }}>
              {spec.held.map((h) => (
                <Node key={h.key} id={h.key} icon={h.icon} title={h.title} sub={h.sub} figure={fig(h.fig)} small tone={h.stop ? "stop" : undefined} />
              ))}
            </div>
          )}

          {/* Load */}
          <Node id="load" row={loadRow} flow={lit("load")} mark={mark("load")} icon={spec.load.icon} title={spec.load.title} sub={spec.load.sub} figure={fig(spec.load.fig)} tone="done">
            {spec.load.items && (
              <ul className="pp-checks">
                {spec.load.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </Node>

          {/* Where it is read */}
          <HubOuts outs={outs} row={loadRow + 1} flow={lit} mark={mark} />
        </div>
      </Canvas>
    </div>
  );

  return (
    <PipelineFrame
      label="Information pipelines"
      items={ORDER.map((k) => ({ key: k, icon: INFO[k].icon, name: INFO[k].short, meta: fig(INFO[k].list) }))}
      value={id}
      onPick={(k) => pick(k as InfoKey)}
      layoutId="pp-item-on-information"
      title={spec.name}
      map={map}
      tools={integrity.button}
      action={{ label: "Open Pipeline", icon: "workflow" }}
      onClosed={() => integrity.reset()}
      overlay={integrity.overlay}
    />
  );
}
