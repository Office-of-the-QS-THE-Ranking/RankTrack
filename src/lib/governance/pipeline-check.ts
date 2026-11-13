/*
 * Process Pipelines › Integrity check: a dry run of a pipeline's draft settings through the real engine, on copies
 * of the Hub that are thrown away. The draft is applied with updateWorkflow, so Save's own rules are checked; the
 * people who would take each step are found, each step needing its own person, as decisionBlock() and review()
 * demand; a test item is approved through openRequest / decide / apply() (review() for Unit submissions) by those
 * people, and a second one is rejected; then every live request or submission is walked against the new steps,
 * and live requests are applied in turn. Nothing is committed, sealed, notified or logged: callers pass the state
 * they read and get a report back.
 */
import type { Reference } from "@/lib/reference";
import { HUB_OFFICE, ROLE } from "./catalog";
import { addDays, evidenceBodies } from "./derive";
import { housekeeping, makeCtx, SYSTEM, type Actor, type Ctx } from "./engine";
import { createAccount } from "./engine/mutations";
import { review } from "./engine/records";
import { decide, decisionBlock, needsApproval, openRequest, updateWorkflow } from "./engine/requests";
import { invitationUnitMatchesRole } from "./invitation";
import { canWith, grantsFor, topGrant, unitScope, type Grant, type Target } from "./rbac";
import { evidenceList } from "./records";
import { decidedBy, submissionSteps, waitingAt, type ReviewStep } from "./submission-review";
import type { Account, EvidenceRecord, GovernanceState, RequestPayload, StepApprover, WorkflowKey, WorkflowStep } from "./types";
import { SUBMISSIONS, approverFits, approverName, reviewerFits, stepOn } from "./workflow-steps";

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckGroup = "settings" | "approvers" | "test" | "reject" | "live" | "sources" | "freshness" | "governed";

export const CHECK_GROUPS: Record<CheckGroup, string> = {
  settings: "Settings",
  approvers: "Approvers",
  test: "Test item",
  reject: "Rejection",
  live: "Waiting now",
  sources: "Sources read",
  freshness: "Health",
  governed: "Governing pipelines",
};

export interface CheckItem {
  group: CheckGroup;
  status: CheckStatus;
  label: string;
  detail?: string;
}

/** A node of the studio's map: req, queue, office, step:<index>, applied, outs, out-told, rej, rej-told. */
export interface NodeMark {
  node: string;
  status: CheckStatus;
  note?: string;
}

/** An assessment report: what one integrity check found, the same shape for workflow and information pipelines. */
export interface PipelineCheck {
  /** The pipeline checked: a workflow key, or an information pipeline's key. */
  pipeline: string;
  /** Its name, as the report heads it. */
  subject: string;
  at: string;
  /** How long the check took on the server, in milliseconds (set by the action that ran it). */
  ms: number;
  status: CheckStatus;
  checks: CheckItem[];
  marks: NodeMark[];
  /** What the test item would have written to the audit log and who would have been notified. Nothing was. */
  logged: string[];
  /** Figures about the run itself: copies made, engine actions run, people matched, live items walked. */
  stats: { label: string; value: number }[];
}

export interface PipelineDraft {
  enabled: boolean;
  slaDays: number;
  separation: boolean;
  notify: boolean;
  steps: { name: string; enabled?: boolean; approver?: StepApprover }[];
}

/** Stands in for whoever opens or sends the test item; no account has this id. */
const TESTER: Actor = { id: "integrity-check", name: "Test requester", role: "Integrity check", grants: [] };
const TEST_EVIDENCE = "EV-CHECK";
const NOTE = "Integrity check";
/** Live items walked, at most. */
const LIVE_MAX = 60;

interface Person {
  account: Account;
  grants: Grant[];
}

interface Out {
  checks: CheckItem[];
  marks: NodeMark[];
  logged: string[];
}

