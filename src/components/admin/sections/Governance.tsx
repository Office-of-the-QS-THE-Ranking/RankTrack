"use client";

import { useEffect, useMemo, useState } from "react";
import { CLASSIFICATIONS } from "@/lib/governance/catalog";
import type { DatasetRow, TermRow } from "@/lib/governance/console-types";
import type { Classification, ExportPolicy } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { UnitSelect } from "../parts";
import { Block, Disclosure, EmptyNote, Field, Hint, KV, Pill, ReadOnly, SearchField, Sheet, StatusPill, Switch, Tabs, fmtAgo, fmtDate, plural, useAct, useConsole } from "../ui";
import { NumberField, Select } from "@/components/ui/pickers";
import { useSkipChecks } from "@/lib/dev-checks";

type Tab = "Datasets" | "Quality" | "Dictionary";

const LEVELS = "Public: can appear on the website. Internal: staff only. Confidential: named roles; exports need approval. Restricted: never exported.";

export function Governance() {
  const { data, focus } = useConsole();
  const [tab, setTab] = useState<Tab>(focus === "duplicates" || focus === "quality" ? "Quality" : "Datasets");
  const issues = (data.rules?.filter((r) => r.status === "Failing" || r.status === "Warning").length ?? 0) + (data.duplicates?.filter((d) => !d.decision).length ?? 0);
  return (
    <div className="adm-stack">
      <Tabs
        label="Data governance"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "Datasets", label: "Datasets", count: data.datasets?.length ?? 0 },
          { key: "Quality", label: "Quality", count: issues || undefined, countTone: "alert" },
          { key: "Dictionary", label: "Dictionary", count: data.terms?.length ?? 0 },
        ]}
      />
      {tab === "Datasets" && <Datasets />}
      {tab === "Quality" && <Quality />}
      {tab === "Dictionary" && <Dictionary />}
    </div>
  );
}

const exportTone = (p: ExportPolicy) => (p === "Allowed" ? "ok" : p === "Blocked" ? "danger" : "revise");

