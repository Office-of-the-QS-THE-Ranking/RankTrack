"use client";

import { useEffect, useMemo, useState } from "react";
import { MODULES } from "@/lib/governance/catalog";
import type { AccountRow, RoleRow } from "@/lib/governance/console-types";
import { has, normalize, permissionOrigin, rolePermissions, union } from "@/lib/governance/rbac";
import type { Action, Assignment, ModuleKey, PermissionSet, Role } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { PermissionMatrix, diffCell } from "../parts";
import { EmptyNote, Field, Hint, Pill, ReadOnly, Sheet, Tabs, fmtDate, plural, useAct, useConsole } from "../ui";
import { scopeText } from "./Accounts";

type Tab = "Roles" | "Temporary access";

export function Roles() {
  const { data, focus } = useConsole();
  const [tab, setTab] = useState<Tab>(focus === "temporary" ? "Temporary access" : "Roles");
  const temporary = (data.accounts ?? []).flatMap((a) => a.assignments.filter((x) => x.expires && x.expires > data.day).map((x) => ({ a, x })));
  return (
    <div className="adm-stack">
      <Tabs
        label="Roles and permissions"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "Roles", label: <>Roles <span className="adm-tabs__count">{data.roles.length}</span></> },
          { key: "Temporary access", label: <>Temporary access <span className="adm-tabs__count">{temporary.length}</span></> },
        ]}
      />
      {tab === "Roles" ? <RoleBrowser /> : <Temporary rows={temporary} />}
    </div>
  );
}

/** Flip one permission on a draft role: grant or remove it, or (for inherited ones) add or lift an exception. */
function useToggle(draft: Role, roles: Role[], perms: PermissionSet, setPerms: (p: PermissionSet) => void, exceptions: PermissionSet, setExceptions: (p: PermissionSet) => void) {
  return (m: ModuleKey, a: Action) => {
    const origin = permissionOrigin(draft, roles, m, a);
    const set = (s: PermissionSet, on: boolean) => {
      const cur = new Set(s[m] ?? []);
      if (on) cur.add(a);
      else cur.delete(a);
      return normalize({ ...s, [m]: [...cur] });
    };
    if (origin === "inherited") setExceptions(set(exceptions, true));
    else if (origin === "excepted") setExceptions(set(exceptions, false));
    else if (origin === "granted") setPerms(set(perms, false));
    else setPerms(set(perms, true));
  };
}

const NOT_YOURS = "You can't grant a permission you don't have.";

/* ---------- Roles ---------- */

function RoleBrowser() {
  const { data } = useConsole();
  const [sel, setSel] = useState(data.roles[0]?.id ?? "");
  const [creating, setCreating] = useState<null | { from?: string }>(null);
  const role = data.roles.find((r) => r.id === sel) ?? data.roles[0];
  const canCreate = viewerCan(data.viewer, "roles", "create");
  const builtIn = data.roles.filter((r) => r.system).sort((a, b) => b.tier - a.tier);
  const custom = data.roles.filter((r) => !r.system).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="adm-split">
      <div className="adm-split__list">
        {canCreate && (
          <button type="button" className="btn btn--dark btn--sm btn--block" onClick={() => setCreating({})}>
            <Icon name="plus" size={15} /> New role
          </button>
        )}
        <p className="adm-split__label">Built-in</p>
        <RoleList roles={builtIn} sel={role?.id} onSel={setSel} />
        <p className="adm-split__label">Custom</p>
        {custom.length ? <RoleList roles={custom} sel={role?.id} onSel={setSel} /> : <p className="adm-note">None yet.</p>}
      </div>
      <div className="adm-split__detail">{role && <RoleDetail key={role.id} role={role} onDuplicate={() => setCreating({ from: role.id })} onDeleted={() => setSel(data.roles[0].id)} />}</div>
      <NewRole state={creating} onClose={() => setCreating(null)} onCreated={(id) => setSel(id)} />
    </div>
  );
}

