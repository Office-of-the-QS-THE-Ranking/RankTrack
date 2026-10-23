"use client";

import { useEffect, useMemo, useState } from "react";
import type { RequestRow } from "@/lib/governance/console-types";
import { UNIVERSITY, unitScope } from "@/lib/governance/rbac";
import type { RequestPayload, WorkflowKey, WorkflowStep } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { UnitSelect } from "../parts";
import { Block, EmptyNote, Field, Hint, KV, Pill, Sheet, StatusPill, Switch, Tabs, fmtAgo, fmtDate, plural, useAct, useConsole } from "../ui";
import { scopeText } from "./Accounts";

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
          { key: "Inbox", label: <>Waiting for you {waiting.length > 0 && <span className="adm-tabs__count is-alert">{waiting.length}</span>}</> },
          { key: "All", label: <>All requests <span className="adm-tabs__count">{data.requests.length}</span></> },
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
                      <StatusPill value={r.status} />
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

function describe(p: RequestPayload, data: ReturnType<typeof useConsole>["data"]): [string, string][] {
  const person = (id: string) => data.people.find((x) => x.id === id)?.name ?? id;
  const unit = (id: string) => data.units.find((x) => x.id === id)?.name ?? id;
  const role = (id: string) => data.roles.find((x) => x.id === id)?.name ?? id;
  switch (p.kind) {
    case "account-access":
      return [["Person", `${p.name} <${p.email}>`], ["Position", p.title], ["Unit", unit(p.unitId)], ["Role", role(p.roleId)]];
    case "privilege-escalation":
      return [["For", person(p.accountId)], ["Role", role(p.roleId)], ["Scope", scopeText(p.scope, data)], ["Ends", p.expires ? fmtDate(p.expires) : "No end date"]];
    case "org-unit":
      return [["New unit", `${p.name} (${p.code})`], ["Type", p.kind2], ["Sits under", unit(p.parentId)]];
    case "data-access":
      return [["For", person(p.accountId)], ["Dataset", data.catalog.datasets.find((d) => d.id === p.datasetId)?.name ?? p.datasetId], ["Access", p.access], ["Until", fmtDate(p.until)]];
    case "publication":
      return [["Publishes", p.target === "story" ? "Impact story, on the public website" : "Report, outside the Office"], ["Title", p.title]];
    case "destructive":
      return [["Operation", p.operation === "restore" ? "Restore from a recovery point" : "Delete a recovery point"], ["Recovery point", p.snapshotId]];
  }
}

function RequestSheet({ r, onClose }: { r: RequestRow | null; onClose: () => void }) {
  const { data, confirm } = useConsole();
  const act = useAct();
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [r?.id]);
  if (!r) return null;
  const roleNames = (ids: string[]) => ids.map((id) => data.roles.find((x) => x.id === id)?.name ?? id).join(" or ");
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={r.title}
      sub={
        <span className="adm-inline">
          <StatusPill value={r.status} />
          <span className="adm-muted small">{r.workflowName}</span>
        </span>
      }
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
                <button type="button" className="btn btn--dark" onClick={() => void act({ type: "request.decide", id: r.id, decision: "Approved", note })}>
                  <Icon name="check" size={15} /> Approve
                </button>
              </>
            )}
          </>
        )
      }
    >
      <KV
        rows={[
          ["Requested by", `${r.requesterName} · ${fmtAgo(r.requestedAt, data.now)}`],
          ...(r.status === "Pending" ? [["Respond by", `${fmtDate(r.due)}${r.overdue ? " (overdue)" : ""}`] as [string, string]] : []),
          ...describe(r.payload, data),
          ["Reason", r.justification || "—"],
        ]}
      />
      <ol className="adm-steps" aria-label="Approval steps">
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
                <small className="adm-muted block">{roleNames(s.approverRoles)}</small>
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
      </ol>
      {r.status === "Pending" && !r.canDecide && r.blocked && <p className="adm-note">{r.blocked}</p>}
      {r.canDecide && (
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
        sub="Steps run in order."
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
                <fieldset className="adm-checks">
                  <legend className="adm-field__label">Who can approve</legend>
                  {data.roles.map((r) => (
                    <label key={r.id} className="choice choice--inline">
                      <input
                        type="checkbox"
                        checked={s.approverRoles.includes(r.id)}
                        onChange={(e) =>
                          setSteps(steps.map((x, k) => (k === i ? { ...x, approverRoles: e.target.checked ? [...x.approverRoles, r.id] : x.approverRoles.filter((y) => y !== r.id) } : x)))
                        }
                      />
                      {r.name}
                    </label>
                  ))}
                </fieldset>
              </Block>
            ))}
            <button type="button" className="btn btn--sm" onClick={() => setSteps([...steps, { name: "Additional approval", approverRoles: ["super-admin"] }])}>
              <Icon name="plus" size={14} /> Add step
            </button>
            <div className="adm-form-grid">
              <Field label="Respond within (days)">
                <input className="input num" type="number" min={1} max={30} value={sla} onChange={(e) => setSla(Number(e.target.value))} />
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
  const [aa, setAa] = useState({ name: "", email: "", unitId: "", roleId: "contributor", title: "" });
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
      payload = { kind, accountId: pe.accountId, roleId: pe.roleId, scope: role?.scopeKind === "university" ? UNIVERSITY : unitScope(acc?.unitId ?? v.unitId), expires: pe.expires || undefined };
    } else if (kind === "data-access") payload = { kind, accountId: v.id, datasetId: da.datasetId, access: da.access, until: da.until };
    else payload = { kind, ...aa };
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
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--dark" disabled={!ready} onClick={submit}>
            <Icon name="send" size={15} /> Send for approval
          </button>
        </>
      }
    >
      <Field label="I need">
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      {kind === "data-access" && (
        <div className="adm-form-grid">
          <Field label="Dataset" wide>
            <select className="select" value={da.datasetId} onChange={(e) => setDa({ ...da, datasetId: e.target.value })}>
              <option value="">Choose a dataset</option>
              {data.catalog.datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Access">
            <select className="select" value={da.access} onChange={(e) => setDa({ ...da, access: e.target.value as "View" | "Export" })}>
              <option>View</option>
              <option disabled={data.catalog.datasets.find((d) => d.id === da.datasetId)?.classification === "Restricted"}>Export</option>
            </select>
          </Field>
          <Field label="Until" hint="Up to 90 days">
            <input className="input" type="date" min={data.day} value={da.until} onChange={(e) => setDa({ ...da, until: e.target.value })} />
          </Field>
        </div>
      )}
      {kind === "privilege-escalation" && (
        <div className="adm-form-grid">
          <Field label="For">
            <select className="select" value={pe.accountId} onChange={(e) => setPe({ ...pe, accountId: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select className="select" value={pe.roleId} onChange={(e) => setPe({ ...pe, roleId: e.target.value })}>
              <option value="">Choose a role</option>
              {data.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ends (optional)">
            <input className="input" type="date" min={data.day} value={pe.expires} onChange={(e) => setPe({ ...pe, expires: e.target.value })} />
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
          <Field label="Role">
            <select className="select" value={aa.roleId} onChange={(e) => setAa({ ...aa, roleId: e.target.value })}>
              {data.roles
                .filter((r) => !["super-admin", "system-admin"].includes(r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      )}
      <Field label="Reason">
        <textarea className="textarea" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Approvers read this first" />
      </Field>
    </Sheet>
  );
}
