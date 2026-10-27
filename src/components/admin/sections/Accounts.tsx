"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ROLE } from "@/lib/governance/catalog";
import { accountFilterOptions, matchesAccountFilter, matchesAccessRequestFilter } from "@/lib/governance/account-filters";
import { useReference } from "@/components/reference/ReferenceProvider";
import type { AccountRow, RequestRow } from "@/lib/governance/console-types";
import { trackStatus } from "@/lib/governance/request-tracker";
import { UNIVERSITY, has, rolePermissions, roleScope, union, unitScope } from "@/lib/governance/rbac";
import type { RoleId, Scope } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { PermissionMatrix, ScopeEditor, UnitSelect, diffCell, parentPath } from "../parts";
import { InviteSheet } from "./InviteSheet";
import { RequestSheet } from "./Workflows";
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
  fmtAgo,
  fmtDate,
  plural,
  useAct,
  useConsole,
  type ConfirmOptions,
} from "../ui";
import { DateField, Select } from "@/components/ui/pickers";

type Filter = "Accounts" | "Requests";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "Accounts", label: "Accounts" },
  { key: "Requests", label: "Access Requests" },
];

/** While the access requests are on screen, new ones and the requesters' first sign-ins come in this often. */
const REQUESTS_POLL_MS = 15_000;

/** The confirmations used by the account panel. */
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
  const { data, focus, reload } = useConsole();
  const v = data.viewer;
  const accounts = data.accounts ?? [];
  const requests = data.requests.filter((r) => r.payload.kind === "account-access");
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("");
  const [role, setRole] = useState("");
  const [filter, setFilter] = useState<Filter>(focus?.startsWith("RQ-") ? "Requests" : "Accounts");
  const [openRequest, setOpenRequest] = useState<string | null>(focus?.startsWith("RQ-") ? focus : null);
  const [open, setOpen] = useState<string | null>(focus && focus.startsWith("ACC-") ? focus : null);
  const [inviting, setInviting] = useState(false);
  const canCreate = viewerCan(v, "accounts", "create");

  const count = (f: Filter) =>
    f === "Accounts" ? accounts.length : requests.filter((r) => r.status === "Pending").length;

  // keep the access requests live while they are on screen
  useEffect(() => {
    if (filter !== "Requests") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, REQUESTS_POLL_MS);
    return () => window.clearInterval(id);
  }, [filter, reload]);

  const { directory } = useReference();
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return accounts
      .filter((a) => !t || a.name.toLowerCase().includes(t) || a.email.includes(t) || a.title.toLowerCase().includes(t))
      .filter((a) => matchesAccountFilter(a, role, unit, data.units, requests, data.day, directory))
      .sort((a, b) => Number(b.inactive) - Number(a.inactive) || a.name.replace(/^\S+\.\s/, "").localeCompare(b.name.replace(/^\S+\.\s/, "")));
  }, [accounts, q, unit, role, data.units, requests, data.day, directory]);

  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? id;
  const current = accounts.find((a) => a.id === open) ?? null;
  const everywhere = v.grants.some((g) => g.units === "all" && has(g.perms, "accounts", "view"));

  return (
    <div className="adm-stack">
      <Tabs<Filter>
        label="Accounts and access requests"
        value={filter}
        onChange={setFilter}
        tabs={FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          count: count(f.key),
          countTone: f.key === "Requests" && count(f.key) ? "alert" : undefined,
        }))}
        actions={
          <>
            {canCreate && (
              <button type="button" className="btn content-tabs__action" onClick={() => setInviting(true)}>
                <Icon name="user-plus" size={15} /> Invite
              </button>
            )}
            <AccountFilters unit={unit} role={role} onUnit={setUnit} onRole={setRole} />
          </>
        }
        search={<SearchField value={q} onChange={setQ} placeholder={filter === "Requests" ? "Search requests" : "Search people"} label={filter === "Requests" ? "Search access requests" : "Search accounts"} shortcuts />}
      />

      {filter === "Requests" ? (
        <AccessRequests requests={requests} q={q} unit={unit} role={role} onOpen={setOpenRequest} />
      ) : shown.length ? (
        <div className="adm-table-wrap">
          <table className="adm-table adm-table--accounts">
            <thead>
              <tr>
                <th>Person</th>
                <th>Unit</th>
                <th>Roles</th>
                <th>Last sign-in</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="is-clickable" onClick={() => setOpen(a.id)}>
                  <td>
                    <button type="button" className="adm-person" onClick={(e) => { e.stopPropagation(); setOpen(a.id); }}>
                      <Avatar name={a.name} src={a.avatar} placeholder />
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
                  <td className="adm-muted num">{a.status === "Pending Invitation" ? "—" : fmtAgo(a.lastLogin, data.now)}</td>
                  <td>
                    <span className="adm-inline">
                      <StatusPill value={a.status} />
                      {a.inactive && <Pill tone="revise">Idle {a.idleDays} days</Pill>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote icon="search" title="No accounts match" />
      )}
      {filter !== "Requests" && (
        <p className="adm-count">
          {plural(shown.length, "account")}
          {everywhere ? "" : " in your units"}
        </p>
      )}

      <AccountSheet account={current} onClose={() => setOpen(null)} />
      <InviteSheet open={inviting} onClose={() => setInviting(false)} onCreated={(id) => setOpen(id)} />
      <RequestSheet r={data.requests.find((r) => r.id === openRequest) ?? null} onClose={() => setOpenRequest(null)} />
    </div>
  );
}

