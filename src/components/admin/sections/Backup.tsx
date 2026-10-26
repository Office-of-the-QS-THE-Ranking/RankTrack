"use client";

import { useEffect, useState } from "react";
import type { RecoveryPoint } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { Block, Disclosure, EmptyNote, Field, Hint, Pill, ReadOnly, RowMenu, Stat, StatusPill, Switch, fmtAgo, fmtDate, plural, useAct, useConsole } from "../ui";
import { NumberField } from "@/components/ui/pickers";

/** The next Manila 02:00 for the daily full backup, and the next top of the hour for incrementals. */
function nextRuns(nowIso: string) {
  const now = new Date(nowIso);
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  hour.setUTCHours(hour.getUTCHours() + 1);
  const full = new Date(now);
  full.setUTCHours(18, 0, 0, 0); // 02:00 in Manila
  if (full <= now) full.setUTCDate(full.getUTCDate() + 1);
  return { incremental: hour.toISOString(), full: full.toISOString() };
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const size = (mb: number) => (mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

export function Backup() {
  const { data, confirm, go } = useConsole();
  const act = useAct();
  const b = data.backup!;
  const v = data.viewer;
  const canRun = viewerCan(v, "backup", "manage");
  const h = data.health.backup;
  const runs = nextRuns(data.now);
  const lastTest = b.tests[0];
  const pending = data.requests.filter((r) => r.workflowId === "destructive" && r.status === "Pending");
  const [s, setS] = useState(b.schedule);
  useEffect(() => setS(b.schedule), [b.schedule]);

  const request = async (operation: "restore" | "delete", p: RecoveryPoint) => {
    const why = await confirm({
      title: operation === "restore" ? `Restore from ${p.id}?` : `Delete ${p.id}?`,
      body:
        operation === "restore"
          ? `Changes since ${fmtDate(p.at, true)} are rolled back. The audit log and sign-ins are kept. A second University-wide Administrator must approve first.`
          : "It's removed once a second University-wide Administrator approves.",
      confirm: "Request approval",
      tone: "danger",
      input: { label: "Reason", required: true, multiline: true, placeholder: "What this recovers from" },
    });
    if (why !== null) await act({ type: "backup.request", operation, pointId: p.id, justification: why });
  };

  return (
    <div className="adm-stack">
      <div className="adm-stats adm-stats--3">
        <Stat label="Last backup" icon="hard-drive" value={h.lastAt ? fmtAgo(h.lastAt, data.now) : "—"} sub={h.withinRpo ? "Up to date" : "Backup due"} tone={h.withinRpo ? "ok" : "danger"} />
        <Stat label="Next backup" icon="clock" value={clock(runs.incremental)} sub={`Full backup at ${clock(runs.full)}`} />
        <Stat label="Last restore test" icon="refresh" value={lastTest ? lastTest.result : "None"} sub={lastTest ? fmtDate(lastTest.at) : "Run one monthly"} tone={lastTest?.result === "Passed" ? "ok" : "danger"} />
      </div>

      {!canRun && <ReadOnly>View only. University-wide Administrators run backups and restores.</ReadOnly>}

      {pending.length > 0 && (
        <p className="adm-note">
          {plural(pending.length, "restore or deletion", "restores or deletions")} waiting for approval.{" "}
          <button type="button" className="link" onClick={() => go("workflows")}>
            Review
          </button>
        </p>
      )}

      <Block
        title={
          <>
            Recovery points <Hint text="Restoring or deleting a point always needs a second University-wide Administrator's approval." />
          </>
        }
        actions={
          canRun && (
            <button type="button" className="btn btn--sm btn--dark" onClick={() => void act({ type: "backup.run" })}>
              <Icon name="hard-drive" size={15} /> Back up now
            </button>
          )
        }
        flush
      >
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Point</th>
                <th>Taken</th>
                <th>Type</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...b.points]
                .sort((x, y) => y.at.localeCompare(x.at))
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="adm-inline">
                        <b className="num">{p.id}</b>
                        {p.file && <Pill tone="gold">Restorable</Pill>}
                      </span>
                      <small className="adm-muted block">
                        {size(p.sizeMB)} · kept until {fmtDate(p.expiresAt)}
                      </small>
                    </td>
                    <td className="num" title={fmtDate(p.at, true)}>
                      {fmtAgo(p.at, data.now)}
                    </td>
                    <td>{p.kind}</td>
                    <td>
                      <StatusPill value={p.status} />
                    </td>
                    <td className="r">
                      {canRun && (
                        <RowMenu
                          label={`Actions for ${p.id}`}
                          items={[
                            p.status === "Completed" && { label: "Test restore", icon: "play", onSelect: () => void act({ type: "backup.test", pointId: p.id }) },
                            !!p.file && p.status === "Completed" && { label: "Restore…", icon: "undo", danger: true, onSelect: () => void request("restore", p) },
                            { label: "Delete…", icon: "trash", danger: true, onSelect: () => void request("delete", p) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Disclosure title="Schedule and retention" meta={`${s.retentionDays} days · off-site ${s.offsite ? "on" : "off"}`}>
        <p className="adm-muted small">
          {b.schedule.full} full · {b.schedule.incremental.toLowerCase()} incremental · at most {b.objectives.rpoMinutes} min of data lost · back online within {b.objectives.rtoMinutes / 60} h
        </p>
        <div className="adm-form-grid">
          <Field label="Keep daily points (days)">
            <NumberField className="input num" min={7} max={365} disabled={!canRun} value={s.retentionDays} onChange={(v) => setS({ ...s, retentionDays: v })} />
          </Field>
          <Field label="Keep monthly copies (months)">
            <NumberField className="input num" min={1} max={120} disabled={!canRun} value={s.monthlyMonths} onChange={(v) => setS({ ...s, monthlyMonths: v })} />
          </Field>
        </div>
        <div className="adm-switchrow">
          <span>
            <b>Off-site copy</b>
          </span>
          <Switch checked={s.offsite} disabled={!canRun} label="Off-site copy" onChange={(x) => setS({ ...s, offsite: x })} />
        </div>
        {JSON.stringify(s) !== JSON.stringify(b.schedule) && (
          <div className="adm-actions">
            <button type="button" className="btn btn--sm" onClick={() => setS(b.schedule)}>
              Discard
            </button>
            <button type="button" className="btn btn--sm btn--dark" onClick={() => void act({ type: "backup.schedule", retentionDays: s.retentionDays, monthlyMonths: s.monthlyMonths, offsite: s.offsite })}>
              Save
            </button>
          </div>
        )}
      </Disclosure>

      <Disclosure title="Restore tests" meta={lastTest ? `Last ${lastTest.result.toLowerCase()} ${fmtDate(lastTest.at)}` : "None yet"}>
        {b.tests.length ? (
          <ul className="adm-timeline">
            {b.tests.slice(0, 6).map((t) => (
              <li key={t.id}>
                <b>
                  {t.pointId} <Pill tone={t.result === "Passed" ? "ok" : "danger"}>{t.result}</Pill>
                </b>
                <span>
                  {fmtDate(t.at, true)} · {t.minutes} min · {data.people.find((p) => p.id === t.by)?.name ?? t.by}
                </span>
                {t.notes && <span>{t.notes}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote icon="refresh" title="No tests yet" />
        )}
      </Disclosure>

      <Disclosure title="Recovery runbooks" meta={String(b.procedures.length)}>
        <div className="adm-cols">
          {b.procedures.map((p) => (
            <article key={p.id} className="adm-runbook">
              <h4>{p.title}</h4>
              <ol>
                {p.steps.map((s2, i) => (
                  <li key={i}>{s2}</li>
                ))}
              </ol>
              <p className="adm-muted small">
                {data.people.find((x) => x.id === p.owner)?.name ?? p.owner} · reviewed {fmtDate(p.updated)}
              </p>
            </article>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}