/** What one run did, for the report's figures. checkPipeline is synchronous, so one tally serves one run. */
const tally = { copies: 0, actions: 0, matched: 0, walked: 0 };
const counted = <A extends unknown[], R>(f: (...a: A) => R) => (...a: A): R => {
  tally.actions++;
  return f(...a);
};
const openRequestT = counted(openRequest);
const decideT = counted(decide);
const reviewT = counted(review);

const RANK: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 };
export const worst = (all: CheckStatus[]) => all.reduce<CheckStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "pass");

function peopleOf(s: GovernanceState, day: string): Person[] {
  return s.accounts.filter((a) => a.status === "Active").map((account) => ({ account, grants: grantsFor(account, s.units, day, s.config.rolePermissions) }));
}

/** Someone deciding a step: held roles count, as they can switch to the one that approves. */
const actorOf = (p: Person): Actor => ({ id: p.account.id, name: p.account.name, role: topGrant(p.grants)?.roleName ?? "No role", grants: p.grants, account: p.account });

/**
 * One different person for each slot, where one exists (a bipartite matching): nobody decides two steps of the
 * same item. A slot nobody is left for stays undefined.
 */
export function assign<P extends { account: { id: string } }>(slots: ((p: P) => boolean)[], pool: P[]): (P | undefined)[] {
  const owner = new Map<string, number>();
  const got: (P | undefined)[] = slots.map(() => undefined);
  const take = (i: number, seen: Set<string>): boolean => {
    for (const p of pool) {
      const id = p.account.id;
      if (seen.has(id) || !slots[i](p)) continue;
      seen.add(id);
      const j = owner.get(id);
      if (j === undefined || take(j, seen)) {
        owner.set(id, i);
        got[i] = p;
        return true;
      }
    }
    return false;
  };
  slots.forEach((_, i) => take(i, new Set()));
  tally.matched += got.filter(Boolean).length;
  return got;
}

/** Why a slot got nobody: no one fits it at all, or everyone who fits it already takes another. */
function whyNobody(fits: (p: Person) => boolean, pool: Person[], who: string) {
  return pool.some(fits) ? `Everyone who can decide it already decides an earlier step, and nobody decides two.` : `No active account can decide it: it needs the ${who}.`;
}

/** A copy of the Hub with housekeeping run and the draft saved on it, as Save would. */
function prepare(state: GovernanceState, ref: Reference, id: WorkflowKey, draft: PipelineDraft, now: Date) {
  tally.copies++;
  const s = structuredClone(state);
  const ctx = makeCtx(s, SYSTEM, ref, now);
  housekeeping(ctx);
  const saved = updateWorkflow(ctx, id, draft);
  return { s, saved, sys: makeCtx(s, SYSTEM, ref, now) };
}

function who(s: GovernanceState, to: string) {
  if (to === "office") return "Rankings Office";
  if (to === TESTER.id) return "the requester";
  if (to.startsWith("unit:")) return s.units.find((u) => u.id === to.slice(5))?.name ?? "the unit";
  return s.accounts.find((a) => a.id === to)?.name ?? to;
}

/** The audit entries and notices a run left on its copy, in words. */
function collect(out: Out, s: GovernanceState, ctxs: Ctx[], noticesBefore: Set<string>) {
  for (const ctx of ctxs) for (const d of ctx.drafts) out.logged.push(`${d.action} · ${d.resource.label}${d.detail ? ` · ${d.detail}` : ""}`);
  for (const n of s.notices) if (!noticesBefore.has(n.id)) out.logged.push(`Notice to ${who(s, n.to)} · ${n.text}`);
  for (const ctx of ctxs)
    for (const fx of ctx.effects)
      if (fx.kind === "restore") out.logged.push(`Would restore the Hub from ${fx.pointId} (not run)`);
      else if (fx.kind === "delete-point") out.logged.push(`Would delete recovery point ${fx.pointId} (not run)`);
}

