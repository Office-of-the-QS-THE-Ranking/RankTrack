"use client";

/*
 * Process Pipelines › Workflow. The workflows stack on the left; the chosen one's node map fills the right:
 * the requester and what they send, the queue, each approval (with the rejection branch), the checks run before the
 * change is applied, and every part of the established Hub the change reaches, with what follows from it. Settings
 * are edited in the Manage Pipeline modal and stay a draft until Save (workflow.update). The page preview is inert
 * and clipped to the viewport (PipelineFrame). The map mirrors the engine:
 * openRequest / decide / apply() in engine/requests.ts and the mutations they call, and for Unit submissions
 * review() in engine/records.ts with lib/governance/submission-review.ts; keep MAP in step with them.
 * Check Integrity dry-runs the draft through the engine on a throwaway copy (lib/governance/pipeline-check.ts).
 * Styles: src/styles/process-pipelines.css.
 */

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { checkPipeline } from "@/app/actions/pipeline-check";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/interactive";
import { closeModal, openModal } from "@/components/ui/modal-motion";
import { NumberField } from "@/components/ui/pickers";
import { GUEST_DAYS } from "@/lib/governance/access-requests";
import { ROLE } from "@/lib/governance/catalog";
import type { StepApprover, Workflow, WorkflowKey, WorkflowStep } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { LOCKED, SUBMISSIONS, approverName, stepOn } from "@/lib/governance/workflow-steps";
import { Avatar, Hint, RowMenu, Switch, useAct, useConsole } from "../ui";
import type { NodeMark } from "@/lib/governance/pipeline-check";
import { Canvas, CheckLine, HubOuts, Node, PipelineFrame, SPRING, outEdges, useIntegrity, type Edge, type Flow, type Out } from "./PipelineStudio";

/** How each workflow reads in lists and request rows. */
export const WF_META: Record<WorkflowKey, { icon: IconName; short: string }> = {
  "account-access": { icon: "user-plus", short: "Account access" },
  "privilege-escalation": { icon: "shield-check", short: "Higher roles" },
  "org-unit": { icon: "building", short: "New units" },
  "data-access": { icon: "data", short: "Data access" },
  publication: { icon: "newspaper", short: "Publishing" },
  destructive: { icon: "hard-drive", short: "Backup restores" },
  "unit-submissions": { icon: "evidence", short: "Unit submissions" },
};

interface Spec {
  /** Where requests are opened. */
  from: { icon: IconName; text: string }[];
  /** What the request carries. */
  sends: string[];
  /** Rechecked by apply() just before the change is made; a failure keeps the request open. */
  checks: string[];
  /** What else happens on a rejection or withdrawal. */
  back?: string;
  outs: Out[];
  /** Words for a pipeline that isn't a request (Unit submissions): who sends, the numbering, the stop and who is told. */
  words?: { who: string; number: string; stop: string; stopSub: string; toldStop: string; toldDone: string; skip: string };
}

