"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  ACTION_PLAN,
  COMPARISON,
  CYCLE,
  EVIDENCE as STATIC_EVIDENCE,
  REPORT_TYPES,
  STAGES,
  UNITS as STATIC_UNITS,
  formatDate,
  type Indicator,
  type Ranking,
} from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, MeterRow, Notice, PlanStatus, Status, Trend } from "@/components/ui/primitives";
import { Segmented, TabPanel, Tabs } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { ChartFrame, Heatmap, RankTrajectory, Sparkline, TrajectoryTable } from "@/components/charts/charts";
import { FiveQuestions, RankingHeader } from "./RankingHeader";
import { IndicatorDrawer } from "./IndicatorDrawer";
import { SpecialDashboard } from "./SpecialDashboard";
import { actionIcon, resolveFocus } from "./focus";
import { useHub } from "@/components/hub/HubProvider";
import { Select } from "@/components/ui/pickers";

const TABS = ["Overview", "Performance", "Indicators", "Evidence", "Contributors", "Action Plan", "Methodology", "Reports"] as const;
type Tab = (typeof TABS)[number];
const slugOf = (t: string) => t.toLowerCase().replace(/\s+/g, "-");

function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RankingView({ ranking }: { ranking: Ranking }) {
  // Evidence and units come from the governance store: review states, directory names and archives.
  const hub = useHub();
  const EVIDENCE = hub?.evidence ?? STATIC_EVIDENCE;
  const UNITS = hub ? hub.units.filter((u) => u.status === "Active") : STATIC_UNITS;
  const [tab, setTabState] = useState<Tab>("Overview");
  const [ind, setInd] = useState<Indicator | null>(null);
  const [made, setMade] = useState<string[]>([]);
  const [evFilter, setEvFilter] = useState<"All" | "Needs attention" | "Reused">("All");

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", t === "Overview" ? location.pathname : `#${slugOf(t)}`);
  }, []);

  useEffect(() => {
    const fromHash = () => {
      const h = location.hash.slice(1);
      const t = TABS.find((x) => slugOf(x) === h);
      if (t) setTabState(t);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const openIndicator = (name: string) => {
    const i = ranking.indicators.find((x) => x.name === name);
    if (i) setInd(i);
  };

  const focus = (label: string) => {
    const f = resolveFocus(ranking, label);
    if (f.kind === "tab") setTab(f.tab as Tab);
    else if (f.kind === "indicator") setInd(f.indicator);
    else if (f.kind === "anchor") document.getElementById(f.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else location.assign(f.href);
  };

  const evidence = EVIDENCE.filter((e) => e.mappedTo.some((m) => m.startsWith(ranking.short + " ·")));
  const shownEvidence = evidence.filter((e) =>
    evFilter === "All" ? true : evFilter === "Reused" ? e.mappedTo.length > 1 : e.status === "Needs revision" || e.status === "For review",
  );
  const owners = new Set(ranking.indicators.map((i) => i.owner));
  const contributors = UNITS.filter((u) => owners.has(u.name) || u.rankingsServed >= 4).slice(0, 10);
  const actions = ranking.indicators.flatMap((i) => i.actions.map((a) => ({ a, ind: i })));
  const idx = TABS.indexOf(tab);
  const included = evidence.filter((e) => e.stage >= 3).length;

  return (
    <>
      <RankingHeader
        ranking={ranking}
        asOf={hub?.site.asOf}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setTab("Reports")}>
              <Icon name="reports" size={18} /> Reports
            </button>
          </>
        }
      />

      <FiveQuestions ranking={ranking} onTab={(t) => setTab(t as Tab)} reviewing={evidence.filter((e) => e.status === "For review").length} />

      <div className="stack" style={{ ["--gap" as string]: "20px" } as CSSProperties}>
        <Tabs tabs={TABS} value={tab} onChange={setTab} label={`${ranking.short} sections`} idBase={`rk-${ranking.slug}`} />

        <TabPanel idBase={`rk-${ranking.slug}`} index={idx} className="stack tabpanel">
          {tab === "Overview" && (
            <>
              <div className="grid cols-2-1">
                <Card title="Executive interpretation" icon="quote">
                  {!ranking.interpretation && !ranking.strengths.length && !ranking.gaps.length && !ranking.opportunities.length ? (
                    <Empty icon="quote" title="No interpretation yet">
                      The Office writes it once {ranking.short} has a result to read.
                    </Empty>
                  ) : (
                  <>
                  <p className="lead-text">{ranking.interpretation}</p>
                  <div className="sgo">
                    <div>
                      <h3 className="sgo__h">Key strengths</h3>
                      <ul className="bullets">
                        {ranking.strengths.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="sgo__h">Critical gaps</h3>
                      <ul className="bullets bullets--gap">
                        {ranking.gaps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="sgo__h">Main opportunities</h3>
                      <ul className="bullets bullets--opp">
                        {ranking.opportunities.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  </>
                  )}
                </Card>
                <Card
                  title="Action panel"
                  sub="Specific actions, not only scores"
                  icon="flag"
                  id="action-panel"
                  foot={
                    actions.length > 4 ? (
                      <button type="button" className="link" onClick={() => setTab("Indicators")}>
                        All {actions.length} actions by indicator <Icon name="arrow" size={14} />
                      </button>
                    ) : undefined
                  }
                >
                  {actions.length ? (
                    <ul className="actions-list actions-list--btn">
                      {actions.slice(0, 4).map(({ a, ind: i }) => (
                        <li key={a}>
                          <button type="button" onClick={() => setInd(i)}>
                            <span className="actions-list__icon">
                              <Icon name={actionIcon(a)} size={16} />
                            </span>
                            <span>
                              {a}
                              <small>
                                {i.name} · {i.owner}
                              </small>
                            </span>
                            <Icon name="chevron" size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty icon="check-circle" title="No open actions">
                      Every indicator has its evidence in place.
                    </Empty>
                  )}
                </Card>
              </div>

              <nav className="focusnav" aria-label={`${ranking.short} menu`}>
                <span className="focusnav__label">In this ranking</span>
                <div className="pills">
                  {ranking.menu.map((m) => (
                    <button key={m} type="button" className="pill" onClick={() => focus(m)}>
                      {m}
                    </button>
                  ))}
                </div>
              </nav>

              <SpecialDashboard ranking={ranking} onIndicator={openIndicator} />
            </>
          )}

          {tab === "Performance" && (
            <>
              <div className="grid cols-1-2">
                <ChartFrame
                  title="Multi-year overall trend"
                  sub="Published band by edition; rank 1 at the top"
                  table={<TrajectoryTable rankings={[ranking]} />}
                >
                  <RankTrajectory ranking={ranking} height={210} />
                </ChartFrame>
                <Card title="Target versus actual" sub="Indicator-level trends and share of target" icon="target" bodyClass="card__body--flush">
                  <div className="table-wrap">
                    <table className="table table--stack">
                      <thead>
                        <tr>
                          <th>Indicator</th>
                          <th>Trend</th>
                          <th className="r">Actual</th>
                          <th className="r">Target</th>
                          <th className="table__meter">Share of target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ranking.indicators.map((i) => (
                          <tr key={i.name}>
                            <td>
                              <button type="button" className="rowlink" onClick={() => setInd(i)}>
                                {i.name}
                              </button>
                            </td>
                            <td data-label="Trend">
                              <Sparkline values={i.history} label={i.name} />
                            </td>
                            <td data-label="Actual" className="r num">
                              {i.current}
                            </td>
                            <td data-label="Target" className="r num">
                              {i.target}
                            </td>
                            <td data-label="Share">
                              <MeterRow value={((i.current ?? 0) / (i.target ?? 1)) * 100} label={`${i.name} share of target`} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
              <div className="grid cols-3-2">
                <Card title="Strength and risk heat map" sub="Value as a share of target, by year" icon="grid">
                  <Heatmap
                    caption={`${ranking.short} indicator value as a share of target by year`}
                    columns={[2023, 2024, 2025, 2026]}
                    rows={ranking.indicators.map((i) => ({
                      label: i.name,
                      values: i.history.map((h) => (h > 0 && i.target ? Math.round((h / i.target) * 100) : null)),
                    }))}
                    min={40}
                    max={100}
                    format={(v) => `${v}%`}
                  />
                </Card>
                <Card title="Philippine and ASEAN comparison" sub="Sample peers, anonymised" icon="globe">
                  <ul className="list">
                    {COMPARISON.map((c) => (
                      <li key={c.name} className={c.own ? "list__own" : undefined}>
                        <span className="list__main">{c.own ? `UST (${ranking.short})` : c.name}</span>
                        <span className="num small" style={{ fontWeight: 600 }}>
                          {c.own ? ranking.current : c.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </>
          )}

          {tab === "Indicators" && (
            <Card
              title="Indicator scorecard"
              sub="Select an indicator for its definition, formula, evidence, history, owner and recommended actions"
              icon="target"
              bodyClass="card__body--flush"
            >
              <div className="table-wrap">
                <table className="table table--hover table--click table--stack">
                  <thead>
                    <tr>
                      <th>Indicator</th>
                      <th>Weight</th>
                      <th className="r">Current</th>
                      <th className="r">Target</th>
                      <th>Trend</th>
                      <th>Evidence status</th>
                      <th>Responsible unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.indicators.map((i) => (
                      <tr key={i.name} onClick={() => setInd(i)}>
                        <td>
                          <button
                            type="button"
                            className="rowlink"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInd(i);
                            }}
                          >
                            {i.name}
                          </button>
                        </td>
                        <td data-label="Weight" className="num">
                          {i.weight}
                        </td>
                        <td data-label="Current" className="r num">
                          <b>
                            {i.current}
                            {i.unit === "% of threshold" ? "%" : ""}
                          </b>
                        </td>
                        <td data-label="Target" className="r num">
                          {i.target}
                        </td>
                        <td data-label="Trend">
                          <Trend trend={i.trend} />
                        </td>
                        <td data-label="Evidence">
                          <Status status={i.status} />
                        </td>
                        <td data-label="Owner" className="small text-2">
                          {i.owner}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === "Evidence" && (
            <div className="grid cols-2-1">
              <Card
                title="Evidence checklist"
                sub={`${evidence.length} items mapped this cycle · ${included} included in the final submission`}
                icon="evidence"
                actions={
                  <Segmented
                    options={["All", "Needs attention", "Reused"] as const}
                    value={evFilter}
                    onChange={setEvFilter}
                    label="Filter evidence"
                  />
                }
              >
                {ranking.indicators
                  .filter((i) => i.status === "Not yet submitted")
                  .map((i) => (
                    <div key={i.name} className="mt-2" style={{ marginBottom: 12 }}>
                      <Notice tone="warn" icon="alert">
                        Still required: <b>{i.name}</b> from {i.owner}.
                      </Notice>
                    </div>
                  ))}
                {shownEvidence.length ? (
                  <ul className="evlist">
                    {shownEvidence.map((e) => (
                      <li key={e.id}>
                        <div className="evlist__top">
                          <Link href={`/admin/contribute?item=${e.id}`} className="list__main">
                            {e.title}
                          </Link>
                          <Status status={e.status} />
                        </div>
                        <p className="list__sub">
                          {e.id} · {e.unit} · {e.period}
                        </p>
                        <ol className="track track--mini" aria-label="Validation history">
                          {STAGES.map((s, k) => (
                            <li key={s} className={k < e.stage ? "is-done" : k === e.stage ? (e.status === "Needs revision" ? "is-flag" : "is-now") : ""}>
                              <span className="sr-only">{s}</span>
                            </li>
                          ))}
                        </ol>
                        {e.mappedTo.length > 1 && (
                          <p className="small text-2">
                            <Icon name="layers" size={14} className="inline-icon" /> Reused in {e.mappedTo.length} rankings:{" "}
                            {e.mappedTo.map((m) => m.split(" · ")[0]).join(", ")}
                          </p>
                        )}
                        {e.comments[0] && (
                          <div className="comment comment--compact">
                            <p className="comment__who">
                              {e.comments[0].by} · {formatDate(e.comments[0].date)}
                            </p>
                            <p>{e.comments[0].text}</p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty icon="evidence" title="Nothing in this view">
                    No evidence matches this filter yet.
                  </Empty>
                )}
              </Card>
              <Card title="Add evidence" sub="Document upload or public URL, checked against the reporting window" icon="upload" tone="tint">
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLFormElement).reset();
                    toast(`Sent for validation. It will appear in the ${ranking.short} checklist once received.`);
                  }}
                >
                  <label className="dropzone">
                    <span className="dropzone__icon">
                      <Icon name="upload" />
                    </span>
                    <strong>Upload a document</strong>
                    <span className="small muted">PDF, XLSX or CSV up to 25 MB</span>
                    <input type="file" className="sr-only" />
                  </label>
                  <label className="field">
                    <span className="field__label">Or a public URL</span>
                    <input className="input" type="url" placeholder="https://www.ust.edu.ph/…" />
                  </label>
                  <label className="field">
                    <span className="field__label">Reporting period</span>
                    <Select className="select" defaultValue={ranking.reportingPeriod}>
                      <option>{ranking.reportingPeriod}</option>
                      <option>Calendar year 2024</option>
                    </Select>
                    <span className="field__hint">Verified against this ranking&rsquo;s reporting window before review.</span>
                  </label>
                  <button className="btn btn--dark" type="submit">
                    <Icon name="send" size={18} /> Send for validation
                  </button>
                </form>
              </Card>
            </div>
          )}

          {tab === "Contributors" && (
            <Card title="Contributing offices" sub="Assigned requirements, completion and assistance requested" icon="collaboration" bodyClass="card__body--flush">
              <div className="table-wrap">
                <table className="table table--hover table--stack">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Coordinator</th>
                      <th className="r">Assigned</th>
                      <th className="table__meter">Completion</th>
                      <th className="r">Validated</th>
                      <th>Assistance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contributors.map((u) => (
                      <tr key={u.slug}>
                        <td>
                          <Link href={`/admin/units/${u.slug}`} className="rowlink">
                            {u.name}
                          </Link>
                        </td>
                        <td data-label="Coordinator">{u.coordinator}</td>
                        <td data-label="Assigned" className="r num">
                          {u.assigned}
                        </td>
                        <td data-label="Completion">
                          <MeterRow value={(u.completed / u.assigned) * 100} label={`${u.name} completion`} />
                        </td>
                        <td data-label="Validated" className="r num">
                          {u.validated}
                        </td>
                        <td data-label="Assistance">
                          {u.assistance ? <span className="chip chip--gold">Requested</span> : <span className="muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === "Action Plan" && (
            <Card title="Strategy tracker" sub="Improvement actions with KPI, owner, timeline and progress" icon="flag" bodyClass="card__body--flush">
              <div className="table-wrap">
                <table className="table table--stack">
                  <thead>
                    <tr>
                      <th>Improvement action</th>
                      <th>KPI</th>
                      <th>Owner</th>
                      <th>Timeline</th>
                      <th className="table__meter">Progress</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ACTION_PLAN.map((a) => (
                      <tr key={a.action}>
                        <td className="table__primary">{a.action}</td>
                        <td data-label="KPI">{a.kpi}</td>
                        <td data-label="Owner" className="small text-2">
                          {a.owner}
                        </td>
                        <td data-label="Timeline" className="num nowrap">
                          {a.timeline}
                        </td>
                        <td data-label="Progress">
                          <MeterRow value={a.progress} tone="gold" label={`${a.action} progress`} />
                        </td>
                        <td data-label="Status">
                          <PlanStatus status={a.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === "Methodology" && (
            <div className="grid cols-2-1">
              <Card title="In plain language" icon="knowledge">
                <p className="lead-text">
                  <b>What it measures.</b> {ranking.measures}.
                </p>
                <h3 className="sgo__h mt-6">Indicators and weightings</h3>
                <ul className="list mt-3">
                  {ranking.indicators.map((i) => (
                    <li key={i.name}>
                      <span className="list__main">{i.name}</span>
                      <span className="list__aside chip">{i.weight}</span>
                      <span className="list__sub">{i.definition}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <div className="grid">
                <Card title="Data sources and reporting period" icon="data">
                  <ul className="bullets bullets--ink">
                    {ranking.dataSources.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  <p className="small text-2 mt-4">
                    <b>Reporting period:</b> {ranking.reportingPeriod}
                  </p>
                </Card>
                <Card title="Common evidence errors" icon="alert" tone="tint">
                  <ul className="bullets bullets--gap">
                    {ranking.commonErrors.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </Card>
                <Card title="Methodology changes" icon="history">
                  <p className="small text-2">{ranking.methodologyChanges}</p>
                </Card>
              </div>
            </div>
          )}

          {tab === "Reports" && (
            <Card title="Generate a report" sub={`${ranking.short}, cycle ${CYCLE}. Available to authorised users.`} icon="reports">
              <ul className="list">
                {REPORT_TYPES.map((r) => (
                  <li key={r.name}>
                    <span className="list__main">{r.name}</span>
                    <span className="list__aside">
                      {made.includes(r.name) ? (
                        <span className="row" style={{ ["--gap" as string]: "6px" } as CSSProperties}>
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() =>
                              downloadCsv(`${ranking.slug}-${r.name.toLowerCase().replace(/\s+/g, "-")}.csv`, [
                                ["Indicator", "Weight", "Current", "Target", "Trend", "Evidence status", "Owner"],
                                ...ranking.indicators.map((i) => [i.name, i.weight, i.current, i.target, i.trend, i.status, i.owner]),
                              ])
                            }
                          >
                            <Icon name="download" size={16} /> CSV
                          </button>
                          <button type="button" className="btn btn--sm" onClick={() => window.print()}>
                            <Icon name="reports" size={16} /> Print or PDF
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--dark btn--sm"
                          onClick={() => {
                            setMade((m) => [...m, r.name]);
                            toast(`${r.name} is ready to download.`);
                          }}
                        >
                          Generate
                        </button>
                      )}
                    </span>
                    <span className="list__sub">{r.note}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabPanel>
      </div>

      <IndicatorDrawer ranking={ranking} indicator={ind} onClose={() => setInd(null)} />
    </>
  );
}