const newNotice = (s: GovernanceState, before: Set<string>, to: string) => s.notices.some((n) => !before.has(n.id) && n.to === to);

/* ---------- Request pipelines ---------- */

/** A test request of this workflow's kind, built from the copy's own units, datasets and recovery points. */
function testItem(s: GovernanceState, id: WorkflowKey, sys: Ctx): { payload: RequestPayload; title: string } | string {
  const active = s.units.filter((u) => u.status === "Active");
  switch (id) {
    case "account-access": {
      const unit = active.find((u) => invitationUnitMatchesRole(u, ROLE.coordinator));
      if (!unit) return "No active unit can hold a Coordinator yet.";
      return {
        payload: { kind: "account-access", name: "Test Person", email: "integrity-check@example.invalid", unitId: unit.id, roleId: ROLE.coordinator, title: NOTE },
        title: "Account for Test Person",
      };
    }
    case "privilege-escalation": {
      const unit = active.find((u) => invitationUnitMatchesRole(u, ROLE.admin));
      if (!unit) return "No active unit can hold an Administrator yet.";
      const acc = createAccount(sys, { name: "Test Person", email: "integrity-check@example.invalid", title: NOTE, unitId: unit.id, roleId: ROLE.coordinator });
      acc.status = "Active";
      return { payload: { kind: "privilege-escalation", accountId: acc.id, roleId: ROLE.admin, scope: unitScope(unit.id) }, title: "Administrator for Test Person" };
    }
    case "org-unit": {
      const parent = active.find((u) => !u.parentId) ?? active[0];
      if (!parent) return "No active unit to add one under.";
      let code = "ICHK";
      for (let i = 2; s.units.some((u) => u.code.toUpperCase() === code); i++) code = `ICHK${i}`;
      return { payload: { kind: "org-unit", name: "Test unit", code, kind2: "Office", parentId: parent.id, emails: [] }, title: "New unit: Test unit" };
    }
    case "data-access": {
      const ds = s.datasets[0];
      const acc = s.accounts.find((a) => a.status === "Active");
      if (!ds || !acc) return "There is no dataset to request yet.";
      return { payload: { kind: "data-access", accountId: acc.id, datasetId: ds.id, access: "View", until: addDays(sys.day, 30) }, title: `View access to ${ds.name}` };
    }
    case "publication":
      return { payload: { kind: "publication", target: "report", id: "integrity-check", title: "Test report" }, title: "Publish report: Test report" };
    case "destructive": {
      const point = s.backup.points.find((p) => p.status === "Completed" && p.file);
      if (!point) return "No recovery point holds Hub data, so a restore can't be approved.";
      return { payload: { kind: "destructive", operation: "restore", snapshotId: point.id }, title: `Restore from ${point.id}` };
    }
    default:
      return "This pipeline has no test request.";
  }
}

const stepLabel = (steps: readonly WorkflowStep[], i: number) => `Step ${i + 1} · ${steps[i]?.name ?? "Untitled"}`;

