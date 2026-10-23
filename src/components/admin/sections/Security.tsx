"use client";

import { useEffect, useState } from "react";
import type { AccessReview, Classification, Incident, PrivacyAssessment, SecurityPolicy, SubjectRequest } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { Block, EmptyNote, Field, Hint, KV, Pill, ReadOnly, Sheet, StatusPill, Switch, Tabs, fmtAgo, fmtDate, plural, useAct, useConsole } from "../ui";

type Tab = "Sign-in" | "Access reviews" | "Privacy" | "Alerts" | "Protection";

const COMPLIANCE =
  "These settings support University policy and the Data Privacy Act of 2012 (RA 10173). No single setting guarantees compliance: confirm procedures with the Data Protection Officer.";

export function Security() {
  const { data, focus } = useConsole();
  const sec = data.security!;
  const [tab, setTab] = useState<Tab>(focus === "alerts" ? "Alerts" : focus === "keys" ? "Protection" : focus === "reviews" ? "Access reviews" : "Sign-in");
  const alerts = sec.alerts.filter((a) => a.status === "Open").length + sec.incidents.filter((i) => i.status !== "Closed").length;
  return (
    <div className="adm-stack">
      <Tabs
        label="Privacy and security"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "Sign-in", label: "Sign-in" },
          { key: "Access reviews", label: "Access reviews" },
          { key: "Privacy", label: "Privacy" },
          { key: "Alerts", label: <>Alerts and incidents {alerts > 0 && <span className="adm-tabs__count is-alert">{alerts}</span>}</> },
          { key: "Protection", label: "Data protection" },
        ]}
      />
      {!viewerCan(data.viewer, "security", "edit") && <ReadOnly>View only.</ReadOnly>}
      {tab === "Sign-in" && <SignIn sec={sec} />}
      {tab === "Access reviews" && <Reviews sec={sec} />}
      {tab === "Privacy" && <Privacy sec={sec} />}
      {tab === "Alerts" && (
        <div className="adm-stack adm-stack--tight">
          <Alerts sec={sec} />
          <Incidents sec={sec} />
        </div>
      )}
      {tab === "Protection" && <Protection sec={sec} />}
    </div>
  );
}

function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <div className="adm-actions">
      <button type="button" className="btn btn--sm" onClick={onReset}>
        Discard
      </button>
      <button type="button" className="btn btn--sm btn--dark" onClick={onSave}>
        Save
      </button>
    </div>
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- Sign-in ---------- */