const MAP: Record<WorkflowKey, Spec> = {
  "account-access": {
    from: [
      { icon: "lock-keyhole", text: "Sign-in page · Request access" },
      { icon: "workflow", text: "New request · An account" },
    ],
    sends: ["Name", "Email", "Role", "Unit", "Affiliation"],
    checks: ["Email has no account yet", "Unit is active and fits the role", "Guest sign-in is on, for partners"],
    outs: [
      { part: "accounts", does: "Account created, invitation pending", then: [{ icon: "lock-keyhole", text: "Active on first Google sign-in" }] },
      { part: "roles", does: "Coordinator, Student Organizer or External Contributor", then: [{ icon: "clock", text: `Partners end after ${GUEST_DAYS} days` }] },
      { part: "directory", does: "Placed in its unit", then: [{ icon: "building", text: "Student Organizers sit with the Office" }] },
      { part: "signin", does: "Shows Approved" },
      { part: "audit", does: "Logged as an invitation" },
    ],
  },
  "privilege-escalation": {
    from: [
      { icon: "key", text: "Accounts · A higher role" },
      { icon: "workflow", text: "New request · A role" },
    ],
    sends: ["Account", "Role", "Position", "Scope", "End date"],
    checks: ["Account is active or invited", "Partners hold External Contributor only", "Approver can grant the role there"],
    outs: [
      { part: "roles", does: "Role added within its scope", then: [{ icon: "swap", text: "Switchable from the account" }, { icon: "clock", text: "Ends on its end date" }] },
      { part: "audit", does: "Logged as a role given" },
    ],
  },
  "org-unit": {
    from: [{ icon: "building", text: "Directory · Add unit" }],
    sends: ["Name", "Code", "Type", "Parent", "Emails", "Logo"],
    checks: ["Parent is still active", "Code is not taken", "Emails and logo are valid"],
    outs: [
      { part: "directory", does: "Unit added under its parent" },
      { part: "accounts", does: "Offered when inviting people" },
      { part: "audit", does: "Logged as a new unit" },
    ],
  },
  "data-access": {
    from: [{ icon: "workflow", text: "New request · A dataset" }],
    sends: ["Dataset", "View or Export", "End date"],
    checks: ["Account and dataset still exist", "Restricted data is view only", "90 days at most"],
    outs: [
      { part: "data", does: "View or export on the dataset", then: [{ icon: "clock", text: "Removed after the end date" }] },
      { part: "audit", does: "Logged as access given" },
    ],
  },
  publication: {
    from: [
      { icon: "pen", text: "Post composer · Publish" },
      { icon: "newspaper", text: "Publications · Stories" },
      { icon: "research", text: "Articles and reports" },
      { icon: "send", text: "Report release" },
    ],
    sends: ["Item", "Title", "Where"],
    checks: ["The item still exists"],
    back: "Back to Draft or Unpublished",
    outs: [
      {
        part: "public",
        does: "Goes live, or a report is released",
        then: [{ icon: "newspaper", text: "Stories & News, Research Articles or Reports & Insights" }],
      },
      { part: "unit", does: "Told it is live" },
      { part: "audit", does: "Logged as published" },
    ],
  },
  "unit-submissions": {
    from: [
      { icon: "upload", text: "Portal · Submit evidence" },
      { icon: "undo", text: "Reply to a revision" },
    ],
    sends: ["Title", "Kind", "Period", "Files or links", "SDGs", "Indicators"],
    checks: ["Still For review", "Reviewer covers its unit and rankings"],
    back: "Resubmits from step 1",
    outs: [
      { part: "rankings", does: "Counts toward its indicators", then: [{ icon: "target", text: "Readiness and points secured" }] },
      { part: "recognition", does: "Merit for the unit", then: [{ icon: "recognition", text: "Honours and medals" }] },
      { part: "audit", does: "Logged as accepted" },
    ],
    words: {
      who: "Unit",
      number: "Numbered EV-0000",
      stop: "Needs revision",
      stopSub: "Note required",
      toldStop: "Told what to change",
      toldDone: "Told where it counts",
      skip: "Nobody holds it: either approver decides",
    },
  },
  destructive: {
    from: [{ icon: "hard-drive", text: "Backups · Restore or delete" }],
    sends: ["Operation", "Recovery point", "Reason"],
    checks: ["The point still exists", "A restore point holds Hub data"],
    outs: [
      { part: "backup", does: "Restored from the point, or the point deleted", then: [{ icon: "undo", text: "Accounts, roles, Directory, data and website return to the point" }] },
      { part: "audit", does: "Kept: never rolled back" },
    ],
  },
};

const MAX_STEPS = 5;
const WHO: { value: StepApprover; label: string }[] = [
  { value: "office", label: "Either" },
  { value: "director", label: "Director" },
  { value: "specialist", label: "Specialist" },
];

type DStep = WorkflowStep & { key: string };
interface Draft {
  enabled: boolean;
  slaDays: number;
  separation: boolean;
  notify: boolean;
  steps: DStep[];
}