function checkRequests(state: GovernanceState, ref: Reference, id: WorkflowKey, draft: PipelineDraft, viewerId: string, now: Date, out: Out) {
  const check = (group: CheckGroup, status: CheckStatus, label: string, detail?: string) => out.checks.push({ group, status, label, ...(detail && { detail }) });
  const mark = (node: string, status: CheckStatus, note?: string) => out.marks.push({ node, status, ...(note && { note }) });

  const base = prepare(state, ref, id, draft, now);
  if (!base.saved.ok) {
    check("settings", "fail", "Save would be refused", base.saved.message);
    return;
  }
  check("settings", "pass", "Save would be accepted");
  const wf = base.s.workflows.find((w) => w.id === id)!;
  const day = base.sys.day;
  mark("req", "pass");

  if (!wf.enabled) {
    check("approvers", "warn", "Switched off", "Changes apply straight away, with no approval.");
    mark("queue", "warn", "Off: no approval");
    mark("applied", "warn", "Straight away");
  } else {
    const pool = peopleOf(base.s, day).filter((p) => canWith(p.grants, "workflows", "approve"));
    const on = wf.steps.map((st, i) => ({ st, i })).filter((x) => stepOn(x.st));
    const fits = (st: WorkflowStep) => (p: Person) => approverFits(p.grants, st.approver ?? "office");
    const team = assign(on.map((x) => fits(x.st)), pool);
    const gated = needsApproval(makeCtx(base.s, TESTER, ref, now), id);
    const missing = on.filter((_, k) => !team[k]);

    if (!gated && !missing.length) {
      check("approvers", "warn", "Too few approvers", "Requests apply straight away: every step on needs its own approver.");
      mark("queue", "warn", "Applies directly");
      mark("applied", "warn", "Straight away");
    } else if (missing.length) {
      for (const x of missing) {
        const why = whyNobody(fits(x.st), pool, approverName(x.st.approver ?? "office"));
        check("approvers", "fail", `${stepLabel(wf.steps, x.i)} can never be decided`, gated ? `Requests would open and stall here. ${why}` : why);
        mark(`step:${x.i}`, "fail", "Nobody can decide it");
      }
      if (!gated) mark("queue", "warn", "Applies directly");
    } else {
      on.forEach((x, k) => check("approvers", "pass", stepLabel(wf.steps, x.i), `${team[k]!.account.name} can decide it`));
      // Separation of duties can let a change you make yourself skip approval when too few others remain.
      const me = base.s.accounts.find((a) => a.id === viewerId);
      if (wf.separation && me && !needsApproval(makeCtx(base.s, actorOf({ account: me, grants: grantsFor(me, base.s.units, day, base.s.config.rolePermissions) }), ref, now), id))
        check("approvers", "warn", "Your own requests apply directly", "With you as requester, too few others can approve.");

      testRun(state, ref, id, draft, now, on, out, check, mark);
    }
  }

  liveRequests(state, ref, id, draft, now, check);
}

