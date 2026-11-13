"use client";

import { closeModal } from "@/components/ui/modal-motion";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GUEST_DAYS, checkDomains } from "@/lib/governance/access-requests";
import { ROLE } from "@/lib/governance/catalog";
import type { RequestRow } from "@/lib/governance/console-types";
import { trackRequest, trackStatus } from "@/lib/governance/request-tracker";
import { invitationUnitMatchesRole } from "@/lib/governance/invitation";
import { UNIVERSITY, roleScope, unitScope } from "@/lib/governance/rbac";
import type { Applicant, RequestPayload, RoleId, WorkflowKey } from "@/lib/governance/types";
import { stepOn } from "@/lib/governance/workflow-steps";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { UnitSelect } from "../parts";
import { TabPanel } from "@/components/ui/interactive";
import { Avatar, EmptyNote, Field, Hint, KV, Pill, SearchField, Sheet, StatusPill, Tabs, fmtAgo, fmtDate, useAct, useConsole } from "../ui";
import { Route } from "./PipelineStudio";
import { WF_META, WorkflowStudio } from "./WorkflowStudio";
import { InformationStudio } from "./InformationStudio";
import { scopeText } from "./Accounts";
import { DateField, Select } from "@/components/ui/pickers";

/*
 * Command & Control › Process Pipelines. Workflow: who approves each kind of request, and what an approval changes.
 * Information: how data is extracted, transformed and loaded, from the units to the analytics engine, the dashboards
 * and the public website. Then the requests themselves: those waiting for the viewer, and all of them.
 */
type Tab = "Workflow" | "Information" | "Inbox" | "All";

