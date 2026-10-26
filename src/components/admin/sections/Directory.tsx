"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { startEmblemUpload, startUnitLogoUpload } from "@/app/actions/emblems";
import type { UnitRow } from "@/lib/governance/console-types";
import { directorySection, matchesUnitParent, participationKind, type DirectorySection, type UnitCreationKind } from "@/lib/governance/directory";
import { descendants } from "@/lib/governance/rbac";
import type { OrgKind } from "@/lib/governance/types";
import { EMBLEM_MAX_MB, EMBLEM_MAX_SIDE, EMBLEM_PICK_TYPES, EMBLEM_TYPES, emblemOf, officialEmblem } from "@/lib/governance/unit-emblems";
import { useReference } from "@/components/reference/ReferenceProvider";
import { viewerCan } from "@/lib/governance/viewer";
import { prepare, upload } from "@/components/impact/media";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { UnitMark } from "@/components/units/UnitMark";
import { LogoDropzone } from "@/components/units/LogoDropzone";
import { UnitSelect, parentPath } from "../parts";
import { Block, Disclosure, EmptyNote, Field, KV, Pill, ReadOnly, RowMenu, SearchField, Sheet, fmtDate, plural, useAct, useConsole } from "../ui";
import { Tabs, TabPanel } from "@/components/ui/interactive";
import { Select } from "@/components/ui/pickers";
import { useSkipChecks } from "@/lib/dev-checks";
import { UNIT_CATEGORY_LABELS, UNIT_CATEGORY_TABS as DIRECTORY_TABS } from "@/lib/unit-categories";
import { UNIT_EMAILS } from "@/lib/governance/catalog";

const KINDS: OrgKind[] = ["Faculty", "College", "Institute", "School", "Student Government", "Research Centre", "Department", "Program", "Office"];
const DIRECTORY_SECTIONS: Record<typeof DIRECTORY_TABS[number], DirectorySection> = {
  "Faculty/Colleges": "academic",
  "University Offices": "offices",
  "Research Centers": "research",
};
const SEARCH_EXAMPLES: Record<DirectorySection, readonly string[]> = {
  academic: ["Search by name or code", "Try Architecture", "Try Accountancy", "Try a college code: C11"],
  offices: ["Search by name or code", "Try Registrar", "Try Office of the Rector", "Try an office code: A01"],
  research: ["Search by center name", "Search by research center code", "Try Research"],
};
const CREATION_TYPES: { kind: UnitCreationKind; label: string }[] = [
  { kind: "College", label: "Faculty/Colleges" },
  { kind: "Office", label: "University Office" },
  { kind: "Research Centre", label: "Research Centers" },
];
const CREATION_KIND: Record<DirectorySection, UnitCreationKind> = {
  academic: "College", offices: "Office", research: "Research Centre",
};

const byStatusThenName = (a: UnitRow, b: UnitRow) => Number(a.status === "Archived") - Number(b.status === "Archived") || a.name.localeCompare(b.name);