/** Approve a test request through every step, then reject a second one at the first. */
function testRun(
  state: GovernanceState,
  ref: Reference,
  id: WorkflowKey,
  draft: PipelineDraft,
  now: Date,
  on: { st: WorkflowStep; i: number }[],
  out: Out,
  check: (group: CheckGroup, status: CheckStatus, label: string, detail?: string) => void,
  mark: (node: string, status: CheckStatus, note?: string) => void,
) {
  const { s, sys } = prepare(state, ref, id, draft, now);
  const wf = s.workflows.find((w) => w.id === id)!;
  const pool = peopleOf(s, sys.day).filter((p) => canWith(p.grants, "workflows", "approve"));
  const team = assign(on.map((x) => (p: Person) => approverFits(p.grants, x.st.approver ?? "office")), pool);
  const item = testItem(s, id, sys);
  if (typeof item === "string") {
    check("test", "warn", "Test request not tried", item);
    return;
  }
  const before = new Set(s.notices.map((n) => n.id));
  const rctx = makeCtx(s, TESTER, ref, now);
  const req = openRequestT(rctx, id, item.payload, item.title, `${NOTE} of this pipeline.`);
  const ctxs: Ctx[] = [rctx];
  mark("queue", "pass", `${req.id} · reply by ${req.due}`);
  mark("office", newNotice(s, before, "office") ? "pass" : "warn", newNotice(s, before, "office") ? "Notified" : "Not notified: template off");

  let failed = false;
  const by: string[] = [];
  for (let i = 0; i < wf.steps.length && !failed; i++) {
    if (!stepOn(wf.steps[i])) {
      mark(`step:${i}`, "pass", "Passed: off");
      continue;
    }
    const p = team[on.findIndex((x) => x.i === i)]!;
    const actx = makeCtx(s, actorOf(p), ref, now);
    ctxs.push(actx);
    const block = decisionBlock(actx, req);
    if (block) {
      mark(`step:${i}`, "fail", block);
      check("test", "fail", `${stepLabel(wf.steps, i)} refused ${p.account.name}`, block);
      failed = true;
      break;
    }
    const res = decideT(actx, req.id, "Approved", NOTE);
    mark(`step:${i}`, "pass", `Approved by ${p.account.name}`);
    by.push(p.account.name);
    if (!res.ok) {
      mark("applied", "fail", "Could not apply");
      check("test", "fail", "The change could not be applied", res.message.replace(/^Could not apply [^:]+: /, ""));
      failed = true;
    }
  }
  if (!failed) {
    if (req.status !== "Approved") {
      mark("applied", "fail", "Still waiting");
      check("test", "fail", "The test request never finished", `It still waits at ${stepLabel(wf.steps, req.step)}.`);
    } else {
      mark("applied", "pass", "Checks passed");
      mark("outs", "pass");
      check("test", "pass", "Approved and applied", `${req.id}, decided by ${by.join(", then ")}`);
      const told = newNotice(s, before, TESTER.id);
      if (!wf.notify) mark("out-told", "pass", "Not told");
      else {
        mark("out-told", told ? "pass" : "warn", told ? "Told" : "Not told: template off");
        if (!told) check("test", "warn", "The requester isn't told", "Switch on the Request decision template in System Configuration.");
      }
    }
  }
  collect(out, s, ctxs, before);

  // The rejection branch, on a fresh copy.
  const r = prepare(state, ref, id, draft, now);
  const item2 = testItem(r.s, id, r.sys);
  if (typeof item2 === "string") return;
  const rwf = r.s.workflows.find((w) => w.id === id)!;
  const before2 = new Set(r.s.notices.map((n) => n.id));
  const req2 = openRequestT(makeCtx(r.s, TESTER, ref, now), id, item2.payload, item2.title, `${NOTE} of this pipeline.`);
  const first = peopleOf(r.s, r.sys.day).find((p) => p.account.id === team[0]?.account.id);
  if (!first) return;
  const res = decideT(makeCtx(r.s, actorOf(first), ref, now), req2.id, "Rejected", `${NOTE}: rejected on purpose.`);
  if (!res.ok || req2.status !== "Rejected") {
    mark("rej", "fail", res.message);
    check("reject", "fail", "A rejection was refused", res.message);
    return;
  }
  mark("rej", "pass", `Rejected by ${first.account.name}`);
  const told = newNotice(r.s, before2, TESTER.id);
  if (rwf.notify) {
    mark("rej-told", told ? "pass" : "warn", told ? "Told why" : "Not told: template off");
    check("reject", told ? "pass" : "warn", "Rejected at the first step", told ? "The requester is told why." : "The requester isn't told: the Request decision template is off.");
  } else check("reject", "pass", "Rejected at the first step", "The requester isn't told: Tell the requester is off.");
}

