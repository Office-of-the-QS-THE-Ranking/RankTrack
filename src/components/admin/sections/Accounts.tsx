"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccountRow } from "@/lib/governance/console-types";
import { UNIVERSITY, has, rolePermissions, union, unitScope } from "@/lib/governance/rbac";
import type { AccountStatus, Scope } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { PermissionMatrix, ScopeEditor, UnitSelect, diffCell, parentPath } from "../parts";
import { readSheetFile } from "../sheet-reader";
import {
  Avatar,
  Block,
  Disclosure,
  EmptyNote,
  Field,
  KV,
  Pill,
  ReadOnly,
  RowMenu,
  SearchField,
  Sheet,
  StatusPill,
  Tabs,
  download,
  fmtAgo,
  fmtDate,
  plural,
  useAct,
  useConsole,
  type ConfirmOptions,
} from "../ui";

type Filter = "All" | AccountStatus | "Flagged";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "All", label: "All" },
  { key: "Active", label: "Active" },
  { key: "Pending Invitation", label: "Invited" },
  { key: "Suspended", label: "Suspended" },
  { key: "Deactivated", label: "Deactivated" },
  { key: "Flagged", label: "Needs review" },
];

/** The confirmations shared by the row menu and the account panel. */
const reasonInput = { label: "Reason", placeholder: "Saved in the audit log", required: true };
const STATUS_CONFIRM: Record<"Suspended" | "Deactivated" | "Cancel", (name: string) => ConfirmOptions> = {
  Suspended: (name) => ({ title: `Suspend ${name}?`, body: "They are signed out now and can't sign in until reactivated.", confirm: "Suspend", tone: "danger", input: reasonInput }),
  Deactivated: (name) => ({ title: `Deactivate ${name}?`, body: "Their access ends. Their submissions stay with their unit.", confirm: "Deactivate", tone: "danger", input: reasonInput }),
  Cancel: (name) => ({ title: `Cancel ${name}'s invitation?`, body: "The invitation link stops working.", confirm: "Cancel invitation", tone: "danger", input: reasonInput }),
};

/** Suspend, deactivate, cancel an invitation or reactivate, asking first where it takes access away. */
function useStatusChange() {
  const { confirm } = useConsole();
  const act = useAct();
  return async (a: AccountRow, to: "Active" | "Suspended" | "Deactivated" | "Cancel") => {
    const reason = to === "Active" ? "Reactivated by an administrator" : await confirm(STATUS_CONFIRM[to](a.name));
    if (reason === null) return;
    await act({ type: "account.status", id: a.id, status: to === "Cancel" ? "Deactivated" : to, reason });
  };
}