export function Directory() {
  const { data } = useConsole();
  const catalogue = useReference();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [section, setSection] = useState<DirectorySection>("academic");
  const [viewing, setViewing] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const closeModal = useCallback(() => setViewing(null), []);
  const sectionUnits = useMemo(() => data.units.filter((u) => section === "academic"
    ? participationKind(u) === "Faculty or college"
    : directorySection(data.units, u) === section), [data.units, section]);
  const sectionIds = new Set(sectionUnits.map((u) => u.id));
  const archivedCount = sectionUnits.filter((u) => u.status === "Archived").length;
  const showUnit = (id: string) => {
    const target = data.units.find((u) => u.id === id);
    const targetSection = target && directorySection(data.units, target);
    if (!targetSection) return;
    if (targetSection !== section) {
      setSection(targetSection);
      setQ("");
    }
    if (target.status === "Archived") setArchived(true);
    setViewing(id);
  };

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = (u: UnitRow) => (!t || u.name.toLowerCase().includes(t) || u.code.toLowerCase().includes(t)) && (archived || u.status === "Active");
    // Keep ancestors of any hit so each match still shows where it sits.
    const keep = new Set<string>();
    for (const u of sectionUnits)
      if (hit(u)) {
        let cur: UnitRow | undefined = u;
        while (cur && sectionUnits.some((u) => u.id === cur!.id) && !keep.has(cur.id)) {
          keep.add(cur.id);
          cur = data.units.find((x) => x.id === cur!.parentId);
        }
      }
    return keep;
  }, [data.units, sectionUnits, q, archived]);
  const roots = sectionUnits.filter((u) => (!u.parentId || !sectionIds.has(u.parentId)) && matches.has(u.id)).sort(byStatusThenName);
  const kidsOf = (id: string) => sectionUnits.filter((x) => x.parentId === id && matches.has(x.id)).sort(byStatusThenName);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const node = (u: UnitRow, depth: number): React.ReactNode => {
    const kids = kidsOf(u.id);
    const expanded = open.has(u.id) || !!q.trim();
    const activeKids = kids.filter((k) => k.status === "Active").length;
    return (
      <li key={u.id} className={`adm-dir__item${expanded && kids.length ? " is-open" : ""}`}>
        <div className={`adm-dir__row${u.status === "Archived" ? " is-archived" : ""}`} style={{ ["--depth" as string]: depth }}>
          <button type="button" className="adm-dir__open" aria-haspopup="dialog" onClick={() => setViewing(u.id)}>
            <UnitMark emblem={emblemOf(u, catalogue)} code={u.code} className="adm-dir__mark" />
            <span className="adm-dir__text">
              <span className="adm-dir__name">{u.name}</span>
              <span className="adm-dir__meta">
                {u.kind}
                {activeKids > 0 && ` · ${plural(activeKids, "unit")} beneath`}
                {u.accounts > 0 && ` · ${plural(u.accounts, "account")}`}
              </span>
            </span>
            <span className="adm-dir__tags">
              {u.status === "Archived" && <Pill tone="missing">{u.mergedInto ? "Merged" : "Archived"}</Pill>}
              {u.participating && u.status === "Active" && <Pill tone="gold">Reports rankings</Pill>}
            </span>
          </button>
          {kids.length > 0 ? (
            <button type="button" className="adm-dir__toggle" aria-expanded={expanded} aria-label={expanded ? `Hide units beneath ${u.name}` : `Show units beneath ${u.name}`} onClick={() => toggle(u.id)}>
              <span>{kids.length}</span>
              <Icon name="chevron-down" size={15} />
            </button>
          ) : (
            <span className="adm-dir__toggle adm-dir__toggle--none" aria-hidden="true" />
          )}
        </div>
        {expanded && kids.length > 0 && <ul className="adm-dir__kids">{kids.map((k) => node(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="adm-stack">
      <Tabs
        label="Directory sections"
        idBase="organizational-directory"
        tabs={DIRECTORY_TABS}
        value={UNIT_CATEGORY_LABELS[section]}
        onChange={(value) => { setSection(DIRECTORY_SECTIONS[value]); setQ(""); }}
        sliding
        actions={viewerCan(data.viewer, "directory", "create") && (
          <button type="button" className="btn content-tabs__action" onClick={() => setAdding(data.units.find((u) => u.kind === "University")?.id ?? "ust")}>
            <Icon name="plus" size={15} /> Add unit
          </button>
        )}
        search={<SearchField value={q} onChange={setQ} placeholder="Search by name or code" label={`Search ${UNIT_CATEGORY_LABELS[section]} by name or code`} examples={SEARCH_EXAMPLES[section]} shortcuts />}
      />
      <TabPanel idBase="organizational-directory" index={DIRECTORY_TABS.indexOf(UNIT_CATEGORY_LABELS[section])} className="adm-stack">
        {archivedCount > 0 && (
          <div className="adm-toolbar">
            <label className="choice choice--inline">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
              Show archived ({archivedCount})
            </label>
          </div>
        )}
        {roots.length ? (
          <ul className="adm-dir" aria-label={UNIT_CATEGORY_LABELS[section]}>
            {roots.map((u) => node(u, 0))}
          </ul>
        ) : (
          <EmptyNote icon="search" title="No units match" />
        )}
      </TabPanel>
      <UnitModal id={viewing} onClose={closeModal} onSelect={showUnit} onAdd={(id) => { setViewing(null); setAdding(id); }} />
      <AddUnit parentId={adding} section={section} onClose={() => setAdding(null)} onCreated={(kind, parentId) => {
        setQ("");
        if (["Faculty", "College", "Institute", "School"].includes(kind)) setSection("academic");
        else if (kind === "Research Centre") setSection("research");
        else if (["Office", "Student Government"].includes(kind)) setSection("offices");
        else {
          const parent = data.units.find((unit) => unit.id === parentId);
          const parentSection = parent && directorySection(data.units, parent);
          if (parentSection) setSection(parentSection);
        }
        setOpen((s) => new Set(s).add(parentId));
      }} />
    </div>
  );
}

function UnitModal({ id, onClose, onSelect, onAdd }: { id: string | null; onClose: () => void; onSelect: (id: string) => void; onAdd: (parentId: string) => void }) {
  const { data } = useConsole();
  const u = id ? data.units.find((x) => x.id === id) : undefined;
  const path = u ? parentPath(data.units, u.id) : "";
  return (
    <Sheet
      open={!!u}
      modal
      onClose={onClose}
      title={u?.name}
      sub={path || undefined}
      headerContent={
        u && (
          <p className="adm-inline adm-inline--wrap adm-dir__head-meta">
            <span className="adm-muted small">
              {u.code} · {u.kind}
            </span>
            {u.status === "Archived" && <Pill tone="missing">{u.mergedInto ? "Merged" : "Archived"}</Pill>}
            {u.participating && <Pill tone="gold">Reports rankings</Pill>}
          </p>
        )
      }
    >
      {u && <UnitDetail key={u.id} unit={u} onSelect={onSelect} onAdd={() => onAdd(u.id)} />}
    </Sheet>
  );
}

function UnitDetail({ unit: u, onSelect, onAdd }: { unit: UnitRow; onSelect: (id: string) => void; onAdd: () => void }) {
  const { data, confirm } = useConsole();
  const catalogue = useReference();
  const act = useAct();
  const [mode, setMode] = useState<"view" | "edit" | "move" | "merge">("view");
  const parent = data.units.find((x) => x.id === u.parentId);
  const merged = u.mergedInto ? data.units.find((x) => x.id === u.mergedInto) : undefined;
  const absorbed = data.units.filter((x) => x.mergedInto === u.id);
  const children = data.units.filter((x) => x.parentId === u.id).sort(byStatusThenName);
  const visibleChildren = participationKind(u) === "Faculty or college"
    ? children.filter((child) => participationKind(child) === "Faculty or college")
    : children;
  const person = (id: string) => data.people.find((p) => p.id === id);
  const canAdd = u.canEdit && u.status === "Active" && viewerCan(data.viewer, "directory", "create", { unitId: u.id });
  const structural = u.canManage && !!u.parentId;
  const hasActions = (u.canEdit && u.status === "Active") || canAdd || (structural && !u.mergedInto);

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
    <>
      {hasActions && mode === "view" && (
        <div className="adm-actions adm-dir__actions">
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
      )}

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
        <>
          <div className="adm-dir__stats">
            <div>
              <b>{visibleChildren.filter((c) => c.status === "Active").length}</b>
              <span>Units beneath</span>
            </div>
            <div>
              <b>{u.accounts}</b>
              <span>Accounts</span>
            </div>
            <div>
              <b>{u.records}</b>
              <span>Submissions</span>
            </div>
          </div>
          <KV
            rows={[
              ["Parent", parent ? parent.kind === "University" ? parent.name : <button type="button" className="link" onClick={() => onSelect(parent.id)}>{parent.name}</button> : "None"],
              ["Unit email addresses", u.emails?.join(", ") || "None"],
              ["Administrators", u.adminIds.length ? u.adminIds.map((id) => person(id)?.name ?? id).join(", ") : "None"],
              ...(absorbed.length ? [["Absorbed", absorbed.map((a) => a.name).join(", ")] as [string, string]] : []),
              ...(visibleChildren.some((c) => c.status === "Archived") ? [["Archived beneath", String(visibleChildren.filter((c) => c.status === "Archived").length)] as [string, string]] : []),
              ["Established", u.established ? fmtDate(u.established) : "—"],
            ]}
          />
          {visibleChildren.length > 0 && (
            <Disclosure title="Units beneath" meta={visibleChildren.length}>
              <ul className="adm-dir__sublist">
                {visibleChildren.map((c) => {
                  const mark = emblemOf(c, catalogue);
                  return (
                  <li key={c.id}>
                    <button type="button" className={c.status === "Archived" ? "is-archived" : undefined} onClick={() => onSelect(c.id)}>
                      {mark && <UnitMark emblem={mark} code={c.code} className="adm-dir__submark" />}
                      <span className="adm-dir__name">{c.name}</span>
                      <span className="adm-muted small">{c.code}</span>
                      <Icon name="chevron" size={14} />
                    </button>
                  </li>
                  );
                })}
              </ul>
            </Disclosure>
          )}
        </>
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
    </>
  );
}

function EditUnit({ u, onDone }: { u: UnitRow; onDone: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [name, setName] = useState(u.name);
  const [code, setCode] = useState(u.code);
  const [admins, setAdmins] = useState<string[]>(u.adminIds);
  // undefined: unchanged; null: back to the University's arms; else a newly uploaded logo.
  const [emblem, setEmblem] = useState<UnitRow["emblem"] | null>();
  const tree = descendants(data.units, u.id);
  const person = (id: string) => data.people.find((p) => p.id === id);
  const dirty = name !== u.name || code !== u.code || admins.join() !== u.adminIds.join() || emblem !== undefined;
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
      <LogoField u={u} code={code} value={emblem === undefined ? u.emblem : emblem ?? undefined} onChange={setEmblem} />
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
        <Select className="select" value="" onChange={(v) => v && setAdmins([...admins, v])} aria-label="Add an administrator">
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
        </Select>
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
            const r = await act({ type: "unit.update", id: u.id, name, code, adminIds: admins, ...(emblem !== undefined && { emblem }) });
            if (r.ok) onDone();
          }}
        >
          Save
        </button>
      </div>
    </Block>
  );
}

/** The unit's logo: upload one to show in place of the University's arms, or go back to the arms. Saved with the form. */
function LogoField({ u, parentId, code, value, onChange, onBusyChange }: { u?: UnitRow; parentId?: string; code: string; value: UnitRow["emblem"]; onChange: (v: UnitRow["emblem"] | null) => void; onBusyChange?: (busy: boolean) => void }) {
  const catalogue = useReference();
  const uploading = useRef(false);
  const [progress, setProgress] = useState(0);
  const [pendingFile, setPendingFile] = useState<{ name: string; size: number }>();
  const [savedFile, setSavedFile] = useState<{ name: string; size: number }>();
  const [localPreview, setLocalPreview] = useState<UnitRow["emblem"]>();
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview.src); }, [localPreview]);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onBusyChange?.(false); };
  }, [onBusyChange]);
  const official = u ? officialEmblem(u, catalogue) : null;
  const shown = value ? { key: u?.id ?? "new-unit", form: "logo" as const, ...value } : u ? emblemOf({ ...u, emblem: value }, catalogue) : null;
  const pick = async (file: File) => {
    if (uploading.current || (!u && !parentId)) return;
    if (!EMBLEM_PICK_TYPES[file.type]) return toast("Use a PNG or JPG logo.", "error");
    if (file.size > EMBLEM_MAX_MB * 1_048_576) return toast(`The logo must be under ${EMBLEM_MAX_MB} MB.`, "error");
    uploading.current = true;
    setBusy(true);
    setProgress(0);
    setPendingFile({ name: file.name, size: file.size });
    onBusyChange?.(true);
    try {
      const ready = await prepare(file, EMBLEM_MAX_SIDE, true);
      if (typeof ready === "string") return toast(ready, "error");
      if (!mounted.current) return;
      if (!EMBLEM_TYPES[ready.type]) return toast("Use a PNG or JPG logo.", "error");
      if (ready.blob.size > EMBLEM_MAX_MB * 1_048_576) return toast(`The logo must be under ${EMBLEM_MAX_MB} MB.`, "error");
      setLocalPreview({ src: URL.createObjectURL(ready.blob), width: ready.width, height: ready.height });
      const fileInfo = { type: ready.type, size: ready.blob.size };
      const ticket = u ? await startEmblemUpload(u.id, fileInfo) : await startUnitLogoUpload(parentId ?? "", fileInfo);
      if (!mounted.current) return;
      if (!ticket.ok) return toast(ticket.message, "error");
      await upload(ticket.url, ready, (fraction) => { if (mounted.current) setProgress(fraction); });
      if (mounted.current) {
        setSavedFile({ name: file.name, size: ready.blob.size });
        onChange({ src: ticket.src, width: ready.width, height: ready.height });
      }
    } catch {
      if (mounted.current) toast("The logo couldn’t be uploaded. Try again.", "error");
    } finally {
      uploading.current = false;
      if (mounted.current) {
        setBusy(false);
        setPendingFile(undefined);
        setLocalPreview(undefined);
        onBusyChange?.(false);
      }
    }
  };
  const preview = localPreview ? { key: "pending-logo", form: "logo" as const, ...localPreview } : shown;
  const file = busy ? pendingFile : savedFile;
  return (
    <div className="adm-field">
      <span className="adm-field__label">Logo</span>
      <LogoDropzone
        preview={preview}
        code={code}
        fileName={file?.name}
        fileSize={file?.size}
        busy={busy}
        disabled={!u && !parentId}
        progress={progress}
        onPick={(file) => void pick(file)}
        onRemove={value ? () => { setSavedFile(undefined); onChange(u?.emblem ? null : undefined); } : undefined}
        removeLabel={official ? "Use the University’s arms" : "Remove logo"}
      />
    </div>
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

function AddUnit({ parentId, section, onClose, onCreated }: { parentId: string | null; section: DirectorySection; onClose: () => void; onCreated: (kind: OrgKind, parentId: string) => void }) {
  const formId = useId();
  const nextEmailId = useRef(1);
  const [emails, setEmails] = useState([{ id: 0, value: "" }]);
  const skip = useSkipChecks();
  const { data, busy: saving } = useConsole();
  const act = useAct();
  const [emblem, setEmblem] = useState<UnitRow["emblem"]>();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [f, setF] = useState({ name: "", code: "", kind: "College" as UnitCreationKind, parentId: "" });
  useEffect(() => {
    if (parentId) {
      setEmblem(undefined);
      setEmails([{ id: 0, value: "" }]);
      nextEmailId.current = 1;
      const p = data.units.find((u) => u.id === parentId);
      const kind = CREATION_KIND[section];
      const allowed = p?.status === "Active" && matchesUnitParent(p, kind) && viewerCan(data.viewer, "directory", "create", { unitId: p.id });
      setF({ name: "", code: p && allowed && p.code !== "UST" ? `${p.code}-` : "", kind, parentId: allowed ? parentId : "" });
    }
  }, [parentId, data.units, data.viewer, section]);
  const canPickParent = (unit: UnitRow) => {
    if (unit.status !== "Active" || !viewerCan(data.viewer, "directory", "create", { unitId: unit.id })) return false;
    return matchesUnitParent(unit, f.kind);
  };
  const direct = !data.approvals.includes("org-unit");
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
            type="submit"
            form={formId}
            className="btn btn--dark"
            disabled={saving || uploadingLogo || (!skip && (f.name.trim().length < 3 || f.code.trim().length < 2 || !f.parentId))}
          >
            {direct ? "Add unit" : "Send for approval"}
          </button>
        </>
      }
    >
      <form id={formId} className="adm-form-grid adm-add-unit" onSubmit={async (event) => {
        event.preventDefault();
        if (saving || uploadingLogo) return;
        const r = await act({ type: "unit.create", ...f, emails: emails.map((email) => email.value.trim()).filter(Boolean), ...(emblem && { emblem }) });
        if (r.ok) {
          onClose();
          onCreated(f.kind, f.parentId);
        }
      }}>
        <Field label="Name" wide>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name of faculty, office or center" required minLength={3} maxLength={120} />
        </Field>
        <Field label="Code">
          <input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="CICS-DS" required minLength={2} maxLength={16} pattern="[A-Z0-9][A-Z0-9\-]{1,15}" title="" />
        </Field>
        <Field label="Type">
          <Select className="select" value={f.kind} onChange={(value) => {
            const kind = value as UnitCreationKind;
            const parent = data.units.find((unit) => unit.id === f.parentId);
            setF({ ...f, kind, parentId: parent && matchesUnitParent(parent, kind) ? f.parentId : "" });
          }}>
            {CREATION_TYPES.map(({ kind, label }) => (
              <option key={kind} value={kind}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sits under" wide>
          <UnitSelect
            label="Parent unit"
            value={f.parentId}
            onChange={(id) => setF({ ...f, parentId: id })}
            filter={canPickParent}
            required
          />
        </Field>
        {emails.map((email, index) => (
          <Field key={email.id} label={index === 0 ? "Unit email address" : `Additional email address ${index}`} wide>
            <div className="adm-unit-email">
              <input
                className="input"
                type="email"
                name={`unit-email-${email.id}`}
                value={email.value}
                onChange={(event) => {
                  const value = event.target.value;
                  event.currentTarget.setCustomValidity(value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) ? "Enter an email address, like office@ust.edu.ph." : "");
                  setEmails(emails.map((row) => row.id === email.id ? { ...row, value } : row));
                }}
                placeholder="office@ust.edu.ph"
                maxLength={254}
                title=""
              />
              {emails.length > 1 && <button type="button" className="adm-iconbtn" aria-label={`Remove email address ${index + 1}`} onClick={() => setEmails(emails.filter((row) => row.id !== email.id))}><Icon name="close" size={16} /></button>}
            </div>
          </Field>
        ))}
        {emails.length < UNIT_EMAILS && (
          <div className="adm-add-unit__emails-action">
            <button type="button" className="btn btn--sm" onClick={() => setEmails([...emails, { id: nextEmailId.current++, value: "" }])}><Icon name="plus" size={14} /> Add email address</button>
          </div>
        )}
        <div className="adm-add-unit__logo">
          <LogoField parentId={f.parentId} code={f.code} value={emblem} onChange={(value) => setEmblem(value ?? undefined)} onBusyChange={setUploadingLogo} />
          {!f.parentId && <p className="adm-muted small">Choose where the unit sits to upload a logo.</p>}
        </div>
      </form>
    </Sheet>
  );
}
