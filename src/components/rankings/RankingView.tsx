"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { ACTION_PLAN, COMPARISON, EVIDENCE as STATIC_EVIDENCE, STAGES, daysUntil, formatDate, type EvidenceStatus, type Indicator, type Ranking } from "@/lib/data";
import { familyOf } from "@/lib/reference";
import { Tile } from "@/components/dashboard/Tile";
import { UnitMark } from "@/components/units/UnitMark";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PlanStatus, Ring, Status, cx } from "@/components/ui/primitives";
import { Drawer, InfoTooltip, Segmented, TabPanel, Tabs, type ContentTab } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { Select } from "@/components/ui/pickers";
import { useHub } from "@/components/hub/HubProvider";
import { useReference, useViews } from "@/components/reference/ReferenceProvider";
import { RankingHero, drivers, nextAction } from "./RankingHeader";
import { Bullet, EmptyArt, HeatGrid, PeerLadder, Quiet, Spark, StatusDonut, WeightMosaic, shareOf, valueOf, weightOf, type Part } from "./RankingCharts";
import { IndicatorDrawer } from "./IndicatorDrawer";
import { SpecialDashboard } from "./SpecialDashboard";
import { actionIcon, resolveFocus, type FocusTarget } from "./focus";

/* Keys stay as the ranking menus (focus.ts) and earlier links (#indicators, #methodology) name them. */
type Tab = "Overview" | "Indicators" | "Evidence" | "Contributors" | "Action Plan" | "Methodology";
const TABS: ContentTab<Tab>[] = [
  { key: "Overview", label: "Overview" },
  { key: "Indicators", label: "Indicators" },
  { key: "Evidence", label: "Evidence" },
  { key: "Contributors", label: "Units" },
  { key: "Action Plan", label: "Action plan" },
  { key: "Methodology", label: "Methodology" },
];
const slugOf = (t: string) => t.toLowerCase().replace(/\s+/g, "-");
/** Sections that were tabs of their own before. */
const MOVED: Record<string, Tab> = { performance: "Indicators" };

const TONE: Record<EvidenceStatus, Part["tone"] | null> = {
  Validated: "ok",
  "For review": "review",
  "Needs revision": "revise",
  "Not yet submitted": "missing",
  "Not applicable": null,
};
const PARTS: { status: EvidenceStatus; label: string }[] = [
  { status: "Validated", label: "Validated" },
  { status: "For review", label: "For review" },
  { status: "Needs revision", label: "Revisions" },
  { status: "Not yet submitted", label: "Not sent" },
];
const PLAN = ["Complete", "On track", "At risk", "Not started"] as const;

const FOCUS_ICON: Record<FocusTarget["kind"], IconName> = { tab: "layers", indicator: "target", link: "arrow-up-right", anchor: "arrow-down" };