export function Accounts() {
  const { data, focus } = useConsole();
  const v = data.viewer;
  const accounts = data.accounts ?? [];
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>(focus === "flagged" ? "Flagged" : "All");
  const [unit, setUnit] = useState("");
  const [role, setRole] = useState("");
  const [open, setOpen] = useState<string | null>(focus && focus.startsWith("ACC-") ? focus : null);
  const [inviting, setInviting] = useState(false);
  const [importing, setImporting] = useState(false);
  const canCreate = viewerCan(v, "accounts", "create");

  const count = (f: Filter) => (f === "All" ? accounts.length : f === "Flagged" ? accounts.filter((a) => a.inactive).length : accounts.filter((a) => a.status === f).length);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return accounts
      .filter((a) => !t || a.name.toLowerCase().includes(t) || a.email.includes(t) || a.title.toLowerCase().includes(t))
      .filter((a) => (filter === "All" ? true : filter === "Flagged" ? a.inactive : a.status === filter))
      .filter((a) => !unit || a.unitId === unit)
      .filter((a) => !role || a.assignments.some((x) => x.roleId === role))
      .sort((a, b) => Number(b.inactive) - Number(a.inactive) || a.name.replace(/^\S+\.\s/, "").localeCompare(b.name.replace(/^\S+\.\s/, "")));
  }, [accounts, q, filter, unit, role]);

  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? id;
  const current = accounts.find((a) => a.id === open) ?? null;
  const everywhere = v.superAdmin || v.grants.some((g) => g.units === "all" && has(g.perms, "accounts", "view"));

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Search people" label="Search accounts" />
        <select className="select select--sm" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Filter by unit">
          <option value="">All units</option>
          {[...new Set(accounts.map((a) => a.unitId))]
            .sort((a, b) => unitName(a).localeCompare(unitName(b)))
            .map((u) => (
              <option key={u} value={u}>
                {unitName(u)}
              </option>
            ))}
        </select>
        <select className="select select--sm" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {data.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <span className="adm-toolbar__spacer" />
        {canCreate && (
          <>
            <button type="button" className="btn btn--sm" onClick={() => setImporting(true)}>
              <Icon name="upload" size={15} /> Import
            </button>
            <button type="button" className="btn btn--dark btn--sm" onClick={() => setInviting(true)}>
              <Icon name="user-plus" size={15} /> Invite
            </button>
          </>
        )}
      </div>

      <Tabs<Filter>
        label="Filter accounts by status"
        value={filter}
        onChange={setFilter}
        tabs={FILTERS.filter((f) => f.key === "All" || f.key === filter || count(f.key) > 0).map((f) => ({
          key: f.key,
          label: (
            <>
              {f.label}
              <span className={`adm-tabs__count${f.key === "Flagged" && count(f.key) ? " is-alert" : ""}`}>{count(f.key)}</span>
            </>
          ),
        }))}
      />

      {shown.length ? (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Unit</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="is-clickable" onClick={() => setOpen(a.id)}>
                  <td>
                    <button type="button" className="adm-person" onClick={(e) => { e.stopPropagation(); setOpen(a.id); }}>
                      <Avatar name={a.name} />
                      <span>
                        <b>{a.name}</b>
                        <small>{a.email}</small>
                      </span>
                    </button>
                  </td>
                  <td className="adm-muted adm-cell-unit">
                    <span title={unitName(a.unitId)}>{unitName(a.unitId)}</span>
                  </td>
                  <td>
                    <span className="adm-rolelist">
                      {a.roleNames.slice(0, 1).map((r) => (
                        <span key={r} className="adm-chip adm-chip--quiet">
                          {r}
                        </span>
                      ))}
                      {a.roleNames.length > 1 && <span className="adm-muted small" title={a.roleNames.slice(1).join(", ")}>+{a.roleNames.length - 1}</span>}
                      {!a.roleNames.length && <span className="adm-muted small">None</span>}
                    </span>
                  </td>
                  <td>
                    <span className="adm-inline">
                      <StatusPill value={a.status} />
                      {a.inactive && <Pill tone="revise">Idle {a.idleDays} days</Pill>}
                      {a.external && <Pill tone="gold">Guest</Pill>}
                    </span>
                  </td>
                  <td className="adm-muted num">{a.status === "Pending Invitation" ? "—" : fmtAgo(a.lastLogin, data.now)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <QuickMenu a={a} onOpen={() => setOpen(a.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote icon="search" title="No accounts match" />
      )}
      <p className="adm-count">
        {plural(shown.length, "account")}
        {everywhere ? "" : " in your units"}
      </p>

      <AccountSheet account={current} onClose={() => setOpen(null)} />
      <InviteSheet open={inviting} onClose={() => setInviting(false)} onCreated={(id) => setOpen(id)} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

/* ---------- Row quick actions ---------- */

function QuickMenu({ a, onOpen }: { a: AccountRow; onOpen: () => void }) {
  const act = useAct();
  const status = useStatusChange();
  return (
    <RowMenu
      label={`Actions for ${a.name}`}
      items={[
        { label: "Open", icon: "eye", onSelect: onOpen },
        a.canEdit && a.status === "Pending Invitation" && { label: "Re-send invitation", icon: "send", onSelect: () => void act({ type: "account.resend", id: a.id }) },
        a.canEdit && a.inactive && { label: "Keep active", icon: "check", onSelect: () => void act({ type: "account.keep", id: a.id }) },
        a.canEdit && a.status === "Active" && { label: "Suspend", icon: "ban", danger: true, onSelect: () => void status(a, "Suspended") },
        a.canEdit && (a.status === "Suspended" || a.status === "Deactivated") && { label: "Reactivate", icon: "refresh", onSelect: () => void status(a, "Active") },
        a.canEdit && a.sessions > 0 && { label: "Sign out everywhere", icon: "logout", onSelect: () => void act({ type: "account.revoke", id: a.id }) },
      ]}
    />
  );
}

/* ---------- One account ---------- */

function AccountSheet({ account: a, onClose }: { account: AccountRow | null; onClose: () => void }) {
  const { data, go } = useConsole();
  const act = useAct();
  const status = useStatusChange();
  const [tab, setTab] = useState<"Profile" | "Roles" | "Activity">("Profile");
  const [mode, setMode] = useState<"view" | "edit" | "transfer">("view");
  useEffect(() => {
    setTab("Profile");
    setMode("view");
  }, [a?.id]);
  if (!a) return <Sheet open={false} title="" onClose={onClose}>{null}</Sheet>;
  const unit = data.units.find((u) => u.id === a.unitId);
  const events = (data.audit?.events ?? []).filter((e) => e.resource.id === a.id || e.actorId === a.id).slice(0, 14);
  const edit = (m: "edit" | "transfer") => {
    setTab("Profile");
    setMode(m);
  };

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={
        <span className="adm-inline">
          <Avatar name={a.name} size={34} />
          <span>
            {a.name}
            <small className="adm-sheet__mail">{a.email}</small>
          </span>
        </span>
      }
      sub={
        <span className="adm-inline">
          <StatusPill value={a.status} />
          {a.external && <Pill tone="gold">Guest</Pill>}
        </span>
      }
    >
      {a.canEdit ? (
        <div className="adm-actionrow">
          {(a.status === "Suspended" || a.status === "Deactivated") && (
            <button type="button" className="btn btn--sm btn--dark" onClick={() => void status(a, "Active")}>
              <Icon name="refresh" size={15} /> Reactivate
            </button>
          )}
          {a.status === "Pending Invitation" && (
            <button type="button" className="btn btn--sm" onClick={() => void act({ type: "account.resend", id: a.id })}>
              <Icon name="send" size={15} /> Re-send invitation
            </button>
          )}
          <button type="button" className="btn btn--sm" onClick={() => edit("edit")}>
            <Icon name="pen" size={15} /> Edit
          </button>
          {a.status !== "Deactivated" && (
            <button type="button" className="btn btn--sm" onClick={() => edit("transfer")}>
              <Icon name="move" size={15} /> Transfer
            </button>
          )}
          {a.status === "Active" && (
            <button type="button" className="btn btn--sm" onClick={() => void status(a, "Suspended")}>
              <Icon name="ban" size={15} /> Suspend
            </button>
          )}
          <RowMenu
            label="More actions"
            items={[
              a.status === "Active" && { label: "Sign out everywhere", icon: "logout", onSelect: () => void act({ type: "account.revoke", id: a.id }) },
              a.status === "Active" && { label: "Require sign-in again", icon: "key", onSelect: () => void act({ type: "account.reauth", id: a.id }) },
              a.status === "Pending Invitation" && { label: "Cancel invitation", icon: "close", danger: true, onSelect: () => void status(a, "Cancel") },
              (a.status === "Active" || a.status === "Suspended") && { label: "Deactivate", icon: "trash", danger: true, onSelect: () => void status(a, "Deactivated") },
            ]}
          />
        </div>
      ) : (
        <ReadOnly>
          {a.id === data.viewer.id
            ? "Your own account. Another administrator must change it."
            : !viewerCan(data.viewer, "accounts", "edit")
              ? "View only."
              : "View only: outside your scope or holds a higher role."}
        </ReadOnly>
      )}

      {a.inactive && a.canEdit && (
        <div className="adm-callout is-revise">
          <Icon name="clock" size={18} />
          <div>
            <b>No activity for {a.idleDays} days.</b> Keep this account?
            <div className="adm-actions">
              <button type="button" className="btn btn--sm" onClick={() => void act({ type: "account.keep", id: a.id })}>
                Keep active
              </button>
              <button type="button" className="btn btn--sm btn--danger" onClick={() => void status(a, "Deactivated")}>
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
      {a.statusReason && a.status !== "Active" && (
        <p className="adm-note">
          {a.status === "Pending Invitation" ? "Invited" : a.status} {fmtDate(a.statusChangedAt)}: {a.statusReason}
        </p>
      )}

      <Tabs label="Account details" value={tab} onChange={setTab} tabs={["Profile", "Roles", "Activity"] as const} />

      {tab === "Profile" &&
        (mode === "edit" ? (
          <EditDetails a={a} onDone={() => setMode("view")} />
        ) : mode === "transfer" ? (
          <Transfer a={a} onDone={() => setMode("view")} />
        ) : (
          <>
            <KV
              rows={[
                ["Position", a.title || "—"],
                ["Unit", unit ? <span>{unit.name}{parentPath(data.units, unit.id) && <small className="adm-muted block">{parentPath(data.units, unit.id)}</small>}</span> : a.unitId],
                ["Signs in with", a.identity === "Google Workspace" ? "University Google account" : "Guest account"],
                ["2-step verification", a.mfa.enrolled ? a.mfa.method : a.mfaRequired ? <Pill tone="revise">Not set up</Pill> : "Off"],
                ["Last sign-in", a.lastLogin ? <span title={fmtDate(a.lastLogin, true)}>{fmtAgo(a.lastLogin, data.now)}</span> : "Never"],
                ["Signed in now", a.sessions ? plural(a.sessions, "session") : "No"],
                [a.status === "Pending Invitation" ? "Invited" : "Created", fmtDate(a.status === "Pending Invitation" ? a.invitedAt ?? a.createdAt : a.createdAt)],
              ]}
            />
            {a.transfers.length > 0 && (
              <Disclosure title="Transfer history" meta={plural(a.transfers.length, "transfer")}>
                <ul className="adm-timeline">
                  {a.transfers.map((t, i) => (
                    <li key={i}>
                      <b>
                        {data.units.find((u) => u.id === t.from)?.name ?? t.from} → {data.units.find((u) => u.id === t.to)?.name ?? t.to}
                      </b>
                      <span>
                        {fmtDate(t.at)} · {data.people.find((p) => p.id === t.by)?.name ?? t.by}
                      </span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </>
        ))}

      {tab === "Roles" && <RolesTab a={a} />}

      {tab === "Activity" &&
        (data.audit ? (
          events.length ? (
            <ul className="adm-timeline">
              {events.map((e) => (
                <li key={e.seq}>
                  <b>
                    {e.action} <span className={`adm-outcome is-${e.outcome.toLowerCase()}`}>{e.outcome}</span>
                  </b>
                  <span>
                    {fmtDate(e.at, true)} · {e.actorName}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote icon="scroll" title="No activity yet" />
          )
        ) : (
          <EmptyNote icon="lock" title="Needs audit log access">
            <button type="button" className="link" onClick={() => go("audit")}>
              Open Audit Logs
            </button>
          </EmptyNote>
        ))}
    </Sheet>
  );
}

function EditDetails({ a, onDone }: { a: AccountRow; onDone: () => void }) {
  const act = useAct();
  const [name, setName] = useState(a.name);
  const [title, setTitle] = useState(a.title);
  const dirty = name.trim() !== a.name || title.trim() !== a.title;
  return (
    <Block title="Edit details">
      <div className="adm-form-grid">
        <Field label="Full name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Position">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </div>
      <div className="adm-actions">
        <button type="button" className="btn btn--sm" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--sm btn--dark"
          disabled={!dirty || name.trim().length < 3}
          onClick={async () => {
            const r = await act({ type: "account.update", id: a.id, name: name.trim(), title: title.trim() });
            if (r.ok) onDone();
          }}
        >
          Save
        </button>
      </div>
    </Block>
  );
}

function Transfer({ a, onDone }: { a: AccountRow; onDone: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [to, setTo] = useState("");
  const [move, setMove] = useState(true);
  return (
    <Block title="Transfer to another unit">
      <div className="adm-form-grid">
        <Field label="New unit">
          <UnitSelect label="New unit" value={to} onChange={setTo} filter={(u) => u.status === "Active" && u.id !== a.unitId && viewerCan(data.viewer, "accounts", "edit", { unitId: u.id })} />
        </Field>
        <label className="choice adm-field--check">
          <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} />
          Move their unit roles too
        </label>
      </div>
      <p className="adm-note">Past submissions stay with {data.units.find((u) => u.id === a.unitId)?.name ?? "the old unit"}.</p>
      <div className="adm-actions">
        <button type="button" className="btn btn--sm" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--sm btn--dark"
          disabled={!to}
          onClick={async () => {
            const r = await act({ type: "account.transfer", id: a.id, toUnitId: to, moveScope: move });
            if (r.ok) onDone();
          }}
        >
          Transfer
        </button>
      </div>
    </Block>
  );
}

/* ---------- Roles held, and adding one with a preview ---------- */

function RolesTab({ a }: { a: AccountRow }) {
  const { data, confirm } = useConsole();
  const act = useAct();
  const v = data.viewer;
  const roleOf = (id: string) => data.roles.find((r) => r.id === id);
  const current = union(...a.assignments.filter((x) => !x.expires || x.expires > data.day).map((x) => rolePermissions(x.roleId, data.roles)));
  const [adding, setAdding] = useState(false);
  const [roleId, setRoleId] = useState("");
  const [scope, setScope] = useState<Scope>(UNIVERSITY);
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const universityAdmin = v.superAdmin || v.grants.some((g) => g.units === "all" && has(g.perms, "accounts", "edit"));
  const pick = (id: string) => {
    setRoleId(id);
    const r = roleOf(id);
    setScope(r?.scopeKind === "university" && universityAdmin ? UNIVERSITY : r?.scopeKind === "custom" ? { ...UNIVERSITY, datasets: [] } : unitScope(a.unitId));
  };
  const reset = () => {
    setAdding(false);
    setRoleId("");
    setNote("");
    setExpires("");
  };
  const after = roleId ? union(current, rolePermissions(roleId, data.roles)) : current;
  const needsEnd = roleId === "external";

  return (
    <div className="adm-stack adm-stack--tight">
      {a.assignments.length ? (
        <ul className="adm-assignments">
          {a.assignments.map((x) => {
            const r = roleOf(x.roleId);
            const expired = !!x.expires && x.expires <= data.day;
            return (
              <li key={x.id} className={expired ? "is-expired" : undefined}>
                <div>
                  <b>{r?.name ?? x.roleId}</b>
                  <span className="adm-muted">{scopeText(x.scope, data)}</span>
                  {x.note && <span className="adm-muted small">{x.note}</span>}
                </div>
                <span className="adm-inline">
                  {x.expires && (
                    <Pill tone={expired ? "missing" : "review"}>
                      {expired ? "Ended" : "Until"} {fmtDate(x.expires)}
                    </Pill>
                  )}
                  {a.canEdit && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={async () => {
                        const ok = await confirm({ title: `Remove ${r?.name ?? "this role"}?`, confirm: "Remove", tone: "danger" });
                        if (ok !== null) await act({ type: "assignment.remove", accountId: a.id, assignmentId: x.id });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyNote icon="key" title="No roles yet" />
      )}
      {(a.dataGrants ?? []).length > 0 && (
        <p className="adm-note">
          Dataset access: {(a.dataGrants ?? []).map((g) => `${data.catalog.datasets.find((d) => d.id === g.datasetId)?.name ?? g.datasetId} until ${fmtDate(g.until)}`).join("; ")}
        </p>
      )}

      {a.canEdit && a.status !== "Deactivated" && !adding && (
        <div>
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> Add role
          </button>
        </div>
      )}

      {adding && (
        <Block title="Add role">
          <div className="adm-form-grid">
            <Field label="Role">
              <select className="select" value={roleId} onChange={(e) => pick(e.target.value)} autoFocus>
                <option value="">Choose a role</option>
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id} disabled={!r.grantable || (!!a.external && r.id !== "external")}>
                    {r.name}
                    {!r.grantable ? " (above your access)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={needsEnd ? "Ends" : "Ends (optional)"}>
              <input className="input" type="date" min={data.day} value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="End date" />
            </Field>
          </div>
          {roleId && (
            <>
              <ScopeEditor value={scope} onChange={setScope} allowUniversity={universityAdmin} unitFilter={(u) => u.status === "Active" && viewerCan(v, "accounts", "edit", { unitId: u.id })} />
              <Field label="Reason (optional)">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Covering during a colleague's leave" />
              </Field>
              <Disclosure title="Preview permissions">
                <PermissionMatrix caption={`Effective permissions for ${a.name}`} cell={diffCell(current, after)} />
              </Disclosure>
            </>
          )}
          <div className="adm-actions">
            <button type="button" className="btn btn--sm" onClick={reset}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark btn--sm"
              disabled={!roleId || (needsEnd && !expires)}
              onClick={async () => {
                const r = await act({ type: "assignment.add", accountId: a.id, roleId, scope, expires: expires || undefined, note });
                if (r.ok) reset();
              }}
            >
              Add role
            </button>
          </div>
        </Block>
      )}
    </div>
  );
}

export function scopeText(s: Scope, data: ReturnType<typeof useConsole>["data"]) {
  const parts: string[] = [];
  parts.push(s.units === "all" ? "University-wide" : s.units.map((u) => data.units.find((x) => x.id === u)?.name ?? u).join(", ") || "No units");
  if (s.rankingBodies !== "all") parts.push(s.rankingBodies.length ? s.rankingBodies.map((b) => (b === "UI" ? "UI GreenMetric" : b)).join(" + ") : "no ranking bodies");
  if (s.years !== "all") parts.push(`cycle ${s.years.join(", ")}`);
  if (s.datasets !== "all") parts.push(s.datasets.map((d) => data.catalog.datasets.find((x) => x.id === d)?.name ?? d).join(", ") || "no datasets");
  return parts.join(" · ");
}

/* ---------- Invite ---------- */

function InviteSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { data } = useConsole();
  const act = useAct();
  const v = data.viewer;
  const [f, setF] = useState({ name: "", email: "", title: "", unitId: "", roleId: "", expires: "", external: false });
  const [custom, setCustom] = useState(false);
  const [scope, setScope] = useState<Scope>(UNIVERSITY);
  const universityAdmin = v.superAdmin || v.grants.some((g) => g.units === "all" && has(g.perms, "accounts", "edit"));
  useEffect(() => {
    if (open) {
      setF({ name: "", email: "", title: "", unitId: "", roleId: "", expires: "", external: false });
      setCustom(false);
    }
  }, [open]);
  const role = data.roles.find((r) => r.id === f.roleId);
  const ready = f.name.trim().length > 2 && /@/.test(f.email) && f.unitId && f.roleId && (!f.external || f.expires);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite someone"
      sub="They join the first time they sign in."
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--dark"
            disabled={!ready}
            onClick={async () => {
              const r = await act({
                type: "account.invite",
                input: { name: f.name, email: f.email, title: f.title, unitId: f.unitId, roleId: f.external ? "external" : f.roleId, expires: f.expires || undefined, external: f.external, scope: custom ? scope : undefined },
              });
              if (r.ok) {
                onClose();
                if (typeof r.data === "string") onCreated(r.data);
              }
            }}
          >
            <Icon name="send" size={15} /> Send invitation
          </button>
        </>
      }
    >
      <div className="adm-form-grid">
        <Field label="Full name">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dr. J. Santiago" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={f.external ? "name@partner.org" : "name@ust.edu.ph"} />
        </Field>
        <Field label="Position">
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Data Encoder" />
        </Field>
        <Field label="Unit">
          <UnitSelect label="Unit" value={f.unitId} onChange={(id) => setF({ ...f, unitId: id })} filter={(u) => u.status === "Active" && viewerCan(v, "accounts", "create", { unitId: u.id })} />
        </Field>
        <Field label="Role">
          <select className="select" value={f.external ? "external" : f.roleId} disabled={f.external} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
            <option value="">Choose a role</option>
            {data.roles.map((r) => (
              <option key={r.id} value={r.id} disabled={!r.grantable || (r.id === "external" && !f.external)}>
                {r.name}
                {!r.grantable ? " (above your access)" : r.id === "external" && !f.external ? " (guests only)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label={f.external ? "Access ends" : "Access ends (optional)"}>
          <input className="input" type="date" min={data.day} value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />
        </Field>
      </div>
      {viewerCan(v, "accounts", "manage") && (
        <label className="choice">
          <input type="checkbox" checked={f.external} onChange={(e) => setF({ ...f, external: e.target.checked, roleId: e.target.checked ? "external" : "" })} />
          Guest from outside the University
        </label>
      )}
      {role &&
        (custom ? (
          <Block
            title="Access scope"
            actions={
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCustom(false)}>
                Use default
              </button>
            }
          >
            <ScopeEditor value={scope} onChange={setScope} allowUniversity={universityAdmin} unitFilter={(u) => u.status === "Active" && viewerCan(v, "accounts", "edit", { unitId: u.id })} />
          </Block>
        ) : (
          <p className="adm-note">
            Access scope: {role.scopeKind === "university" ? "University-wide" : "their unit"}.{" "}
            <button
              type="button"
              className="link"
              onClick={() => {
                setCustom(true);
                setScope(role.scopeKind === "university" && universityAdmin ? UNIVERSITY : f.unitId ? unitScope(f.unitId) : UNIVERSITY);
              }}
            >
              Change
            </button>
          </p>
        ))}
      {role && (
        <Disclosure title={`What ${role.name} can do`}>
          <PermissionMatrix caption={`${role.name} permissions`} cell={diffCell({}, rolePermissions(role.id, data.roles))} />
        </Disclosure>
      )}
    </Sheet>
  );
}

/* ---------- Bulk import ---------- */

const TEMPLATE = "name,email,title,unit,role\nDr. A. Example,a.example@ust.edu.ph,Faculty member,ENG-CE,Data Contributor\nMs. B. Sample,b.sample@ust.edu.ph,Data Encoder,SCI,Data Contributor\n";

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [file, setFile] = useState("");
  const [rows, setRows] = useState<{ name: string; email: string; title: string; unit: string; role: string; problem?: string }[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ invited: string[]; skipped: { row: number; why: string }[] } | null>(null);
  useEffect(() => {
    if (open) {
      setFile("");
      setRows([]);
      setError("");
      setResult(null);
    }
  }, [open]);

  const load = async (f: File) => {
    setError("");
    setResult(null);
    setFile(f.name);
    try {
      const raw = await readSheetFile(f);
      if (raw.length < 2) throw new Error("The file needs a header row and at least one person.");
      const head = raw[0].map((h) => h.trim().toLowerCase());
      const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
      const ci = { name: col("name", "full name"), email: col("email", "e-mail"), title: col("title", "position"), unit: col("unit", "code"), role: col("role") };
      if (ci.name < 0 || ci.email < 0 || ci.unit < 0 || ci.role < 0) throw new Error("Columns needed: name, email, unit, role.");
      const seen = new Set<string>();
      const known = new Set((data.accounts ?? []).map((a) => a.email));
      // Bulk imports add University staff; sponsored guests are invited one at a time by the Office.
      const domains = data.security?.sso.domains ?? ["ust.edu.ph"];
      setRows(
        raw.slice(1).map((r) => {
          const row = { name: r[ci.name]?.trim() ?? "", email: (r[ci.email] ?? "").trim().toLowerCase(), title: ci.title >= 0 ? r[ci.title]?.trim() ?? "" : "", unit: r[ci.unit]?.trim() ?? "", role: r[ci.role]?.trim() ?? "" };
          const unit = data.units.find((u) => [u.code.toLowerCase(), u.id, u.name.toLowerCase()].includes(row.unit.toLowerCase()));
          const role = data.roles.find((x) => x.name.toLowerCase() === row.role.toLowerCase() || x.id === row.role.toLowerCase());
          let problem: string | undefined;
          if (!row.name) problem = "Name missing";
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) problem = "Email looks wrong";
          else if (seen.has(row.email)) problem = "Duplicate in this file";
          else if (domains.length && !domains.includes(row.email.split("@")[1] ?? "")) problem = "Not a University email";
          else if (known.has(row.email)) problem = "Already has an account";
          else if (!unit) problem = `Unknown unit “${row.unit}”`;
          else if (unit.status !== "Active") problem = `${unit.name} is archived`;
          else if (!role) problem = `Unknown role “${row.role}”`;
          else if (!role.grantable) problem = "Role above your access";
          seen.add(row.email);
          return { ...row, problem };
        }),
      );
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "The file could not be read.");
    }
  };

  const ready = rows.filter((r) => !r.problem);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title="Import accounts"
      sub="Invite many people at once from a CSV or Excel file."
      footer={
        <>
          <button type="button" className="btn" onClick={() => download("hub-accounts-template.csv", TEMPLATE)}>
            <Icon name="download" size={15} /> Template
          </button>
          <span className="adm-toolbar__spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn--dark"
            disabled={!ready.length || !!result}
            onClick={async () => {
              const r = await act({ type: "account.import", rows: ready.map(({ problem: _p, ...x }) => { void _p; return x; }), file });
              if (r.data) setResult(r.data as typeof result);
            }}
          >
            Invite {plural(ready.length, "person", "people")}
          </button>
        </>
      }
    >
      <label className="adm-drop">
        <Icon name="upload" size={22} />
        <b>{file || "Choose a .csv or .xlsx file"}</b>
        <span className="adm-muted small">Columns: name, email, title, unit, role</span>
        <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
      </label>
      {error && (
        <p className="field__error" role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
      {result && (
        <div className="adm-callout is-ok">
          <Icon name="check-circle" size={18} />
          <div>
            <b>{plural(result.invited.length, "invitation")} sent.</b>
            {result.skipped.length > 0 && (
              <ul className="adm-list-tight">
                {result.skipped.map((s) => (
                  <li key={s.row}>
                    Row {s.row}: {s.why}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table adm-table--compact">
            <thead>
              <tr>
                <th>Row</th>
                <th>Name</th>
                <th>Email</th>
                <th>Unit</th>
                <th>Role</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r, i) => (
                <tr key={i}>
                  <td className="num adm-muted">{i + 2}</td>
                  <td>{r.name}</td>
                  <td className="adm-muted">{r.email}</td>
                  <td>{r.unit}</td>
                  <td>{r.role}</td>
                  <td>{r.problem ? <Pill tone="danger">{r.problem}</Pill> : <Pill tone="ok">Ready</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  );
}
