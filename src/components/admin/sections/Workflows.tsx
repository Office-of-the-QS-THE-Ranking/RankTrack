"use client";

import { closeModal } from "@/components/ui/modal-motion";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GUEST_DAYS, checkDomains } from "@/lib/governance/access-requests";
import { ROLE } from "@/lib/governance/catalog";
import type { RequestRow } from "@/lib/governance/console-types";
import { trackRequest, trackStatus } from "@/lib/governance/request-tracker";
import { invitationUnitMatchesRole } from "@/lib/governance/invitation";
import { UNIVERSITY, roleScope, unitScope } from "@/lib/governance/rbac";
import type { Applicant, RequestPayload, RoleId, WorkflowKey, WorkflowStep } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { UnitSelect } from "../parts";
import { Avatar, Block, EmptyNote, Field, Hint, KV, Pill, Sheet, StatusPill, Switch, Tabs, fmtAgo, fmtDate, plural, useAct, useConsole } from "../ui";
import { scopeText } from "./Accounts";
import { DateField, NumberField, Select } from "@/components/ui/pickers";

type Tab = "Inbox" | "All" | "Settings";

export function Workflows() {
  const { data } = useConsole();
  const waiting = data.requests.filter((r) => r.canDecide);
  const [tab, setTab] = useState<Tab>(waiting.length ? "Inbox" : "All");
  const [onlyMine, setOnlyMine] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const list = tab === "Inbox" ? waiting : onlyMine ? data.requests.filter((r) => r.mine) : data.requests;
  const current = data.requests.find((r) => r.id === open) ?? null;
  return (
    <div className="adm-stack">
      <Tabs
        label="Approval workflows"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "Inbox", label: "Waiting for you", count: waiting.length || undefined, countTone: "alert" },
          { key: "All", label: "All requests", count: data.requests.length },
          { key: "Settings", label: "Settings" },
        ]}
      />
      {tab !== "Settings" && (
        <>
          <div className="adm-toolbar">
            {tab === "All" && (
              <label className="choice choice--inline">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                Only mine
              </label>
            )}
            <span className="adm-toolbar__spacer" />
            <button type="button" className="btn btn--dark btn--sm" onClick={() => setAsking(true)}>
              <Icon name="plus" size={15} /> New request
            </button>
          </div>
          {list.length ? (
            <ul className="adm-requests">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" className="adm-request" onClick={() => setOpen(r.id)}>
                    <span className="adm-request__main">
                      <b>{r.title}</b>
                      <small className="adm-muted">
                        {r.requesterName} · {fmtAgo(r.requestedAt, data.now)}
                      </small>
                    </span>
                    <span className="adm-request__step">
                      {r.status === "Pending" && r.steps.length > 1 && (
                        <small className="adm-muted">
                          Step {Math.min(r.step + 1, r.steps.length)} of {r.steps.length}
                        </small>
                      )}
                    </span>
                    <span className="adm-inline">
                      {r.overdue && <Pill tone="danger">Overdue</Pill>}
                      {tab === "All" && r.canDecide && <Pill tone="review">Your turn</Pill>}
                      <StatusPill value={requestStatus(r, data)} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote icon="inbox" title={tab === "Inbox" ? "Nothing waiting for you" : "No requests"} />
          )}
        </>
      )}
      {tab === "Settings" && <Definitions />}
      <RequestSheet r={current} onClose={() => setOpen(null)} />
      <NewRequest
        open={asking}
        onClose={() => setAsking(false)}
        onCreated={(id) => {
          setAsking(false);
          setTab("All");
          setOpen(id);
        }}
      />
    </div>
  );
}

/* The short name approvers know an affiliation by: its acronym when it has one. */
const shortName = (affiliation: string) => /\(([^)]+)\)\s*$/.exec(affiliation)?.[1] ?? affiliation;

/** Account requests use the same standing as the requester-facing tracker. */
function requestStatus(r: RequestRow, data: ReturnType<typeof useConsole>["data"]) {
  if (r.payload.kind !== "account-access") return r.status;
  const email = r.payload.email.toLowerCase();
  const account = data.accounts?.find((a) => a.email.toLowerCase() === email);
  return trackStatus(r, !!(account?.firstLogin ?? account?.lastLogin));
}

