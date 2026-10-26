"use client";

import { useMemo, useState } from "react";
import { exportAudit } from "@/app/actions/governance";
import type { AuditCategory, AuditEvent } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { Disclosure, EmptyNote, Hint, KV, Pill, SearchField, Sheet, download, fmtAgo, fmtDate, plural, useAct, useConsole } from "../ui";
import { Select } from "@/components/ui/pickers";

const CATEGORIES: AuditCategory[] = ["Account", "Access", "Session", "Data", "Approval", "Export", "Directory", "Security", "Configuration", "Backup"];
const PERIODS = [
  { key: "", label: "Any time" },
  { key: "1", label: "Last 24 hours" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
];

export function Audit() {
  const { data, notify, reload } = useConsole();
  const act = useAct();
  const events = data.audit?.events ?? [];
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [outcome, setOutcome] = useState("");
  const [period, setPeriod] = useState("");
  const [limit, setLimit] = useState(100);
  const [open, setOpen] = useState<AuditEvent | null>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const since = period ? Date.parse(data.now) - Number(period) * 86_400_000 : 0;
    return events.filter(
      (e) =>
        (!t || [e.actorName, e.action, e.resource.label, e.resource.id, e.detail ?? ""].some((x) => x.toLowerCase().includes(t))) &&
        (!category || e.category === category) &&
        (!outcome || (outcome === "Problems" ? e.outcome !== "Success" : e.outcome === outcome)) &&
        (!since || Date.parse(e.at) >= since),
    );
  }, [events, q, category, outcome, period, data.now]);
  const filters = [q && `“${q}”`, category, outcome && (outcome === "Problems" ? "refused or failed" : "succeeded"), period && PERIODS.find((p) => p.key === period)?.label.toLowerCase()].filter(Boolean).join(", ");

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Search names or actions" label="Search the audit log" />
        <Select className="select select--sm" value={category} onChange={setCategory} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select className="select select--sm" value={period} onChange={setPeriod} aria-label="When">
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select className="select select--sm" value={outcome} onChange={setOutcome} aria-label="Outcome">
          <option value="">All results</option>
          <option value="Success">Succeeded</option>
          <option value="Problems">Refused or failed</option>
        </Select>
        <span className="adm-toolbar__spacer" />
        <span className="adm-inline">
          <button
            type="button"
            className="btn btn--sm"
            onClick={async () => {
              const r = await act({ type: "audit.verify" }, true);
              if (r.ok) notify(r.message, (r.data as { ok: boolean } | undefined)?.ok ? "ok" : "error");
            }}
          >
            <Icon name="shield-check" size={15} /> Verify
          </button>
          <Hint text="Each entry is sealed with the one before it, so any change to past entries is detected." label="How the log is protected" />
        </span>
        {viewerCan(data.viewer, "audit", "export") && (
          <button
            type="button"
            className="btn btn--sm btn--dark"
            disabled={!shown.length}
            onClick={async () => {
              const r = await exportAudit(shown.map((e) => e.seq), filters);
              notify(r.message, r.ok ? "ok" : "error");
              if (r.ok && r.csv) download(`hub-audit-log-${data.day}.csv`, r.csv);
              await reload();
            }}
          >
            <Icon name="download" size={15} /> Export
          </button>
        )}
      </div>
      {shown.length ? (
        <div className="adm-table-wrap">
          <table className="adm-table adm-table--log">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>
                  <span className="sr-only">Outcome</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((e) => (
                <tr key={e.seq} className="is-clickable" onClick={() => setOpen(e)}>
                  <td className="num adm-muted nowrap" title={fmtDate(e.at, true)}>
                    {fmtAgo(e.at, data.now)}
                  </td>
                  <td>
                    <b>{e.actorName}</b>
                  </td>
                  <td>
                    <code className="adm-code">{e.action}</code> {e.resource.label}
                    {e.detail && <small className="adm-muted block adm-clamp">{e.detail}</small>}
                  </td>
                  <td>{e.outcome !== "Success" && <Pill tone="danger">{e.outcome}</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > limit && (
            <div className="adm-actions">
              <button type="button" className="btn btn--sm" onClick={() => setLimit(limit + 200)}>
                Show more
              </button>
            </div>
          )}
        </div>
      ) : (
        <EmptyNote icon="search" title="No entries match" />
      )}
      <p className="adm-count">
        {filters ? `${plural(shown.length, "entry", "entries")} of ${(data.audit?.total ?? 0).toLocaleString("en-PH")}` : plural(data.audit?.total ?? 0, "entry", "entries")}
      </p>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? <code className="adm-code">{open.action}</code> : ""} sub={open ? `${fmtDate(open.at, true)} · entry ${open.seq}` : undefined}>
        {open && (
          <>
            <KV
              rows={[
                ["Who", `${open.actorName} (${open.actorRole})`],
                ["What", open.action],
                ["Affected", `${open.resource.type}: ${open.resource.label}`],
                ["Outcome", open.outcome],
                ["Detail", open.detail ?? "—"],
              ]}
            />
            <Disclosure title="Integrity">
              <div className="adm-hashes">
                <p className="adm-field__label">Previous hash</p>
                <code>{open.prev}</code>
                <p className="adm-field__label">This entry&rsquo;s hash</p>
                <code>{open.hash}</code>
              </div>
            </Disclosure>
          </>
        )}
      </Sheet>
    </div>
  );
}