export function ProcessPipelines() {
  const { data } = useConsole();
  const waiting = data.requests.filter((r) => r.canDecide);
  const [tab, setTab] = useState<Tab>("Workflow");
  // The workflow an Information stage opened (who decides it), shown first on the Workflow tab.
  const [workflow, setWorkflow] = useState<WorkflowKey | undefined>();
  const [onlyMine, setOnlyMine] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const tabs = ["Workflow", "Information", "Inbox", "All"] as const;
  const q = query.trim().toLowerCase();
  const list = (tab === "Inbox" ? waiting : onlyMine ? data.requests.filter((r) => r.mine) : data.requests).filter(
    (r) => !q || [r.title, r.requesterName, r.id, r.workflowName].some((x) => x.toLowerCase().includes(q)),
  );
  const current = data.requests.find((r) => r.id === open) ?? null;
  const requests = tab === "Inbox" || tab === "All";
  return (
    <div className="cmd-stack">
      <Tabs
        label="Process pipelines"
        idBase="pipelines"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "Workflow", label: "Workflow" },
          { key: "Information", label: "Information" },
          { key: "Inbox", label: "Waiting for you", count: waiting.length || undefined, countTone: "alert" },
          { key: "All", label: "All requests", count: data.requests.length || undefined },
        ]}
        actions={
          requests && (
            <>
              {tab === "All" && (
                <button type="button" className="btn content-tabs__action" aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>
                  <Icon name={onlyMine ? "check" : "user"} size={14} /> Only mine
                </button>
              )}
              <button type="button" className="btn content-tabs__action" onClick={() => setAsking(true)}>
                <Icon name="plus" size={14} /> New request
              </button>
            </>
          )
        }
        search={requests && <SearchField value={query} onChange={setQuery} placeholder="Search requests" label="Search requests" examples={["RQ-0012", "Account access", "A requester's name"]} shortcuts />}
      />
      <TabPanel idBase="pipelines" index={tabs.indexOf(tab)}>
        {requests &&
          (list.length ? (
            <ul className="pp-reqs">
              {list.map((r) => (
                <li key={r.id}>
                  <RequestRowButton r={r} showTurn={tab === "All"} onOpen={() => setOpen(r.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote icon="inbox" title={q ? "No requests match" : tab === "Inbox" ? "Nothing waiting for you" : "No requests"} />
          ))}
        {tab === "Workflow" && <WorkflowStudio key={workflow ?? ""} start={workflow} />}
        {tab === "Information" && (
          <InformationStudio
            onWorkflow={(key) => {
              setWorkflow(key);
              setTab("Workflow");
            }}
          />
        )}
      </TabPanel>
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

/** The steps a request goes through: those switched on, and any it was already decided at. */
const shownSteps = (r: RequestRow) => r.steps.map((s, i) => ({ s, i })).filter(({ s, i }) => stepOn(s) || r.decisions.some((d) => d.step === i) || (r.status === "Pending" && r.step === i));

/** One request in the list: what it is, who asked, and how far along its route it has got. */
function RequestRowButton({ r, showTurn, onOpen }: { r: RequestRow; showTurn: boolean; onOpen: () => void }) {
  const { data } = useConsole();
  const steps = shownSteps(r);
  const state = (i: number) => {
    const d = r.decisions.find((x) => x.step === i);
    if (d) return d.decision === "Approved" ? "done" : "stopped";
    if (r.status === "Approved") return "done";
    return r.status === "Pending" && r.step === i ? "now" : "next";
  };
  const where =
    r.status === "Pending"
      ? r.stepName
      : r.status === "Approved"
        ? "Applied"
        : r.status === "Rejected"
          ? `Stopped at ${r.steps[r.decisions.find((d) => d.decision === "Rejected")?.step ?? r.step]?.name ?? "a step"}`
          : "Withdrawn";
  return (
    <button type="button" className="pp-req" onClick={onOpen} data-status={r.status}>
      <span className="pp-req__icon" aria-hidden="true">
        <Icon name={WF_META[r.workflowId]?.icon ?? "workflow"} size={16} />
      </span>
      <span className="pp-req__main">
        <b>{r.title}</b>
        <small>
          {r.requesterName} · {fmtAgo(r.requestedAt, data.now)} · <span className="num">{r.id}</span>
        </small>
      </span>
      <span className="pp-req__route">
        <Route
          marks={[
            { k: "request", s: "done" },
            ...steps.map(({ i }) => ({ k: "approver" as const, s: state(i) as "done" | "now" | "next" | "stopped" })),
            { k: "applied", s: r.status === "Approved" ? "done" : r.status === "Pending" ? "next" : "stopped" },
          ]}
        />
        <small>
          {where}
          {r.overdue && <em>Overdue</em>}
        </small>
      </span>
      <span className="pp-req__end">
        {showTurn && r.canDecide && <Pill tone="gold">Your turn</Pill>}
        <StatusPill value={requestStatus(r, data)} />
      </span>
    </button>
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
      <span key="d" className="cmd-inline">
        <span>{email}</span>
        {verdict}
        {c.email === "mismatch" && <small className="cmd-muted">{who} uses {c.expected.join(" or ")}</small>}
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
      <span key="w" className="cmd-inline">
        <span className="cmd-url">
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
                    // Students belong to no College/Faculty or Office.
                    ...(p.roleId === ROLE.student ? [] : [["Office or College/Faculty", a.unitId ? unit(a.unitId) : "Not given"]]),
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
      return [["For", person(p.accountId)], ["Role", role(p.roleId)], ["Scope", scopeText(p.scope, data, p.roleId)], ["Ends", p.expires ? fmtDate(p.expires) : "No end date"]];
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
    <section className="cmd-track" aria-label="Submission Tracker">
      <ol className="cmd-track__list">
        {track.stages.map((s, i) => {
          const by = actor(s.key);
          return (
            <li
              key={s.key}
              className={`is-${s.state}`}
              data-on={track.stages[i + 1] && track.stages[i + 1].state !== "upcoming" ? "" : undefined}
              aria-current={s.state === "current" ? "step" : undefined}
            >
              <span className="cmd-track__dot" aria-hidden="true">
                {s.state === "done" ? <Icon name="check" size={13} strokeWidth={2.8} /> : s.state === "stopped" ? <Icon name="close" size={13} strokeWidth={2.8} /> : i + 1}
              </span>
              <div className="cmd-track__card">
                <div className="cmd-track__head">
                  <b>{s.label}</b>
                  {s.state === "current" ? (
                    <span className="cmd-track__now">Now</span>
                  ) : (
                    s.at && <time dateTime={s.at} title={`${fmtDate(s.at, true)} PHT`}>{fmtAgo(s.at, data.now)}</time>
                  )}
                </div>
                {(s.at || by) && (
                  <div className="cmd-track__meta">
                    {s.at && <span>{fmtDate(s.at, true)}</span>}
                    {by && (
                      <span className="cmd-track__who">
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
  // Students belong to no unit: the Office keeps their accounts.
  const needsUnit = r.payload.kind === "account-access" && !r.payload.unitId && r.payload.roleId !== ROLE.student && r.step === r.steps.length - 1;
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={account ? (
        <span className="cmd-inline">
          <span>{applicantName ?? r.title}</span>
          <StatusPill value={requestStatus(r, data)} />
        </span>
      ) : r.title}
      sub={
        !account && <span className="cmd-inline">
          <StatusPill value={r.status} />
          <span className="cmd-muted small">{r.workflowName}</span>
        </span>
      }
      headerContent={account && (
        <div className="cmd-sheet__tabs">
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
            <span className="cmd-toolbar__spacer" />
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
      {!account && <ol className="cmd-steps" aria-label="Approval steps">
        {shownSteps(r).map(({ s, i }) => {
          const d = r.decisions.find((x) => x.step === i);
          const state = d ? (d.decision === "Approved" ? "done" : "rejected") : r.status === "Pending" && i === r.step ? "now" : "next";
          return (
            <li key={i} className={`is-${state}`}>
              <span className="cmd-steps__dot" aria-hidden="true">
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
      {!account && r.status === "Pending" && !r.canDecide && r.blocked && <p className="cmd-note">{r.blocked}</p>}
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
          <button type="button" className="btn" onClick={(event) => closeModal(event.currentTarget.closest<HTMLElement>(".cmd-sheet"), onClose)}>
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
        <div className="cmd-form-grid">
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
        <div className="cmd-form-grid">
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
        <div className="cmd-form-grid">
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