/*
 * Where a requester from the sign-in page comes from: the email's domain against the domains the affiliation
 * is known to use, and the website they gave (Others only) as plain text, never a link.
 */
function originRows(email: string, a: Applicant, university: boolean): [ReactNode, ReactNode, string?][] {
  const c = checkDomains({ email, affiliation: a.affiliation, website: a.website, university });
  const who = shortName(a.affiliation);
  const verdict = {
    university: <Pill tone="ok">University domain</Pill>,
    match: <Pill tone="ok">Matches {who}</Pill>,
    mismatch: <Pill tone="danger">Doesn&rsquo;t match {who}</Pill>,
    personal: null,
    unknown: <Pill>No domain on file</Pill>,
  }[c.email];
  const rows: [ReactNode, ReactNode, string?][] = [
    [
      "Email",
      <span key="d" className="adm-inline">
        <span>{email}</span>
        {verdict}
        {c.email === "mismatch" && <small className="adm-muted">{who} uses {c.expected.join(" or ")}</small>}
      </span>,
      email,
    ],
  ];
  if (a.website && c.site) {
    const at = a.website.indexOf(c.site.host);
    rows.push([
      <>
        Website <Hint text="Shown as text, not a link. Compare it with the email domain before opening it." />
      </>,
      <span key="w" className="adm-inline">
        <span className="adm-url">
          {a.website.slice(0, at)}
          <b>{c.site.host}</b>
          {a.website.slice(at + c.site.host.length)}
        </span>
        {c.site.matches ? <Pill tone="ok">Same as email</Pill> : <Pill tone="revise">Differs from email</Pill>}
      </span>,
      a.website,
    ]);
  }
  return rows;
}

function describe(p: RequestPayload, data: ReturnType<typeof useConsole>["data"]): [ReactNode, ReactNode, string?][] {
  const person = (id: string) => data.people.find((x) => x.id === id)?.name ?? id;
  const unit = (id: string) => data.units.find((x) => x.id === id)?.name ?? id;
  const role = (id: string) => data.roles.find((x) => x.id === id)?.name ?? id;
  switch (p.kind) {
    case "account-access": {
      // from the sign-in page: who they are and where they come from; the unit may be the approver's to choose
      const a = p.applicant;
      return [
        ["Person", `${a?.salutation ? `${a.salutation} ` : ""}${p.name}`],
        ...(a ? originRows(p.email, a, !p.external) : [["Email", p.email] as [string, string]]),
        ...(a
          ? ([
              ["Birthday", fmtDate(a.birthday)],
              ...(a.thomasian
                ? [
                    ["Requester", "Thomasian"],
                    ["Office or College/Faculty", a.unitId ? unit(a.unitId) : "Not given"],
                    // A Student is the Secretary of the organization they named.
                    ...(a.organization ? [["Secretary of", a.organization]] : []),
                  ]
                : [
                    ["Requester", "External partner"],
                    ["Affiliation", `${a.affiliation}${a.organization ? ` · ${a.organization}` : ""}${a.listed ? "" : " (Others)"}`],
                  ]),
              ...(a.agreedAt ? [["Declarations", `Accepted ${fmtDate(a.agreedAt)}`]] : []),
            ] as [string, string][])
          : ([["Position", p.title]] as [string, string][])),
        ["Role", role(p.roleId)],
        ...(p.external ? ([["Access", `Guest, for ${GUEST_DAYS} days from approval`]] as [string, string][]) : []),
      ];
    }
    case "privilege-escalation":
      return [["For", person(p.accountId)], ["Role", role(p.roleId)], ["Scope", scopeText(p.scope, data)], ["Ends", p.expires ? fmtDate(p.expires) : "No end date"]];
    case "org-unit":
      return [["New unit", `${p.name} (${p.code})`], ["Type", p.kind2], ["Sits under", unit(p.parentId)], ["Unit email addresses", p.emails?.join(", ") || "None"]];
    case "data-access":
      return [["For", person(p.accountId)], ["Dataset", data.catalog.datasets.find((d) => d.id === p.datasetId)?.name ?? p.datasetId], ["Access", p.access], ["Until", fmtDate(p.until)]];
    case "publication":
      return [["Publishes", p.target === "story" ? "Story, on the public website" : p.target === "document" ? "Article or report, on the public website" : "Report, outside the Office"], ["Title", p.title]];
    case "destructive":
      return [["Operation", p.operation === "restore" ? "Restore from a recovery point" : "Delete a recovery point"], ["Recovery point", p.snapshotId]];
  }
}

