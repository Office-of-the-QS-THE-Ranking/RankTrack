"use client";

import { useEffect, useState } from "react";
import type { CycleConfig, FeatureFlag, NotificationTemplate } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { UnitSelect } from "../parts";
import { Block, Field, Hint, Pill, ReadOnly, Sheet, StatusPill, Switch, Tabs, plural, useAct, useConsole } from "../ui";

type Tab = "Rankings" | "Calendar" | "Workspace" | "Notifications" | "Features";

const TYPES = ["PDF", "XLSX", "XLS", "CSV", "DOCX", "DOC", "PPTX", "PNG", "JPG", "JPEG", "ZIP", "TXT"];

export function Config() {
  const { data } = useConsole();
  const [tab, setTab] = useState<Tab>("Rankings");
  const edit = viewerCan(data.viewer, "config", "edit");
  return (
    <div className="adm-stack">
      <Tabs label="System configuration" value={tab} onChange={setTab} tabs={["Rankings", "Calendar", "Workspace", "Notifications", "Features"] as const} />
      {!edit && <ReadOnly>View only.</ReadOnly>}
      {tab === "Rankings" && <Bodies />}
      {tab === "Calendar" && <Calendar />}
      {tab === "Workspace" && (
        <div className="adm-cols">
          <Uploads />
          <Dashboard />
        </div>
      )}
      {tab === "Notifications" && (
        <div className="adm-stack adm-stack--tight">
          <Notice />
          <Templates />
        </div>
      )}
      {tab === "Features" && (
        <div className="adm-stack adm-stack--tight">
          <Features />
          <Flags />
        </div>
      )}
    </div>
  );
}

function SaveRow({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset?: () => void }) {
  if (!dirty) return null;
  return (
    <div className="adm-actions">
      {onReset && (
        <button type="button" className="btn btn--sm" onClick={onReset}>
          Discard
        </button>
      )}
      <button type="button" className="btn btn--sm btn--dark" onClick={onSave}>
        Save
      </button>
    </div>
  );
}

/* ---------- Rankings ---------- */

