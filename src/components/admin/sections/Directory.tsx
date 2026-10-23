"use client";

import { useEffect, useMemo, useState } from "react";
import type { UnitRow } from "@/lib/governance/console-types";
import { descendants } from "@/lib/governance/rbac";
import type { OrgKind } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { UnitSelect, parentPath } from "../parts";
import { Block, Disclosure, EmptyNote, Field, KV, Pill, ReadOnly, RowMenu, SearchField, Sheet, fmtDate, plural, useAct, useConsole } from "../ui";

const KINDS: OrgKind[] = ["Faculty", "College", "Institute", "Research Centre", "Department", "Program", "Office"];

export function Directory() {
  const { data } = useConsole();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [sel, setSel] = useState("engineering");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["ust", "engineering", "rector", "vrri"]));
  const [adding, setAdding] = useState<string | null>(null);
  const unit = data.units.find((u) => u.id === sel) ?? data.units[0];
  const archivedCount = data.units.filter((u) => u.status === "Archived").length;

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = (u: UnitRow) => (!t || u.name.toLowerCase().includes(t) || u.code.toLowerCase().includes(t)) && (archived || u.status === "Active");
    // Keep ancestors of any hit so the tree stays readable.
    const keep = new Set<string>();
    for (const u of data.units)
      if (hit(u)) {
        let cur: UnitRow | undefined = u;
        while (cur) {
          keep.add(cur.id);
          cur = data.units.find((x) => x.id === cur!.parentId);
        }
      }
    return keep;
  }, [data.units, q, archived]);

  const node = (u: UnitRow, depth: number): React.ReactNode => {
    if (!matches.has(u.id)) return null;
    const kids = data.units
      .filter((x) => x.parentId === u.id && matches.has(x.id))
      .sort((a, b) => Number(a.status === "Archived") - Number(b.status === "Archived") || a.name.localeCompare(b.name));
    const expanded = open.has(u.id) || !!q.trim();
    return (
      <li key={u.id}>
        <div className={`adm-tree__row${u.id === sel ? " is-current" : ""}${u.status === "Archived" ? " is-archived" : ""}`} style={{ ["--depth" as string]: depth }}>
          {kids.length ? (
            <button
              type="button"
              className="adm-tree__twisty"
              aria-label={expanded ? `Collapse ${u.name}` : `Expand ${u.name}`}
              aria-expanded={expanded}
              onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
            >
              <Icon name={expanded ? "chevron-down" : "chevron"} size={14} />
            </button>
          ) : (
            <span className="adm-tree__twisty" aria-hidden="true" />
          )}
          <button type="button" className="adm-tree__label" aria-current={u.id === sel ? "true" : undefined} title={`${u.name} (${u.code})`} onClick={() => setSel(u.id)}>
            <span className="adm-tree__name">{u.name}</span>
            <span className="adm-tree__code">{u.code}</span>
            {u.status === "Archived" && <Pill tone="missing">{u.mergedInto ? "Merged" : "Archived"}</Pill>}
          </button>
        </div>
        {expanded && kids.length > 0 && <ul>{kids.map((k) => node(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Search units or codes" label="Search the directory" />
        {archivedCount > 0 && (
          <label className="choice choice--inline">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Show archived ({archivedCount})
          </label>
        )}
        <span className="adm-toolbar__spacer" />
        {viewerCan(data.viewer, "directory", "create") && (
          <button type="button" className="btn btn--dark btn--sm" onClick={() => setAdding(unit?.status === "Active" ? unit.id : "ust")}>
            <Icon name="plus" size={15} /> Add unit
          </button>
        )}
      </div>
      <div className="adm-split">
        <div className="adm-split__list adm-split__list--tree">
          <ul className="adm-tree" role="tree" aria-label="Organizational directory">
            {data.units.filter((u) => u.parentId === null).map((u) => node(u, 0))}
          </ul>
          {!matches.size && <EmptyNote icon="search" title="No units match" />}
        </div>
        <div className="adm-split__detail">{unit && <UnitDetail key={unit.id} unit={unit} onSelect={setSel} onAdd={() => setAdding(unit.id)} />}</div>
      </div>
      <AddUnit parentId={adding} onClose={() => setAdding(null)} onCreated={(id) => setSel(id)} />
    </div>
  );
}

function UnitDetail({ unit: u, onSelect, onAdd }: { unit: UnitRow; onSelect: (id: string) => void; onAdd: () => void }) {
  const { data, confirm } = useConsole();
  const act = useAct();
  const [mode, setMode] = useState<"view" | "edit" | "move" | "merge">("view");
  const parent = data.units.find((x) => x.id === u.parentId);
  const merged = u.mergedInto ? data.units.find((x) => x.id === u.mergedInto) : undefined;
  const absorbed = data.units.filter((x) => x.mergedInto === u.id);
  const children = data.units.filter((x) => x.parentId === u.id);
  const person = (id: string) => data.people.find((p) => p.id === id);
  const canAdd = u.canEdit && u.status === "Active" && viewerCan(data.viewer, "directory", "create", { unitId: u.id });
  const structural = u.canManage && !!u.parentId;

  const archive = async () => {
    const below = children.filter((c) => c.status === "Active").length;
    const reason = await confirm({
      title: `Archive ${u.name}?`,
      body: `${below ? `${plural(below, "unit")} beneath it will be archived too. ` : ""}Nothing is deleted. Its submissions stay credited to it.`,
      confirm: "Archive",
      tone: "danger",
      input: { label: "Reason", required: true, placeholder: "Program discontinued from AY 2027–2028" },
    });
    if (reason !== null) await act({ type: "unit.archive", id: u.id, reason });
  };

  return (
    <div className="adm-stack adm-stack--tight">
      <header className="adm-detail-head">
        <div>
          {parentPath(data.units, u.id) && <p className="adm-muted small">{parentPath(data.units, u.id)}</p>}
          <h3 className="adm-detail-head__title">{u.name}</h3>
          <p className="adm-inline adm-inline--wrap">
            <span className="adm-muted small">
              {u.code} · {u.kind}
            </span>
            {u.status === "Archived" && <Pill tone="missing">{merged ? "Merged" : "Archived"}</Pill>}
            {u.participating && <Pill tone="gold">Reports rankings</Pill>}
          </p>
        </div>
        <div className="adm-actions">
          {u.canEdit && u.status === "Active" && (
            <button type="button" className="btn btn--sm" onClick={() => setMode("edit")}>
              <Icon name="pen" size={15} /> Edit
            </button>
          )}
          {canAdd && (
            <button type="button" className="btn btn--sm" onClick={onAdd}>
              <Icon name="plus" size={15} /> Add beneath
            </button>
          )}
          {structural && u.status === "Archived" && !u.mergedInto && (
            <button type="button" className="btn btn--sm btn--dark" onClick={() => void act({ type: "unit.reactivate", id: u.id })}>
              <Icon name="undo" size={15} /> Reactivate
            </button>
          )}
          {structural && u.status === "Active" && (
            <RowMenu
              label={`More actions for ${u.name}`}
              items={[
                { label: "Move", icon: "move", onSelect: () => setMode("move") },
                { label: "Merge", icon: "merge", onSelect: () => setMode("merge") },
                { label: "Archive", icon: "archive", danger: true, onSelect: () => void archive() },
              ]}
            />
          )}
        </div>
      </header>

      {u.status === "Archived" && (
        <p className="adm-note">
          {merged ? `Merged into ${merged.name}` : "Archived"} {fmtDate(u.archivedAt)}
          {u.archivedReason ? `: ${u.archivedReason}` : ""}.{u.records > 0 && ` Its ${plural(u.records, "submission")} stay credited to it.`}
        </p>
      )}
      {!u.canEdit && <ReadOnly>View only: outside the units you administer.</ReadOnly>}

      {mode === "edit" && <EditUnit u={u} onDone={() => setMode("view")} />}
      {mode === "move" && <MoveUnit u={u} onDone={() => setMode("view")} />}
      {mode === "merge" && <MergeUnit u={u} onDone={() => setMode("view")} />}

      {mode === "view" && (
        <KV
          rows={[
            ["Parent", parent ? <button type="button" className="link" onClick={() => onSelect(parent.id)}>{parent.name}</button> : "None"],
            ["Administrators", u.adminIds.length ? u.adminIds.map((id) => person(id)?.name ?? id).join(", ") : "None"],
            ["Units beneath", children.length ? `${children.filter((c) => c.status === "Active").length} active${children.some((c) => c.status === "Archived") ? `, ${children.filter((c) => c.status === "Archived").length} archived` : ""}` : "None"],
            ["Accounts", u.accounts],
            ["Submissions", `${u.records}${absorbed.length ? ` (incl. ${absorbed.map((a) => a.name).join(", ")})` : ""}`],
            ["Established", u.established ? fmtDate(u.established) : "—"],
          ]}
        />
      )}

      {u.history.length > 0 && (
        <Disclosure title="History" meta={plural(u.history.length, "change")}>
          <ul className="adm-timeline">
            {[...u.history].reverse().map((h, i) => (
              <li key={i}>
                <b>{h.change}</b>
                <span>
                  {fmtDate(h.at, true)} · {person(h.by)?.name ?? h.by}
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}

function EditUnit({ u, onDone }: { u: UnitRow; onDone: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [name, setName] = useState(u.name);
  const [code, setCode] = useState(u.code);
  const [admins, setAdmins] = useState<string[]>(u.adminIds);
  const tree = descendants(data.units, u.id);
  const person = (id: string) => data.people.find((p) => p.id === id);
  const dirty = name !== u.name || code !== u.code || admins.join() !== u.adminIds.join();
  return (
    <Block title="Edit unit">
      <div className="adm-form-grid">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Code">
          <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
      </div>
      <Field label="Administrators">
        <div className="adm-chips">
          {admins.map((id) => (
            <span key={id} className="adm-chip">
              {person(id)?.name ?? id}
              <button type="button" aria-label={`Remove ${person(id)?.name}`} onClick={() => setAdmins(admins.filter((x) => x !== id))}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
        <select className="select" value="" onChange={(e) => e.target.value && setAdmins([...admins, e.target.value])} aria-label="Add an administrator">
          <option value="">Add an administrator…</option>
          {data.people
            .filter((p) => !admins.includes(p.id) && p.status !== "Deactivated")
            .sort((a, b) => Number(!tree.includes(a.unitId)) - Number(!tree.includes(b.unitId)) || a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {tree.includes(p.unitId) ? "" : ` (${data.units.find((x) => x.id === p.unitId)?.code ?? p.unitId})`}
              </option>
            ))}
        </select>
      </Field>
      <div className="adm-actions">
        <button type="button" className="btn btn--sm" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--sm btn--dark"
          disabled={!dirty}
          onClick={async () => {
            const r = await act({ type: "unit.update", id: u.id, name, code, adminIds: admins });
            if (r.ok) onDone();
          }}
        >
          Save
        </button>
      </div>
    </Block>
  );
}

function MoveUnit({ u, onDone }: { u: UnitRow; onDone: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [to, setTo] = useState("");
  const tree = descendants(data.units, u.id);
  return (
    <Block title={`Move ${u.name}`}>
      <Field label="New parent">
        <UnitSelect label="New parent" value={to} onChange={setTo} filter={(x) => x.status === "Active" && !tree.includes(x.id) && x.id !== u.parentId && x.kind !== "Program"} />
      </Field>
      <div className="adm-actions">
        <button type="button" className="btn btn--sm" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--sm btn--dark"
          disabled={!to}
          onClick={async () => {
            const r = await act({ type: "unit.move", id: u.id, parentId: to });
            if (r.ok) onDone();
          }}
        >
          Move
        </button>
      </div>
    </Block>
  );
}

function MergeUnit({ u, onDone }: { u: UnitRow; onDone: () => void }) {
  const { data, confirm } = useConsole();
  const act = useAct();
  const [to, setTo] = useState("");
  const tree = descendants(data.units, u.id);
  return (
    <Block title={`Merge ${u.name}`}>
      <Field label="Merge into">
        <UnitSelect label="Merge into" value={to} onChange={setTo} filter={(x) => x.status === "Active" && !tree.includes(x.id)} />
      </Field>
      <div className="adm-actions">
        <button type="button" className="btn btn--sm" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--sm btn--dark"
          disabled={!to}
          onClick={async () => {
            const target = data.units.find((x) => x.id === to);
            const reason = await confirm({
              title: `Merge into ${target?.name}?`,
              body: `${u.name} is archived and its people and units move to ${target?.name}. Its submissions keep their original label.`,
              confirm: "Merge",
              tone: "danger",
              input: { label: "Reason", required: true, placeholder: "Board resolution or memo reference" },
            });
            if (reason === null) return;
            const r = await act({ type: "unit.merge", id: u.id, intoId: to, reason });
            if (r.ok) onDone();
          }}
        >
          Merge
        </button>
      </div>
    </Block>
  );
}

function AddUnit({ parentId, onClose, onCreated }: { parentId: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [f, setF] = useState({ name: "", code: "", kind: "Department" as OrgKind, parentId: "", justification: "" });
  useEffect(() => {
    if (parentId) {
      const p = data.units.find((u) => u.id === parentId);
      setF({ name: "", code: p && p.code !== "UST" ? `${p.code}-` : "", kind: p?.kind === "Department" ? "Program" : p?.kind === "University" ? "College" : "Department", parentId, justification: "" });
    }
  }, [parentId, data.units]);
  const direct = data.viewer.superAdmin || !data.workflows.find((w) => w.id === "org-unit")?.enabled;
  return (
    <Sheet
      open={!!parentId}
      onClose={onClose}
      title="Add unit"
      sub={direct ? undefined : "Needs approval before it appears."}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--dark"
            disabled={f.name.trim().length < 3 || f.code.trim().length < 2 || !f.parentId}
            onClick={async () => {
              const r = await act({ type: "unit.create", ...f });
              if (r.ok) {
                onClose();
                if (typeof r.data === "string") onCreated(r.data);
              }
            }}
          >
            {direct ? "Add unit" : "Send for approval"}
          </button>
        </>
      }
    >
      <div className="adm-form-grid">
        <Field label="Name" wide>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Department of Data Science" />
        </Field>
        <Field label="Code">
          <input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="CICS-DS" />
        </Field>
        <Field label="Type">
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as OrgKind })}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Sits under" wide>
          <UnitSelect label="Parent unit" value={f.parentId} onChange={(id) => setF({ ...f, parentId: id })} filter={(u) => u.status === "Active" && viewerCan(data.viewer, "directory", "create", { unitId: u.id })} />
        </Field>
        {!direct && (
          <Field label="Reason" wide>
            <textarea className="textarea" value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} placeholder="Academic Senate resolution or memo" />
          </Field>
        )}
      </div>
    </Sheet>
  );
}