function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Counts of items by evidence status, as legend rows. */
function StatusLegend({ parts }: { parts: Part[] }) {
  return (
    <dl className="rk-legend">
      {parts.map((p) => (
        <div key={p.key}>
          <dt>
            <span className={`status status--${p.tone} ov-key`}>
              <i className="status__shape" />
            </span>
            {p.label}
          </dt>
          <dd>{p.n}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RankingView({ ranking }: { ranking: Ranking }) {
  const { latestEdition, reportTypes } = useViews();
  const fam = familyOf(useReference(), ranking.family);
  // Evidence and units come from the governance store: review states, directory names and archives.
  const hub = useHub();
  const EVIDENCE = hub?.evidence ?? STATIC_EVIDENCE;
  const UNITS = hub?.units.filter((u) => u.status === "Active") ?? [];
  const [tab, setTabState] = useState<Tab>("Overview");
  const [ind, setInd] = useState<Indicator | null>(null);
  const [reports, setReports] = useState(false);
  const [made, setMade] = useState<string[]>([]);
  const [evFilter, setEvFilter] = useState<"All" | "Needs attention" | "Reused">("All");

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", t === "Overview" ? location.pathname : `#${slugOf(t)}`);
  }, []);

  useEffect(() => {
    const fromHash = () => {
      const h = location.hash.slice(1);
      if (h === "reports") return setReports(true);
      const t = TABS.find((x) => slugOf(x.key) === h)?.key ?? MOVED[h];
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
  const missing = ranking.indicators.filter((i) => i.status === "Not yet submitted");
  const owners = new Set(ranking.indicators.map((i) => i.owner));
  const contributors = UNITS.filter((u) => owners.has(u.name) || u.rankingsServed >= 4).slice(0, 10);
  const actions = ranking.indicators.flatMap((i) => i.actions.map((a) => ({ a, ind: i })));
  const idx = TABS.findIndex((t) => t.key === tab);

  const countBy = <T,>(items: T[], statusOf: (x: T) => EvidenceStatus): Part[] =>
    PARTS.map((p) => ({ key: p.status, label: p.label, tone: TONE[p.status]!, n: items.filter((x) => statusOf(x) === p.status).length }));
  const indicatorParts = countBy(ranking.indicators, (i) => i.status);
  const evidenceParts = countBy(evidence, (e) => e.status);

  const top = drivers(ranking);
  const act = nextAction(ranking);
  const more = actions.filter(({ a }) => a !== act?.action).slice(0, 3);
  const actDays = act?.due ? daysUntil(act.due) : null;
  const sgo = [
    { label: "Strengths", icon: "trend-up", tone: "ok", items: ranking.strengths },
    { label: "Gaps", icon: "alert", tone: "revise", items: ranking.gaps },
    { label: "Opportunities", icon: "spark", tone: "gold", items: ranking.opportunities },
  ] as const;
  const read = ranking.interpretation || sgo.some((g) => g.items.length);
  const menu = ranking.menu.filter((m) => !/Overview$/.test(m));

  // Each indicator's history ends at the latest edition.
  const span = Math.max(0, ...ranking.indicators.map((i) => i.history.length));
  const years = Array.from({ length: span }, (_, k) => latestEdition - span + 1 + k);
  const heatRows = ranking.indicators.map((i) => ({
    label: i.name,
    values: Array.from({ length: span }, (_, k) => {
      const h = i.history[k - (span - i.history.length)];
      return h && h > 0 && i.target ? Math.round((h / i.target) * 100) : null;
    }),
  }));
  const plan = PLAN.map((s) => ({ status: s, n: ACTION_PLAN.filter((a) => a.status === s).length })).filter((p) => p.n);
  const totalWeight = ranking.indicators.reduce((s, i) => s + weightOf(i), 0);

  return (
    <div className="ov rk" style={{ "--fam": fam.color } as CSSProperties}>
      <RankingHero ranking={ranking} asOf={hub?.site.asOf} />

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        label={`${ranking.short} sections`}
        idBase={`rk-${ranking.slug}`}
        counts={{ Evidence: ranking.pending || undefined }}
        actions={
          <button type="button" className="content-tabs__action" onClick={() => setReports(true)} aria-haspopup="dialog">
            <Icon name="reports" size={16} /> Reports
          </button>
        }
      />

      <TabPanel idBase={`rk-${ranking.slug}`} index={idx} className="rk-panel tabpanel">
        {tab === "Overview" && (
          <>
            <div className="ov-bento rk-bento">
              <Tile
                id="rk-drivers"
                title="What drives it"
                className="rk-s5"
                aside={
                  <button type="button" className="rk-more" onClick={() => setTab("Indicators")} aria-label="All indicators">
                    <Icon name="chevron" size={16} />
                  </button>
                }
              >
                {ranking.indicators.length ? (
                  <>
                    <WeightMosaic indicators={ranking.indicators} onPick={setInd} />
                    <ol className="rk-top2">
                      {top.map((i) => (
                        <li key={i.name}>
                          <button type="button" onClick={() => setInd(i)}>
                            <span className="rk-top2__w">{i.weight}</span>
                            <span className="rk-top2__name">{i.name}</span>
                            <span className="rk-top2__v">
                              {valueOf(i)}
                              <small> / {i.target ?? "—"}</small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <Quiet icon="target">No indicators yet</Quiet>
                )}
              </Tile>

              <Tile
                id="rk-ev"
                title="Evidence"
                className="rk-s3"
                aside={
                  <button type="button" className="rk-more" onClick={() => setTab("Evidence")} aria-label="Open evidence">
                    <Icon name="chevron" size={16} />
                  </button>
                }
              >
                <StatusDonut parts={indicatorParts} label="Indicators by evidence status">
                  <b>{ranking.pending}</b>
                  <span>to go</span>
                </StatusDonut>
                <StatusLegend parts={indicatorParts} />
              </Tile>

              <Tile
                id="rk-next"
                title="Next up"
                className="rk-s4"
                aside={
                  <button type="button" className="rk-more" onClick={() => setTab("Action Plan")} aria-label="Action plan">
                    <Icon name="chevron" size={16} />
                  </button>
                }
              >
                {act ? (
                  <div className="rk-next">
                    <span className="rk-next__icon">
                      <Icon name={actionIcon(act.action)} size={18} />
                    </span>
                    <p className="rk-next__what">{act.action}</p>
                    <p className="rk-next__who">{act.unit}</p>
                    {act.due && actDays !== null && (
                      <p className={cx("rk-next__due", actDays <= 14 && "is-soon")}>
                        <Icon name="clock" size={13} />
                        {formatDate(act.due)}
                        <span>· {actDays > 0 ? `${actDays} days` : actDays === 0 ? "today" : "overdue"}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <Quiet icon="check-circle">Nothing waiting</Quiet>
                )}
                {more.length > 0 && (
                  <ul className="rk-then">
                    {more.map(({ a, ind: i }) => (
                      <li key={a}>
                        <button type="button" onClick={() => setInd(i)}>
                          <Icon name={actionIcon(a)} size={14} />
                          <span>{i.name}</span>
                          <Icon name="chevron" size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Tile>

              <Tile id="rk-sum" title="Summary" className="rk-s8">
                {read ? (
                  <>
                    {ranking.interpretation && <p className="rk-sum__lead">{ranking.interpretation}</p>}
                    <div className="rk-sgo">
                      {sgo
                        .filter((g) => g.items.length)
                        .map((g) => (
                          <section key={g.label} className={`rk-sgo__col is-${g.tone}`} aria-label={g.label}>
                            <h3>
                              <span className="rk-sgo__badge">
                                <Icon name={g.icon} size={14} strokeWidth={2} />
                              </span>
                              {g.label}
                            </h3>
                            <ul>
                              {g.items.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                          </section>
                        ))}
                    </div>
                  </>
                ) : (
                  <Quiet icon="quote">No summary yet</Quiet>
                )}
              </Tile>

              <Tile id="rk-explore" title="Explore" className="rk-s4">
                {menu.length ? (
                  <ul className="rk-chips">
                    {menu.map((m) => (
                      <li key={m}>
                        <button type="button" className="rk-chip" onClick={() => focus(m)}>
                          <Icon name={FOCUS_ICON[resolveFocus(ranking, m).kind]} size={13} />
                          {m}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Quiet icon="layers">Nothing to explore yet</Quiet>
                )}
              </Tile>
            </div>

            <SpecialDashboard ranking={ranking} onIndicator={openIndicator} />
          </>
        )}

        {tab === "Indicators" && (
          <div className="ov-bento rk-bento">
            <Tile id="rk-score" title="Scorecard" className="rk-s12">
              {ranking.indicators.length ? (
                <div className="rk-score">
                  <p className="rk-score__head" aria-hidden="true">
                    <span>Indicator</span>
                    <span>Weight</span>
                    <span>Toward target</span>
                    <span>Trend</span>
                    <span>Evidence</span>
                  </p>
                  <ul>
                    {ranking.indicators.map((i) => {
                      const s = shareOf(i);
                      return (
                        <li key={i.name}>
                          <button type="button" className="rk-score__row" onClick={() => setInd(i)}>
                            <span className="rk-score__name">
                              <b>{i.name}</b>
                              <small>{i.owner}</small>
                            </span>
                            <span className="rk-score__w">{i.weight}</span>
                            <span className="rk-score__prog">
                              <Bullet share={s} label={`${i.name} toward target`} />
                              <span className="rk-score__v">
                                {valueOf(i)}
                                <small> / {i.target ?? "—"}</small>
                              </span>
                            </span>
                            <Spark values={i.history} trend={i.trend} label={`${i.name} by year`} />
                            <Status status={i.status} />
                            <Icon name="chevron" size={16} className="rk-score__go" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <EmptyArt kind="start">No indicators yet</EmptyArt>
              )}
            </Tile>

            <Tile id="rk-heat" title="Share of target by year" className="rk-s7">
              {span > 1 && heatRows.some((r) => r.values.some((v) => v !== null)) ? (
                <HeatGrid years={years} rows={heatRows} caption={`${ranking.short} indicator value as a share of target by year`} />
              ) : (
                <Quiet icon="grid">No yearly values yet</Quiet>
              )}
            </Tile>

            <Tile
              id="rk-peers"
              title={
                <>
                  Peers
                  <InfoTooltip label="About peers">Philippine and ASEAN universities, anonymised.</InfoTooltip>
                </>
              }
              className="rk-s5"
            >
              {COMPARISON.length ? (
                <PeerLadder rows={COMPARISON.map((c) => (c.own ? { name: "UST", value: ranking.current || "—", own: true } : c))} />
              ) : (
                <Quiet icon="globe">No peer results yet</Quiet>
              )}
            </Tile>
          </div>
        )}

        {tab === "Evidence" && (
          <div className="ov-bento rk-bento">
            <Tile
              id="rk-evlist"
              title={
                <>
                  Evidence <span className="count">{evidence.length}</span>
                </>
              }
              className="rk-s8"
              aside={
                evidence.length > 0 && (
                  <Segmented options={["All", "Needs attention", "Reused"] as const} value={evFilter} onChange={setEvFilter} label="Filter evidence" />
                )
              }
            >
              {evidence.length > 0 && (
                <div className="rk-evbar">
                  <span className="ov-pipe__bar" aria-hidden="true">
                    {evidenceParts
                      .filter((p) => p.n)
                      .map((p) => (
                        <i key={p.key} className={`is-${p.tone}`} style={{ flexGrow: p.n }} />
                      ))}
                  </span>
                  <StatusLegend parts={evidenceParts} />
                </div>
              )}
              {missing.length > 0 && (
                <ul className="rk-slots" aria-label="Still to send">
                  {missing.map((i) => (
                    <li key={i.name}>
                      <button type="button" className="rk-slot" onClick={() => setInd(i)}>
                        <span className="rk-slot__icon">
                          <Icon name="plus" size={16} />
                        </span>
                        <span className="rk-slot__name">
                          <b>{i.name}</b>
                          <small>{i.owner}</small>
                        </span>
                        <Status status="Not yet submitted" label="Not sent" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {shownEvidence.length ? (
                <ul className="rk-evs">
                  {shownEvidence.map((e) => {
                    const at = Math.min(e.stage, STAGES.length - 1);
                    return (
                      <li key={e.id} className="rk-evi">
                        <span className="rk-evi__icon">
                          <Icon name="evidence" size={18} />
                        </span>
                        <span className="rk-evi__main">
                          <Link href={`/admin/contribute?item=${e.id}`} className="rk-evi__title">
                            {e.title}
                          </Link>
                          <span className="rk-evi__meta">
                            {e.unit} · {e.period}
                            {e.mappedTo.length > 1 && (
                              <span className="rk-evi__reuse" data-tip={e.mappedTo.map((m) => m.split(" · ")[0]).join(", ")}>
                                <Icon name="layers" size={12} /> {e.mappedTo.length} rankings
                              </span>
                            )}
                          </span>
                        </span>
                        <ol className="rk-stages" aria-label={`Stage: ${STAGES[at]}`} data-tip={STAGES[at]}>
                          {STAGES.map((s, k) => (
                            <li key={s} className={k < e.stage ? "is-done" : k === e.stage ? (e.status === "Needs revision" ? "is-flag" : "is-now") : undefined} />
                          ))}
                        </ol>
                        <Status status={e.status} />
                        {e.comments[0] && (
                          <p className="rk-evi__note">
                            <Icon name="comment" size={13} />
                            <span>
                              <b>{e.comments[0].by}</b> {e.comments[0].text}
                            </span>
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyArt kind={evidence.length ? "search" : "start"}>{evidence.length ? "Nothing in this view" : "No evidence yet"}</EmptyArt>
              )}
            </Tile>

            <Tile id="rk-add" title="Add evidence" className="rk-s4 rk-addtile">
              <form
                className="rk-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLFormElement).reset();
                  toast(`Sent for validation. It joins the ${ranking.short} list once received.`);
                }}
              >
                <label className="dropzone rk-drop">
                  <span className="dropzone__icon">
                    <Icon name="upload" />
                  </span>
                  <strong>Upload a file</strong>
                  <span className="small muted">PDF, XLSX or CSV · 25 MB</span>
                  <input type="file" className="sr-only" accept=".pdf,.xlsx,.csv" />
                </label>
                <label className="field">
                  <span className="field__label">Or a link</span>
                  <input className="input" type="url" placeholder="https://www.ust.edu.ph/…" />
                </label>
                <label className="field">
                  <span className="field__label">Reporting period</span>
                  <Select className="select" defaultValue={ranking.reportingPeriod}>
                    <option>{ranking.reportingPeriod}</option>
                    <option>Calendar year 2024</option>
                  </Select>
                </label>
                <button className="btn btn--dark" type="submit">
                  <Icon name="send" size={18} /> Send for validation
                </button>
              </form>
            </Tile>
          </div>
        )}

        {tab === "Contributors" && (
          <div className="ov-bento rk-bento">
            <Tile
              id="rk-units"
              title={
                <>
                  Units <span className="count">{contributors.length}</span>
                </>
              }
              className="rk-s12"
            >
              {contributors.length ? (
                <ul className="rk-units">
                  {contributors.map((u) => {
                    const pct = u.assigned ? Math.round((u.completed / u.assigned) * 100) : 0;
                    return (
                      <li key={u.slug}>
                        <Link href={`/admin/units/${u.slug}`} className="rk-unit">
                          <UnitMark emblem={u.emblem ?? null} code={u.code} className="rk-unit__mark" />
                          <span className="rk-unit__name">
                            <b>{u.name}</b>
                            {u.coordinator && <small>{u.coordinator}</small>}
                          </span>
                          <Ring value={pct} size={50} stroke={5} label={
                            <b>
                              {pct}
                              <small>%</small>
                            </b>
                          } />
                          <dl className="rk-unit__stats">
                            <div>
                              <dt>Assigned</dt>
                              <dd>{u.assigned}</dd>
                            </div>
                            <div>
                              <dt>Validated</dt>
                              <dd>{u.validated}</dd>
                            </div>
                          </dl>
                          {u.assistance && (
                            <span className="rk-unit__help">
                              <Icon name="help" size={13} /> Help asked
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyArt kind="start">No units on this ranking yet</EmptyArt>
              )}
            </Tile>
          </div>
        )}

        {tab === "Action Plan" && (
          <div className="ov-bento rk-bento">
            <Tile
              id="rk-plan"
              title="Action plan"
              className="rk-s12"
              aside={
                plan.length > 0 && (
                  <ul className="rk-plan__sum" aria-label="Actions by status">
                    {plan.map((p) => (
                      <li key={p.status}>
                        <PlanStatus status={p.status} />
                        <b>{p.n}</b>
                      </li>
                    ))}
                  </ul>
                )
              }
            >
              {ACTION_PLAN.length ? (
                <ul className="rk-plan">
                  {ACTION_PLAN.map((a) => (
                    <li key={a.action} className={cx("rk-plan__row", a.status === "At risk" && "is-risk")}>
                      <span className="rk-plan__main">
                        <b>{a.action}</b>
                        <small>
                          <Icon name="target" size={12} /> {a.kpi}
                        </small>
                      </span>
                      <span className="rk-plan__who">
                        <Icon name="building" size={13} />
                        {a.owner}
                      </span>
                      <span className="rk-plan__when">
                        <Icon name="calendar" size={13} />
                        {a.timeline}
                      </span>
                      <span className="rk-plan__prog">
                        <Bullet share={a.progress} label={`${a.action} progress`} />
                        <b>{a.progress}%</b>
                      </span>
                      <PlanStatus status={a.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyArt kind="start">No plan yet</EmptyArt>
              )}
            </Tile>
          </div>
        )}

        {tab === "Methodology" && (
          <div className="ov-bento rk-bento">
            <Tile
              id="rk-weights"
              title={
                <>
                  Weights
                  {ranking.measures && <InfoTooltip label="What it measures">{ranking.measures}.</InfoTooltip>}
                </>
              }
              className="rk-s12"
            >
              {ranking.indicators.length ? (
                <>
                  <div className="rk-ramp" role="img" aria-label={ranking.indicators.map((i) => `${i.name} ${i.weight}`).join(", ")}>
                    {ranking.indicators.map((i, k, all) => {
                      const w = weightOf(i);
                      return (
                        <i
                          key={i.name}
                          className={cx(k === 0 && "is-start", k === all.length - 1 && "is-end", all.length > 1 && k / (all.length - 1) > 0.5 && "is-light")}
                          style={{ flexGrow: totalWeight ? Math.max(w, 1) : 1, "--k": all.length > 1 ? k / (all.length - 1) : 0 } as CSSProperties}
                          data-tip={`${i.name} · ${i.weight}`}
                        >
                          {w >= 8 && <span>{i.weight}</span>}
                        </i>
                      );
                    })}
                  </div>
                  <ul className="rk-defs">
                    {ranking.indicators.map((i, k, all) => (
                      <li key={i.name}>
                        <details className="rk-def">
                          <summary>
                            <i className="rk-def__sw" style={{ "--k": all.length > 1 ? k / (all.length - 1) : 0 } as CSSProperties} aria-hidden="true" />
                            <span className="rk-def__name">{i.name}</span>
                            <b className="rk-def__w">{i.weight}</b>
                            <Icon name="chevron-down" size={16} className="rk-def__go" />
                          </summary>
                          <div className="rk-def__body">
                            <p>{i.definition}</p>
                            {i.formula && (
                              <p className="rk-def__formula">
                                <Icon name="hash" size={13} />
                                {i.formula}
                              </p>
                            )}
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Quiet icon="layers">No indicators yet</Quiet>
              )}
            </Tile>

            <Tile id="rk-src" title="Data sources" className="rk-s4">
              <ul className="rk-list">
                {ranking.dataSources.map((d) => (
                  <li key={d}>
                    <Icon name="data" size={14} />
                    {d}
                  </li>
                ))}
              </ul>
              {ranking.reportingPeriod && (
                <p className="rk-period">
                  <Icon name="calendar" size={14} />
                  {ranking.reportingPeriod}
                </p>
              )}
            </Tile>
            <Tile id="rk-err" title="Common errors" className="rk-s4">
              {ranking.commonErrors.length ? (
                <ul className="rk-list is-warn">
                  {ranking.commonErrors.map((d) => (
                    <li key={d}>
                      <Icon name="alert" size={14} />
                      {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <Quiet icon="check-circle">None noted</Quiet>
              )}
            </Tile>
            <Tile id="rk-chg" title="What changed" className="rk-s4">
              {ranking.methodologyChanges ? <p className="rk-chg">{ranking.methodologyChanges}</p> : <Quiet icon="history">No changes this edition</Quiet>}
            </Tile>
          </div>
        )}
      </TabPanel>

      <Drawer open={reports} onClose={() => setReports(false)} eyebrow={`${ranking.short}${hub?.currentCycle ? ` · ${hub.currentCycle}` : ""}`} title="Reports">
        <ul className="rk-reports">
          {reportTypes.map((r) => (
            <li key={r.name} className="rk-report">
              <span className="rk-report__icon">
                <Icon name="reports" size={18} />
              </span>
              <span className="rk-report__name">
                <b>{r.name}</b>
                <small>{r.note}</small>
              </span>
              {made.includes(r.name) ? (
                <span className="rk-report__get">
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
                    <Icon name="reports" size={16} /> PDF
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn--dark btn--sm"
                  onClick={() => {
                    setMade((m) => [...m, r.name]);
                    toast(`${r.name} is ready.`);
                  }}
                >
                  Generate
                </button>
              )}
            </li>
          ))}
        </ul>
      </Drawer>

      <IndicatorDrawer ranking={ranking} indicator={ind} onClose={() => setInd(null)} />
    </div>
  );
}
