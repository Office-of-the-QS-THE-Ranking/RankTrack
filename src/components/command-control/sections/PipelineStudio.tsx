"use client";

/*
 * Process Pipelines: what the Workflow and Information tabs share. PipelineFrame lays a tab out: the pipelines stack on
 * the left; the chosen one's node map on the right, as an inert preview clipped to the viewport, opened full size in a
 * modal. The map is a vertical spine on an onyx dot grid with branches beside it; Canvas measures the rendered nodes
 * and draws the edges, so the layout stays CSS. Check Integrity (useIntegrity) runs a real check on the server, walks the
 * path gold along its result, stops where it failed, marks each node and opens the Assessment report. Route draws a pipeline
 * small: a round start, a gold diamond per approval, a square where it lands. Styles: src/styles/process-pipelines.css.
 */

import { motion, useReducedMotion } from "motion/react";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { closeModal, openModal } from "@/components/ui/modal-motion";
import { toast } from "@/components/ui/toast";
import { CHECK_GROUPS, type CheckGroup, type CheckStatus, type NodeMark, type PipelineCheck } from "@/lib/governance/pipeline-check";
import type { SectionKey } from "../sections";
import { useConsole } from "../ui";
import { usePending } from "@/components/ui/ButtonBusy";

export const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

/* ---------- The established Hub: where a pipeline's work lands ---------- */

export type HubKey =
  | "accounts"
  | "roles"
  | "directory"
  | "signin"
  | "data"
  | "public"
  | "backup"
  | "audit"
  | "unit"
  | "rankings"
  | "recognition"
  | "dashboard"
  | "units"
  | "engine"
  | "reports"
  | "knowledge"
  | "assistant"
  | "forms"
  | "students"
  | "requests"
  | "config"
  | "submissions"
  | "site-home"
  | "site-rankings"
  | "site-publications"
  | "site-recognition";

export const HUB: Record<HubKey, { name: string; icon: IconName; go?: SectionKey; href?: string }> = {
  accounts: { name: "Accounts", icon: "users", go: "accounts" },
  roles: { name: "Roles & access", icon: "key", go: "roles" },
  directory: { name: "Directory", icon: "building", go: "directory" },
  signin: { name: "Submission Tracker", icon: "lock-keyhole", href: "/signin" },
  data: { name: "Data governance", icon: "data", go: "governance" },
  public: { name: "Public website", icon: "globe", href: "/" },
  backup: { name: "Backups", icon: "hard-drive", go: "backup" },
  audit: { name: "Audit log", icon: "scroll", go: "audit" },
  unit: { name: "The unit", icon: "bell" },
  rankings: { name: "Rankings", icon: "rankings", href: "/admin/rankings" },
  recognition: { name: "Recognition", icon: "recognition", href: "/admin?view=recognition" },
  dashboard: { name: "Dashboard", icon: "dashboard", href: "/admin" },
  units: { name: "Unit dashboards", icon: "units" },
  engine: { name: "Analytics engine", icon: "activity" },
  reports: { name: "Build a Report", icon: "reports", href: "/admin/workspace/build-a-report" },
  knowledge: { name: "Knowledge Base", icon: "knowledge", href: "/admin/knowledge-base" },
  assistant: { name: "Assistant", icon: "agentic", go: "agentic-control" },
  forms: { name: "Digital Forms", icon: "clipboard", href: "/admin/workspace/forms" },
  students: { name: "Student Portal", icon: "education" },
  requests: { name: "Data requests", icon: "inbox", href: "/admin/rankings/data-requests" },
  config: { name: "System Configuration", icon: "settings", go: "config" },
  submissions: { name: "Unit Submissions", icon: "evidence", href: "/admin/unit-submissions" },
  "site-home": { name: "Home page", icon: "home", href: "/" },
  "site-rankings": { name: "Rankings", icon: "rankings", href: "/rankings" },
  "site-publications": { name: "Publications", icon: "publications", href: "/publications/stories" },
  "site-recognition": { name: "Recognition", icon: "recognition", href: "/recognition" },
};

