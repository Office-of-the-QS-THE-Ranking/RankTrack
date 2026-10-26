"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ACTION_PLAN, type Indicator, type Ranking } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, Kpi, MeterRow, Notice, PageHeader, PlanStatus, Status, Trend } from "@/components/ui/primitives";
import { BarList, ChartFrame, LineWithTarget } from "@/components/charts/charts";
import { linkedEvidence } from "./IndicatorDrawer";
import { criticalIndicator } from "./focus";
import { useHub } from "@/components/hub/HubProvider";
import { useViews } from "@/components/reference/ReferenceProvider";

/** Dedicated diagnostic for a ranking's principal structural challenge (QS: Citations per Faculty). */
export function Diagnostic({ ranking }: { ranking: Ranking }) {
  const ind = criticalIndicator(ranking);
  if (ind) return <IndicatorDiagnostic ranking={ranking} ind={ind} />;
  return (
    <>
      <PageHeader
        title="Diagnostic"
        actions={
          <Link href={`/admin/rankings/${ranking.slug}#indicators`} className="btn">
            <Icon name="arrow-left" size={18} /> Back to {ranking.short}
          </Link>
        }
      />
      <Card>
        <Empty icon="target" title="No indicator values yet">
          The diagnostic opens on the indicator furthest from its target once {ranking.short} has values and targets.
        </Empty>
      </Card>
    </>
  );
}

function IndicatorDiagnostic({ ranking, ind }: { ranking: Ranking; ind: Indicator }) {
  const { families, researchFunnel } = useViews();
  const years = [2023, 2024, 2025, 2026];
  const share = ind.current !== null && ind.target ? Math.round((ind.current / ind.target) * 100) : null;
  const hub = useHub();
  const owner = hub?.units.find((u) => u.name === ind.owner);
  const evidence = linkedEvidence(ranking, ind, hub?.evidence);
  const isQs = ranking.slug === "qs-wur";
  const decimals = [ind.current ?? 0, ind.target ?? 0, ...ind.history].some((v) => v % 1 !== 0) ? 1 : 0;
  const num = (v: number | null) => (v === null ? "—" : v.toFixed(decimals));
  const plan = ACTION_PLAN.filter((a) => (isQs ? /co-authorship|Citations/.test(a.action) : a.owner === ind.owner));

  return (
    <>
      <PageHeader
        title={`${ind.name}: diagnostic`}
        lede={
          isQs
            ? "Citations per Faculty is UST's principal structural challenge in QS. It is an institutional process issue, not only a rankings-office concern: it depends on research capacity, indexed output and international collaboration across every faculty."
            : `The indicator furthest from target in ${ranking.short}, with its history, causes, owner and the actions that move it.`
        }
        actions={
          <Link href={`/admin/rankings/${ranking.slug}#indicators`} className="btn">
            <Icon name="arrow-left" size={18} /> Back to {ranking.short}
          </Link>
        }
      />

      <div className="grid cols-4">
        <Kpi label="Current score" icon="target" value={num(ind.current)} meta={`Weight ${ind.weight} of ${ranking.short}`} />
        <Kpi label="Target" icon="flag" value={num(ind.target)} meta={share !== null ? `${share}% of target today` : undefined} />
        <Kpi label="Trend" icon="trend-up" value={<Trend trend={ind.trend} />} meta="Across four reporting cycles" />
        <Kpi label="Evidence" icon="evidence" value={<Status status={ind.status} />} meta={`Owner: ${ind.owner}`} />
      </div>

      <div className="grid cols-3-2">
        <ChartFrame
          title="History against target"
          sub="Score by reporting cycle"
          table={
            <table className="chart-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {ind.history.map((h, k) => (
                  <tr key={k}>
                    <td>{years[k]}</td>
                    <td>{h > 0 ? h : "—"}</td>
                  </tr>
                ))}
                <tr>
                  <td>Target</td>
                  <td>{ind.target}</td>
                </tr>
              </tbody>
            </table>
          }
        >
          <LineWithTarget values={ind.history} years={years} target={ind.target} label={`${ind.name} by year`} color={families[ranking.family].color} />
        </ChartFrame>
        <Card title="Definition and formula" icon="knowledge">
          <dl className="kv kv--stack">
            <dt>What it measures</dt>
            <dd>{ind.definition}</dd>
            <dt>How it is calculated</dt>
            <dd>{ind.formula}</dd>
            <dt>Responsible unit</dt>
            <dd>
              {owner ? (
                <Link className="link" href={`/admin/units/${owner.slug}`}>
                  {ind.owner} <Icon name="arrow" size={14} />
                </Link>
              ) : (
                ind.owner
              )}
            </dd>
          </dl>
        </Card>
      </div>

      {isQs && (
        <div className="grid cols-2">
          <Card title="Where the score comes from" sub="Research influence funnel, 2025" icon="research">
            <ol className="flow flow--stack">
              {researchFunnel.map((s, i) => (
                <li key={s.step} className={`flow__step${i === 4 ? " flow__step--warn" : ""}`}>
                  <span className="flow__value">{s.value}</span>
                  <span className="flow__name">{s.step}</span>
                  <span className="flow__note">{s.note}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Citations per faculty by cluster" sub="Five-year citations per faculty FTE (sample breakdown); the line marks the 3.0 target" icon="grid">
            <BarList
              label="Citations per faculty by cluster"
              max={4}
              suffix=""
              marker={{ value: 3, label: "Target 3.0" }}
              rows={[
                { label: "Medicine and health", value: 3.1, detail: "Above target; strong clinical co-authorship" },
                { label: "Natural sciences", value: 2.4, detail: "Rising with international partners" },
                { label: "Engineering", value: 1.2, detail: "Output growing; few indexed venues" },
                { label: "Social sciences", value: 0.9, detail: "Many outputs outside Scopus" },
                { label: "Arts and humanities", value: 0.4, detail: "Books and local journals dominate" },
              ]}
            />
            <div className="mt-4">
              <Notice tone="info" icon="info">
                The two levers with the most reach: publish in indexed venues and grow international co-authorship from 36% to 45%.
              </Notice>
            </div>
          </Card>
        </div>
      )}

      <div className="grid cols-2">
        <Card title="Improvement actions" sub="From the action plan and the indicator's open items" icon="flag">
          <ul className="list">
            {plan.map((a) => (
              <li key={a.action}>
                <span className="list__main">{a.action}</span>
                <span className="list__aside">
                  <PlanStatus status={a.status} />
                </span>
                <span className="list__sub">
                  {a.kpi} · {a.owner} · {a.timeline}
                </span>
              </li>
            ))}
            {ind.actions.map((a) => (
              <li key={a}>
                <span className="list__main">{a}</span>
                <span className="list__aside">
                  <span className="chip">Open</span>
                </span>
                <span className="list__sub">{ind.owner}</span>
              </li>
            ))}
          </ul>
          {plan[0] && (
            <div className="mt-4" style={{ maxWidth: 360 } as CSSProperties}>
              <p className="small text-2" style={{ marginBottom: 6 }}>
                {plan[0].action}
              </p>
              <MeterRow value={plan[0].progress} tone="gold" label={`${plan[0].action} progress`} />
            </div>
          )}
        </Card>
        <Card title="Linked evidence" icon="evidence">
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
            <p className="small muted">
              No evidence is mapped to this indicator yet. Bibliometric indicators are calculated by the ranking body from Scopus; the
              Office validates affiliation strings and publication lists instead.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
