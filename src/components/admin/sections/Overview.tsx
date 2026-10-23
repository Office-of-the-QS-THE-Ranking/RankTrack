"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Bars, Block, EmptyNote, Stat, fmtAgo, fmtDate, useAct, useConsole } from "../ui";
import type { SectionKey } from "../sections";

/** System health at a glance: four numbers, what to do next, and recent activity. */
export function Overview() {
  const { data, go } = useConsole();
  const act = useAct();
  const h = data.health;
  const can = (s: string) => data.viewer.admin.includes(s as never);
  const [chain, setChain] = useState<boolean | null>(null);
  // Overdue among the requests this viewer decides, not across the University.
  const myOverdue = data.requests.filter((r) => r.canDecide && r.overdue).length;

  const status: { label: string; tone: "ok" | "revise" | "danger" }[] = [
    { label: "Hub online", tone: "ok" },
    { label: "Google sign-in", tone: "ok" },
    { label: h.backup.withinRpo ? "Backups current" : "Backup due", tone: h.backup.withinRpo ? "ok" : "danger" },
    { label: chain === null ? "Audit log sealed" : chain ? "Audit log verified" : "Audit log altered", tone: chain === false ? "danger" : "ok" },
  ];

  return (
    <div className="adm-stack">
      <div className="adm-stats adm-stats--4">
        <Stat label="Active accounts" icon="users" value={h.accounts.active} sub={h.accounts.pending ? `${h.accounts.pending} invited` : undefined} onClick={can("accounts") ? () => go("accounts") : undefined} />
        <Stat
          label="To approve"
          icon="workflow"
          value={h.requests.mine}
          sub={myOverdue ? `${myOverdue} overdue` : undefined}
          tone={myOverdue ? "revise" : undefined}
          onClick={can("workflows") ? () => go("workflows") : undefined}
        />
        <Stat
          label="Security alerts"
          icon="shield"
          value={h.alertsOpen}
          tone={h.alertsOpen ? "danger" : undefined}
          sub={h.alertsOpen ? "Open" : "All clear"}
          onClick={can("security") ? () => go("security") : undefined}
        />
        <Stat
          label="Last backup"
          icon="hard-drive"
          value={h.backup.lastAt ? fmtAgo(h.backup.lastAt, data.now) : "—"}
          sub={h.backup.withinRpo ? "Up to date" : "Backup due"}
          tone={h.backup.withinRpo ? "ok" : "danger"}
          onClick={can("backup") ? () => go("backup") : undefined}
        />
      </div>

      <div className="adm-cols">
        <Block title="To do">
          {h.attention.length ? (
            <ul className="adm-attn">
              {h.attention.map((a) => (
                <li key={a.text}>
                  <button type="button" className="adm-attn__item" onClick={() => go(a.section as SectionKey, a.focus)}>
                    <span className={`adm-attn__dot is-${a.tone}`} aria-hidden="true" />
                    <span>{a.text}</span>
                    <Icon name="chevron" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote title="All caught up" />
          )}
        </Block>

        <Block title="Activity, last 14 days">
          <Bars data={h.activity.map((d) => ({ key: d.day, value: d.total, alt: d.denied, title: fmtDate(d.day) }))} label="Audited events per day" />
          <p className="adm-note">
            <span className="adm-legend adm-legend--bar" /> Changes <span className="adm-legend adm-legend--alt" /> Refused
          </p>
        </Block>
      </div>

      <div className="adm-statusbar">
        <div className="adm-dot-status" aria-label="System status">
          {status.map((s) => (
            <span key={s.label}>
              <i className={s.tone === "ok" ? undefined : `is-${s.tone}`} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </div>
        {can("audit") && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={async () => {
              const r = await act({ type: "audit.verify" });
              setChain(!!(r.data as { ok?: boolean } | undefined)?.ok);
            }}
          >
            Verify audit log
          </button>
        )}
      </div>
    </div>
  );
}
