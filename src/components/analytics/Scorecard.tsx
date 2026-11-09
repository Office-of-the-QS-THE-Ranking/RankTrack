"use client";

/*
 * The Rankings overview's Scorecard: every edition the Office is collecting for, as a tile: the headline figure on the body's own
 * scale (claimed and secured), readiness, how each group stands, the fixes worth most, data errors, and what moved
 * since the snapshot about a quarter ago. Beside them, the open data requests and the action items.
 */
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Tile } from "@/components/dashboard/Tile";
import { RowMenu } from "@/components/publications/PostManager";
import { download } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { exportBrief, exportIndicators, exportQuarterly } from "@/app/actions/analytics-admin";
import { takeSnapshot } from "@/app/actions/analytics";
import type { EditionCard, ScorecardDesk } from "@/lib/analytics/desk-types";
import { count, day, daysTo, pct, pts } from "@/lib/analytics/format";
import { ActionSheet, draftOf, newAction, type ActionDraft } from "./ActionSheet";
import { EmptyState, Figure, PointsBar, ReadyRing, useRun } from "./parts";

const KIND_LABEL: Record<string, string> = { sum: "points", "the-impact": "annual score", "best-per-group": "best cases", readiness: "readiness", results: "ranked" };

function EditionTile({ e, can }: { e: EditionCard; can: ScorecardDesk["can"] }) {
  const { run, pending } = useRun();
  const t = e.total;
  const max = Math.max(...e.groups.map((g) => g.max), 1);
  const due = e.closesOn ? daysTo(e.closesOn) : null;
  const fileOut = async (fn: (i: { edition: string }) => Promise<{ ok: boolean; message: string; data?: { name: string; text: string } }>, type?: string) => {
    const r = await run(() => fn({ edition: e.id }));
    if (r.ok && r.data) download(r.data.name, r.data.text, type);
  };
  const scaleText = t.kind === "results" ? `${t.claimed} of ${t.max}` : t.kind === "readiness" ? pct(t.claimed) : `${pts(t.claimed)}`;
  return (
    <Tile
      id={`an-ed-${e.id}`}
      className="an-ed"
      title={
        <>
          <span className="an-dot" style={{ background: e.color }} aria-hidden="true" />
          {e.label}
          {e.status !== "Active" && <span className="chip">{e.status}</span>}
        </>
      }
      aside={
        <RowMenu
          label={`Actions for ${e.label}`}
          disabled={pending}
          items={[
            { label: "Open indicators", icon: "target", onSelect: () => location.assign(`/admin/rankings/${e.ranking}?edition=${e.id}#indicators`) },
            can.edit && { label: "Take a snapshot", icon: "photo-stack", onSelect: () => void run(() => takeSnapshot({ edition: e.id })) },
            can.export && { label: "Positioning brief", icon: "reports", onSelect: () => void fileOut(exportBrief, "text/markdown;charset=utf-8") },
            can.export && { label: "Quarterly review (CSV)", icon: "download", onSelect: () => void fileOut(exportQuarterly) },
            can.export && { label: "Indicators (CSV)", icon: "download", onSelect: () => void fileOut(exportIndicators) },
          ]}
        />
      }
    >
      <div className="an-ed__head">
        <div className="an-ed__score">
          <span className="an-ed__big">{scaleText}</span>
          <span className="an-ed__of">
            {t.kind === "results" || t.kind === "readiness" ? KIND_LABEL[t.kind] : `of ${pts(t.max)} ${KIND_LABEL[t.kind] ?? ""}`}
          </span>
          {t.kind !== "results" && t.kind !== "readiness" && (
            <span className="an-ed__secured">
              {pts(t.secured)} secured{t.open > 0 ? ` · ${pts(t.open)} open` : ""}
            </span>
          )}
        </div>
        <div className="an-ed__ready">
          <ReadyRing value={e.readiness} size={58} />
          <span className="an-ed__readylabel">ready</span>
        </div>
      </div>
      {t.kind !== "results" && t.kind !== "readiness" && t.max > 0 && <PointsBar points={{ max: t.max, secured: t.secured, claimed: t.claimed, open: t.open, lost: Math.max(0, t.max - t.claimed - t.open) }} compact />}
      {t.note && <p className="an-note">{t.note}</p>}
      <div className="an-ed__figs">
        <Figure label="Validated" value={`${e.counts.validated}/${e.counts.indicators}`} />
        <Figure label="With data" value={e.counts.withValue} />
        <Figure label="Evidence" value={e.counts.links} />
        {due !== null && <Figure label={due >= 0 ? "Closes in" : "Closed"} value={due >= 0 ? `${due} d` : day(e.closesOn)} tone={due >= 0 && due <= 21 ? "revise" : undefined} />}
      </div>
      {e.groups.length > 0 && (
        <ul className={`an-groups${e.groups.length > 8 ? " an-groups--dense" : ""}`} aria-label="Groups">
          {e.groups.map((g) => {
            const share = g.max ? g.claimed / g.max : g.readiness / 100;
            const counted = t.counted?.includes(g.code);
            return (
              <li key={g.code} className={counted ? "is-counted" : undefined} data-tip={`${g.name}: ${g.max ? `${pts(g.claimed)} of ${pts(g.max)}` : pct(g.readiness)}${counted ? " · counts" : ""}`}>
                <span className="an-groups__name">{e.groups.length > 8 ? g.code.replace("SDG", "") : g.name}</span>
                <span className="an-groups__bar" style={{ "--h": `${Math.max(4, share * 100)}%`, "--w": g.max ? `${(g.max / max) * 100}%` : "100%" } as CSSProperties}>
                  <i />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {e.fixes.length > 0 && (
        <div className="an-fixes">
          <p className="an-subhead">Worth most</p>
          <ol>
            {e.fixes.slice(0, 3).map((f) => (
              <li key={`${f.code}-${f.kind}`}>
                <Link href={`/admin/rankings/${e.ranking}?edition=${e.id}&code=${encodeURIComponent(f.code)}#indicators`}>{f.title}</Link>
                <span className="an-gain">+{pts(f.gain)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="an-ed__foot">
        {(e.issues.errors > 0 || e.issues.warnings > 0) && (
          <Link className="an-issues" href={`/admin/rankings/${e.ranking}?edition=${e.id}&view=checks#indicators`}>
            {e.issues.errors > 0 && (
              <span className="an-issues__n an-issues__n--error">
                <Icon name="alert" size={13} /> {e.issues.errors}
              </span>
            )}
            {e.issues.warnings > 0 && (
              <span className="an-issues__n">
                <Icon name="info" size={13} /> {e.issues.warnings}
              </span>
            )}
            data checks
          </Link>
        )}
        {e.movement.length > 0 && (
          <span className="an-moves" data-tip="Since the snapshot about a quarter ago">
            {e.movement.slice(0, 2).map((m) => (
              <span key={m.key} className={`an-move${m.delta > 0 ? " is-up" : m.delta < 0 ? " is-down" : ""}`}>
                <Icon name={m.delta >= 0 ? "trend-up" : "trend-down"} size={13} />
                {m.label} {m.delta > 0 ? "+" : ""}
                {m.key === "readiness" ? `${m.delta} pts` : pts(m.delta)}
              </span>
            ))}
          </span>
        )}
      </div>
    </Tile>
  );
}

export function Scorecard({ desk }: { desk: ScorecardDesk }) {
  const [editing, setEditing] = useState<ActionDraft | null>(null);
  const open = desk.campaigns.filter((c) => c.status === "Open");
  if (!desk.editions.length)
    return <EmptyState icon="layers" title="No editions yet">Import a methodology pack on a ranking’s Methodology tab to start.</EmptyState>;
  return (
    <div className="an">
      <div className="an-bento">
        {desk.editions.map((e) => (
          <EditionTile key={e.id} e={e} can={desk.can} />
        ))}
        <Tile id="an-requests" className="an-side" title="Data requests" href="/admin/rankings/data-requests">
          {open.length ? (
            <ul className="an-reqs">
              {open.slice(0, 5).map((c) => {
                const requested = c.units.reduce((s, u) => s + u.requested, 0);
                const sent = c.units.reduce((s, u) => s + u.submitted, 0);
                const overdue = c.units.filter((u) => u.overdue > 0).length;
                const d = daysTo(c.due);
                return (
                  <li key={c.id}>
                    <span className="an-reqs__title">
                      {c.code} · {c.title}
                    </span>
                    <span className="an-reqs__meta">
                      {count(c.units.length, "unit")} · {d >= 0 ? `due in ${d} d` : `${-d} d past due`}
                      {overdue ? ` · ${overdue} overdue` : ""}
                    </span>
                    <span className="an-meter" role="img" aria-label={`${sent} of ${count(requested, "item")} sent`}>
                      <i style={{ width: `${requested ? (sent / requested) * 100 : 0}%` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="an-muted">No open requests.</p>
          )}
        </Tile>
        <Tile
          id="an-actions"
          className="an-side"
          title="Action items"
          aside={
            desk.can.edit && (
              <button type="button" className="btn btn--sm" onClick={() => setEditing(newAction(desk.editions[0].id))}>
                <Icon name="plus" size={15} /> Add
              </button>
            )
          }
        >
          {desk.actions.length ? (
            <ul className="an-acts">
              {desk.actions.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="an-acts__row"
                    disabled={!desk.can.edit || !a.edition}
                    onClick={() => setEditing(draftOf(a))}
                  >
                    <span className={`an-plan an-plan--${a.status.toLowerCase().replace(/\s+/g, "-")}`}>{a.status}</span>
                    <span className="an-acts__text">{a.action}</span>
                    <span className="an-acts__meta">
                      {a.ownerName ?? a.editionLabel}
                      {a.due ? ` · ${day(a.due)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="an-muted">Plan the fixes worth most as action items.</p>
          )}
        </Tile>
      </div>

      {editing && <ActionSheet draft={editing} editions={desk.editions} units={desk.units} onClose={() => setEditing(null)} />}
    </div>
  );
}