// Saved steps are keyed by position, so the server and the browser render the same node ids (the edges find nodes by
// them); a step added in the browser takes a key of its own.
let seq = 0;
const keyed = (s: WorkflowStep, key = `step-new-${++seq}`): DStep => ({ name: s.name, enabled: stepOn(s), approver: s.approver ?? "office", key });
const draftOf = (w: Workflow): Draft => ({ enabled: w.enabled, slaDays: w.slaDays, separation: w.separation, notify: w.notify, steps: w.steps.map((s, i) => keyed(s, `step-${i}`)) });
/** The draft as workflow.update and Check Integrity take it. */
const settingsOf = (d: Draft) => ({
  enabled: d.enabled,
  slaDays: d.slaDays,
  separation: d.separation,
  notify: d.notify,
  steps: d.steps.map((s): WorkflowStep => ({ name: s.name, enabled: s.enabled, approver: s.approver })),
});

/** What a save changes, in plain words, for the high-risk confirmation. */
function changesOf(w: Workflow, d: Draft): string[] {
  const out: string[] = [];
  if (w.enabled !== d.enabled) out.push(d.enabled ? "Turns the pipeline on" : "Turns the pipeline off");
  if (w.slaDays !== d.slaDays) out.push(`Reply within ${w.slaDays} → ${d.slaDays} ${d.slaDays === 1 ? "day" : "days"}`);
  if (w.separation !== d.separation) out.push(d.separation ? "Requesters can't approve their own" : "Requesters can approve their own");
  if (w.notify !== d.notify) out.push(d.notify ? "Requester is told the outcome" : "Requester is no longer told the outcome");
  const len = Math.max(w.steps.length, d.steps.length);
  for (let i = 0; i < len; i++) {
    const a = w.steps[i];
    const b = d.steps[i];
    if (!a) out.push(`Adds step ${i + 1}: ${b.name || "Untitled"}`);
    else if (!b) out.push(`Removes step ${i + 1}: ${a.name}`);
    else {
      if (a.name !== b.name) out.push(`Renames step ${i + 1} to ${b.name || "Untitled"}`);
      if (stepOn(a) !== stepOn(b)) out.push(`${stepOn(b) ? "Turns on" : "Turns off"} step ${i + 1}`);
      if ((a.approver ?? "office") !== (b.approver ?? "office")) out.push(`Step ${i + 1} approver: ${approverName(b.approver ?? "office")}`);
    }
  }
  return out;
}

/** A workflow's settings as one comparable string, draft or saved. */
const sig = (d: Pick<Draft, "enabled" | "slaDays" | "separation" | "notify"> & { steps: readonly WorkflowStep[] }) =>
  JSON.stringify([d.enabled, d.slaDays, d.separation, d.notify, d.steps.map((s) => [s.name, stepOn(s), s.approver ?? "office"])]);