export type Then = { icon: IconName; text: string };
/** A part of the Hub a pipeline reaches; `open` replaces the part's own page (another pipeline, say). */
export type Out = { part: HubKey; does: string; then?: Then[]; open?: () => void };

/** How a part of the Hub opens: its console section, or its page in a new tab. */
function useHubOpen() {
  const { go } = useConsole();
  return (o: Out) => {
    if (o.open) return o.open;
    const part = HUB[o.part];
    if (part.go) return () => go(part.go!);
    if (part.href) return () => void window.open(part.href, "_blank", "noopener,noreferrer");
    return undefined;
  };
}

/** The parts of the Hub a pipeline reaches, fanned out below where it lands, each with what follows from it. */
export function HubOuts({ outs, row, flow, mark, children }: { outs: Out[]; row: number; flow: (node: string) => Flow; mark?: (node: string) => NodeMark | undefined; children?: ReactNode }) {
  const open = useHubOpen();
  return (
    <div className="pp-outs" style={{ gridRow: row, "--outs": outs.length + (children ? 1 : 0) } as CSSProperties}>
      {outs.map((o) => {
        const part = HUB[o.part];
        return (
          <div className="pp-out" key={o.part}>
            <Node id={`out-${o.part}`} flow={flow(`out-${o.part}`)} mark={mark?.(`out-${o.part}`)} icon={part.icon} title={part.name} sub={o.does} onOpen={open(o)} small />
            {o.then?.map((t, i) => (
              <Node key={t.text} id={`then-${o.part}-${i}`} flow={flow(`then-${o.part}-${i}`)} mark={mark?.(`then-${o.part}-${i}`)} icon={t.icon} title={t.text} small then />
            ))}
          </div>
        );
      })}
      {children && <div className="pp-out">{children}</div>}
    </div>
  );
}

/** The edges from where a pipeline lands to the parts it reaches, and the stages a test run reaches them in. */
export function outEdges(from: string, outs: Out[], edges: Edge[], stages: string[][], extra: string[] = []) {
  for (const o of outs) {
    edges.push({ from, to: `out-${o.part}` });
    (o.then ?? []).forEach((_, i) => edges.push({ from: i ? `then-${o.part}-${i - 1}` : `out-${o.part}`, to: `then-${o.part}-${i}` }));
  }
  stages.push([...outs.map((o) => `out-${o.part}`), ...extra]);
  const depth = Math.max(0, ...outs.map((o) => o.then?.length ?? 0));
  for (let i = 0; i < depth; i++) stages.push(outs.filter((o) => o.then?.[i]).map((o) => `then-${o.part}-${i}`));
}

/* ---------- Check Integrity: a real check, the path walked along its result, then the Assessment report ---------- */

export type Flow = "live" | "passed" | undefined;

type CheckResult = { ok: true; check: PipelineCheck } | { ok: false; message: string };