function Datasets() {
  const { data } = useConsole();
  const act = useAct();
  const [q, setQ] = useState("");
  const [cls, setCls] = useState<"" | Classification>("");
  const [open, setOpen] = useState<string | null>(null);
  const [due, setDue] = useState<{ dataset: string; version: number; then: string }[] | null>(null);
  const sets = (data.datasets ?? []).filter((d) => (!cls || d.classification === cls) && (!q.trim() || d.name.toLowerCase().includes(q.toLowerCase()) || d.ownerName.toLowerCase().includes(q.toLowerCase())));
  const current = data.datasets?.find((d) => d.id === open) ?? null;
  return (
    <>
      <div className="adm-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Search datasets" label="Search datasets" />
        <Select className="select select--sm" value={cls} onChange={(v) => setCls(v as typeof cls)} aria-label="Filter by classification">
          <option value="">All classifications</option>
          {CLASSIFICATIONS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.key}
            </option>
          ))}
        </Select>
        <Hint text={LEVELS} label="Classification levels" />
        <span className="adm-toolbar__spacer" />
        {viewerCan(data.viewer, "governance", "manage") && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={async () => {
              const r = await act({ type: "retention.run" });
              if (r.ok) setDue((r.data as typeof due) ?? []);
            }}
          >
            <Icon name="clock" size={15} /> Check retention
          </button>
        )}
      </div>
      {due && due.length > 0 && (
        <div className="adm-callout is-revise">
          <Icon name="clock" size={18} />
          <div>
            <b>Past retention</b>
            <ul className="adm-list-tight">
              {due.map((x) => (
                <li key={x.dataset + x.version}>
                  {x.dataset}, version {x.version}: {x.then.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {sets.length ? (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Classification</th>
                <th>Export</th>
                <th className="r">Quality</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((d) => (
                <tr key={d.id} className="is-clickable" onClick={() => setOpen(d.id)}>
                  <td>
                    <button type="button" className="adm-rowtitle" onClick={(e) => { e.stopPropagation(); setOpen(d.id); }}>
                      {d.name}
                    </button>
                    <small className="adm-muted block">{d.ownerName}</small>
                  </td>
                  <td>
                    <StatusPill value={d.classification} />
                  </td>
                  <td>
                    <span className={`adm-pill adm-pill--${exportTone(d.exportPolicy)}`}>{d.exportPolicy === "Approval required" ? "Needs approval" : d.exportPolicy}</span>
                  </td>
                  <td className="r num">{d.quality}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote icon="search" title="No datasets match" />
      )}
      <DatasetSheet d={current} onClose={() => setOpen(null)} />
    </>
  );
}

function DatasetSheet({ d, onClose }: { d: DatasetRow | null; onClose: () => void }) {
  const skip = useSkipChecks();
  const { data } = useConsole();
  const act = useAct();
  const [f, setF] = useState({ classification: "Public" as Classification, stewardId: "", ownerUnitId: "", years: 1, then: "Archive" as "Archive" | "Review" | "Dispose", exportPolicy: "Allowed" as ExportPolicy, justification: "" });
  const [note, setNote] = useState("");
  useEffect(() => {
    if (d) setF({ classification: d.classification, stewardId: d.stewardId, ownerUnitId: d.ownerUnitId, years: d.retention.years, then: d.retention.then, exportPolicy: d.exportPolicy, justification: "" });
  }, [d]);
  if (!d) return null;
  const changed = f.classification !== d.classification || f.stewardId !== d.stewardId || f.ownerUnitId !== d.ownerUnitId || f.years !== d.retention.years || f.then !== d.retention.then || f.exportPolicy !== d.exportPolicy;
  const holders = (data.accounts ?? []).flatMap((a) => (a.dataGrants ?? []).filter((g) => g.datasetId === d.id).map((g) => ({ a, g })));
  const facts: [string, React.ReactNode][] = [
    ["On the website", d.publicSurface ? `${d.publicSurface}${d.classification === "Public" ? "" : " (hidden until Public)"}` : "Never"],
    ["Personal data", d.personal ? "Yes" : "No"],
    ["Used by", d.bodies.length ? d.bodies.map((b) => (b === "UI" ? "UI GreenMetric" : b)).join(", ") : "The Hub"],
    ["Records", d.records.toLocaleString("en-PH")],
  ];
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={d.name}
      sub={
        <span className="adm-inline">
          <StatusPill value={d.classification} />
          <span className="adm-muted small">v{d.version}</span>
        </span>
      }
      footer={
        d.canEdit &&
        changed && (
          <>
            <input className="input" value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} placeholder="Reason for the change" aria-label="Reason for the change" />
            <button
              type="button"
              className="btn btn--dark"
              onClick={() => void act({ type: "dataset.update", id: d.id, classification: f.classification, stewardId: f.stewardId, ownerUnitId: f.ownerUnitId, retention: { years: f.years, then: f.then }, exportPolicy: f.exportPolicy, justification: f.justification })}
            >
              Save
            </button>
          </>
        )
      }
    >
      {d.description && <p className="adm-muted">{d.description}</p>}
      {d.canEdit ? (
        <>
          <div className="adm-form-grid">
            <Field
              label={
                <>
                  Classification <Hint text={LEVELS} label="Classification levels" />
                </>
              }
              hint={d.locked ? `Locked: ${d.locked}` : undefined}
            >
              <Select className="select" value={f.classification} disabled={!d.canClassify} onChange={(v) => setF({ ...f, classification: v as Classification })}>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c.key} value={c.key} disabled={c.key === "Public" && d.personal}>
                    {c.key}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Export">
              <Select className="select" value={f.exportPolicy} onChange={(v) => setF({ ...f, exportPolicy: v as ExportPolicy })}>
                {(["Allowed", "Approval required", "Blocked"] as ExportPolicy[]).map((p) => (
                  <option key={p} value={p} disabled={(f.classification === "Restricted" && p !== "Blocked") || (f.classification === "Confidential" && p === "Allowed")}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Owner">
              <UnitSelect label="Owner unit" value={f.ownerUnitId} onChange={(id) => setF({ ...f, ownerUnitId: id })} filter={(u) => u.status === "Active"} />
            </Field>
            <Field label="Steward">
              <Select className="select" value={f.stewardId} onChange={(v) => setF({ ...f, stewardId: v })}>
                {data.people
                  .filter((p) => p.status === "Active")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Keep for">
              <span className="adm-inline">
                <NumberField className="input num" min={1} max={50} value={f.years} onChange={(v) => setF({ ...f, years: v })} aria-label="Years to keep" />
                <span className="adm-muted">years</span>
              </span>
            </Field>
            <Field label="Then">
              <Select className="select" value={f.then} onChange={(v) => setF({ ...f, then: v as typeof f.then })}>
                <option>Archive</option>
                <option>Review</option>
                <option>Dispose</option>
              </Select>
            </Field>
          </div>
          <KV rows={facts} />
        </>
      ) : (
        <>
          <ReadOnly>View only.</ReadOnly>
          <KV
            rows={[
              ["Owner", d.ownerName],
              ["Steward", d.stewardName],
              ["Retention", `${d.retention.years} years, then ${d.retention.then.toLowerCase()}`],
              ["Export", d.exportPolicy],
              ...facts,
            ]}
          />
        </>
      )}
      {holders.length > 0 && (
        <p className="adm-note">
          Temporary access: {holders.map(({ a, g }) => `${a.name} (${g.access.toLowerCase()} until ${fmtDate(g.until)})`).join(", ")}
        </p>
      )}
      <Disclosure title="Versions" meta={`Latest v${d.version} · ${fmtDate(d.updatedAt)}`}>
        {d.canEdit && (
          <span className="adm-inline">
            <input className="input input--sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed" aria-label="Version note" />
            <button
              type="button"
              className="btn btn--sm"
              disabled={!skip && note.trim().length < 5}
              onClick={async () => {
                const r = await act({ type: "dataset.version", id: d.id, note });
                if (r.ok) setNote("");
              }}
            >
              Add version
            </button>
          </span>
        )}
        <ul className="adm-timeline">
          {d.versions.map((x) => (
            <li key={x.v + x.at}>
              <b>
                v{x.v}: {x.note}
              </b>
              <span>
                {fmtDate(x.at, true)} · {data.people.find((p) => p.id === x.by)?.name ?? x.by}
              </span>
            </li>
          ))}
        </ul>
      </Disclosure>
    </Sheet>
  );
}

/* ---------- Quality: rules and likely duplicates ---------- */

function Quality() {
  const { data } = useConsole();
  const act = useAct();
  const results = data.rules ?? [];
  const sets = [...new Set(results.map((r) => r.rule.datasetId))];
  const last = results.map((r) => r.rule.lastRun).filter(Boolean).sort().at(-1);
  return (
    <div className="adm-stack adm-stack--tight">
      <div className="adm-toolbar">
        {last && <span className="adm-count">Last full run {fmtAgo(last, data.now)}</span>}
        <span className="adm-toolbar__spacer" />
        <button type="button" className="btn btn--sm btn--dark" onClick={() => void act({ type: "rule.run" })}>
          <Icon name="play" size={14} /> Run checks
        </button>
      </div>
      <Duplicates />
      {sets.map((id) => {
        const ds = data.datasets?.find((d) => d.id === id);
        return (
          <Block key={id} title={ds?.name ?? id} actions={<span className="adm-count num">{ds?.quality ?? 100}%</span>}>
            <ul className="adm-rules">
              {results
                .filter((r) => r.rule.datasetId === id)
                .map((r) => (
                  <li key={r.rule.id}>
                    <div className="adm-rules__main">
                      <span className="adm-inline">
                        <b>{r.rule.name}</b>
                        <Hint text={r.rule.description} />
                        {r.status !== "Passing" && <Pill tone={r.status === "Failing" ? "danger" : r.status === "Warning" ? "revise" : "missing"}>{r.status}</Pill>}
                      </span>
                      {r.failures.length > 0 && r.status !== "Off" && (
                        <details>
                          <summary className="small">{plural(r.failures.length, "record")} to fix</summary>
                          <ul className="adm-list-tight">
                            {r.failures.map((f) => (
                              <li key={f.id}>
                                <b className="num">{f.id}</b> {f.label}: {f.why}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <Switch checked={r.rule.enabled} label={`${r.rule.name} ${r.rule.enabled ? "on" : "off"}`} disabled={!ds?.canEdit} onChange={(on) => void act({ type: "rule.toggle", id: r.rule.id, enabled: on })} />
                  </li>
                ))}
            </ul>
          </Block>
        );
      })}
    </div>
  );
}

function Duplicates() {
  const { data } = useConsole();
  const act = useAct();
  const list = data.duplicates ?? [];
  const open = list.filter((p) => !p.decision);
  const done = list.filter((p) => p.decision);
  const canAct = viewerCan(data.viewer, "governance", "edit", { datasetId: "DS-EVIDENCE" }) || viewerCan(data.viewer, "evidence", "approve");
  if (!list.length) return null;
  const pair = (p: (typeof list)[number]) => (
    <div className="adm-compare">
      {[p.a, p.b].map((x) => (
        <div key={x.id} className={p.decision?.keep === x.id ? "is-kept" : undefined}>
          <p className="adm-muted small num">{x.id}</p>
          <b>{x.title}</b>
          <p className="adm-muted small">
            {x.unit} · {fmtDate(x.submitted)}
          </p>
          {canAct && !p.decision && (
            <button type="button" className="btn btn--sm" onClick={() => void act({ type: "duplicate.resolve", key: p.key, decision: "Merged", keep: x.id })}>
              Keep this one
            </button>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <>
      {open.map((p) => (
        <Block
          key={p.key}
          title="Possible duplicate"
          actions={
            canAct && (
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => void act({ type: "duplicate.resolve", key: p.key, decision: "Dismissed" })}>
                Not a duplicate
              </button>
            )
          }
        >
          {pair(p)}
        </Block>
      ))}
      {done.length > 0 && (
        <Disclosure title="Resolved duplicates" meta={String(done.length)}>
          {done.map((p) => (
            <div key={p.key} className="adm-stack adm-stack--tight">
              <p className="adm-muted small">
                {p.decision!.decision === "Merged" ? `Kept ${p.decision!.keep}` : "Not a duplicate"} · {p.decision!.by} · {fmtDate(p.decision!.at)}
              </p>
              {pair(p)}
            </div>
          ))}
        </Disclosure>
      )}
    </>
  );
}

/* ---------- Data dictionary ---------- */

function Dictionary() {
  const { data } = useConsole();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<TermRow | null>(null);
  const terms = useMemo(() => (data.terms ?? []).filter((t) => !q.trim() || t.term.toLowerCase().includes(q.toLowerCase()) || t.definition.toLowerCase().includes(q.toLowerCase())), [data.terms, q]);
  return (
    <>
      <div className="adm-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Search terms" label="Search the data dictionary" />
      </div>
      {terms.length ? (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>Definition</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.term} className="is-clickable" onClick={() => setEdit(t)}>
                  <td>
                    <b>{t.term}</b>
                  </td>
                  <td className="adm-muted adm-clamp">{t.definition}</td>
                  <td className="adm-muted">{t.unitOfMeasure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote icon="search" title="No terms match" />
      )}
      <TermSheet t={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function TermSheet({ t, onClose }: { t: TermRow | null; onClose: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [f, setF] = useState({ definition: "", unitOfMeasure: "", stewardId: "", datasetId: "" });
  useEffect(() => {
    if (t) setF({ definition: t.definition, unitOfMeasure: t.unitOfMeasure, stewardId: t.stewardId, datasetId: t.datasetId });
  }, [t]);
  if (!t) return null;
  const can = viewerCan(data.viewer, "governance", "edit", { datasetId: t.datasetId }) || viewerCan(data.viewer, "knowledge", "edit");
  return (
    <Sheet
      open
      onClose={onClose}
      title={t.term}
      sub={t.rankings.length ? `Used in ${t.rankings.join(", ")}` : undefined}
      footer={
        can && (
          <>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              onClick={async () => {
                const r = await act({ type: "term.update", term: t.term, ...f });
                if (r.ok) onClose();
              }}
            >
              Save
            </button>
          </>
        )
      }
    >
      {!can && <ReadOnly>View only.</ReadOnly>}
      <Field label="Definition">
        <textarea className="textarea" value={f.definition} disabled={!can} onChange={(e) => setF({ ...f, definition: e.target.value })} />
      </Field>
      <div className="adm-form-grid">
        <Field label="Unit of measure">
          <input className="input" value={f.unitOfMeasure} disabled={!can} onChange={(e) => setF({ ...f, unitOfMeasure: e.target.value })} />
        </Field>
        <Field label="Dataset">
          <Select className="select" value={f.datasetId} disabled={!can} onChange={(v) => setF({ ...f, datasetId: v })}>
            {data.catalog.datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Steward">
          <Select className="select" value={f.stewardId} disabled={!can} onChange={(v) => setF({ ...f, stewardId: v })}>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="adm-count">Updated {fmtDate(t.updatedAt)}</p>
    </Sheet>
  );
}