/** Every request waiting in this workflow, walked against the draft: who could take each step left, then applied. */
function liveRequests(
  state: GovernanceState,
  ref: Reference,
  id: WorkflowKey,
  draft: PipelineDraft,
  now: Date,
  check: (group: CheckGroup, status: CheckStatus, label: string, detail?: string) => void,
) {
  const { s, sys } = prepare(state, ref, id, draft, now);
  const wf = s.workflows.find((w) => w.id === id)!;
  const waiting = s.requests.filter((r) => r.workflowId === id && r.status === "Pending");
  if (!waiting.length) {
    check("live", "pass", "No requests waiting");
    return;
  }
  const pool = peopleOf(s, sys.day).filter((p) => canWith(p.grants, "workflows", "approve"));
  const overdue = waiting.filter((r) => r.due < sys.day);
  let fine = 0;
  for (const r of waiting.slice(0, LIVE_MAX)) {
    tally.walked++;
    // the step it stands at is decided even if it was switched off meanwhile; after it, only steps on
    const left = [r.step, ...wf.steps.map((_, i) => i).filter((i) => i > r.step && stepOn(wf.steps[i]))].filter((i) => wf.steps[i]);
    if (!left.length) {
      check("live", "fail", `${r.id} has no step to wait on`, r.title);
      continue;
    }
    const done = new Set(r.decisions.filter((d) => d.decision === "Approved").map((d) => d.by));
    const free = pool.filter((p) => !done.has(p.account.id) && !(wf.separation && p.account.id === r.requesterId));
    const fits = (i: number) => (p: Person) => approverFits(p.grants, wf.steps[i].approver ?? "office");
    const team = assign(left.map(fits), free);
    const gap = left.findIndex((_, k) => !team[k]);
    if (gap >= 0) {
      check("live", "fail", `${r.id} would stall at ${stepLabel(wf.steps, left[gap])}`, `${r.title}. ${whyNobody(fits(left[gap]), free, approverName(wf.steps[left[gap]].approver ?? "office"))}`);
      continue;
    }
    // An account request without a unit is placed by its approver, so it can't be applied blind.
    if (r.payload.kind === "account-access" && !r.payload.unitId) {
      fine++;
      continue;
    }
    let problem: string | null = null;
    for (let k = 0; k < left.length && !problem; k++) {
      const res = decideT(makeCtx(s, actorOf(team[k]!), ref, sys.now), r.id, "Approved", NOTE);
      if (!res.ok) problem = res.message.replace(/^Could not apply [^:]+: /, "");
    }
    if (problem) check("live", "fail", `${r.id} would fail when applied`, `${r.title}. ${problem}`);
    else fine++;
  }
  if (waiting.length > LIVE_MAX) check("live", "warn", `Only the first ${LIVE_MAX} of ${waiting.length} requests were walked`);
  if (fine) check("live", "pass", `${fine} waiting ${fine === 1 ? "request" : "requests"} can be decided and applied`);
  if (overdue.length) check("live", "warn", `${overdue.length} ${overdue.length === 1 ? "request is" : "requests are"} past their reply date`, overdue.slice(0, 5).map((r) => r.id).join(", "));
}

/* ---------- Unit submissions ---------- */

const targetOf = (e: Pick<EvidenceRecord, "programId" | "unitSlug" | "mappedTo">): Target => ({ unitId: e.programId ?? e.unitSlug, bodies: evidenceBodies(e.mappedTo) });
const sentBy = (e: EvidenceRecord, p: Person) => (e.submittedById ? e.submittedById === p.account.id : e.submittedBy === p.account.name);

function testEvidence(s: GovernanceState, day: string): EvidenceRecord {
  const unit = s.units.find((u) => u.status === "Active" && u.id !== HUB_OFFICE && u.parentId) ?? s.units.find((u) => u.status === "Active") ?? s.units[0];
  const like = evidenceList(s).find((e) => e.mappedTo.length);
  return {
    id: TEST_EVIDENCE,
    title: "Test submission",
    unitSlug: unit?.id ?? HUB_OFFICE,
    type: "Operational data",
    period: "",
    submitted: day,
    submittedBy: TESTER.name,
    submittedById: TESTER.id,
    status: "For review",
    stage: 1,
    level: 1,
    mappedTo: like ? [like.mappedTo[0]] : [],
    sdgs: [],
    summary: "",
    result: "",
    beneficiaries: "",
    files: [],
    comments: [],
  };
}