export function WorkflowStudio({ start }: { start?: WorkflowKey }) {
  const { data, confirm } = useConsole();
  const act = useAct();
  const manage = viewerCan(data.viewer, "workflows", "manage");
  const reduce = useReducedMotion();
  const [id, setId] = useState<WorkflowKey>(start ?? data.workflows[0]?.id ?? "account-access");
  const wf = data.workflows.find((w) => w.id === id) ?? data.workflows[0];
  const saved = wf ? sig(wf) : "";
  const [draft, setDraft] = useState<Draft | null>(() => (wf ? draftOf(wf) : null));
  const [fresh, setFresh] = useState<string | null>(null);
  const riskRef = useRef<HTMLDialogElement>(null);
  const riskTitle = useId();
  const [risk, setRisk] = useState(false);

  // Start again from the saved workflow when another one is picked or the saved one changes (after Save).
  // Steps keep their keys by position, so a step being edited keeps its place and focus.
  useEffect(() => {
    if (!wf) return;
    setDraft((prev) => {
      const next = draftOf(wf);
      if (prev && prev.steps.length) next.steps.forEach((s, i) => prev.steps[i] && (s.key = prev.steps[i].key));
      return next;
    });
  }, [id, saved]); // wf is followed through `saved`, so a reload that changes nothing keeps the draft

  // Who holds each position in the Office, to show the faces behind each approval.
  const holders = useMemo(() => {
    const day = data.day.slice(0, 10);
    const at = (positions: string[]) =>
      (data.accounts ?? []).filter((a) => a.status === "Active" && a.assignments.some((x) => x.roleId === ROLE.superAdmin && !!x.position && positions.includes(x.position) && (!x.expires || x.expires > day)));
    return { office: at(["director", "specialist"]), director: at(["director"]), specialist: at(["specialist"]) } satisfies Record<StepApprover, unknown>;
  }, [data.accounts, data.day]);

  const spec = wf ? MAP[wf.id] : null;

  /* The map's edges, and the order a test run reaches its nodes in. */
  const { edges, stages } = useMemo(() => {
    const e: Edge[] = [];
    const st: string[][] = [];
    if (!draft || !spec) return { edges: e, stages: st };
    e.push({ from: "req", to: "queue" }, { from: "queue", to: "office", kind: "side" });
    st.push(["req"], ["queue", "office"]);
    if (draft.enabled && draft.steps.length) {
      let prev = "queue";
      let skipped: string[] = [];
      for (const s of draft.steps) {
        e.push({ from: prev, to: s.key });
        prev = s.key;
        if (stepOn(s)) {
          e.push({ from: s.key, to: "rej", kind: "reject" });
          st.push([...skipped, s.key]);
          skipped = [];
        } else skipped.push(s.key); // passed without stopping
      }
      e.push({ from: prev, to: "applied" });
      st.push([...skipped, "applied"]);
      const toldWhy = draft.notify || !!spec.words; // a unit always hears what to change
      if (toldWhy) e.push({ from: "rej", to: "rej-told", kind: "reject" });
      if (spec.back) e.push({ from: toldWhy ? "rej-told" : "rej", to: "rej-back", kind: "reject" });
    } else {
      e.push({ from: "queue", to: "applied" });
      st.push(["applied"]);
    }
    e.push({ from: "applied", to: "out-told" });
    outEdges("applied", spec.outs, e, st, draft.notify ? ["out-told"] : []);
    return { edges: e, stages: st };
  }, [draft, spec]);

  // Check Integrity runs the draft as it stands; the server's step:<i> and outs marks land on this map's nodes.
  const integrity = useIntegrity({
    stages,
    sig: draft ? `${id}|${sig(draft)}` : id,
    check: () => checkPipeline(id, settingsOf(draft!)),
    nodesOf: (node) =>
      node.startsWith("step:")
        ? [draft?.steps[Number(node.slice(5))]?.key ?? ""]
        : node === "outs"
          ? (spec?.outs ?? []).flatMap((o) => [`out-${o.part}`, ...(o.then ?? []).map((_, i) => `then-${o.part}-${i}`)])
          : [node],
  });
  const { run, reached, flow, mark } = integrity;

  if (!wf || !draft || !spec) return null;
  const locked = LOCKED.includes(wf.id);
  const words = spec.words;
  const dirty = sig(draft) !== saved;
  const changes = dirty ? changesOf(wf, draft) : [];
  const onCount = draft.steps.filter(stepOn).length;
  const full = draft.steps.length >= MAX_STEPS;
  // Evidence never applies directly: a step nobody can take falls to either approver (submission-review.ts).
  const direct = wf.id !== SUBMISSIONS && draft.enabled && !data.approvals.includes(wf.id) && sig(draft) === saved;

  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setStep = (key: string, p: Partial<WorkflowStep>) => patch({ steps: draft.steps.map((s) => (s.key === key ? { ...s, ...p } : s)) });
  const insertAt = (i: number) => {
    if (full) return;
    const s = keyed({ name: "New approval", enabled: true, approver: "office" });
    patch({ steps: [...draft.steps.slice(0, i), s, ...draft.steps.slice(i)] });
    setFresh(s.key); // its name is ready to be typed over
  };
  const move = (key: string, by: -1 | 1) => {
    const i = draft.steps.findIndex((s) => s.key === key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    patch({ steps });
  };
  // the last step on stays on: switching the workflow off is how changes apply directly
  const lastOn = (s: DStep) => stepOn(s) && onCount === 1;

  const discard = async () => dirty && (await confirm({ title: "Discard unsaved changes?", confirm: "Discard", tone: "danger" })) === null;

  const pick = async (next: WorkflowKey) => {
    if (next === id) return;
    if (await discard()) return;
    const w = data.workflows.find((x) => x.id === next);
    if (!w) return;
    integrity.reset();
    setDraft(draftOf(w));
    setId(next);
  };

  // An unnamed step is flagged on its own field by the Hub's field messages before this runs.
  // Saving reroutes live requests, so it always passes the high-risk confirmation first.
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setRisk(true);
    openModal(riskRef.current);
  };
  const closeRisk = () => closeModal(riskRef.current);
  const commit = async () => {
    closeRisk();
    await act({ type: "workflow.update", id: wf.id, ...settingsOf(draft) });
  };

  const n = draft.steps.length;
  const stepRow = 4; // rows: requester, what it sends, queue, then the steps
  const appliedRow = stepRow + n + (manage && !full ? 1 : 0);

  const tools = (
    <>
      {integrity.button}
      <span className="pp-onoff">
        {draft.enabled ? "On" : "Off"}
        <Switch checked={draft.enabled} disabled={!manage || locked} label={`${wf.name} on`} describe={locked ? "Always on" : undefined} onChange={(v) => patch({ enabled: v })} />
      </span>
    </>
  );

  const map = (
    <form className="pp-map" onSubmit={save} aria-label={`${wf.name} pipeline`} data-fx="off">
      <header className="pp-map__bar">
        <h3>
          {wf.name}
          <Hint text={wf.description} />
        </h3>
      </header>

      <Canvas edges={edges} lit={(e) => reached(e.from) && reached(e.to) && e.kind !== "reject"} layoutKey={`${wf.id}|${sig(draft)}|${draft.steps.map((s) => s.key).join()}`}>
        <div className="pp-grid" style={{ "--n": n } as CSSProperties} key={wf.id}>
          {/* Requester */}
          <Node id="req" row={1} flow={flow("req")} mark={mark("req")} icon={words ? "building" : "user"} title={words?.who ?? "Requester"}>
            <ul className="pp-from">
              {spec.from.map((f) => (
                <li key={f.text}>
                  <Icon name={f.icon} size={13} /> {f.text}
                </li>
              ))}
            </ul>
          </Node>

          <div className="pp-sends" style={{ gridRow: 2 }} aria-label="Sends">
            {spec.sends.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>

          {/* Queue */}
          <Node id="queue" row={3} flow={flow("queue")} mark={mark("queue")} icon="inbox" title="Queue" sub={words?.number ?? "Numbered RQ-0000"}>
            <div className="pp-opts">
              <label className="pp-opt">
                Reply within
                <NumberField className="input input--sm pp-days" min={1} max={30} value={draft.slaDays} disabled={!manage} suffix={draft.slaDays === 1 ? "day" : "days"} onChange={(v) => patch({ slaDays: v })} aria-label="Reply within (days)" />
              </label>
              <span className="pp-opt">
                Can&rsquo;t approve own
                <Switch checked={draft.separation} disabled={!manage || locked} label="Requester can't approve their own request" onChange={(v) => patch({ separation: v })} />
              </span>
            </div>
            {direct && (
              <p className="pp-warn">
                <Icon name="alert" size={13} /> Too few approvers: applies directly
              </p>
            )}
          </Node>
          <Node id="office" row={3} side flow={flow("office")} mark={mark("office")} icon="bell" title="Rankings Office" sub="Notified" small />

          {/* Approvals */}
          {draft.steps.map((s, i) => (
            <StepNode
              key={s.key}
              step={s}
              index={i}
              row={stepRow + i}
              count={n}
              manage={manage}
              flow={flow(s.key)}
              mark={mark(s.key)}
              paused={!draft.enabled}
              keepOn={lastOn(s)}
              fresh={fresh === s.key}
              people={holders[s.approver]}
              open={!!words && s.approver !== "office" && !!data.accounts && !holders[s.approver].length}
              openText={words?.skip}
              known={!!data.accounts}
              onChange={(p) => setStep(s.key, p)}
              onMove={(by) => move(s.key, by)}
              onRemove={() => patch({ steps: draft.steps.filter((x) => x.key !== s.key) })}
            />
          ))}
          {manage && !full && (
            <button type="button" className="pp-add" style={{ gridRow: stepRow + n }} onClick={() => insertAt(n)} disabled={run !== null}>
              <Icon name="plus" size={12} strokeWidth={2.4} /> Approval
            </button>
          )}
          {draft.enabled && n > 0 && (
            <div className="pp-branch" style={{ gridRow: `${stepRow} / span ${n + (manage && !full ? 1 : 0)}` }}>
              <Node id="rej" mark={mark("rej")} icon={words ? "undo" : "x-circle"} title={words?.stop ?? "Rejected"} sub={words?.stopSub ?? "Reason required"} small tone="stop" />
              {(draft.notify || words) && <Node id="rej-told" mark={mark("rej-told")} icon="bell" title={words?.who ?? "Requester"} sub={words?.toldStop ?? "Told why"} small />}
              {spec.back && <Node id="rej-back" icon="undo" title="The item" sub={spec.back} small />}
            </div>
          )}

          {/* Applied */}
          <Node id="applied" row={appliedRow} flow={flow("applied")} mark={mark("applied")} icon="check" title="Applied" sub={draft.enabled ? "After the last approval" : "Straight away"} tone="done">
            <ul className="pp-checks" aria-label="Checked first">
              {spec.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Node>

          {/* The established Hub */}
          <HubOuts outs={spec.outs} row={appliedRow + 1} flow={flow} mark={mark}>
            <Node id="out-told" flow={flow("out-told")} mark={mark("out-told")} icon="bell" title={words?.who ?? "Requester"} sub={draft.notify ? (words?.toldDone ?? "Told it was approved") : "Not told"} small off={!draft.notify}>
              <Switch checked={draft.notify} disabled={!manage} label={words ? "Tell the unit it was accepted" : "Tell the requester the outcome"} onChange={(v) => patch({ notify: v })} />
            </Node>
          </HubOuts>
        </div>
      </Canvas>

      <AnimatePresence>
        {manage && dirty && (
          <motion.div className="pp-savebar" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: 12 }} transition={SPRING}>
            <span>Unsaved changes</span>
            <button type="button" className="btn btn--sm" onClick={() => setDraft(draftOf(wf))}>
              Discard
            </button>
            <button type="submit" className="btn btn--sm btn--dark">
              Save
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );

  return (
    <PipelineFrame
      label="Workflow pipelines"
      items={data.workflows.map((w) => {
        const shown = w.id === wf.id ? draft : w;
        const pending = w.id === SUBMISSIONS ? data.health.evidence.review : data.requests.filter((r) => r.workflowId === w.id && r.status === "Pending").length;
        return {
          key: w.id,
          icon: WF_META[w.id].icon,
          name: WF_META[w.id].short,
          meta: (!shown.enabled || pending > 0) && (
            <>
              {!shown.enabled && "Off"}
              {pending > 0 && <b>{pending}</b>}
            </>
          ),
        };
      })}
      value={wf.id}
      onPick={(k) => void pick(k as WorkflowKey)}
      layoutId="pp-item-on-workflow"
      title={wf.name}
      map={map}
      tools={tools}
      action={{ label: "Manage Pipeline", icon: "workflow" }}
      canClose={async () => {
        if (await discard()) return false;
        if (dirty) setDraft(draftOf(wf));
        return true;
      }}
      onClosed={() => {
        integrity.reset();
        setFresh(null);
      }}
      overlay={integrity.overlay}
    >
      <dialog
        ref={riskRef}
        className="pp-risk"
        aria-labelledby={riskTitle}
        onCancel={(event) => {
          event.preventDefault();
          closeRisk();
        }}
        onClose={() => setRisk(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeRisk();
        }}
      >
        {risk && (
          <>
            <div className="pp-risk__main">
              <span className="pp-risk__icon" aria-hidden="true">
                <Icon name="alert" size={18} />
              </span>
              <span className="pp-risk__tag">High risk</span>
              <h2 id={riskTitle}>Save changes to {wf.name}?</h2>
              <p>This changes who approves requests in this pipeline, and how, from the moment you save.</p>
              <ul className="pp-risk__list" aria-label="Changes">
                {changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <footer className="pp-risk__foot">
              <button type="button" className="btn" onClick={closeRisk}>
                Cancel
              </button>
              <button type="button" className="btn btn--danger" onClick={() => void commit()} autoFocus>
                Save changes
              </button>
            </footer>
          </>
        )}
      </dialog>
    </PipelineFrame>
  );
}

function StepNode({
  step,
  index,
  row,
  count,
  manage,
  flow,
  mark,
  paused,
  keepOn,
  fresh,
  people,
  known,
  open,
  openText,
  onChange,
  onMove,
  onRemove,
}: {
  step: DStep;
  index: number;
  row: number;
  count: number;
  manage: boolean;
  flow?: Flow;
  mark?: NodeMark;
  paused: boolean;
  keepOn: boolean;
  fresh: boolean;
  people: { id: string; name: string; avatar?: string }[];
  known: boolean;
  /** Given to a position nobody holds, on a pipeline where either approver then decides it. */
  open?: boolean;
  openText?: string;
  onChange: (p: Partial<WorkflowStep>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const name = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (fresh) name.current?.select();
  }, [fresh]);
  const on = stepOn(step);
  const label = step.name.trim() || `Step ${index + 1}`;
  return (
    <div className="pp-node" data-node={step.key} data-kind="approver" data-off={!on || paused || undefined} data-flow={flow} data-check={mark?.status} style={{ gridRow: row }}>
      <div className="pp-node__head">
        <span className="pp-node__mark pp-node__mark--step" aria-hidden="true">
          <b>{flow === "passed" ? <Icon name="check" size={12} strokeWidth={2.8} /> : index + 1}</b>
        </span>
        <input
          ref={name}
          className="pp-node__input"
          value={step.name}
          required
          maxLength={80}
          data-missing="Name this step."
          aria-label={`Step ${index + 1} name`}
          disabled={!manage}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <span className="pp-node__end">
          <Switch checked={on} disabled={!manage || keepOn} label={`${label} on`} describe={keepOn ? "One step stays on. Switch the workflow off to skip approval." : undefined} onChange={(v) => onChange({ enabled: v })} />
          {manage && (
            <RowMenu
              label={`${label} options`}
              items={[
                index > 0 && { label: "Move up", icon: "arrow-up", onSelect: () => onMove(-1) },
                index < count - 1 && { label: "Move down", icon: "arrow-down", onSelect: () => onMove(1) },
                count > 1 && !keepOn && { label: "Remove", icon: "trash", onSelect: onRemove, danger: true },
              ]}
            />
          )}
        </span>
      </div>
      <div className="pp-node__body pp-node__who">
        {manage ? <Segmented className="pp-who" label={`Who decides ${label}`} options={WHO} value={step.approver} onChange={(v) => onChange({ approver: v })} /> : <span className="pp-opt">{approverName(step.approver)}</span>}
        {known &&
          (people.length ? (
            <span className="pp-faces" role="img" aria-label={people.map((p) => p.name).join(", ")}>
              {people.slice(0, 3).map((p) => (
                <Avatar key={p.id} name={p.name} src={p.avatar} size={22} />
              ))}
              {people.length > 3 && <i>+{people.length - 3}</i>}
            </span>
          ) : (
            <span className="pp-nobody">
              <Icon name="alert" size={12} /> No one
              {open && openText && <Hint text={openText} label="Who decides it" />}
            </span>
          ))}
      </div>
      <CheckLine mark={mark} />
    </div>
  );
}
