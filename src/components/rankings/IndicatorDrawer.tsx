"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { EVIDENCE, unitByName, type EvidenceItem, type Indicator, type Ranking } from "@/lib/data";
import { useHub } from "@/components/hub/HubProvider";
import { Drawer } from "@/components/ui/interactive";
import { Icon } from "@/components/ui/Icon";
import { Meter, Status, Trend } from "@/components/ui/primitives";
import { Sparkline } from "@/components/charts/charts";
import { criticalIndicator } from "./focus";

export function linkedEvidence(ranking: Ranking, ind: Indicator, pool: EvidenceItem[] = EVIDENCE) {
  const key = ind.name.split(":")[0].toLowerCase();
  return pool.filter((e) =>
    e.mappedTo.some((m) => {
      const [rk, indicator = ""] = m.split(" · ");
      if (rk !== ranking.short) return false;
      const i = indicator.toLowerCase();
      return i.includes(key) || key.includes(i) || key.split(" ").some((w) => w.length > 4 && i.includes(w));
    }),
  );
}

export function IndicatorDrawer({ ranking, indicator, onClose }: { ranking: Ranking; indicator: Indicator | null; onClose: () => void }) {
  const ind = indicator;
  const hub = useHub();
  const owner = ind ? hub?.units.find((u) => u.name === ind.owner) ?? unitByName(ind.owner) : undefined;
  const evidence = ind ? linkedEvidence(ranking, ind, hub?.evidence) : [];
  const share = ind && ind.current !== null && ind.target ? Math.round((ind.current / ind.target) * 100) : null;
  const hist = ind ? ind.history.filter((h) => h > 0) : [];
  const critical = ind && criticalIndicator(ranking)?.name === ind.name;

  return (
    <Drawer
      open={!!ind}
      onClose={onClose}
      eyebrow={ind ? `${ranking.short} · weight ${ind.weight}` : ""}
      title={ind?.name ?? ""}
      footer={
        ind && (
          <>
            {critical && (
              <Link href={`/admin/rankings/${ranking.slug}/diagnostic`} className="btn">
                <Icon name="research" size={18} /> Open diagnostic
              </Link>
            )}
            <Link href="/admin/contribute" className="btn btn--dark">
              <Icon name="evidence" size={18} /> Review evidence
            </Link>
          </>
        )
      }
    >
      {ind && (
        <>
          <div className="drawer-kpis">
            <div>
              <p className="eyebrow">Current</p>
              <p className="drawer-kpis__v">
                {ind.current ?? "—"}
                {ind.unit === "% of threshold" && <small>%</small>}
              </p>
            </div>
            <div>
              <p className="eyebrow">Target</p>
              <p className="drawer-kpis__v">{ind.target ?? "—"}</p>
            </div>
            <div>
              <p className="eyebrow">Trend</p>
              <p style={{ marginTop: 8 }}>
                <Trend trend={ind.trend} />
              </p>
            </div>
          </div>
          {share !== null && (
            <div className="stack" style={{ ["--gap" as string]: "6px" } as CSSProperties}>
              <p className="small text-2">
                <b className="num" style={{ color: "var(--text)" }}>
                  {share}%
                </b>{" "}
                of target
              </p>
              <Meter value={share} tone="gold" label="Share of target" />
            </div>
          )}

          <dl className="kv">
            <dt>Definition</dt>
            <dd>{ind.definition}</dd>
            <dt>Formula</dt>
            <dd>{ind.formula}</dd>
            <dt>Owner</dt>
            <dd>
              {owner ? (
                <Link href={`/admin/units/${owner.slug}`} className="link">
                  {ind.owner} <Icon name="arrow" size={14} />
                </Link>
              ) : (
                ind.owner
              )}
            </dd>
            <dt>Evidence status</dt>
            <dd>
              <Status status={ind.status} />
            </dd>
          </dl>

          <div>
            <h3>Historical values</h3>
            {hist.length > 1 ? (
              <div className="row" style={{ ["--gap" as string]: "18px" } as CSSProperties}>
                <Sparkline values={ind.history} width={180} height={44} label={`${ind.name} history`} />
                <ol className="hist">
                  {ind.history.map((h, k) =>
                    h > 0 ? (
                      <li key={k}>
                        <span className="muted">{2023 + k}</span>
                        <b className="num">{h}</b>
                      </li>
                    ) : null,
                  )}
                </ol>
              </div>
            ) : (
              <p className="small muted">First reporting year.</p>
            )}
          </div>

          <div>
            <h3>Linked evidence</h3>
            {evidence.length ? (
              <ul className="list">
                {evidence.map((e) => (
                  <li key={e.id}>
                    <Link href={`/admin/contribute?item=${e.id}`} className="list__main">
                      {e.title}
                    </Link>
                    <span className="list__aside">
                      <Status status={e.status} />
                    </span>
                    <span className="list__sub">
                      {e.id} · {e.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No evidence is mapped to this indicator yet this cycle.</p>
            )}
          </div>

          <div>
            <h3>Recommended actions</h3>
            {ind.actions.length ? (
              <ul className="actions-list">
                {ind.actions.map((a) => (
                  <li key={a}>
                    <Icon name="arrow" size={16} />
                    <span>
                      {a}
                      <small>{ind.owner}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No open actions for this indicator.</p>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