const VERDICT: Record<CheckStatus, string> = { pass: "Integrity OK", warn: "Integrity OK, with warnings", fail: "Integrity compromised" };

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n < 10 ? n.toFixed(1) : Math.round(n)} ms`);

/**
 * Check Integrity for one pipeline map. `check` runs the check on the server; `sig` names the settings checked (a
 * change makes the result stale and hides its marks); `nodesOf` turns a mark's node into this map's node ids.
 */
export function useIntegrity({ stages, sig, check, nodesOf }: { stages: string[][]; sig: string; check: () => Promise<CheckResult>; nodesOf: (node: string) => string[] }) {
  const reduce = useReducedMotion();
  const [run, setRun] = useState<number | null>(null);
  const [result, setResult] = useState<{ sig: string; check: PipelineCheck; roundTrip: number } | null>(null);
  const [checking, setChecking] = useState(false);
  usePending(checking);
  const [report, setReport] = useState(false);
  const current = !!result && result.sig === sig;

  const marks = new Map<string, NodeMark>();
  if (current) for (const m of result.check.marks) for (const n of nodesOf(m.node)) marks.set(n, m);
  // The walk stops at the first stage where something failed.
  const stopAt = stages.findIndex((st) => st.some((n) => marks.get(n)?.status === "fail"));

  useEffect(() => {
    if (run === null || !result) return;
    const last = stopAt >= 0 ? stopAt : stages.length - 1;
    const t = setTimeout(
      () => {
        if (run < last) return setRun(run + 1);
        setRun(null);
        setReport(true);
        const c = result.check;
        const total = c.checks.length;
        const passed = c.checks.filter((x) => x.status === "pass").length;
        toast(`${c.subject}: ${VERDICT[c.status]}. ${passed} of ${total} tests passed.`, c.status === "fail" ? "error" : c.status === "warn" ? "info" : "ok");
      },
      run < last ? (reduce ? 300 : 600) : reduce ? 300 : 900,
    );
    return () => clearTimeout(t);
  }, [run, result, stopAt, stages.length, reduce]);

  const stageOf = (node: string) => stages.findIndex((s) => s.includes(node));
  const reached = (node: string) => run !== null && stageOf(node) >= 0 && stageOf(node) <= run;
  const flow = (node: string): Flow => (run === null ? undefined : stageOf(node) === run ? "live" : reached(node) ? "passed" : undefined);
  // A node shows its mark once the walk reaches it; nodes off the walk (branches) when it ends.
  const mark = (node: string) => (run === null || reached(node) ? marks.get(node) : undefined);

  const start = async () => {
    if (checking || run !== null) return;
    setChecking(true);
    setReport(false);
    const checked = sig;
    const t0 = performance.now();
    const r = await check().catch((): CheckResult => ({ ok: false, message: "The integrity check could not reach the Hub. Try again." }));
    const roundTrip = performance.now() - t0;
    setChecking(false);
    if (!r.ok) return void toast(r.message, "error");
    setResult({ sig: checked, check: r.check, roundTrip });
    setRun(0);
  };
  const reset = () => {
    setRun(null);
    setResult(null);
    setReport(false);
  };

  const busy = checking || run !== null;
  const button = (
    <button type="button" className="pp-chipbtn" onClick={() => void start()} disabled={busy} aria-busy={busy || undefined}>
      <Icon name="shield-check" size={13} /> {checking ? "Checking…" : run !== null ? "Walking the path…" : "Check Integrity"}
    </button>
  );
  const overlay =
    result && report ? (
      <AssessmentReport check={result.check} roundTrip={result.roundTrip} stale={!current} busy={busy} onAgain={() => void start()} onClose={() => setReport(false)} />
    ) : null;

  return { run, reached, flow, mark, busy, button, overlay, reset };
}

const CHECK_ICON: Record<CheckStatus, IconName> = { pass: "check-circle", warn: "alert", fail: "x-circle" };

/** What the integrity check found at a node. */
export function CheckLine({ mark }: { mark?: NodeMark }) {
  if (!mark) return null;
  return (
    <p className="pp-node__check" data-status={mark.status}>
      <Icon name={CHECK_ICON[mark.status]} size={12} />
      {mark.note ?? (mark.status === "pass" ? "Checked" : mark.status === "warn" ? "Warning" : "Failed")}
    </p>
  );
}

/** The report as plain text, for the clipboard. */
function reportText(c: PipelineCheck, roundTrip: number) {
  const n = (s: CheckStatus) => c.checks.filter((x) => x.status === s).length;
  const lines = [
    `Assessment report: ${c.subject}`,
    `${VERDICT[c.status]} · ${new Date(c.at).toLocaleString("en-PH")}`,
    `Tests: ${n("pass")} passed, ${n("warn")} warnings, ${n("fail")} failed, of ${c.checks.length}`,
    `Runtime: ${ms(c.ms)} on the server, ${ms(roundTrip)} round trip`,
    ...c.stats.map((s) => `${s.label}: ${s.value}`),
    "",
  ];
  for (const g of Object.keys(CHECK_GROUPS) as CheckGroup[]) {
    const items = c.checks.filter((x) => x.group === g);
    if (!items.length) continue;
    lines.push(CHECK_GROUPS[g]);
    for (const x of items) lines.push(`  [${x.status.toUpperCase()}] ${x.label}${x.detail ? ` · ${x.detail}` : ""}`);
  }
  if (c.logged.length) lines.push("", "Would be logged and sent (not run):", ...c.logged.map((l) => `  ${l}`));
  lines.push("", "Dry run. Nothing was saved or sent.");
  return lines.join("\n");
}

function AssessmentReport({ check: c, roundTrip, stale, busy, onAgain, onClose }: { check: PipelineCheck; roundTrip: number; stale: boolean; busy: boolean; onAgain: () => void; onClose: () => void }) {
  const n = (s: CheckStatus) => c.checks.filter((x) => x.status === s).length;
  const total = c.checks.length;
  const passed = n("pass");
  const groups = (Object.keys(CHECK_GROUPS) as CheckGroup[]).filter((g) => c.checks.some((x) => x.group === g));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText(c, roundTrip));
      toast("Assessment report copied.", "ok");
    } catch {
      toast("Could not copy the report. Try again.", "error");
    }
  };
  return (
    // Centred over the map; a click on the scrim around it closes it.
    <div className="pp-report-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="pp-report" aria-label="Assessment report" data-status={c.status}>
      <header className="pp-report__head">
        <span className="pp-report__kicker">Assessment report</span>
        <button type="button" className="pp-report__x" onClick={onClose} aria-label="Close the assessment report">
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="pp-report__scroll">
        <div className="pp-report__verdict" data-status={c.status}>
          <span className="pp-report__badge" data-status={c.status}>
            <Icon name={c.status === "pass" ? "shield-check" : CHECK_ICON[c.status]} size={18} />
          </span>
          <span>
            <b>{VERDICT[c.status]}</b>
            <small>
              {c.subject} · {new Date(c.at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
            </small>
          </span>
        </div>
        {stale && (
          <p className="pp-report__stale">
            <Icon name="alert" size={12} /> Settings changed since this check.
          </p>
        )}

        <div className="pp-report__meter" role="img" aria-label={`${passed} of ${total} tests passed, ${n("warn")} warnings, ${n("fail")} failed`}>
          {(["pass", "warn", "fail"] as const).map((s) => n(s) > 0 && <i key={s} data-status={s} style={{ flexGrow: n(s) }} />)}
        </div>
        <dl className="pp-report__figs">
          <div>
            <dt>Tests passed</dt>
            <dd>
              {passed}
              <small>/{total}</small>
            </dd>
          </div>
          <div data-status={n("warn") ? "warn" : undefined}>
            <dt>Warnings</dt>
            <dd>{n("warn")}</dd>
          </div>
          <div data-status={n("fail") ? "fail" : undefined}>
            <dt>Failed</dt>
            <dd>{n("fail")}</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>{ms(c.ms)}</dd>
          </div>
        </dl>
        <ul className="pp-report__stats">
          <li>
            <span>Round trip</span>
            <b>{ms(roundTrip)}</b>
          </li>
          {c.stats.map((s) => (
            <li key={s.label}>
              <span>{s.label}</span>
              <b>{s.value.toLocaleString("en-PH")}</b>
            </li>
          ))}
        </ul>

        {groups.map((g) => {
          const items = c.checks.filter((x) => x.group === g);
          const ok = items.filter((x) => x.status === "pass").length;
          return (
            <section key={g} className="pp-report__group">
              <h3>
                {CHECK_GROUPS[g]}
                <span>
                  {ok}/{items.length}
                </span>
              </h3>
              <ul>
                {items.map((x, i) => (
                  <li key={i} data-status={x.status}>
                    <Icon name={CHECK_ICON[x.status]} size={13} />
                    <span>
                      <b>{x.label}</b>
                      {x.detail && <small>{x.detail}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {c.logged.length > 0 && (
          <details className="pp-report__log">
            <summary>Would be logged and sent ({c.logged.length})</summary>
            <ol>
              {c.logged.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <footer className="pp-report__foot">
        <small>Dry run. Nothing was saved or sent.</small>
        <span>
          <button type="button" className="pp-chipbtn" onClick={() => void copy()}>
            <Icon name="copy" size={12} /> Copy
          </button>
          <button type="button" className="pp-chipbtn" onClick={onAgain} disabled={busy}>
            <Icon name="refresh" size={12} /> Run again
          </button>
        </span>
      </footer>
    </aside>
    </div>
  );
}

/* ---------- The frame: the stack, the clipped preview and the full-size modal ---------- */

export interface FrameItem {
  key: string;
  icon: IconName;
  name: string;
  meta?: ReactNode;
}

export function PipelineFrame({
  label,
  items,
  value,
  onPick,
  layoutId,
  title,
  map,
  tools,
  action,
  canClose,
  onClosed,
  overlay,
  children,
}: {
  /** The stack's name, for screen readers. */
  label: string;
  items: FrameItem[];
  value: string;
  onPick: (key: string) => void;
  /** Unique per tab, so the sliding highlight stays in its own stack. */
  layoutId: string;
  /** The chosen pipeline's name. */
  title: string;
  /** The node map: drawn inert in the preview, live in the modal. */
  map: ReactNode;
  /** The modal header's controls. */
  tools: ReactNode;
  /** The button that opens the modal. */
  action: { label: string; icon: IconName };
  /** Asked before the modal closes; false keeps it open. */
  canClose?: () => Promise<boolean>;
  onClosed?: () => void;
  /** Shown over the map inside the modal: the Assessment report. */
  overlay?: ReactNode;
  /** Further dialogs (the Workflow tab's save confirmation). */
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const preview = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const [open, setOpen] = useState(false);

  // Fit the clipped preview to the available viewport, including responsive header/list changes.
  useLayoutEffect(() => {
    const el = preview.current;
    if (!el) return;
    const fit = () => {
      const viewport = window.visualViewport;
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      el.style.height = `${Math.max(240, bottom - el.getBoundingClientRect().top - 16)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement!);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const overflow = document.documentElement.style.overflow;
    openModal(dialog.current);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = overflow;
    };
  }, [open]);

  const dismiss = async () => {
    if (canClose && !(await canClose())) return;
    closeModal(dialog.current);
  };

  return (
    <div className="pp-shell">
      <div className="pp">
        <ul className="pp-list" aria-label={label}>
          {items.map((it) => {
            const on = it.key === value;
            return (
              <li key={it.key}>
                <button type="button" className="pp-item" aria-pressed={on} onClick={() => onPick(it.key)}>
                  {on && <motion.span layoutId={layoutId} className="pp-item__on" transition={reduce ? { duration: 0 } : SPRING} aria-hidden="true" />}
                  <span className="pp-item__icon" aria-hidden="true">
                    <Icon name={it.icon} size={16} />
                  </span>
                  <span className="pp-item__main">
                    <b>{it.name}</b>
                  </span>
                  {it.meta && <span className="pp-item__meta">{it.meta}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="pp-preview pp-map" ref={preview} role="region" aria-label={`${title} pipeline preview`}>
          <div className="pp-preview__content" inert aria-hidden="true">
            {map}
          </div>
          <div className="pp-preview__footer">
            <button type="button" className="btn btn--dark" aria-haspopup="dialog" onClick={() => setOpen(true)}>
              <Icon name={action.icon} size={16} /> {action.label}
            </button>
          </div>
        </div>
        <dialog
          ref={dialog}
          className="pp-editor pp-map"
          aria-labelledby={dialogTitle}
          onCancel={(event) => {
            event.preventDefault();
            void dismiss();
          }}
          onClose={() => {
            setOpen(false);
            onClosed?.();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) void dismiss();
          }}
        >
          <button type="button" className="pp-editor__close" onClick={() => void dismiss()} aria-label="Close pipeline" autoFocus>
            <Icon name="close" size={16} />
          </button>
          <header className="pp-editor__header">
            <h2 id={dialogTitle}>{title}</h2>
            <span className="pp-map__tools">{tools}</span>
          </header>
          {open && map}
          {open && overlay}
        </dialog>
        {children}
      </div>
    </div>
  );
}

/* ---------- The canvas: nodes laid out by CSS, edges measured from them ---------- */

export type EdgeKind = "flow" | "side" | "reject";
export type Edge = { from: string; to: string; kind?: EdgeKind };

type Path = { d: string; kind: EdgeKind; lit: boolean; a: [number, number]; b: [number, number] };

export function Canvas({ edges, lit, layoutKey, children }: { edges: Edge[]; lit: (e: Edge) => boolean; layoutKey: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const arrowId = useId();
  const [geo, setGeo] = useState<{ w: number; h: number; at: Record<string, DOMRect> }>({ w: 0, h: 0, at: {} });

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const base = el.getBoundingClientRect();
    const at: Record<string, DOMRect> = {};
    el.querySelectorAll<HTMLElement>("[data-node]").forEach((n) => {
      const r = n.getBoundingClientRect();
      at[n.dataset.node!] = new DOMRect(r.left - base.left + el.scrollLeft, r.top - base.top + el.scrollTop, r.width, r.height);
    });
    setGeo({ w: el.scrollWidth, h: el.scrollHeight, at });
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = box.current;
    if (!el) return;
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(later);
    ro.observe(el);
    el.querySelectorAll("[data-node]").forEach((n) => ro.observe(n));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [layoutKey, measure]);

  const paths: Path[] = [];
  for (const e of edges) {
    const a = geo.at[e.from];
    const b = geo.at[e.to];
    if (!a || !b) continue;
    const kind = e.kind ?? "flow";
    // beside: leave from the right edge into the left edge; otherwise from the bottom into the top
    if (kind !== "flow" && b.left >= a.right - 2) {
      const x1 = a.right;
      const y1 = a.top + a.height / 2;
      const x2 = b.left;
      const y2 = b.top + b.height / 2;
      const k = Math.max(24, (x2 - x1) / 2);
      paths.push({ d: `M${x1} ${y1} C${x1 + k} ${y1} ${x2 - k} ${y2} ${x2} ${y2}`, kind, lit: lit(e), a: [x1, y1], b: [x2, y2] });
    } else {
      const x1 = a.left + a.width / 2;
      const y1 = a.bottom;
      const x2 = b.left + b.width / 2;
      const y2 = b.top;
      const k = Math.max(16, (y2 - y1) / 2);
      paths.push({ d: `M${x1} ${y1} C${x1} ${y1 + k} ${x2} ${y2 - k} ${x2} ${y2}`, kind, lit: lit(e), a: [x1, y1], b: [x2, y2] });
    }
  }

  return (
    <div className="pp-canvas" ref={box}>
      <svg className="pp-edges" width={geo.w} height={geo.h} aria-hidden="true">
        <defs>
          <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1.2 7 4 1 6.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        {paths.map((p, i) => (
          <Fragment key={i}>
            <path className="pp-edge" data-kind={p.kind} data-lit={p.lit || undefined} d={p.d} pathLength={1} markerEnd={p.kind === "reject" ? `url(#${arrowId})` : undefined} />
            {p.kind !== "reject" && (
              <>
                <circle className="pp-port" data-lit={p.lit || undefined} cx={p.a[0]} cy={p.a[1]} r={3.5} />
                <circle className="pp-port" data-lit={p.lit || undefined} cx={p.b[0]} cy={p.b[1]} r={3.5} />
              </>
            )}
          </Fragment>
        ))}
        {/* Packets travelling the pipes. CSS shows them only in the modal, never under reduced motion. */}
        <g className="pp-packets">
          {paths.map((p, i) => {
            // one packet per pipe, and only on every other side or rejection pipe
            if (p.kind !== "flow" && i % 2) return null;
            const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
            const dur = Math.max(1.6, Math.min(4, len / 70)) * (p.kind === "reject" ? 1.4 : 1);
            const begin = `${(-(i % 5) * 0.37).toFixed(2)}s`;
            return (
              <g key={`${i}-${p.d}`} className="pp-packet" data-kind={p.kind} data-lit={p.lit || undefined} opacity={0}>
                <circle className="pp-packet__glow" r={3.5} />
                <circle className="pp-packet__core" r={1.5} />
                <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" path={p.d} calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.45 0 0.25 1" />
                <animate attributeName="opacity" dur={`${dur}s`} begin={begin} repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.12;0.82;1" />
              </g>
            );
          })}
        </g>
      </svg>
      {children}
    </div>
  );
}

export function Node({
  id,
  row,
  side,
  icon,
  title,
  sub,
  figure,
  step,
  small,
  then,
  tone,
  off,
  flow,
  mark,
  onOpen,
  children,
}: {
  id: string;
  row?: number;
  side?: boolean;
  icon: IconName;
  title: ReactNode;
  sub?: ReactNode;
  /** A live figure: how many wait here, or when it last ran. */
  figure?: string;
  /** A numbered stage: a gold diamond where a person decides, a square where the Hub does the work. */
  step?: { n: number; person?: boolean };
  small?: boolean;
  then?: boolean;
  tone?: "stop" | "done";
  off?: boolean;
  flow?: Flow;
  /** What Check Integrity found here. */
  mark?: NodeMark;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const head = (
    <>
      <span className={`pp-node__mark${step ? (step.person ? " pp-node__mark--step" : " pp-node__mark--auto") : ""}`} aria-hidden="true">
        {step ? <b>{flow === "passed" ? <Icon name="check" size={12} strokeWidth={2.8} /> : step.n}</b> : <Icon name={icon} size={then ? 12 : 14} />}
      </span>
      <span className="pp-node__text">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {figure && <span className="pp-node__fig">{figure}</span>}
    </>
  );
  return (
    <div
      className="pp-node"
      data-node={id}
      data-kind={step?.person ? "approver" : undefined}
      data-small={small || undefined}
      data-then={then || undefined}
      data-side={side || undefined}
      data-tone={tone}
      data-off={off || undefined}
      data-flow={flow}
      data-check={mark?.status}
      style={row ? { gridRow: row } : undefined}
    >
      {onOpen ? (
        <button type="button" className="pp-node__head pp-node__head--open" onClick={onOpen}>
          {head}
          <Icon name="arrow-up-right" size={13} className="pp-node__go" />
        </button>
      ) : (
        <div className="pp-node__head">
          {head}
          {children && small && <span className="pp-node__end">{children}</span>}
        </div>
      )}
      {children && !small && <div className="pp-node__body">{children}</div>}
      <CheckLine mark={mark} />
    </div>
  );
}

/* ---------- Route marks, drawn small ---------- */

type Mark = { k: "request" | "approver" | "applied"; s?: "done" | "now" | "next" | "stopped" | "off" };

/** A pipeline drawn small: a round start, a gold diamond for each approval, a square where it lands. */
export function Route({ marks, dim }: { marks: Mark[]; dim?: boolean }) {
  return (
    <span className="pp-route" data-dim={dim || undefined} aria-hidden="true">
      {marks.map((m, i) => (
        <Fragment key={i}>
          {i > 0 && <i className="pp-route__seg" />}
          <i className="pp-route__mark" data-k={m.k} data-s={m.s} />
        </Fragment>
      ))}
    </span>
  );
}
