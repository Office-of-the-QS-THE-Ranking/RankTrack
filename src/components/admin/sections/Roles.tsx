"use client";

import { useCallback, useState } from "react";
import { ACTIONS, MODULES, ROLE_SECTIONS } from "@/lib/governance/catalog";
import type { AccountRow, RoleRow } from "@/lib/governance/console-types";
import { canEditRolePermissions, has, normalize } from "@/lib/governance/rbac";
import type { Action, Assignment, ModuleKey, PermissionSet, RoleId } from "@/lib/governance/types";
import { Icon, type IconName } from "@/components/ui/Icon";
import { InfoTooltip, TabPanel } from "@/components/ui/interactive";
import { Select } from "@/components/ui/pickers";
import { PermissionLegend, PermissionMatrix, type CellState } from "../parts";
import { Avatar, EmptyNote, Hint, Pill, Sheet, Tabs, fmtDate, plural, useConsole } from "../ui";
import { scopeText } from "./Accounts";

type Tab = "Roles" | "Temporary access";

const GLYPH: Record<RoleId, IconName> = { administrator: "shield-check", coordinator: "contributions", student: "education", external: "globe" };

/** Where an assignment of the role reaches, in a few words. */
const where = (r: RoleRow) =>
  r.universityPermissions ? "Unit or University-wide" : r.scopeKind === "custom" ? "Guests, until an end date" : ROLE_SECTIONS[r.id].includes("offices") ? "Office or college" : "College or faculty";

/** Ink is what every holder of the role gets; `wide` what only a University-wide holder adds. */
const cellOf = (r: RoleRow) => (m: ModuleKey, a: Action): CellState =>
  has(r.permissions, m, a) ? "granted" : r.universityPermissions && has(r.universityPermissions, m, a) ? "wide" : "none";

const TOTAL = MODULES.reduce((n, m) => n + m.actions.length, 0);

function tally(r: RoleRow) {
  const cell = cellOf(r);
  const cells = MODULES.flatMap((m) => m.actions.map((a) => cell(m.key, a)));
  return { total: cells.length, granted: cells.filter((c) => c === "granted").length, wide: cells.filter((c) => c === "wide").length };
}

const holders = (accounts: AccountRow[], id: RoleId) => accounts.flatMap((a) => a.assignments.filter((x) => x.roleId === id).map((x) => ({ a, x })));

export function Roles() {
  const { data, focus } = useConsole();
  const [tab, setTab] = useState<Tab>(focus === "temporary" ? "Temporary access" : "Roles");
  const temporary = (data.accounts ?? []).flatMap((a) => a.assignments.filter((x) => x.expires && x.expires > data.day).map((x) => ({ a, x })));
  return (
    <div className="rp">
      <Tabs
        label="Roles and permissions"
        idBase="rp"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "Roles", label: "Roles", count: data.roles.length },
          { key: "Temporary access", label: "Temporary access", count: temporary.length },
        ]}
      />
      <TabPanel idBase="rp" index={tab === "Roles" ? 0 : 1} className="rp-panel">
        {tab === "Roles" ? <RoleBrowser /> : <Temporary rows={temporary} />}
      </TabPanel>
    </div>
  );
}

/* ---------- Roles ---------- */

function RoleBrowser() {
  const { data } = useConsole();
  const [sel, setSel] = useState<RoleId | undefined>(data.roles[0]?.id);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const role = data.roles.find((r) => r.id === sel) ?? data.roles[0];
  return (
    <>
      <ul className="rp-roles" aria-label="Roles">
        {data.roles.map((r) => (
          <li key={r.id}>
            <RoleCard
              role={r}
              current={r.id === role?.id}
              expanded={open && r.id === role?.id}
              onPick={() => {
                setSel(r.id);
                setOpen(true);
              }}
            />
          </li>
        ))}
      </ul>
      {role && (
        <Sheet
          open={open}
          title={
            <span className="rp-modal-heading">
              <span className="rp-glyph rp-glyph--lg">
                <Icon name={GLYPH[role.id]} size={24} />
              </span>
              <span>
                <span className="rp-modal-heading__name">
                  {role.name}
                  <InfoTooltip label={`About ${role.name}`} escapeClipping>{role.description}</InfoTooltip>
                </span>
                <small className="rp-modal-heading__context">Roles & Permissions</small>
              </span>
            </span>
          }
          onClose={close}
          modal
        >
          <RoleDetail key={role.id} role={role} />
        </Sheet>
      )}
    </>
  );
}

