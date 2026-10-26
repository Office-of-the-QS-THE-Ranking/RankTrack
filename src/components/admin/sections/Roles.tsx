"use client";

import { useState } from "react";
import type { AccountRow, RoleRow } from "@/lib/governance/console-types";
import { has } from "@/lib/governance/rbac";
import type { Assignment, RoleId } from "@/lib/governance/types";
import { PermissionMatrix, diffCell } from "../parts";
import { EmptyNote, Pill, Tabs, fmtDate, plural, useConsole } from "../ui";
import { scopeText } from "./Accounts";

type Tab = "Roles" | "Temporary access";

/** Where an assignment of each kind of role normally reaches. */
const SCOPE: Record<RoleRow["scopeKind"], string> = {
  university: "University-wide",
  unit: "Their office or college",
  custom: "Chosen for each person, with an end date",
};

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
          { key: "Roles", label: "Roles", count: data.roles.length },
          { key: "Temporary access", label: "Temporary access", count: temporary.length },
        ]}
      />
      {tab === "Roles" ? <RoleBrowser /> : <Temporary rows={temporary} />}
    </div>
  );
}

/* ---------- Roles ---------- */

function RoleBrowser() {
  const { data } = useConsole();
  const [sel, setSel] = useState<RoleId>(data.roles[0].id);
  const role = data.roles.find((r) => r.id === sel) ?? data.roles[0];
  return (
    <div className="adm-split">
      <div className="adm-split__list">
        <ul className="adm-picklist">
          {data.roles.map((r) => (
            <li key={r.id}>
              <button type="button" aria-current={r.id === role.id ? "true" : undefined} onClick={() => setSel(r.id)} title={r.description}>
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
      </div>
      <div className="adm-split__detail">
        <RoleDetail key={role.id} role={role} />
      </div>
    </div>
  );
}

function RoleDetail({ role }: { role: RoleRow }) {
  const { data, go } = useConsole();
  const [tab, setTab] = useState<"Permissions" | "People">("Permissions");
  const members = (data.accounts ?? []).filter((a) => a.assignments.some((x) => x.roleId === role.id));

  return (
    <div className="adm-stack adm-stack--tight">
      <header className="adm-detail-head">
        <div>
          <h3 className="adm-detail-head__title">{role.name}</h3>
          <p className="adm-muted">{role.description}</p>
          <p className="adm-inline adm-inline--wrap">
            <Pill tone="neutral">{role.universityPermissions ? "Their office or college; University-wide in the Rankings Office" : SCOPE[role.scopeKind]}</Pill>
            <span className="adm-muted small">{plural(role.members, "person", "people")}</span>
          </p>
        </div>
      </header>

      <Tabs label="Role details" value={tab} onChange={setTab} tabs={["Permissions", "People"] as const} />

      {tab === "Permissions" &&
        (role.universityPermissions ? (
          // what an office or college Administrator holds, and what a University-wide one adds
          <PermissionMatrix caption={`${role.name} permissions; added ones are held only University-wide`} cell={diffCell(role.permissions, role.universityPermissions)} />
        ) : (
          <PermissionMatrix caption={`${role.name} permissions`} cell={(m, a) => (has(role.permissions, m, a) ? "granted" : "none")} />
        ))}

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
    </div>
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