function checkSubmissions(state: GovernanceState, ref: Reference, draft: PipelineDraft, now: Date, out: Out) {
  const check = (group: CheckGroup, status: CheckStatus, label: string, detail?: string) => out.checks.push({ group, status, label, ...(detail && { detail }) });
  const mark = (node: string, status: CheckStatus, note?: string) => out.marks.push({ node, status, ...(note && { note }) });

  const base = prepare(state, ref, SUBMISSIONS, draft, now);
  if (!base.saved.ok) {
    check("settings", "fail", "Save would be refused", base.saved.message);
    return;
  }
  check("settings", "pass", "Save would be accepted");
  const { s, sys } = base;
  const wf = s.workflows.find((w) => w.id === SUBMISSIONS)!;
  const steps = submissionSteps(s, sys.day);
  const item = testEvidence(s, sys.day);
  const pool = peopleOf(s, sys.day);
  const fits = (st: ReviewStep, t: Target) => (p: Person) => reviewerFits(p.grants, decidedBy(st), t);
  const team = assign(steps.map((st) => fits(st, targetOf(item))), pool);
  const unitName = s.units.find((u) => u.id === item.unitSlug)?.name ?? item.unitSlug;

  mark("req", "pass", unitName);
  for (const st of steps) if (st.open) check("approvers", "warn", `${stepLabel(wf.steps, st.at)}: nobody is ${approverName(st.approver)}`, "Either approver decides it instead.");
  const missing = steps.filter((_, k) => !team[k]);
  for (const st of missing) {
    check("approvers", "fail", `${stepLabel(wf.steps, st.at)} can never be decided`, `Evidence from ${unitName} would stall here. ${whyNobody(fits(st, targetOf(item)), pool, approverName(decidedBy(st)))}`);
    mark(`step:${st.at}`, "fail", "Nobody can decide it");
  }

  if (!missing.length) {
    steps.forEach((st, k) => check("approvers", "pass", stepLabel(wf.steps, st.at), `${team[k]!.account.name} can decide it`));
    // Accept through every step.
    s.records.evidence[TEST_EVIDENCE] = item;
    const before = new Set(s.notices.map((n) => n.id));
    const ctxs: Ctx[] = [];
    mark("queue", "pass", `${TEST_EVIDENCE} · from ${unitName}`);
    let failed = false;
    for (let i = 0; i < wf.steps.length && !failed; i++) {
      const k = steps.findIndex((st) => st.at === i);
      if (k < 0) {
        mark(`step:${i}`, "pass", "Passed: off");
        continue;
      }
      const p = team[k]!;
      const actx = makeCtx(s, actorOf(p), ref, now);
      ctxs.push(actx);
      const res = reviewT(actx, TEST_EVIDENCE, "accept", "");
      if (!res.ok) {
        mark(`step:${i}`, "fail", res.message);
        check("test", "fail", `${stepLabel(wf.steps, i)} refused ${p.account.name}`, res.message);
        failed = true;
      } else mark(`step:${i}`, "pass", `Approved by ${p.account.name}`);
    }
    const after = evidenceList(s).find((e) => e.id === TEST_EVIDENCE);
    if (!failed) {
      if (after?.status !== "Validated") {
        mark("applied", "fail", "Still in review");
        check("test", "fail", "The test submission never counted", `It is ${after?.status ?? "missing"}.`);
      } else {
        mark("applied", "pass", "Checks passed");
        mark("outs", "pass");
        check("test", "pass", "Accepted through every step", `Decided by ${steps.map((_, k) => team[k]!.account.name).join(", then ")}`);
        const told = newNotice(s, before, `unit:${item.unitSlug}`);
        if (!wf.notify) mark("out-told", "pass", "Not told");
        else {
          mark("out-told", told ? "pass" : "warn", told ? "Told" : "Not told: template off");
          if (!told) check("test", "warn", "The unit isn't told it was accepted", "Switch on the Evidence accepted template in System Configuration.");
        }
      }
    }
    collect(out, s, ctxs, before);

    // A revision at the first step, on a fresh copy.
    const r = prepare(state, ref, SUBMISSIONS, draft, now);
    r.s.records.evidence[TEST_EVIDENCE] = testEvidence(r.s, r.sys.day);
    const before2 = new Set(r.s.notices.map((n) => n.id));
    const first = peopleOf(r.s, r.sys.day).find((p) => p.account.id === team[0]?.account.id);
    if (first) {
      const res = reviewT(makeCtx(r.s, actorOf(first), ref, now), TEST_EVIDENCE, "revise", `${NOTE}: sent back on purpose.`);
      const sent = evidenceList(r.s).find((e) => e.id === TEST_EVIDENCE);
      if (!res.ok || sent?.status !== "Needs revision") {
        mark("rej", "fail", res.message);
        check("reject", "fail", "A revision request was refused", res.message);
      } else {
        mark("rej", "pass", `Sent back by ${first.account.name}`);
        const told = newNotice(r.s, before2, `unit:${item.unitSlug}`);
        mark("rej-told", told ? "pass" : "warn", told ? "Told what to change" : "Not told: template off");
        check("reject", told ? "pass" : "warn", "Sent back at the first step", told ? "The unit is told what to change." : "The unit isn't told: the Revision requested template is off.");
      }
    }
  }

  // Everything in review now, against the new steps.
  const live = prepare(state, ref, SUBMISSIONS, draft, now);
  const lsteps = submissionSteps(live.s, live.sys.day);
  const lpool = peopleOf(live.s, live.sys.day);
  const waiting = evidenceList(live.s).filter((e) => e.status === "For review");
  if (!waiting.length) {
    check("live", "pass", "No submissions waiting");
    return;
  }
  let fine = 0;
  for (const e of waiting.slice(0, LIVE_MAX)) {
    tally.walked++;
    const left = lsteps.slice(waitingAt(lsteps, e.review));
    const done = new Set((e.review?.approvals ?? []).map((a) => a.by));
    const free = lpool.filter((p) => !done.has(p.account.id) && !sentBy(e, p));
    const t = targetOf(e);
    const team2 = assign(left.map((st) => fits(st, t)), free);
    const gap = left.findIndex((_, k) => !team2[k]);
    if (gap < 0) fine++;
    else check("live", "fail", `${e.id} would stall at ${stepLabel(live.s.workflows.find((w) => w.id === SUBMISSIONS)!.steps, left[gap].at)}`, `${e.title}. ${whyNobody(fits(left[gap], t), free, approverName(decidedBy(left[gap])))}`);
  }
  if (waiting.length > LIVE_MAX) check("live", "warn", `Only the first ${LIVE_MAX} of ${waiting.length} submissions were walked`);
  if (fine) check("live", "pass", `${fine} waiting ${fine === 1 ? "submission" : "submissions"} can be decided`);
}