function RoleCard({ role, current, expanded, onPick }: { role: RoleRow; current: boolean; expanded: boolean; onPick: () => void }) {
  const { data } = useConsole();
  const { granted, wide } = tally(role);
  const faces = data.accounts ? [...new Map(holders(data.accounts, role.id).map(({ a }) => [a.id, a])).values()].slice(0, 3) : [];
  return (
    <button type="button" className="rp-role" data-current={current || undefined} aria-haspopup="dialog" aria-expanded={expanded} onClick={onPick}>
      <span className="rp-role__top">
        <span className="rp-glyph">
          <Icon name={GLYPH[role.id]} size={19} />
        </span>
        <span className="rp-faces">
          {faces.map((a) => (
            <Avatar key={a.id} name={a.name} src={a.avatar} size={24} />
          ))}
          <span className="rp-faces__n num">
            {role.members ? (
              <>
                {role.members}
                <span className="sr-only"> {role.members === 1 ? "person" : "people"}</span>
              </>
            ) : (
              "No one"
            )}
          </span>
        </span>
      </span>
      <span className="rp-role__name">{role.name}</span>
      <span className="rp-role__where">{where(role)}</span>
      <Fingerprint role={role} />
      <span className="rp-role__foot">
        <b className="num">{granted + wide}</b> of {TOTAL} permissions
      </span>
    </button>
  );
}

const DOT = 6;
const STEP = 9;
const GAP = 7;

/** The role's permissions in miniature: modules across, actions down, one dot each, groups set apart. */
function Fingerprint({ role }: { role: RoleRow }) {
  const cell = cellOf(role);
  const dots: { x: number; y: number; st: CellState | "na"; k: string }[] = [];
  let x = 0;
  MODULES.forEach((m, i) => {
    if (i && m.group !== MODULES[i - 1].group) x += GAP;
    ACTIONS.forEach((a, j) => dots.push({ x, y: j * STEP, st: m.actions.includes(a.key) ? cell(m.key, a.key) : "na", k: `${m.key}.${a.key}` }));
    x += STEP;
  });
  return (
    <svg className="rp-fp" viewBox={`0 0 ${x - STEP + DOT} ${ACTIONS.length * STEP - STEP + DOT}`} aria-hidden="true">
      {dots.map((d) => (
        <circle key={d.k} cx={d.x + DOT / 2} cy={d.y + DOT / 2} r={d.st === "na" ? 1 : DOT / 2} className={`is-${d.st}`} />
      ))}
    </svg>
  );
}