function RoleList({ roles, sel, onSel }: { roles: RoleRow[]; sel?: string; onSel: (id: string) => void }) {
  return (
    <ul className="adm-picklist">
      {roles.map((r) => (
        <li key={r.id}>
          <button type="button" aria-current={r.id === sel ? "true" : undefined} onClick={() => onSel(r.id)} title={r.description}>
            <span className="adm-picklist__main">
              <b>{r.name}</b>
            </span>
            <span className="adm-picklist__aside num" aria-label={plural(r.members, "person", "people")}>
              {r.members}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RoleDetail({ role, onDuplicate, onDeleted }: { role: RoleRow; onDuplicate: () => void; onDeleted: () => void }) {
  const { data, confirm, go } = useConsole();
  const act = useAct();
  const v = data.viewer;
  const [tab, setTab] = useState<"Permissions" | "People" | "Preview">("Permissions");
  const [perms, setPerms] = useState<PermissionSet>(role.permissions);
  const [exceptions, setExceptions] = useState<PermissionSet>(role.exceptions ?? {});
  const [meta, setMeta] = useState({ name: role.name, description: role.description, inherits: role.inherits ?? "" });
  const discard = () => {
    setPerms(role.permissions);
    setExceptions(role.exceptions ?? {});
    setMeta({ name: role.name, description: role.description, inherits: role.inherits ?? "" });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(discard, [role]);
  const draft: Role = { ...role, ...meta, inherits: meta.inherits || undefined, permissions: perms, exceptions };
  const roles = data.roles.map((r) => (r.id === role.id ? draft : r));
  const dirty =
    JSON.stringify(normalize(perms)) !== JSON.stringify(normalize(role.permissions)) ||
    JSON.stringify(normalize(exceptions)) !== JSON.stringify(normalize(role.exceptions ?? {})) ||
    meta.name !== role.name ||
    meta.description !== role.description ||
    (meta.inherits || "") !== (role.inherits ?? "");
  const toggle = useToggle(draft, roles, perms, setPerms, exceptions, setExceptions);
  const locked = (m: ModuleKey, a: Action) => (!v.superAdmin && !has(v.perms, m, a) && permissionOrigin(draft, roles, m, a) === "none" ? NOT_YOURS : null);
  const members = (data.accounts ?? []).filter((a) => a.assignments.some((x) => x.roleId === role.id));
  const parent = data.roles.find((r) => r.id === role.inherits);

  return (
    <div className="adm-stack adm-stack--tight">
      <header className="adm-detail-head">
        <div>
          <h3 className="adm-detail-head__title">{role.name}</h3>
          <p className="adm-muted">{role.description}</p>
          <p className="adm-inline adm-inline--wrap">
            <Pill tone={role.system ? "neutral" : "gold"}>{role.system ? "Built-in" : "Custom"}</Pill>
            {parent && <Pill tone="review">Inherits {parent.name}</Pill>}
            {role.technical && <Pill tone="revise">Technical</Pill>}
            <span className="adm-muted small">{plural(role.members, "person", "people")}</span>
          </p>
        </div>
        <div className="adm-actions">
          {viewerCan(v, "roles", "create") && (
            <button type="button" className="btn btn--sm" onClick={onDuplicate}>
              <Icon name="copy" size={15} /> Duplicate
            </button>
          )}
          {!role.system && viewerCan(v, "roles", "delete") && (
            <button
              type="button"
              className="btn btn--sm btn--danger"
              aria-label={`Delete ${role.name}`}
              title="Delete role"
              onClick={async () => {
                const ok = await confirm({ title: `Delete ${role.name}?`, body: "Only roles nobody holds can be deleted.", confirm: "Delete", tone: "danger" });
                if (ok !== null) {
                  const r = await act({ type: "role.delete", id: role.id });
                  if (r.ok) onDeleted();
                }
              }}
            >
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
      </header>

      <Tabs label="Role details" value={tab} onChange={setTab} tabs={["Permissions", "People", "Preview"] as const} />

      {tab === "Permissions" && (
        <>
          {!role.canEdit && <ReadOnly>{role.system ? "Built-in roles can't be changed. Duplicate one to customize it." : "View only."}</ReadOnly>}
          {role.canEdit && (
            <div className="adm-form-grid">
              <Field label="Name">
                <input className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
              </Field>
              <Field
                label={
                  <>
                    Inherits from <Hint text="Gets everything that role can do. Untick a box to make an exception." />
                  </>
                }
              >
                <select className="select" value={meta.inherits} onChange={(e) => setMeta({ ...meta, inherits: e.target.value })}>
                  <option value="">Nothing</option>
                  {data.roles
                    .filter((r) => r.id !== role.id)
                    .map((r) => (
                      <option key={r.id} value={r.id} disabled={!r.grantable}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Description" wide>
                <input className="input" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
              </Field>
            </div>
          )}
          <PermissionMatrix caption={`${role.name} permissions`} cell={(m, a) => permissionOrigin(draft, roles, m, a)} onToggle={role.canEdit ? toggle : undefined} locked={role.canEdit ? locked : undefined} />
          {role.canEdit && dirty && (
            <div className="adm-savebar">
              <span>Unsaved changes</span>
              <button type="button" className="btn btn--sm" onClick={discard}>
                Discard
              </button>
              <button
                type="button"
                className="btn btn--sm btn--dark"
                onClick={() => void act({ type: "role.update", id: role.id, name: meta.name, description: meta.description, inherits: meta.inherits || null, permissions: perms, exceptions })}
              >
                Save
              </button>
            </div>
          )}
        </>
      )}

      {tab === "People" &&
        (data.accounts ? (
          members.length ? (
            <ul className="adm-assignments">
              {members.map((a) =>
                a.assignments
                  .filter((x) => x.roleId === role.id)
                  .map((x) => (
                    <li key={x.id}>
                      <div>
                        <button type="button" className="link" onClick={() => go("accounts", a.id)}>
                          {a.name}
                        </button>
                        <span className="adm-muted">{scopeText(x.scope, data)}</span>
                      </div>
                      <span className="adm-inline">
                        {x.expires && <Pill tone="review">Until {fmtDate(x.expires)}</Pill>}
                        {a.status !== "Active" && <Pill tone="missing">{a.status === "Pending Invitation" ? "Invited" : a.status}</Pill>}
                      </span>
                    </li>
                  )),
              )}
            </ul>
          ) : (
            <EmptyNote icon="users" title="Nobody has this role" />
          )
        ) : (
          <EmptyNote icon="lock" title="Needs account access" />
        ))}

      {tab === "Preview" && <Preview role={role} />}
    </div>
  );
}

/** What one person would be able to do with this role added. */
function Preview({ role }: { role: RoleRow }) {
  const { data } = useConsole();
  const accounts = data.accounts ?? [];
  const [id, setId] = useState(accounts[0]?.id ?? "");
  const a = accounts.find((x) => x.id === id);
  if (!accounts.length) return <EmptyNote icon="lock" title="Needs account access" />;
  const before = a ? union(...a.assignments.filter((x) => !x.expires || x.expires > data.day).map((x) => rolePermissions(x.roleId, data.roles))) : {};
  const after = union(before, role.effective);
  const added = MODULES.reduce((n, m) => n + m.actions.filter((x) => has(after, m.key, x) && !has(before, m.key, x)).length, 0);
  return (
    <div className="adm-stack adm-stack--tight">
      <Field label="Preview for">
        <select className="select" value={id} onChange={(e) => setId(e.target.value)}>
          {accounts.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      {a && (
        <>
          <p className="adm-note">{added ? `${a.name} would gain ${plural(added, "permission")}.` : `${a.name} already has everything in this role.`}</p>
          <PermissionMatrix caption={`Effective permissions for ${a.name} with ${role.name}`} cell={diffCell(before, after)} />
        </>
      )}
    </div>
  );
}

/* ---------- New role ---------- */

/** "", "t:<template>" or "r:<role>". */
type Source = string;

function NewRole({ state, onClose, onCreated }: { state: null | { from?: string }; onClose: () => void; onCreated: (id: string) => void }) {
  const { data } = useConsole();
  const act = useAct();
  const v = data.viewer;
  const [source, setSource] = useState<Source>("");
  const [linked, setLinked] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeKind, setScopeKind] = useState<Role["scopeKind"]>("unit");
  const [perms, setPerms] = useState<PermissionSet>({});
  const [exceptions, setExceptions] = useState<PermissionSet>({});
  useEffect(() => {
    if (!state) return;
    const r = data.roles.find((x) => x.id === state.from);
    setSource(r ? `r:${r.id}` : "");
    setLinked(false);
    setName(r ? `${r.name} (copy)` : "");
    setDescription(r?.description ?? "");
    setScopeKind(r?.scopeKind ?? "unit");
    setPerms(r ? r.effective : {});
    setExceptions({});
  }, [state, data.roles]);

  const base = source.startsWith("r:") ? data.roles.find((r) => r.id === source.slice(2)) : undefined;
  const pick = (next: Source) => {
    setSource(next);
    setExceptions({});
    if (next.startsWith("t:")) {
      setLinked(false);
      setPerms(data.templates.find((t) => t.id === next.slice(2))?.permissions ?? {});
    } else if (next.startsWith("r:")) {
      const r = data.roles.find((x) => x.id === next.slice(2));
      setPerms(linked ? {} : r?.effective ?? {});
      if (r) setScopeKind(r.scopeKind);
    } else {
      setLinked(false);
      setPerms({});
    }
  };
  const link = (on: boolean) => {
    setLinked(on);
    setExceptions({});
    setPerms(on ? {} : base?.effective ?? {});
  };
  const draft: Role = { id: "__new", name, description, system: false, tier: 1, inherits: linked ? base?.id : undefined, permissions: perms, exceptions, scopeKind, createdAt: "" };
  const roles = useMemo(() => [...data.roles, draft], [data.roles, draft]);
  const toggle = useToggle(draft, roles, perms, setPerms, exceptions, setExceptions);
  const locked = (m: ModuleKey, a: Action) => (!v.superAdmin && !has(v.perms, m, a) && permissionOrigin(draft, roles, m, a) === "none" ? NOT_YOURS : null);

  return (
    <Sheet
      open={!!state}
      wide
      onClose={onClose}
      title="New role"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--dark"
            disabled={name.trim().length < 3}
            onClick={async () => {
              const r = await act({ type: "role.create", name, description, inherits: linked ? base?.id : undefined, permissions: perms, exceptions, scopeKind });
              if (r.ok) {
                onClose();
                if (typeof r.data === "string") onCreated(r.data);
              }
            }}
          >
            Create role
          </button>
        </>
      }
    >
      <div className="adm-form-grid">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sustainability Data Steward" />
        </Field>
        <Field label="Start from">
          <select className="select" value={source} onChange={(e) => pick(e.target.value)}>
            <option value="">Blank</option>
            <optgroup label="Templates">
              {data.templates.map((t) => (
                <option key={t.id} value={`t:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Existing roles">
              {data.roles.map((r) => (
                <option key={r.id} value={`r:${r.id}`} disabled={!r.grantable}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Description" wide>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the role is for" />
        </Field>
        <Field label="Applies to">
          <select className="select" value={scopeKind} onChange={(e) => setScopeKind(e.target.value as Role["scopeKind"])}>
            <option value="unit">Their own unit</option>
            <option value="university">The whole University</option>
            <option value="custom">Chosen for each person</option>
          </select>
        </Field>
      </div>
      {base && (
        <label className="choice">
          <input type="checkbox" checked={linked} onChange={(e) => link(e.target.checked)} />
          Stay in sync with {base.name} <Hint text={`Later changes to ${base.name} apply here too. Untick a box to make an exception.`} />
        </label>
      )}
      <PermissionMatrix caption="New role permissions" cell={(m, a) => permissionOrigin(draft, roles, m, a)} onToggle={toggle} locked={locked} />
    </Sheet>
  );
}

/* ---------- Temporary access ---------- */

function Temporary({ rows }: { rows: { a: AccountRow; x: Assignment }[] }) {
  const { data, go } = useConsole();
  const left = (iso: string) => Math.round((Date.parse(iso) - Date.parse(data.day)) / 86_400_000);
  const sorted = [...rows].sort((p, q) => (p.x.expires ?? "").localeCompare(q.x.expires ?? ""));
  if (!sorted.length) return <EmptyNote icon="clock" title="No temporary access" />;
  return (
    <>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Ends</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ a, x }) => {
              const d = left(x.expires!);
              return (
                <tr key={x.id} className="is-clickable" onClick={() => go("accounts", a.id)}>
                  <td>
                    <b>{a.name}</b>
                  </td>
                  <td>
                    {data.roles.find((r) => r.id === x.roleId)?.name}
                    <small className="adm-muted block">{scopeText(x.scope, data)}</small>
                  </td>
                  <td>
                    <Pill tone={d <= 7 ? "revise" : d <= 21 ? "review" : "neutral"}>
                      {fmtDate(x.expires)} · {plural(d, "day")}
                    </Pill>
                  </td>
                  <td className="adm-muted">{x.note ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="adm-count">Access ends automatically on the end date.</p>
    </>
  );
}