function SignIn({ sec }: { sec: SecurityPolicy }) {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "security", "edit");
  const manage = viewerCan(data.viewer, "security", "manage");
  const [mfa, setMfa] = useState(sec.mfa);
  const [sso, setSso] = useState(sec.sso);
  const [domain, setDomain] = useState("");
  const [session, setSession] = useState(sec.session);
  const [lockout, setLockout] = useState(sec.lockout);
  const [idle, setIdle] = useState(sec.inactivityDays);
  useEffect(() => {
    setMfa(sec.mfa);
    setSso(sec.sso);
    setSession(sec.session);
    setLockout(sec.lockout);
    setIdle(sec.inactivityDays);
  }, [sec]);
  const gaps = (data.accounts ?? []).filter((a) => a.status === "Active" && a.mfaRequired && !a.mfa.enrolled);
  return (
    <div className="adm-cols">
      <Block title="2-step verification">
        <Field label="Required for">
          <select className="select" value={mfa.mode} disabled={!edit} onChange={(e) => setMfa({ ...mfa, mode: e.target.value as typeof mfa.mode })}>
            <option value="Everyone">Everyone</option>
            <option value="Privileged roles">Selected roles</option>
            <option value="Off" disabled={!manage}>
              Nobody (not recommended)
            </option>
          </select>
        </Field>
        {mfa.mode === "Privileged roles" && (
          <fieldset className="adm-checks">
            <legend className="adm-field__label">Roles</legend>
            {data.roles.map((r) => (
              <label key={r.id} className="choice choice--inline">
                <input type="checkbox" disabled={!edit} checked={mfa.roles.includes(r.id)} onChange={(e) => setMfa({ ...mfa, roles: e.target.checked ? [...mfa.roles, r.id] : mfa.roles.filter((x) => x !== r.id) })} />
                {r.name}
              </label>
            ))}
          </fieldset>
        )}
        <fieldset className="adm-checks">
          <legend className="adm-field__label">Methods</legend>
          {(["Authenticator app", "Security key"] as const).map((m) => (
            <label key={m} className="choice choice--inline">
              <input type="checkbox" disabled={!edit} checked={mfa.methods.includes(m)} onChange={(e) => setMfa({ ...mfa, methods: e.target.checked ? [...mfa.methods, m] : mfa.methods.filter((x) => x !== m) })} />
              {m}
            </label>
          ))}
        </fieldset>
        {gaps.length > 0 && (
          <p className="adm-note" title={gaps.map((a) => a.name).join(", ")}>
            {plural(gaps.length, "person", "people")} will set it up at their next sign-in.
          </p>
        )}
        <SaveBar dirty={!same(mfa, sec.mfa)} onReset={() => setMfa(sec.mfa)} onSave={() => void act({ type: "security.policy", section: "mfa", value: mfa })} />
      </Block>

      <Block title="Google sign-in">
        <div className="adm-switchrow">
          <span>
            <b>Google sign-in only</b>
          </span>
          <Switch checked={sso.enforced} disabled={!manage} label="Google sign-in only" onChange={(v) => setSso({ ...sso, enforced: v })} />
        </div>
        <Field label="Allowed domains">
          <div className="adm-chips">
            {sso.domains.map((d) => (
              <span key={d} className="adm-chip">
                {d}
                {manage && (
                  <button type="button" aria-label={`Remove ${d}`} onClick={() => setSso({ ...sso, domains: sso.domains.filter((x) => x !== d) })}>
                    <Icon name="close" size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {manage && (
            <span className="adm-inline">
              <input className="input input--sm" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Add a domain" aria-label="Add a domain" />
              <button
                type="button"
                className="btn btn--sm"
                disabled={!domain.trim()}
                onClick={() => {
                  setSso({ ...sso, domains: [...sso.domains, domain.trim().toLowerCase()] });
                  setDomain("");
                }}
              >
                Add
              </button>
            </span>
          )}
        </Field>
        <div className="adm-switchrow">
          <span>
            <b>Allow guests</b>
            <small>Invited outside collaborators, with an end date</small>
          </span>
          <Switch checked={sso.allowGuests} disabled={!manage} label="Allow guests" onChange={(v) => setSso({ ...sso, allowGuests: v })} />
        </div>
        <SaveBar dirty={!same(sso, sec.sso)} onReset={() => setSso(sec.sso)} onSave={() => void act({ type: "security.policy", section: "sso", value: sso })} />
      </Block>

      <Block title="Sessions">
        <div className="adm-form-grid">
          <Field label="Sign out when idle (min)">
            <input className="input num" type="number" min={5} max={240} disabled={!edit} value={session.idleMinutes} onChange={(e) => setSession({ ...session, idleMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Warn before (min)">
            <input className="input num" type="number" min={1} max={30} disabled={!edit} value={session.warnMinutes} onChange={(e) => setSession({ ...session, warnMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Longest session (hours)">
            <input className="input num" type="number" min={1} max={24} disabled={!edit} value={session.absoluteHours} onChange={(e) => setSession({ ...session, absoluteHours: Number(e.target.value) })} />
          </Field>
        </div>
        <SaveBar dirty={!same(session, sec.session)} onReset={() => setSession(sec.session)} onSave={() => void act({ type: "security.policy", section: "session", value: session })} />
      </Block>

      <Block
        title={
          <>
            Suspicious sign-ins <Hint text="Too many failed sign-ins suspend the account and raise an alert." />
          </>
        }
      >
        <div className="adm-form-grid">
          <Field label="Lock after failed tries">
            <input className="input num" type="number" min={3} max={20} disabled={!edit} value={lockout.attempts} onChange={(e) => setLockout({ ...lockout, attempts: Number(e.target.value) })} />
          </Field>
          <Field label="Within (min)">
            <input className="input num" type="number" min={5} max={120} disabled={!edit} value={lockout.windowMinutes} onChange={(e) => setLockout({ ...lockout, windowMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Flag inactive after (days)">
            <input className="input num" type="number" min={30} max={365} disabled={!edit} value={idle} onChange={(e) => setIdle(Number(e.target.value))} />
          </Field>
        </div>
        <SaveBar
          dirty={!same(lockout, sec.lockout) || idle !== sec.inactivityDays}
          onReset={() => {
            setLockout(sec.lockout);
            setIdle(sec.inactivityDays);
          }}
          onSave={async () => {
            if (!same(lockout, sec.lockout)) await act({ type: "security.policy", section: "lockout", value: lockout });
            if (idle !== sec.inactivityDays) await act({ type: "security.policy", section: "inactivityDays", value: idle });
          }}
        />
      </Block>
    </div>
  );
}

/* ---------- Access reviews ---------- */

function Reviews({ sec }: { sec: SecurityPolicy }) {
  const { data } = useConsole();
  const act = useAct();
  const [sel, setSel] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [f, setF] = useState({ name: "", population: "privileged" as "privileged" | "external" | "all", due: "" });
  const review = sec.reviews.find((r) => r.id === sel) ?? null;
  return (
    <div className="adm-stack adm-stack--tight">
      {viewerCan(data.viewer, "security", "manage") && (
        <div className="adm-toolbar">
          <span className="adm-count">Confirm who still needs access.</span>
          <span className="adm-toolbar__spacer" />
          <button type="button" className="btn btn--dark btn--sm" onClick={() => setStarting(true)}>
            <Icon name="plus" size={15} /> Start review
          </button>
        </div>
      )}
      {sec.reviews.length ? (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Review</th>
                <th>Due</th>
                <th>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sec.reviews.map((r) => {
                const done = r.accountIds.filter((a) => r.decisions[a]).length;
                return (
                  <tr key={r.id} className="is-clickable" onClick={() => setSel(r.id)}>
                    <td>
                      <b>{r.name}</b>
                      <small className="adm-muted block">{r.scope}</small>
                    </td>
                    <td className="num">{fmtDate(r.due)}</td>
                    <td>
                      <span className="adm-progress" aria-label={`${done} of ${r.accountIds.length} decided`}>
                        <span style={{ width: `${(done / Math.max(1, r.accountIds.length)) * 100}%` }} />
                      </span>
                      <small className="adm-muted num">
                        {done} of {r.accountIds.length}
                      </small>
                    </td>
                    <td>
                      <StatusPill value={r.status !== "Complete" && r.due < data.day ? "Overdue" : r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote icon="users" title="No reviews yet" />
      )}
      <ReviewSheet review={review} onClose={() => setSel(null)} />
      <Sheet
        open={starting}
        onClose={() => setStarting(false)}
        title="Start an access review"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setStarting(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={!f.name || !f.due}
              onClick={async () => {
                const r = await act({ type: "review.start", ...f });
                if (r.ok) {
                  setF({ name: "", population: "privileged", due: "" });
                  setStarting(false);
                }
              }}
            >
              Start review
            </button>
          </>
        }
      >
        <div className="adm-form-grid">
          <Field label="Name" wide>
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Q1 2027 access review" />
          </Field>
          <Field label="Who">
            <select className="select" value={f.population} onChange={(e) => setF({ ...f, population: e.target.value as typeof f.population })}>
              <option value="privileged">Admins, temporary access and guests</option>
              <option value="external">Guests only</option>
              <option value="all">Everyone active</option>
            </select>
          </Field>
          <Field label="Due">
            <input className="input" type="date" min={data.day} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}

function ReviewSheet({ review: r, onClose }: { review: AccessReview | null; onClose: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  if (!r) return null;
  const open = r.status !== "Complete";
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={r.name}
      sub={`Due ${fmtDate(r.due)} · reviewer ${data.people.find((p) => p.id === r.reviewerId)?.name ?? "—"}`}
      footer={
        open &&
        viewerCan(data.viewer, "security", "manage") && (
          <>
            <span className="adm-count">Revoked accounts are suspended when you finish.</span>
            <button type="button" className="btn btn--dark" onClick={() => void act({ type: "review.complete", id: r.id })}>
              Finish review
            </button>
          </>
        )
      }
    >
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Last sign-in</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {r.accountIds.map((id) => {
              const a = data.accounts?.find((x) => x.id === id);
              const d = r.decisions[id];
              return (
                <tr key={id}>
                  <td>
                    <b>{a?.name ?? id}</b>
                    <small className="adm-muted block">{a?.roleNames.join(", ")}</small>
                  </td>
                  <td className="adm-muted num">{fmtAgo(a?.lastLogin, data.now)}</td>
                  <td>
                    {open && viewerCan(data.viewer, "security", "edit") && id !== data.viewer.id ? (
                      <span className="adm-inline">
                        <button type="button" className={`btn btn--sm${d === "Keep" ? " btn--dark" : ""}`} aria-pressed={d === "Keep"} onClick={() => void act({ type: "review.decide", id: r.id, accountId: id, decision: "Keep" }, true)}>
                          Keep
                        </button>
                        <button type="button" className={`btn btn--sm${d === "Revoke" ? " btn--danger" : ""}`} aria-pressed={d === "Revoke"} onClick={() => void act({ type: "review.decide", id: r.id, accountId: id, decision: "Revoke" }, true)}>
                          Revoke
                        </button>
                      </span>
                    ) : d ? (
                      <Pill tone={d === "Keep" ? "ok" : "danger"}>{d}</Pill>
                    ) : (
                      <Pill>{id === data.viewer.id ? "Someone else decides" : "Undecided"}</Pill>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}

/* ---------- Privacy ---------- */

function Privacy({ sec }: { sec: SecurityPolicy }) {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "security", "edit");
  const [p, setP] = useState(sec.privacy);
  const [pia, setPia] = useState<(Partial<PrivacyAssessment> & { name: string }) | null>(null);
  const [logging, setLogging] = useState(false);
  const [dsr, setDsr] = useState({ type: "Access" as SubjectRequest["type"], subject: "", received: data.day });
  useEffect(() => setP(sec.privacy), [sec.privacy]);
  return (
    <div className="adm-stack adm-stack--tight">
      <Block
        title={
          <>
            Privacy contact <Hint text={COMPLIANCE} label="Compliance" />
          </>
        }
      >
        <div className="adm-form-grid">
          <Field label="Contact">
            <input className="input" disabled={!edit} value={p.officer} onChange={(e) => setP({ ...p, officer: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" disabled={!edit} value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
          </Field>
          <Field label="Privacy notice updated">
            <input className="input" type="date" disabled={!edit} value={p.noticeUpdated} onChange={(e) => setP({ ...p, noticeUpdated: e.target.value })} />
          </Field>
          <Field
            label={
              <>
                Report breaches within (hours) <Hint text="72 hours supports the National Privacy Commission's notification timeline." />
              </>
            }
          >
            <input className="input num" type="number" min={1} max={72} disabled={!edit} value={p.breachHours} onChange={(e) => setP({ ...p, breachHours: Number(e.target.value) })} />
          </Field>
        </div>
        <SaveBar dirty={!same(p, sec.privacy)} onReset={() => setP(sec.privacy)} onSave={() => void act({ type: "security.policy", section: "privacy", value: p })} />
      </Block>

      <Block
        title="Impact assessments"
        actions={
          edit && (
            <button type="button" className="btn btn--sm" onClick={() => setPia({ name: "", datasetId: data.catalog.datasets[0].id, risk: "Medium", status: "Draft", owner: data.viewer.id, measures: "" })}>
              <Icon name="plus" size={14} /> New
            </button>
          )
        }
      >
        {sec.assessments.length ? (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Risk</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sec.assessments.map((a) => (
                  <tr key={a.id} className={edit ? "is-clickable" : undefined} onClick={() => edit && setPia(a)}>
                    <td>
                      <b>{a.name}</b>
                      <small className="adm-muted block">{data.catalog.datasets.find((d) => d.id === a.datasetId)?.name}</small>
                    </td>
                    <td>
                      <StatusPill value={a.risk} />
                    </td>
                    <td>
                      <StatusPill value={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyNote icon="clipboard" title="No assessments yet" />
        )}
      </Block>

      <Block
        title={
          <>
            Data subject requests <Hint text="Requests to access, correct, erase, object to or move personal data. Respond within 30 days." />
          </>
        }
        actions={
          edit && (
            <button type="button" className="btn btn--sm" onClick={() => setLogging(true)}>
              <Icon name="plus" size={14} /> Log request
            </button>
          )
        }
      >
        {sec.subjectRequests.length ? (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Respond by</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sec.subjectRequests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.type}</b>
                      <small className="adm-muted block">{r.subject}</small>
                    </td>
                    <td className="num">
                      {fmtDate(r.due)} {(r.status === "Open" || r.status === "In progress") && r.due < data.day && <Pill tone="danger">Late</Pill>}
                    </td>
                    <td>
                      {edit && (r.status === "Open" || r.status === "In progress") ? (
                        <select className="select select--sm" value={r.status} aria-label={`Status of ${r.id}`} onChange={(e) => void act({ type: "dsr.update", id: r.id, status: e.target.value as SubjectRequest["status"] })}>
                          <option>Open</option>
                          <option>In progress</option>
                          <option>Fulfilled</option>
                          <option>Declined</option>
                        </select>
                      ) : (
                        <StatusPill value={r.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyNote icon="inbox" title="No requests" />
        )}
      </Block>

      <Sheet
        open={logging}
        onClose={() => setLogging(false)}
        title="Log a data subject request"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setLogging(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={dsr.subject.trim().length < 4}
              onClick={async () => {
                const r = await act({ type: "dsr.create", request: dsr });
                if (r.ok) {
                  setDsr({ ...dsr, subject: "" });
                  setLogging(false);
                }
              }}
            >
              Log request
            </button>
          </>
        }
      >
        <div className="adm-form-grid">
          <Field label="Type">
            <select className="select" value={dsr.type} onChange={(e) => setDsr({ ...dsr, type: e.target.value as SubjectRequest["type"] })}>
              {(["Access", "Correction", "Erasure or blocking", "Objection", "Portability"] as const).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Received">
            <input className="input" type="date" max={data.day} value={dsr.received} onChange={(e) => setDsr({ ...dsr, received: e.target.value })} />
          </Field>
          <Field label="Who (describe, don't name)" wide>
            <input className="input" value={dsr.subject} onChange={(e) => setDsr({ ...dsr, subject: e.target.value })} placeholder="Alumnus, College of Nursing" />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={!!pia}
        onClose={() => setPia(null)}
        title={pia?.id ? pia.name || "Assessment" : "New impact assessment"}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setPia(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={!pia?.name.trim()}
              onClick={async () => {
                if (!pia) return;
                const r = await act({ type: "pia.save", pia: { id: pia.id, name: pia.name, datasetId: pia.datasetId!, risk: pia.risk!, status: pia.status!, owner: pia.owner ?? data.viewer.id, measures: pia.measures ?? "" } });
                if (r.ok) setPia(null);
              }}
            >
              Save
            </button>
          </>
        }
      >
        {pia && (
          <div className="adm-form-grid">
            <Field label="Name" wide>
              <input className="input" value={pia.name} onChange={(e) => setPia({ ...pia, name: e.target.value })} />
            </Field>
            <Field label="Dataset">
              <select className="select" value={pia.datasetId} onChange={(e) => setPia({ ...pia, datasetId: e.target.value })}>
                {data.catalog.datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Risk">
              <select className="select" value={pia.risk} onChange={(e) => setPia({ ...pia, risk: e.target.value as PrivacyAssessment["risk"] })}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </Field>
            <Field label="Status">
              <select className="select" value={pia.status} onChange={(e) => setPia({ ...pia, status: e.target.value as PrivacyAssessment["status"] })}>
                <option>Draft</option>
                <option>In review</option>
                <option>Approved</option>
              </select>
            </Field>
            <Field label="Safeguards" wide>
              <textarea className="textarea" value={pia.measures} onChange={(e) => setPia({ ...pia, measures: e.target.value })} placeholder="How the data is minimized, protected, shared and disposed of" />
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ---------- Alerts and incidents ---------- */

function Alerts({ sec }: { sec: SecurityPolicy }) {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "security", "edit");
  return (
    <Block title="Alerts">
      {sec.alerts.length ? (
        <ul className="adm-alerts">
          {sec.alerts.map((a) => (
            <li key={a.id} className={`is-${a.severity.toLowerCase()}${a.status === "Resolved" ? " is-resolved" : ""}`}>
              <span className="adm-alerts__sev">
                <StatusPill value={a.severity} />
              </span>
              <div className="adm-alerts__main">
                <b>{a.kind}</b>
                <p>{a.detail}</p>
                <small className="adm-muted">
                  {fmtAgo(a.at, data.now)}
                  {a.accountId ? ` · ${data.people.find((p) => p.id === a.accountId)?.name ?? a.accountId}` : ""}
                </small>
              </div>
              <span className="adm-inline">
                {a.status !== "Open" && <StatusPill value={a.status} />}
                {edit && a.status === "Open" && (
                  <button type="button" className="btn btn--sm" onClick={() => void act({ type: "alert.update", id: a.id, status: "Acknowledged" })}>
                    Acknowledge
                  </button>
                )}
                {edit && a.status !== "Resolved" && (
                  <button type="button" className="btn btn--sm btn--dark" onClick={() => void act({ type: "alert.update", id: a.id, status: "Resolved" })}>
                    Resolve
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote title="No alerts" />
      )}
    </Block>
  );
}

const ESCALATE = ["University Data Protection Officer", "National Privacy Commission (through the DPO)", "University IT Services", "Office of the Secretary General"];

function Incidents({ sec }: { sec: SecurityPolicy }) {
  const { data } = useConsole();
  const act = useAct();
  const [sel, setSel] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [f, setF] = useState({ title: "", severity: "Medium" as Incident["severity"], personalData: false, note: "" });
  const inc = sec.incidents.find((i) => i.id === sel) ?? null;
  const [u, setU] = useState({ status: "Investigating" as Incident["status"], note: "", escalatedTo: "" });
  useEffect(() => {
    if (inc) setU({ status: inc.status, note: "", escalatedTo: inc.escalatedTo ?? "" });
  }, [inc]);
  const edit = viewerCan(data.viewer, "security", "edit");
  return (
    <>
      <Block
        title="Incidents"
        actions={
          <button type="button" className="btn btn--sm" onClick={() => setReporting(true)}>
            <Icon name="flag" size={14} /> Report incident
          </button>
        }
      >
        {sec.incidents.length ? (
          <ul className="adm-alerts">
            {sec.incidents.map((i) => (
              <li key={i.id} className={`is-${i.severity.toLowerCase()}${i.status === "Closed" ? " is-resolved" : ""}`}>
                <span className="adm-alerts__sev">
                  <StatusPill value={i.severity} />
                </span>
                <div className="adm-alerts__main">
                  <b>{i.title}</b>
                  <small className="adm-muted">
                    {fmtDate(i.reported)}
                    {i.personalData ? " · personal data" : ""}
                    {i.escalatedTo ? ` · escalated to ${i.escalatedTo}` : ""}
                  </small>
                </div>
                <span className="adm-inline">
                  <StatusPill value={i.status} />
                  <button type="button" className="btn btn--sm" onClick={() => setSel(i.id)}>
                    Open
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote title="No incidents" />
        )}
      </Block>

      <Sheet
        open={reporting}
        onClose={() => setReporting(false)}
        title="Report an incident"
        sub={`Personal-data incidents are escalated within ${sec.privacy.breachHours} hours.`}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setReporting(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={f.title.trim().length < 6}
              onClick={async () => {
                const r = await act({ type: "incident.report", ...f });
                if (r.ok) {
                  setF({ title: "", severity: "Medium", personalData: false, note: "" });
                  setReporting(false);
                }
              }}
            >
              Report
            </button>
          </>
        }
      >
        <div className="adm-form-grid">
          <Field label="What happened" wide>
            <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Evidence file shared through a public link" />
          </Field>
          <Field label="Severity">
            <select className="select" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Incident["severity"] })}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </Field>
          <label className="choice adm-field--check">
            <input type="checkbox" checked={f.personalData} onChange={(e) => setF({ ...f, personalData: e.target.checked })} />
            Personal data may be involved
          </label>
          <Field label="Details" wide>
            <textarea className="textarea" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="When it was found, what is affected, what was done" />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={!!inc}
        onClose={() => setSel(null)}
        title={inc?.title ?? ""}
        sub={inc ? `${inc.severity}${inc.personalData ? " · personal data" : ""} · reported by ${data.people.find((p) => p.id === inc.reporterId)?.name ?? inc.reporterId}` : undefined}
        footer={
          inc &&
          edit && (
            <button
              type="button"
              className="btn btn--dark"
              disabled={u.note.trim().length < 3}
              onClick={async () => {
                const r = await act({ type: "incident.update", id: inc.id, status: u.status, note: u.note, escalatedTo: u.escalatedTo || undefined });
                if (r.ok) setU({ ...u, note: "" });
              }}
            >
              Add update
            </button>
          )
        }
      >
        {inc && (
          <>
            <ul className="adm-timeline">
              {inc.timeline.map((t, i) => (
                <li key={i}>
                  <b>{t.note}</b>
                  <span>
                    {fmtDate(t.at, true)} · {data.people.find((p) => p.id === t.by)?.name ?? t.by}
                  </span>
                </li>
              ))}
            </ul>
            {edit && (
              <div className="adm-form-grid">
                <Field label="Status">
                  <select className="select" value={u.status} onChange={(e) => setU({ ...u, status: e.target.value as Incident["status"] })}>
                    {(["Reported", "Investigating", "Escalated", "Contained", "Closed"] as const).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Escalate to">
                  <select className="select" value={u.escalatedTo} onChange={(e) => setU({ ...u, escalatedTo: e.target.value, status: e.target.value ? "Escalated" : u.status })}>
                    <option value="">Not escalated</option>
                    {ESCALATE.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Update" wide>
                  <textarea className="textarea" value={u.note} onChange={(e) => setU({ ...u, note: e.target.value })} />
                </Field>
              </div>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}

/* ---------- Data protection: encryption, keys, exports and sharing ---------- */

function Protection({ sec }: { sec: SecurityPolicy }) {
  const { data, confirm } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "security", "edit");
  const rotate = viewerCan(data.viewer, "security", "manage") && data.viewer.technical;
  const [x, setX] = useState(sec.exports);
  const [s, setS] = useState(sec.sharing);
  useEffect(() => {
    setX(sec.exports);
    setS(sec.sharing);
  }, [sec]);
  const levels: Classification[] = ["Public", "Internal", "Confidential", "Restricted"];
  const nextRotation = (rot: string, days: number) => {
    const d = new Date(rot + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return (
    <div className="adm-stack adm-stack--tight">
      <div className="adm-cols">
        <Block title="Exports">
          <div className="adm-table-wrap">
            <table className="adm-table adm-table--compact">
              <tbody>
                {levels.map((c) => {
                  const state = x.blocked.includes(c) ? "Blocked" : x.approvalFor.includes(c) ? "Approval required" : "Allowed";
                  return (
                    <tr key={c}>
                      <td>
                        <StatusPill value={c} />
                      </td>
                      <td>
                        <select
                          className="select select--sm"
                          value={state}
                          disabled={!edit || c === "Restricted"}
                          aria-label={`Export rule for ${c}`}
                          onChange={(e) => {
                            const v = e.target.value;
                            setX({
                              ...x,
                              blocked: v === "Blocked" ? [...new Set([...x.blocked, c])] : x.blocked.filter((b) => b !== c),
                              approvalFor: v === "Approval required" ? [...new Set([...x.approvalFor, c])] : x.approvalFor.filter((b) => b !== c),
                            });
                          }}
                        >
                          <option>Allowed</option>
                          <option>Approval required</option>
                          <option>Blocked</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="adm-switchrow">
            <span>
              <b>Watermark exports</b>
              <small>Adds the person and date to anything above Public</small>
            </span>
            <Switch checked={x.watermark} disabled={!edit} label="Watermark exports" onChange={(v) => setX({ ...x, watermark: v })} />
          </div>
          <SaveBar dirty={!same(x, sec.exports)} onReset={() => setX(sec.exports)} onSave={() => void act({ type: "security.policy", section: "exports", value: x })} />
        </Block>
        <Block title="Sharing">
          <div className="adm-switchrow">
            <span>
              <b>Public links to evidence files</b>
            </span>
            <Switch checked={s.externalLinks} disabled={!edit} label="Public links to evidence files" onChange={(v) => setS({ ...s, externalLinks: v })} />
          </div>
          <div className="adm-switchrow">
            <span>
              <b>Guests can download</b>
            </span>
            <Switch checked={s.guestDownloads} disabled={!edit} label="Guests can download" onChange={(v) => setS({ ...s, guestDownloads: v })} />
          </div>
          <SaveBar dirty={!same(s, sec.sharing)} onReset={() => setS(sec.sharing)} onSave={() => void act({ type: "security.policy", section: "sharing", value: s })} />
        </Block>
      </div>

      <Block
        title={
          <>
            Encryption keys {!rotate && <Hint text="Only technical administrators can rotate keys." />}
          </>
        }
      >
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Next rotation</th>
                <th>
                  <span className="sr-only">Rotate</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sec.keys.map((k) => {
                const next = nextRotation(k.rotated, k.rotationDays);
                const late = next <= data.day;
                return (
                  <tr key={k.id}>
                    <td>
                      <b>{k.name}</b>
                      <small className="adm-muted block">
                        {k.algorithm} · rotated {fmtDate(k.rotated)}
                      </small>
                    </td>
                    <td>{late ? <Pill tone="danger">Overdue</Pill> : <span className="num">{fmtDate(next)}</span>}</td>
                    <td className="r">
                      {rotate && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={async () => {
                            const ok = await confirm({ title: `Rotate the ${k.name.toLowerCase()}?`, body: "A new key replaces the old one.", confirm: "Rotate" });
                            if (ok !== null) await act({ type: "key.rotate", id: k.id });
                          }}
                        >
                          <Icon name="refresh" size={14} /> Rotate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <KV
          rows={[
            ["At rest", sec.encryption.atRest],
            ["In transit", sec.encryption.inTransit],
            ["Secrets", sec.encryption.secretsManager],
            ["Passwords", "None stored (Google sign-in)"],
          ]}
        />
      </Block>
    </div>
  );
}