function Bodies() {
  const { data } = useConsole();
  const act = useAct();
  const c = data.config!;
  const edit = viewerCan(data.viewer, "config", "edit");
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState({ name: "", short: "", website: "https://" });
  return (
    <div className="adm-stack adm-stack--tight">
      <div className="adm-toolbar">
        <span className="adm-titlerow adm-count">
          {c.bodies.filter((b) => b.enabled).length} of {plural(c.bodies.length, "ranking body", "ranking bodies")} on
          <Hint text="Switching a body off hides its rankings everywhere: workspaces, website and reports. Nothing is deleted." />
        </span>
        <span className="adm-toolbar__spacer" />
        {viewerCan(data.viewer, "config", "manage") && (
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> Add body
          </button>
        )}
      </div>
      {c.bodies.map((b) => {
        const rankings = c.rankingMeta.filter((r) => r.body === b.key);
        return (
          <Block key={b.key} title={b.name} actions={<Switch checked={b.enabled} disabled={!edit} label={`${b.name} ${b.enabled ? "on" : "off"}`} onChange={(v) => void act({ type: "config.body", key: b.key, enabled: v })} />}>
            {rankings.length ? (
              <div className="adm-table-wrap">
                <table className="adm-table adm-table--compact">
                  <thead>
                    <tr>
                      <th>Ranking</th>
                      <th>Tracked</th>
                      <th>On website</th>
                      <th>Data due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.map((r) => {
                      const rc = c.rankings.find((x) => x.slug === r.slug)!;
                      return (
                        <tr key={r.slug} className={!b.enabled ? "is-muted" : undefined}>
                          <td title={r.name}>
                            <b>{r.short}</b>
                          </td>
                          <td>
                            <Switch checked={rc.enabled} disabled={!edit || !b.enabled} label={`Track ${r.short}`} onChange={(v) => void act({ type: "config.ranking", slug: r.slug, enabled: v })} />
                          </td>
                          <td>
                            <Switch checked={rc.public} disabled={!edit || !b.enabled || !rc.enabled} label={`Show ${r.short} on the website`} onChange={(v) => void act({ type: "config.ranking", slug: r.slug, public: v })} />
                          </td>
                          <td>
                            <input
                              className="input input--sm"
                              type="date"
                              disabled={!edit}
                              defaultValue={rc.deadline}
                              aria-label={`${r.short} data due`}
                              onBlur={(e) => e.target.value !== rc.deadline && void act({ type: "config.ranking", slug: r.slug, deadline: e.target.value })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="adm-note">No rankings set up yet.</p>
            )}
          </Block>
        );
      })}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a ranking body"
        sub="It starts switched off."
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={add.name.trim().length < 2 || !add.short.trim()}
              onClick={async () => {
                const r = await act({ type: "config.bodyAdd", ...add });
                if (r.ok) {
                  setAdd({ name: "", short: "", website: "https://" });
                  setAdding(false);
                }
              }}
            >
              Add
            </button>
          </>
        }
      >
        <div className="adm-form-grid">
          <Field label="Name">
            <input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="Nature Index" />
          </Field>
          <Field label="Short name">
            <input className="input" value={add.short} onChange={(e) => setAdd({ ...add, short: e.target.value })} placeholder="Nature" />
          </Field>
          <Field label="Website" wide>
            <input className="input" value={add.website} onChange={(e) => setAdd({ ...add, website: e.target.value })} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}

/* ---------- Calendar ---------- */

function AddRow({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (value: string) => Promise<boolean> }) {
  const [v, setV] = useState("");
  return (
    <span className="adm-inline">
      <input className="input input--sm" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={label} />
      <button
        type="button"
        className="btn btn--sm"
        disabled={!v.trim()}
        onClick={async () => {
          if (await onAdd(v.trim())) setV("");
        }}
      >
        Add
      </button>
    </span>
  );
}

function Calendar() {
  const { data } = useConsole();
  const act = useAct();
  const c = data.config!;
  const edit = viewerCan(data.viewer, "config", "edit");
  const [p, setP] = useState({ label: "", note: "" });
  return (
    <div className="adm-cols">
      <Block title="Reporting cycles">
        <ul className="adm-rowlist">
          {c.cycles.map((cy) => (
            <li key={cy.id}>
              <b className="num">{cy.id}</b>
              {edit ? (
                <select className="select select--sm" value={cy.status} aria-label={`Status of cycle ${cy.id}`} onChange={(e) => void act({ type: "config.cycle", id: cy.id, status: e.target.value as CycleConfig["status"] })}>
                  {(["Current", "Open", "Closed", "Archived"] as const).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <StatusPill value={cy.status} />
              )}
            </li>
          ))}
        </ul>
        {edit && <AddRow label="New cycle" placeholder="2027–2028" onAdd={async (id) => (await act({ type: "config.cycleAdd", id })).ok} />}
      </Block>
      <Block title="Academic years">
        <ul className="adm-rowlist">
          {c.academicYears.map((y) => (
            <li key={y.id}>
              <b className="num">{y.id}</b>
              {y.current ? (
                <Pill tone="ok">Current</Pill>
              ) : (
                edit && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void act({ type: "config.year", id: y.id })}>
                    Make current
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
        {edit && <AddRow label="New academic year" placeholder="2027–2028" onAdd={async (id) => (await act({ type: "config.yearAdd", id })).ok} />}
      </Block>
      <Block
        title={
          <>
            Reporting periods <Hint text="Only open periods can be picked when submitting evidence." />
          </>
        }
      >
        <ul className="adm-rowlist">
          {c.periods.map((x) => (
            <li key={x.id}>
              <span>
                <b>{x.label}</b>
                <small className="adm-muted block">{x.note}</small>
              </span>
              <Switch checked={x.accepting} disabled={!edit} label={`${x.label} ${x.accepting ? "open" : "closed"}`} onChange={(v) => void act({ type: "config.period", id: x.id, accepting: v })} />
            </li>
          ))}
        </ul>
        {edit && (
          <span className="adm-inline adm-inline--wrap">
            <input className="input input--sm" value={p.label} onChange={(e) => setP({ ...p, label: e.target.value })} placeholder="Calendar year 2026" aria-label="Period name" />
            <input className="input input--sm" value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} placeholder="Used by (e.g. THE Impact)" aria-label="Used by" />
            <button
              type="button"
              className="btn btn--sm"
              disabled={!p.label.trim()}
              onClick={async () => {
                const r = await act({ type: "config.periodAdd", ...p });
                if (r.ok) setP({ label: "", note: "" });
              }}
            >
              Add
            </button>
          </span>
        )}
      </Block>
    </div>
  );
}

/* ---------- Workspace: uploads and dashboards ---------- */

function Uploads() {
  const { data } = useConsole();
  const act = useAct();
  const c = data.config!;
  const edit = viewerCan(data.viewer, "config", "edit");
  const [u, setU] = useState(c.uploads);
  useEffect(() => setU(c.uploads), [c.uploads]);
  return (
    <Block title="Uploads">
      <div className="adm-form-grid">
        <Field label="Largest file (MB)">
          <input className="input num" type="number" min={1} max={200} disabled={!edit} value={u.maxFileMB} onChange={(e) => setU({ ...u, maxFileMB: Number(e.target.value) })} />
        </Field>
        <Field label="Files per submission">
          <input className="input num" type="number" min={1} max={50} disabled={!edit} value={u.maxFiles} onChange={(e) => setU({ ...u, maxFiles: Number(e.target.value) })} />
        </Field>
      </div>
      <fieldset className="adm-checks">
        <legend className="adm-field__label">File types</legend>
        {TYPES.map((t) => (
          <label key={t} className="choice choice--inline">
            <input type="checkbox" disabled={!edit} checked={u.types.includes(t)} onChange={(e) => setU({ ...u, types: e.target.checked ? [...u.types, t] : u.types.filter((x) => x !== t) })} />
            {t}
          </label>
        ))}
      </fieldset>
      <SaveRow dirty={JSON.stringify(u) !== JSON.stringify(c.uploads)} onReset={() => setU(c.uploads)} onSave={() => void act({ type: "config.uploads", value: u })} />
    </Block>
  );
}

function Dashboard() {
  const { data } = useConsole();
  const act = useAct();
  const c = data.config!;
  const edit = viewerCan(data.viewer, "config", "edit");
  const [d, setD] = useState(c.dashboard);
  useEffect(() => setD(c.dashboard), [c.dashboard]);
  return (
    <Block title="Dashboards">
      <Field label="Office dashboard opens on">
        <select className="select" disabled={!edit} value={d.officeView} onChange={(e) => setD({ ...d, officeView: e.target.value as typeof d.officeView })}>
          <option value="submissions">Submissions</option>
          <option value="rankings">Rankings</option>
        </select>
      </Field>
      <Field label="Flag deadlines this many days ahead">
        <input className="input num" type="number" min={3} max={90} disabled={!edit} value={d.deadlineWarningDays} onChange={(e) => setD({ ...d, deadlineWarningDays: Number(e.target.value) })} />
      </Field>
      <div className="adm-switchrow">
        <span>
          <b>Show date and time</b>
        </span>
        <Switch checked={d.showClock} disabled={!edit} label="Show date and time" onChange={(v) => setD({ ...d, showClock: v })} />
      </div>
      <SaveRow dirty={JSON.stringify(d) !== JSON.stringify(c.dashboard)} onReset={() => setD(c.dashboard)} onSave={() => void act({ type: "config.dashboard", value: d })} />
    </Block>
  );
}

/* ---------- Notifications ---------- */

const SAMPLE: Record<string, string> = {
  name: "Dr. J. Santiago",
  inviter: "Engr. Nestor R. Ong",
  unit: "Faculty of Engineering",
  role: "Data Contributor",
  title: "Flood-resilience design studio",
  comment: "Please attach the barangay resolution.",
  count: "3",
  decision: "approved",
  approver: "Engr. Rodablas P. Nicolas",
  ranking: "UI GreenMetric",
  days: "10",
  open: "2",
  reason: "Five failed sign-ins.",
};
const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => SAMPLE[k] ?? `{${k}}`);

function Templates() {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "config", "edit");
  const [sel, setSel] = useState<NotificationTemplate | null>(null);
  const [f, setF] = useState({ subject: "", body: "" });
  useEffect(() => {
    if (sel) setF({ subject: sel.subject, body: sel.body });
  }, [sel]);
  return (
    <Block title="Messages" flush>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Message</th>
              <th>Sent when</th>
              <th>
                <span className="sr-only">On</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.config!.templates.map((t) => (
              <tr key={t.id} className="is-clickable" onClick={() => setSel(t)}>
                <td>
                  <b>{t.name}</b>
                  <small className="adm-muted block">{t.channel}</small>
                </td>
                <td className="adm-muted">{t.event}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <Switch checked={t.enabled} disabled={!edit} label={`${t.name} ${t.enabled ? "on" : "off"}`} onChange={(v) => void act({ type: "config.template", id: t.id, enabled: v })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel?.name ?? ""}
        sub={sel ? `${sel.event} · ${sel.channel}` : undefined}
        footer={
          edit && (
            <>
              <button type="button" className="btn" onClick={() => setSel(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--dark"
                onClick={async () => {
                  const r = await act({ type: "config.template", id: sel!.id, ...f });
                  if (r.ok) setSel(null);
                }}
              >
                Save
              </button>
            </>
          )
        }
      >
        <Field label="Subject">
          <input className="input" value={f.subject} disabled={!edit} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        </Field>
        <Field
          label={
            <>
              Message <Hint text="Words in {braces} are filled in when the message is sent." />
            </>
          }
        >
          <textarea className="textarea" value={f.body} disabled={!edit} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div className="adm-mail" aria-label="Preview">
          <b>{fill(f.subject)}</b>
          <p>{fill(f.body)}</p>
        </div>
      </Sheet>
    </Block>
  );
}

function Notice() {
  const { data } = useConsole();
  const act = useAct();
  const s = data.config!.site;
  const edit = viewerCan(data.viewer, "config", "edit");
  const [text, setText] = useState(s.notice);
  useEffect(() => setText(s.notice), [s.notice]);
  return (
    <Block
      title={
        <>
          Site notice <Hint text="A short banner across the website and both workspaces, for maintenance or deadline changes." />
        </>
      }
      actions={<Switch checked={s.noticeOn} disabled={!edit || (!s.notice && !text)} label="Show the notice" onChange={(v) => void act({ type: "config.site", notice: text, noticeOn: v })} />}
    >
      <textarea className="textarea" disabled={!edit} value={text} maxLength={240} onChange={(e) => setText(e.target.value)} placeholder="The Hub will be read-only on 30 October, 18:00 to 20:00, for maintenance." aria-label="Notice text" />
      <SaveRow dirty={text !== s.notice} onReset={() => setText(s.notice)} onSave={() => void act({ type: "config.site", notice: text })} />
    </Block>
  );
}

/* ---------- Features ---------- */

function Features() {
  const { data } = useConsole();
  const act = useAct();
  const c = data.config!;
  const edit = viewerCan(data.viewer, "config", "edit");
  const areas = [...new Set(c.features.map((f) => f.area))];
  return (
    <div className="adm-cols">
      {areas.map((a) => (
        <Block key={a} title={a}>
          <ul className="adm-rowlist">
            {c.features
              .filter((f) => f.area === a)
              .map((f) => (
                <li key={f.id}>
                  <span className="adm-titlerow">
                    <b>{f.name}</b>
                    <Hint text={f.description} />
                  </span>
                  <Switch checked={f.enabled} disabled={!edit} label={`${f.name} ${f.enabled ? "on" : "off"}`} onChange={(v) => void act({ type: "config.feature", id: f.id, enabled: v })} />
                </li>
              ))}
          </ul>
        </Block>
      ))}
    </div>
  );
}

function Flags() {
  const { data } = useConsole();
  return (
    <Block
      title={
        <>
          Early access <Hint text="Turn a new feature on for selected units or people before everyone. A unit includes everything beneath it." />
        </>
      }
    >
      <ul className="adm-rowlist adm-rowlist--loose">
        {data.config!.flags.map((f) => (
          <FlagEditor key={f.id} f={f} />
        ))}
      </ul>
    </Block>
  );
}

function FlagEditor({ f }: { f: FeatureFlag }) {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "config", "edit");
  const [mode, setMode] = useState(f.mode);
  const [units, setUnits] = useState(f.units);
  const [accounts, setAccounts] = useState(f.accounts);
  useEffect(() => {
    setMode(f.mode);
    setUnits(f.units);
    setAccounts(f.accounts);
  }, [f]);
  const dirty = mode !== f.mode || units.join() !== f.units.join() || accounts.join() !== f.accounts.join();
  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? id;
  const person = (id: string) => data.people.find((p) => p.id === id)?.name ?? id;
  return (
    <li className="adm-flag">
      <div className="adm-flag__head">
        <span className="adm-titlerow">
          <Icon name="flask" size={15} />
          <b>{f.name}</b>
          <Hint text={f.description} />
        </span>
        <select className="select select--sm" disabled={!edit} value={mode} aria-label={`${f.name}: who sees it`} onChange={(e) => setMode(e.target.value as FeatureFlag["mode"])}>
          <option value="Off">Off</option>
          <option value="Selected">Selected units and people</option>
          <option value="Everyone">Everyone</option>
        </select>
      </div>
      {mode === "Selected" && (
        <div className="adm-form-grid">
          <Field label="Units">
            <div className="adm-chips">
              {units.map((u) => (
                <span key={u} className="adm-chip">
                  {unitName(u)}
                  {edit && (
                    <button type="button" aria-label={`Remove ${unitName(u)}`} onClick={() => setUnits(units.filter((x) => x !== u))}>
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {edit && <UnitSelect label="Add a unit" value="" placeholder="Add a unit…" filter={(u) => u.status === "Active" && !units.includes(u.id)} onChange={(id) => id && setUnits([...units, id])} />}
          </Field>
          <Field label="People">
            <div className="adm-chips">
              {accounts.map((a) => (
                <span key={a} className="adm-chip">
                  {person(a)}
                  {edit && (
                    <button type="button" aria-label={`Remove ${person(a)}`} onClick={() => setAccounts(accounts.filter((x) => x !== a))}>
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {edit && (
              <select className="select" value="" aria-label="Add a person" onChange={(e) => e.target.value && setAccounts([...accounts, e.target.value])}>
                <option value="">Add a person…</option>
                {data.people
                  .filter((p) => p.status === "Active" && !accounts.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
        </div>
      )}
      <SaveRow
        dirty={dirty}
        onReset={() => {
          setMode(f.mode);
          setUnits(f.units);
          setAccounts(f.accounts);
        }}
        onSave={() => void act({ type: "config.flag", id: f.id, mode, units, accounts })}
      />
    </li>
  );
}