/** The figures about a run, from the tally, for the report. */
export function runStats(logged: number) {
  return [
    { label: "Copies of the Hub", value: tally.copies },
    { label: "Engine actions run", value: tally.actions },
    { label: "Approvers matched", value: tally.matched },
    { label: "Live items walked", value: tally.walked },
    { label: "Entries it would log", value: logged },
  ];
}

export const resetTally = () => Object.assign(tally, { copies: 0, actions: 0, matched: 0, walked: 0 });

/** Dry-run a pipeline's draft. `state` is left as it was. */
export function checkPipeline(state: GovernanceState, ref: Reference, id: WorkflowKey, draft: PipelineDraft, viewerId: string, now = new Date()): PipelineCheck {
  const t0 = performance.now();
  resetTally();
  const out: Out = { checks: [], marks: [], logged: [] };
  const wf = state.workflows.find((w) => w.id === id);
  if (!wf) out.checks.push({ group: "settings", status: "fail", label: "Unknown pipeline" });
  else if (id === SUBMISSIONS) checkSubmissions(state, ref, draft, now, out);
  else checkRequests(state, ref, id, draft, viewerId, now, out);
  return {
    pipeline: id,
    subject: wf?.name ?? id,
    at: now.toISOString(),
    ms: Math.round((performance.now() - t0) * 10) / 10,
    status: worst(out.checks.map((c) => c.status)),
    ...out,
    stats: runStats(out.logged.length),
  };
}