/* ---------- Access requests ---------- */

function AccountFilters({ unit, role, onUnit, onRole }: { unit: string; role: string; onUnit: (value: string) => void; onRole: (value: string) => void }) {
  const { data } = useConsole();
  const { directory } = useReference();
  const options = accountFilterOptions(role, data.units, data.accounts ?? [], data.requests, directory);
  const unitLabel = role === ROLE.student ? "College/Faculty" : role === ROLE.external ? "Affiliation" : role ? "Office or College/Faculty" : "Unit";
  const allUnits = role === ROLE.student ? "All colleges/faculties" : role === ROLE.external ? "All affiliations" : "All offices and colleges";
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>(".pick-trigger")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="adm-account-filter" ref={root}>
      <button ref={trigger} type="button" className={`adm-iconbtn content-tabs__action content-tabs__action--icon adm-account-filter__trigger${unit || role ? " is-active" : ""}`} aria-label="Filter results" aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <Icon name="filter" size={18} />
      </button>
      {open && <div id={panelId} className="adm-account-filter__panel" role="dialog" aria-labelledby={`${panelId}-title`}>
        <div className="adm-account-filter__head">
          <h3 id={`${panelId}-title`}>Filter Results</h3>
          <button type="button" className="adm-iconbtn" aria-label="Close filters" onClick={() => { setOpen(false); trigger.current?.focus(); }}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <Field label="Role">
          <Select className="select select--sm" value={role} onChange={(value) => { onRole(value); onUnit(""); }}>
            <option value="">All roles</option>
            {data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label={unitLabel}>
          <Select className="select select--sm" value={unit} onChange={onUnit} disabled={!role}>
            <option value="">{role ? allUnits : "Choose a role first"}</option>
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        {(unit || role) && <button type="button" className="btn btn--sm" onClick={() => { onUnit(""); onRole(""); }}>Clear filters</button>}
      </div>}
    </div>
  );
}

/**
 * Requests for an account sent from the sign-in page, each with the standing its requester sees in the
 * Submission Tracker. Waiting ones first, oldest first; then the rest, newest first.
 */