function RoleDetail({ role }: { role: RoleRow }) {
  const { data, go, run, busy, notify } = useConsole();
  const [tab, setTab] = useState<"Permissions" | "People">("Permissions");
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState<"unit" | "university">(role.universityPermissions ? "university" : "unit");
  const [draft, setDraft] = useState<PermissionSet>({});
  const [previous, setPrevious] = useState<PermissionSet>({});
  const editable = canEditRolePermissions({ unitId: data.viewer.unitId, status: "Active" }, data.viewer.grants);
  const start = (target = scope) => {
    const permissions = target === "university" ? role.universityPermissions! : role.permissions;
    setScope(target);
    setPrevious(normalize(permissions));
    setDraft(normalize(permissions));
    setEditing(true);
  };
  const save = async () => {
    const result = await run({ type: "role.permissions", id: role.id, scope, permissions: draft, previous });
    notify(result.message, result.ok ? "ok" : "error");
    if (result.ok) setEditing(false);
  };
  const toggle = (module: ModuleKey, action: Action) => setDraft((value) => ({
    ...value,
    [module]: has(value, module, action) ? value[module]!.filter((a) => a !== action) : [...(value[module] ?? []), action],
  }));
  const rows = data.accounts ? holders(data.accounts, role.id) : [];
  const head = `rp-role-${role.id}`;
  const permissionCell = editing ? (m: ModuleKey, a: Action): CellState => has(draft, m, a) ? scope === "university" ? "wide" : "granted" : "none" : cellOf(role);
  const permissionLabels = editing ? { granted: "Allowed", wide: "Allowed in the Rankings Office", none: "Not allowed" } : role.universityPermissions ? { granted: "Every Administrator", wide: "Rankings Office only" } : { granted: "Allowed", none: "Not allowed" };

  return (
    <section className="rp-detail" aria-label={`${role.name} details`}>
      <div className="rp-detail__content">
        <div className="rp-body">
          <Tabs
            label={`${role.name} details`}
            idBase={head}
            value={tab}
            onChange={setTab}
            tabs={["Permissions", { key: "People", label: "People", count: role.members }]}
            actions={tab === "Permissions" ? (
              <>
                {editable && (editing ? (
                  <>
                    {role.universityPermissions && (
                      <Select className="select select--sm content-tabs__action" aria-label="Permission scope" value={scope} disabled={busy} onChange={(value) => start(value as "unit" | "university")}>
                        <option value="unit">Office or college</option>
                        <option value="university">Rankings Office (University-wide)</option>
                      </Select>
                    )}
                    <button type="button" className="content-tabs__action" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
                    <button type="button" className="content-tabs__action" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save permissions"}</button>
                  </>
                ) : (
                  <button type="button" className="content-tabs__action" onClick={() => start()}>Edit permissions</button>
                ))}
                <PermissionLegend cell={permissionCell} labels={permissionLabels} />
              </>
            ) : undefined}
          />
          <TabPanel idBase={head} index={tab === "Permissions" ? 0 : 1} className="rp-panel">
            {tab === "Permissions" ? (
              <PermissionMatrix
                caption={role.universityPermissions ? `${role.name} permissions; gold ones are held only University-wide` : `${role.name} permissions`}
                cell={permissionCell}
                labels={permissionLabels}
                showLegend={false}
                fold={!editing}
                onToggle={editing && editable ? toggle : undefined}
                disabled={busy}
                locked={(m) => role.id === "administrator" && scope === "university" && m === "roles"}
              />
            ) : !data.accounts ? (
              <EmptyNote icon="lock" title="Needs account access" />
            ) : rows.length ? (
              <ul className="rp-people">
                {rows.map(({ a, x }) => (
                  <li key={x.id}>
                    <button type="button" className="rp-person" onClick={() => go("accounts", a.id)}>
                      <Avatar name={a.name} src={a.avatar} size={36} placeholder />
                      <span className="rp-person__main">
                        <b>{a.name}</b>
                        <small>{scopeText(x.scope, data)}</small>
                      </span>
                      {x.expires && <Pill tone="review">Until {fmtDate(x.expires)}</Pill>}
                      {a.status !== "Active" && <Pill tone="missing">{a.status === "Pending Invitation" ? "Invited" : a.status}</Pill>}
                      <Icon name="chevron" size={16} className="rp-person__go" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote icon="users" title="Nobody has this role" />
            )}
          </TabPanel>
        </div>
      </div>
    </section>
  );
}

/* ---------- Temporary access ---------- */

const DAY = 86_400_000;

function Temporary({ rows }: { rows: { a: AccountRow; x: Assignment }[] }) {
  const { data, go } = useConsole();
  const sorted = [...rows].sort((p, q) => (p.x.expires ?? "").localeCompare(q.x.expires ?? ""));
  if (!sorted.length) return <EmptyNote icon="clock" title="No temporary access" />;
  return (
    <div className="adm-table-wrap rp-temp">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Role</th>
            <th>
              Ends <Hint text="Access ends automatically on this date." />
            </th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ a, x }) => {
            const left = Math.round((Date.parse(x.expires!) - Date.parse(data.day)) / DAY);
            const span = Math.max(1, Math.round((Date.parse(x.expires!) - Date.parse(x.grantedAt)) / DAY));
            const role = data.roles.find((r) => r.id === x.roleId);
            return (
              <tr key={x.id} className="is-clickable" onClick={() => go("accounts", a.id)}>
                <td>
                  <span className="rp-who">
                    <Avatar name={a.name} src={a.avatar} size={30} placeholder />
                    <b>{a.name}</b>
                  </span>
                </td>
                <td>
                  <span className="rp-who">
                    {role && (
                      <span className="rp-glyph rp-glyph--sm">
                        <Icon name={GLYPH[role.id]} size={14} />
                      </span>
                    )}
                    <span>
                      {role?.name}
                      <small className="adm-muted block">{scopeText(x.scope, data)}</small>
                    </span>
                  </span>
                </td>
                <td>
                  <span className={`rp-left is-${left <= 7 ? "soon" : left <= 21 ? "near" : "far"}`}>
                    <span className="rp-left__bar" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, (left / span) * 100)}%` }} />
                    </span>
                    <span>
                      {fmtDate(x.expires)} <small className="num">{plural(left, "day")} left</small>
                    </span>
                  </span>
                </td>
                <td className="adm-muted">{x.note ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