/**
 * An access request's standing as its requester sees it in the Submission Tracker on the sign-in page,
 * with who made the final decision.
 */
export function RequestTrack({ r }: { r: RequestRow }) {
  const { data } = useConsole();
  if (r.payload.kind !== "account-access") return null;
  const email = r.payload.email.toLowerCase();
  const account = r.status === "Approved" ? data.accounts?.find((a) => a.email.toLowerCase() === email) : undefined;
  const track = trackRequest(r, r.steps.length, account && (account.firstLogin ?? account.lastLogin));
  // Show who made the final decision.
  const decider = r.decisions.find((d) => d.decision === "Rejected") ?? r.decisions[r.decisions.length - 1];
  const actor = (key: string) => (key === "decision" && r.status !== "Cancelled" ? decider?.by : undefined);
  return (
    <section className="adm-track" aria-label="Submission Tracker">
      <ol className="adm-track__list">
        {track.stages.map((s, i) => {
          const by = actor(s.key);
          return (
            <li
              key={s.key}
              className={`is-${s.state}`}
              data-on={track.stages[i + 1] && track.stages[i + 1].state !== "upcoming" ? "" : undefined}
              aria-current={s.state === "current" ? "step" : undefined}
            >
              <span className="adm-track__dot" aria-hidden="true">
                {s.state === "done" ? <Icon name="check" size={13} strokeWidth={2.8} /> : s.state === "stopped" ? <Icon name="close" size={13} strokeWidth={2.8} /> : i + 1}
              </span>
              <div className="adm-track__card">
                <div className="adm-track__head">
                  <b>{s.label}</b>
                  {s.state === "current" ? (
                    <span className="adm-track__now">Now</span>
                  ) : (
                    s.at && <time dateTime={s.at} title={`${fmtDate(s.at, true)} PHT`}>{fmtAgo(s.at, data.now)}</time>
                  )}
                </div>
                {(s.at || by) && (
                  <div className="adm-track__meta">
                    {s.at && <span>{fmtDate(s.at, true)}</span>}
                    {by && (
                      <span className="adm-track__who">
                        <Avatar name={by} size={20} /> {by}
                      </span>
                    )}
                  </div>
                )}
                {s.detail && <p>{s.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function RequestSheet({ r, onClose }: { r: RequestRow | null; onClose: () => void }) {
  const { data, confirm } = useConsole();
  const act = useAct();
  const [note, setNote] = useState("");
  const [unitId, setUnitId] = useState("");
  const [tab, setTab] = useState<"Profile" | "Status">("Profile");
  // a Thomasian named their college or office; the approver starts from it
  const requestedUnit = r?.payload.kind === "account-access" ? (r.payload.applicant?.unitId ?? "") : "";
  useEffect(() => {
    setNote("");
    setUnitId(requestedUnit);
    setTab("Profile");
  }, [r?.id, requestedUnit]);
  if (!r) return null;
  const account = r.payload.kind === "account-access" ? r.payload : null;
  const applicant = account?.applicant;
  const applicantName = applicant
    ? `${applicant.lastName}, ${[applicant.firstName, applicant.middleName].filter(Boolean).join(" ")}`
    : account?.name;
  // an account request that came without a unit (from the sign-in page) takes one at its last step
  const needsUnit = r.payload.kind === "account-access" && !r.payload.unitId && r.step === r.steps.length - 1;
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={account ? (
        <span className="adm-inline">
          <span>{applicantName ?? r.title}</span>
          <StatusPill value={requestStatus(r, data)} />
        </span>
      ) : r.title}
      sub={
        !account && <span className="adm-inline">
          <StatusPill value={r.status} />
          <span className="adm-muted small">{r.workflowName}</span>
        </span>
      }
      headerContent={account && (
        <div className="adm-sheet__tabs">
          <Tabs label="Account request details" tabs={["Profile", "Status"] as const} value={tab} onChange={setTab} />
        </div>
      )}
      footer={
        r.status === "Pending" && (
          <>
            {(r.mine || viewerCan(data.viewer, "workflows", "manage")) && (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const ok = await confirm({ title: "Withdraw this request?", confirm: "Withdraw", tone: "danger" });
                  if (ok !== null) await act({ type: "request.cancel", id: r.id });
                }}
              >
                Withdraw
              </button>
            )}
            <span className="adm-toolbar__spacer" />
            {r.canDecide && (
              <>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={async () => {
                    const why = note.trim() || (await confirm({ title: "Reject this request?", confirm: "Reject", tone: "danger", input: { label: "Reason (the requester sees this)", required: true } }));
                    if (why) await act({ type: "request.decide", id: r.id, decision: "Rejected", note: why });
                  }}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn btn--dark"
                  disabled={needsUnit && !unitId}
                  onClick={() => void act({ type: "request.decide", id: r.id, decision: "Approved", note, ...(needsUnit ? { unitId } : {}) })}
                >
                  <Icon name="check" size={15} /> Approve
                </button>
              </>
            )}
          </>
        )
      }
    >
      {(!account || tab === "Profile") && <KV
        copyable={!!account}
        rows={[
          ...(account ? [["Reference number", r.id] as [string, string]] : []),
          account
            ? ["Submitted", `${fmtDate(r.requestedAt, true)} PHT`]
            : ["Requested by", `${r.requesterName} · ${fmtAgo(r.requestedAt, data.now)}`],
          ...(account ? [["Workflow", r.workflowName] as [string, string]] : []),
          ...(r.status === "Pending" ? [["Respond by", `${fmtDate(r.due)}${r.overdue ? " (overdue)" : ""}`] as [string, string]] : []),
          ...describe(r.payload, data),
          ...(!account ? [["Reason", r.justification || "—"] as [string, string]] : []),
        ]}
      />}
      {(!account || tab === "Status") && <>
      {account && <RequestTrack r={r} />}
      {!account && <ol className="adm-steps" aria-label="Approval steps">
        {r.steps.map((s, i) => {
          const d = r.decisions.find((x) => x.step === i);
          const state = d ? (d.decision === "Approved" ? "done" : "rejected") : r.status === "Pending" && i === r.step ? "now" : "next";
          return (
            <li key={i} className={`is-${state}`}>
              <span className="adm-steps__dot" aria-hidden="true">
                {state === "done" ? <Icon name="check" size={12} strokeWidth={2.6} /> : state === "rejected" ? <Icon name="close" size={12} strokeWidth={2.6} /> : i + 1}
              </span>
              <div>
                <b>{s.name}</b>
                {d && (
                  <small className="block">
                    {d.decision} by {d.by} · {fmtDate(d.at)}
                    {d.note ? ` · “${d.note}”` : ""}
                  </small>
                )}
              </div>
            </li>
          );
        })}
      </ol>}
      {!account && r.status === "Pending" && !r.canDecide && r.blocked && <p className="adm-note">{r.blocked}</p>}
      </>}
      {(!account || tab === "Profile") && r.canDecide && needsUnit && (
        <Field label="Unit" hint={requestedUnit ? "Where the account belongs. The requester named this one; change it if it's wrong." : "Where the account belongs. The request didn't name one."}>
          <UnitSelect label="Unit" value={unitId} onChange={setUnitId} filter={(u) => u.status === "Active" && invitationUnitMatchesRole(u, account?.roleId ?? "")} />
        </Field>
      )}
      {!account && r.canDecide && (
        <Field label="Note (optional)">
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked" />
        </Field>
      )}
    </Sheet>
  );
}

/* ---------- Workflow settings ---------- */

function Definitions() {
  const { data } = useConsole();
  const act = useAct();
  const manage = viewerCan(data.viewer, "workflows", "manage");
  const [edit, setEdit] = useState<WorkflowKey | null>(null);
  const wf = data.workflows.find((w) => w.id === edit);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [sla, setSla] = useState(3);
  const [sep, setSep] = useState(true);
  useEffect(() => {
    if (wf) {
      setSteps(wf.steps);
      setSla(wf.slaDays);
      setSep(wf.separation);
    }
  }, [wf]);
  return (
    <div className="adm-stack adm-stack--tight">
      <ul className="adm-wflist">
        {data.workflows.map((w) => (
          <li key={w.id}>
            <div className="adm-wflist__main">
              <span className="adm-titlerow">
                <b>{w.name}</b>
                <Hint text={w.description} />
              </span>
              <span className="adm-muted small">
                {w.steps.map((s) => s.name).join(" → ")} · {plural(w.slaDays, "day")} to respond
              </span>
            </div>
            <span className="adm-inline">
              {manage && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEdit(w.id)}>
                  Edit
                </button>
              )}
              <Switch
                checked={w.enabled}
                disabled={!manage || w.id === "destructive"}
                label={`${w.name} ${w.enabled ? "on" : "off"}`}
                describe={w.id === "destructive" ? "Always on" : w.enabled ? "On: changes wait for approval" : "Off: changes apply directly"}
                onChange={(v) => void act({ type: "workflow.update", id: w.id, enabled: v })}
              />
            </span>
          </li>
        ))}
      </ul>
      <Sheet
        open={!!wf}
        onClose={() => setEdit(null)}
        title={wf?.name ?? ""}
        sub="Steps run in order, each decided by a different University-wide Administrator."
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEdit(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              onClick={async () => {
                const r = await act({ type: "workflow.update", id: wf!.id, steps, slaDays: sla, separation: sep });
                if (r.ok) setEdit(null);
              }}
            >
              Save
            </button>
          </>
        }
      >
        {wf && (
          <>
            {steps.map((s, i) => (
              <Block
                key={i}
                title={`Step ${i + 1}`}
                actions={
                  steps.length > 1 && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSteps(steps.filter((_, k) => k !== i))}>
                      Remove
                    </button>
                  )
                }
              >
                <Field label="Name">
                  <input className="input" value={s.name} onChange={(e) => setSteps(steps.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                </Field>
              </Block>
            ))}
            <button type="button" className="btn btn--sm" onClick={() => setSteps([...steps, { name: "Additional approval" }])}>
              <Icon name="plus" size={14} /> Add step
            </button>
            <div className="adm-form-grid">
              <Field label="Respond within (days)">
                <NumberField className="input num" min={1} max={30} value={sla} onChange={setSla} />
              </Field>
              <div className="adm-switchrow">
                <span>
                  <b>Requester can't approve</b>
                </span>
                <Switch checked={sep} disabled={wf.id === "destructive"} label="Requester can't approve" onChange={setSep} />
              </div>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

/* ---------- New request ---------- */

type Kind = "data-access" | "privilege-escalation" | "account-access";
const KINDS: { key: Kind; label: string }[] = [
  { key: "data-access", label: "Access to a dataset" },
  { key: "privilege-escalation", label: "A role for someone" },
  { key: "account-access", label: "An account for someone" },
];

function NewRequest({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { data } = useConsole();
  const act = useAct();
  const v = data.viewer;
  const [kind, setKind] = useState<Kind>("data-access");
  const [justification, setJustification] = useState("");
  const [pe, setPe] = useState({ accountId: v.id, roleId: "", expires: "" });
  const [da, setDa] = useState({ datasetId: "", access: "View" as "View" | "Export", until: "" });
  const [aa, setAa] = useState({ name: "", email: "", unitId: "", title: "" });
  useEffect(() => {
    if (open) setJustification("");
  }, [open]);
  const accounts = useMemo(() => [{ id: v.id, name: `${v.name} (you)` }, ...(data.accounts ?? []).filter((a) => a.id !== v.id && a.canEdit).map((a) => ({ id: a.id, name: a.name }))], [data.accounts, v]);
  const ready =
    justification.trim().length >= 10 &&
    !(kind === "data-access" && (!da.datasetId || !da.until)) &&
    !(kind === "privilege-escalation" && !pe.roleId) &&
    !(kind === "account-access" && (!aa.name || !aa.email || !aa.unitId));
  const submit = async () => {
    let payload: RequestPayload;
    if (kind === "privilege-escalation") {
      const role = data.roles.find((r) => r.id === pe.roleId);
      const acc = data.people.find((p) => p.id === pe.accountId);
      payload = { kind, accountId: pe.accountId, roleId: pe.roleId as RoleId, scope: role ? roleScope(role.id, acc?.unitId ?? v.unitId) : unitScope(acc?.unitId ?? v.unitId), expires: pe.expires || undefined };
    } else if (kind === "data-access") payload = { kind, accountId: v.id, datasetId: da.datasetId, access: da.access, until: da.until };
    else payload = { kind, ...aa, roleId: ROLE.coordinator };
    const r = await act({ type: "request.create", workflowId: kind, payload, justification });
    if (r.ok && r.requestId) onCreated(r.requestId);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New request"
      footer={
        <>
          <button type="button" className="btn" onClick={(event) => closeModal(event.currentTarget.closest<HTMLElement>(".adm-sheet"), onClose)}>
            Cancel
          </button>
          <button type="button" className="btn btn--dark" disabled={!ready} onClick={submit}>
            <Icon name="send" size={15} /> Send for approval
          </button>
        </>
      }
    >
      <Field label="I need">
        <Select className="select" value={kind} onChange={(v) => setKind(v as Kind)}>
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      {kind === "data-access" && (
        <div className="adm-form-grid">
          <Field label="Dataset" wide>
            <Select className="select" value={da.datasetId} onChange={(v) => setDa({ ...da, datasetId: v })}>
              <option value="">Choose a dataset</option>
              {data.catalog.datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Access">
            <Select className="select" value={da.access} onChange={(v) => setDa({ ...da, access: v as "View" | "Export" })}>
              <option>View</option>
              <option disabled={data.catalog.datasets.find((d) => d.id === da.datasetId)?.classification === "Restricted"}>Export</option>
            </Select>
          </Field>
          <Field label="Until" hint="Up to 90 days">
            <DateField className="input" min={data.day} value={da.until} onChange={(v) => setDa({ ...da, until: v })} />
          </Field>
        </div>
      )}
      {kind === "privilege-escalation" && (
        <div className="adm-form-grid">
          <Field label="For">
            <Select className="select" value={pe.accountId} onChange={(v) => setPe({ ...pe, accountId: v })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Role">
            <Select className="select" value={pe.roleId} onChange={(v) => setPe({ ...pe, roleId: v })}>
              <option value="">Choose a role</option>
              {data.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ends (optional)">
            <DateField className="input" min={data.day} value={pe.expires} onChange={(v) => setPe({ ...pe, expires: v })} />
          </Field>
        </div>
      )}
      {kind === "account-access" && (
        <div className="adm-form-grid">
          <Field label="Full name">
            <input className="input" value={aa.name} onChange={(e) => setAa({ ...aa, name: e.target.value })} />
          </Field>
          <Field label="University email">
            <input className="input" type="email" value={aa.email} onChange={(e) => setAa({ ...aa, email: e.target.value })} placeholder="name@ust.edu.ph" />
          </Field>
          <Field label="Position">
            <input className="input" value={aa.title} onChange={(e) => setAa({ ...aa, title: e.target.value })} />
          </Field>
          <Field label="Unit">
            <UnitSelect label="Unit" value={aa.unitId} onChange={(id) => setAa({ ...aa, unitId: id })} filter={(u) => u.status === "Active"} />
          </Field>
        </div>
      )}
      <Field label="Reason">
        <textarea className="textarea" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Approvers read this first" />
      </Field>
    </Sheet>
  );
}