function AccessRequests({ requests, q, unit, role, onOpen }: { requests: RequestRow[]; q: string; unit: string; role: string; onOpen: (id: string) => void }) {
  const { data } = useConsole();
  const { directory } = useReference();
  const signedIn = (email: string) => {
    const a = data.accounts?.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return !!(a && (a.firstLogin ?? a.lastLogin));
  };
  const t = q.trim().toLowerCase();
  const rows = requests
    .flatMap((r) => (r.payload.kind === "account-access" ? [{ r, p: r.payload }] : []))
    .filter(({ p }) => matchesAccessRequestFilter(p, role, unit, data.units, directory))
    .filter(({ r, p }) => !t || p.name.toLowerCase().includes(t) || p.email.includes(t) || r.id.toLowerCase().includes(t) || p.title.toLowerCase().includes(t))
    .sort((a, b) =>
      a.r.status === "Pending" && b.r.status === "Pending"
        ? a.r.requestedAt.localeCompare(b.r.requestedAt)
        : Number(b.r.status === "Pending") - Number(a.r.status === "Pending") || b.r.requestedAt.localeCompare(a.r.requestedAt),
    );
  if (!rows.length) return <EmptyNote icon="inbox" title={t || unit || role ? "No requests match" : "No access requests"} />;
  return (
    <>
      <div className="adm-table-wrap">
        <table className="adm-table adm-table--accounts">
          <thead>
            <tr>
              <th>Applicant Name</th>
              <th>Reference</th>
              <th>Affiliation</th>
              <th>Application Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, p }) => (
              <tr key={r.id} className="is-clickable" onClick={() => onOpen(r.id)}>
                <td>
                  <button type="button" className="adm-person" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>
                    <Avatar name={p.name} placeholder />
                    <span>
                      <b>{p.name}</b>
                      <small>{p.email}</small>
                    </span>
                  </button>
                </td>
                <td className="num">{r.id}</td>
                <td className="adm-muted adm-cell-unit">
                  <span title={p.title}>{p.title}</span>
                </td>
                <td className="adm-muted num">
                  <span title={fmtDate(r.requestedAt, true)}>{fmtDate(r.requestedAt)}</span>
                </td>
                <td>
                  <span className="adm-inline">
                    <StatusPill value={trackStatus(r, r.status === "Approved" && signedIn(p.email))} />
                    {r.overdue && <Pill tone="danger">Overdue</Pill>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adm-count">{plural(rows.length, "request")}</p>
    </>
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
          <Avatar name={a.name} src={a.avatar} size={34} placeholder />
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
                ...profileRows(a),
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

/** What the invitation or the approved request said about them; a website is only ever shown as text. */
function profileRows(a: AccountRow): [string, string][] {
  const p = a.profile;
  if (!p) return [];
  return [
    ...(p.salutation ? [["Salutation", p.salutation] as [string, string]] : []),
    ["Affiliation", `${p.affiliation}${p.organization ? ` · ${p.organization}` : ""}${p.listed ? "" : " (Others)"}`],
    ...(p.website ? [["Organization website", p.website] as [string, string]] : []),
  ];
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
  const current = union(...a.assignments.filter((x) => !x.expires || x.expires > data.day).map((x) => rolePermissions(x.roleId, x.scope)));
  const [adding, setAdding] = useState(false);
  const [roleId, setRoleId] = useState("");
  const [scope, setScope] = useState<Scope>(UNIVERSITY);
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const universityAdmin = v.grants.some((g) => g.units === "all" && has(g.perms, "accounts", "edit"));
  const pick = (id: string) => {
    setRoleId(id);
    const r = roleOf(id);
    const start = roleScope(id, a.unitId);
    setScope(r?.scopeKind === "custom" ? { ...UNIVERSITY, datasets: [] } : start.units === "all" && !universityAdmin ? unitScope(a.unitId) : start);
  };
  const reset = () => {
    setAdding(false);
    setRoleId("");
    setNote("");
    setExpires("");
  };
  const after = roleId ? union(current, rolePermissions(roleId, scope)) : current;
  const needsEnd = roleId === ROLE.external;

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
              <Select className="select" value={roleId} onChange={pick} autoFocus>
                <option value="">Choose a role</option>
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id} disabled={!r.grantable || (!!a.external && r.id !== ROLE.external)}>
                    {r.name}
                    {!r.grantable ? " (above your access)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={needsEnd ? "Ends" : "Ends (optional)"}>
              <DateField className="input" min={data.day} value={expires} onChange={setExpires} aria-label="End date" />
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
                const r = await act({ type: "assignment.add", accountId: a.id, roleId: roleId as RoleId, scope, expires: expires || undefined, note });
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
