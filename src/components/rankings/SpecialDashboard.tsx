"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { COMPARISON, WURI_PLACEMENTS, inkOn, type Ranking } from "@/lib/data";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Card, Empty, Meter, MeterRow, Notice, Status, Trend } from "@/components/ui/primitives";
import { Funnel, Sparkline } from "@/components/charts/charts";
import { useViews } from "@/components/reference/ReferenceProvider";

/* ---------- Shared pieces ---------- */

function Flow({ steps, warnAt }: { steps: { step: string; value: string; note: string }[]; warnAt?: number }) {
  return (
    <ol className="flow" aria-label="Stages">
      {steps.map((s, i) => (
        <li key={s.step} className={`flow__step${i === steps.length - 1 ? " flow__step--end" : i === warnAt ? " flow__step--warn" : ""}`}>
          <span className="flow__value">{s.value}</span>
          <span className="flow__name">{s.step}</span>
          <span className="flow__note">{s.note}</span>
        </li>
      ))}
    </ol>
  );
}

export function Quadrant({ id }: { id?: string }) {
  const { quadrantNotes, subjectAreas, subjectPortfolio } = useViews();
  return (
    <div className="quad" id={id}>
      {subjectPortfolio.map((q) => (
        <section key={q.quadrant} className={`quad__cell quad__cell--${q.quadrant.split(" ")[0].toLowerCase()}`} aria-label={q.quadrant}>
          <h3>{q.quadrant}</h3>
          <p className="quad__note">{quadrantNotes[q.quadrant]}</p>
          {q.subjects.length ? (
            <ul>
              {q.subjects.map((s) => (
                <li key={s.name}>
                  <span className="row" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
                    <i className="sw" style={{ background: subjectAreas[s.area] }} title={s.area} aria-hidden="true" />
                    {s.name}
                  </span>
                  <span className="quad__val">{s.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">None yet</p>
          )}
        </section>
      ))}
    </div>
  );
}

export function AreaLegend() {
  const { subjectAreas } = useViews();
  return (
    <div className="legend">
      {Object.entries(subjectAreas).map(([area, c]) => (
        <span key={area} className="legend__item">
          <i className="legend__rect" style={{ ["--k" as string]: c } as CSSProperties} />
          {area}
        </span>
      ))}
    </div>
  );
}

/* ---------- THE Impact: 17 SDG tiles + evidence ladder ---------- */
export function SdgBoard({ publicMode }: { publicMode?: boolean }) {
  const { impactLadder, sdgColors, sdgNames, sdgTiles } = useViews();
  const [sel, setSel] = useState(3);
  const t = sdgTiles[sel - 1];
  const publicEvidence = Math.min(100, Math.round(t.readiness * 0.92));
  return (
    <div className="grid cols-2-1" id="sdg-board">
      <Card
        title="All 17 Sustainable Development Goals"
        sub={publicMode ? "Goals marked Rated were submitted for this year's rating" : "Select a goal. Goals marked Rated are submitted for this year's rating."}
        icon="globe"
      >
        <div className="sdgs" role="group" aria-label="Sustainable Development Goals">
          {sdgTiles.map((s) => (
            <button
              key={s.sdg}
              type="button"
              className="sdgt"
              aria-pressed={sel === s.sdg}
              onClick={() => setSel(s.sdg)}
              style={{ background: sdgColors[s.sdg], color: inkOn(sdgColors[s.sdg]) } as CSSProperties}
            >
              <span className="sdgt__n">{s.sdg}</span>
              <span className="sdgt__name">{sdgNames[s.sdg]}</span>
              {!publicMode && <span className="sdgt__pct">{s.readiness}% ready</span>}
              {s.submittedForRating && <span className="sdgt__flag">Rated</span>}
            </button>
          ))}
        </div>
      </Card>
      <div className="grid">
        <Card title={`SDG ${t.sdg}: ${sdgNames[t.sdg]}`} sub={t.submittedForRating ? "Submitted for rating this year" : "Not submitted for rating this year"}>
          {!publicMode && (
            <div className="stack" style={{ ["--gap" as string]: "6px", marginBottom: 16 } as CSSProperties}>
              <span className="small text-2">
                Readiness <b className="num">{t.readiness}%</b>
              </span>
              <Meter value={t.readiness} tone="gold" label={`SDG ${t.sdg} readiness`} />
            </div>
          )}
          <dl className="kv kv--tight">
            {!publicMode && (
              <>
                <dt>Evidence submitted</dt>
                <dd className="num">{t.submitted}</dd>
                <dt>Evidence validated</dt>
                <dd className="num">{t.validated}</dd>
                <dt>Responsible units</dt>
                <dd className="num">{t.units}</dd>
              </>
            )}
            <dt>Research outputs</dt>
            <dd className="num">{t.outputs}</dd>
            <dt>Policies and programmes</dt>
            <dd className="num">{t.policies}</dd>
            <dt>Beneficiaries</dt>
            <dd className="num">{t.beneficiaries}</dd>
            <dt>Outcomes demonstrated</dt>
            <dd className="num">{t.outcomes}</dd>
            {!publicMode && (
              <>
                <dt>Public evidence available</dt>
                <dd className="num">{publicEvidence}%</dd>
              </>
            )}
          </dl>
        </Card>
        <Card title="Impact evidence ladder" sub="Moving evidence from activity reports to verified change" icon="ladder" id="impact-ladder">
          <ol className="ladder">
            {impactLadder.map((l, i) => (
              <li key={l.step} style={{ ["--w" as string]: `${100 - i * 11}%` } as CSSProperties}>
                <span className="ladder__n">{i + 1}</span>
                <span className="ladder__step">{l.step}</span>
                <b className="num">{l.count}</b>
              </li>
            ))}
          </ol>
          <p className="small muted mt-3">
            Read through the UST Aquinas Framework and the Social Transformation Framework as the institutional-impact layer.
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ---------- WURI: categories ---------- */
export function WuriCategories({ publicMode }: { publicMode?: boolean }) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Card
      title={WURI_PLACEMENTS.length ? `Top 100 in ${WURI_PLACEMENTS.length} categories` : "Top 100 placements"}
      sub="From the official result letter"
      icon="recognition"
      tone="dark"
      id="wuri-categories"
    >
      {!WURI_PLACEMENTS.length && (
        <p className="small" style={{ color: "var(--on-dark-2)" }}>
          No placements recorded yet.
        </p>
      )}
      <div className="cats" role="group" aria-label="WURI categories">
        {WURI_PLACEMENTS.map((c, i) => (
          <button key={c} type="button" className="cats__btn" aria-pressed={sel === c} onClick={() => setSel(sel === c ? null : c)}>
            <span className="cats__n">{String(i + 1).padStart(2, "0")}</span>
            {c}
          </button>
        ))}
      </div>
      <p className="small mt-4" aria-live="polite" style={{ color: "var(--on-dark-2)" }} hidden={!WURI_PLACEMENTS.length}>
        {sel
          ? `${sel}: Top 100 placement.${publicMode ? "" : " Linked programmes and evidence are listed under Submitted projects."}`
          : "Select a category to see its placement."}
      </p>
    </Card>
  );
}

/** Initiatives submitted to WURI this cycle, with the Office's assessment of each. */
const WURI_INITIATIVES: { name: string; category: string; outcome: string; novelty: string; scale: string; ready: number; replication: string; recognition: string }[] = [];

/* ---------- Ranking-specific dashboards ---------- */
export function SpecialDashboard({ ranking, onIndicator }: { ranking: Ranking; onIndicator?: (name: string) => void }) {
  const { greenmetricPanels, qssPillars, researchFunnel, wuriPipeline } = useViews();
  switch (ranking.slug) {
    case "qs-wur": {
      const trendRows = ranking.indicators.filter((i) => /Reputation|International/.test(i.name));
      return (
        <>
          <div className="grid cols-2-1">
            <Card title="Research influence funnel" sub="From research capacity to QS impact" icon="research" id="research-funnel">
              <Flow steps={researchFunnel} warnAt={4} />
              <div className="mt-4">
                <Notice tone="warn" icon="alert">
                  <b>Citations per Faculty is an institutional process issue,</b> not only a rankings-office concern. It carries 20% of the
                  weight and has its own diagnostic page.
                </Notice>
              </div>
              <div className="mt-4">
                <Link href={`/admin/rankings/${ranking.slug}/diagnostic`} className="btn btn--dark">
                  <Icon name="research" size={18} /> Open the Citations per Faculty diagnostic
                </Link>
              </div>
            </Card>
            <Card title="Philippine and ASEAN comparison" sub="Peers, anonymised" icon="globe">
              {COMPARISON.length ? (
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
              ) : (
                <Empty icon="globe" title="No peer results yet" />
              )}
            </Card>
          </div>
          <Card title="Reputation and internationalization trends" sub="Indicator score by cycle, with direction" icon="trend-up" id="qs-trends" bodyClass="card__body--flush">
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th>Weight</th>
                    <th>Four cycles</th>
                    <th className="r">Score</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.map((i) => (
                    <tr key={i.name}>
                      <td>
                        <button type="button" className="rowlink" onClick={() => onIndicator?.(i.name)}>
                          {i.name}
                        </button>
                      </td>
                      <td data-label="Weight" className="num">
                        {i.weight}
                      </td>
                      <td data-label="Four cycles">
                        <Sparkline values={i.history} label={i.name} />
                      </td>
                      <td data-label="Score" className="r num">
                        <b>{i.current ?? "—"}</b>
                      </td>
                      <td data-label="Trend">
                        <Trend trend={i.trend} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      );
    }

    case "the-wur":
      return (
        <>
          <div className="grid cols-2">
            <Card title="Five-pillar scorecard" sub="Pillar score against target" icon="grid">
              <ul className="pillars">
                {ranking.indicators.map((i) => (
                  <li key={i.name}>
                    <div className="row row--between">
                      <button type="button" className="rowlink" onClick={() => onIndicator?.(i.name)}>
                        {i.name}
                      </button>
                      <span className="small num">
                        <b>{i.current ?? "—"}</b>
                        <span className="muted"> / {i.target ?? "—"}</span>
                        <span className="muted"> · {i.weight}</span>
                      </span>
                    </div>
                    <Meter value={((i.current ?? 0) / (i.target ?? 1)) * 100} label={`${i.name} against target`} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Research competitiveness funnel" sub="Capacity to output to influence" icon="research" id="research-funnel">
              <Flow
                steps={[
                  { step: "Research capacity", value: "—", note: "faculty with research load" },
                  { step: "Research output", value: "—", note: "outputs this reporting year" },
                  { step: "International collaboration", value: "—", note: "co-authored abroad" },
                  { step: "Citation influence", value: "—", note: "Research Quality score" },
                  { step: "THE performance", value: ranking.current || "—", note: "current band" },
                ]}
              />
            </Card>
          </div>
          <Card title="Research signals" sub="The measures THE weighs most heavily for UST's band" icon="target">
            <div className="signals">
              {[
                ["Research productivity", "—", "papers per academic"],
                ["Research income", "—", "per academic staff"],
                ["Doctoral capacity", "—", "doctorates awarded this year"],
                ["Citations", "—", "field-weighted impact"],
                ["International co-authorship", "—", "of this year's papers"],
                ["Industry income", "—", "research income from industry"],
              ].map(([k, v, n]) => (
                <div key={k} className="signal">
                  <span className="signal__k">{k}</span>
                  <span className="signal__v">{v}</span>
                  <span className="signal__n">{n}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      );

    case "the-impact":
      return <SdgBoard />;

    case "the-subject":
      return (
        <div className="grid cols-3-2">
          <Card title="Subject portfolio" sub="Four quadrants; colour marks the broad subject area" icon="grid" foot={<AreaLegend />}>
            <Quadrant id="subject-portfolio" />
          </Card>
          <Card title="Compare subjects" sub="Pillar scores by subject" icon="layers" id="subject-compare">
            <Empty icon="layers" title="No subject scores yet" />
          </Card>
        </div>
      );

    case "qs-sustainability": {
      const cols = ["Policies", "Teaching", "Research", "Operations", "Equality", "Health", "Knowledge exchange", "Outcomes"];
      const links: Record<string, string[]> = {
        "Environmental Impact": ["Policies", "Teaching", "Research", "Operations", "Outcomes"],
        "Social Impact": ["Policies", "Teaching", "Research", "Equality", "Health", "Knowledge exchange", "Outcomes"],
        Governance: ["Policies", "Operations", "Equality", "Outcomes"],
      };
      const icons: Record<string, IconName> = { "Environmental Impact": "sustainability", "Social Impact": "collaboration", Governance: "governance" };
      return (
        <>
          <div className="grid cols-3">
            {qssPillars.map((p) => (
              <Card key={p.name} title={p.name} sub={`${p.weight} of the overall score`} icon={icons[p.name]} actions={<Status status={p.status} />}>
                <details className="expand" open={p.name !== "Governance"}>
                  <summary>Lenses and responsible offices</summary>
                  <ul className="bullets bullets--ink mt-3">
                    {p.lenses.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <p className="small muted mt-3">{p.offices.join(" · ")}</p>
                </details>
                <dl className="mini-stats">
                  <div>
                    <dt>Policies on file</dt>
                    <dd>{p.policies}</dd>
                  </div>
                  <div>
                    <dt>Outcomes documented</dt>
                    <dd>{p.outcomes}</dd>
                  </div>
                </dl>
                <button type="button" className="link small mt-3" onClick={() => onIndicator?.(p.name)}>
                  Indicator detail <Icon name="arrow" size={14} />
                </button>
              </Card>
            ))}
          </div>
          <Card title="Connections" sub="Where each pillar draws its evidence" icon="layers" id="qss-connections" bodyClass="card__body--flush">
            <div className="table-wrap">
              <table className="table matrix">
                <thead>
                  <tr>
                    <th>Pillar</th>
                    {cols.map((c) => (
                      <th key={c} className="c">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qssPillars.map((p) => (
                    <tr key={p.name}>
                      <td className="table__primary">{p.name}</td>
                      {cols.map((c) => (
                        <td key={c} className="c">
                          {links[p.name].includes(c) ? (
                            <span className="tick" title={`${p.name} uses ${c}`}>
                              <Icon name="check" size={14} strokeWidth={2.4} />
                              <span className="sr-only">Connected</span>
                            </span>
                          ) : (
                            <span className="sr-only">Not connected</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      );
    }

    case "qs-subject":
      return (
        <>
          <div className="grid cols-3-2">
            <Card title="Subject portfolio" sub="Four quadrants; colour marks the broad subject area" icon="grid" foot={<AreaLegend />}>
              <Quadrant id="subject-portfolio" />
            </Card>
            <Card title="Distance to ranking threshold" sub="Candidate subjects, share of the QS threshold" icon="target" id="subject-threshold">
              <Empty icon="target" title="No candidate subjects yet" />
            </Card>
          </div>
          <Card title="Medicine: five subject indicators" sub="Academic Reputation, Employer Reputation, Citations, H-index, International Research Network" icon="research" id="subject-indicators" bodyClass="card__body--flush">
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th>Weight</th>
                    <th className="r">Score</th>
                    <th className="r">Target</th>
                    <th className="table__meter">Share of target</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.indicators.filter((i) => i.name.startsWith("Medicine")).map((i) => (
                    <tr key={i.name}>
                      <td className="table__primary">{i.name.replace("Medicine: ", "")}</td>
                      <td data-label="Weight" className="num">
                        {i.weight}
                      </td>
                      <td data-label="Score" className="r num">
                        {i.current ?? "—"}
                      </td>
                      <td data-label="Target" className="r num">
                        {i.target ?? "—"}
                      </td>
                      <td data-label="Share of target">
                        <MeterRow value={((i.current ?? 0) / (i.target ?? 1)) * 100} label={`${i.name} share of target`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      );

    case "greenmetric": {
      const icons: IconName[] = ["tree", "energy", "waste", "water", "transport", "education"];
      return (
        <>
          <div className="grid cols-3">
            {greenmetricPanels.map((p, k) => {
              const ind = ranking.indicators.find((i) => i.name === p.name);
              return (
                <Card
                  key={p.name}
                  title={p.name}
                  sub={ind ? `${ind.weight} of the score` : undefined}
                  icon={icons[k]}
                  className={k === 1 || k === 3 ? "card--water" : undefined}
                  actions={ind && <Status status={ind.status} />}
                >
                  <ul className="gm">
                    {p.metrics.map(([m, now, tgt]) => {
                      const a = parseFloat(now.replace(/,/g, ""));
                      const b = parseFloat(tgt.replace(/,/g, ""));
                      const lower = /per person/i.test(m);
                      const pct = Number.isFinite(a) && Number.isFinite(b) ? Math.min(100, Math.round((lower ? b / a : a / b) * 100)) : null;
                      return (
                        <li key={m}>
                          <span className="gm__m">{m}</span>
                          <span className="gm__v num">
                            <b>{now}</b> {tgt !== "—" && <span className="muted">→ {tgt}</span>}
                          </span>
                          {pct !== null ? (
                            <Meter value={pct} tone="ok" label={`${m}: ${pct}% of target`} />
                          ) : (
                            <span className="small muted">{now === "—" ? "Not recorded yet" : "Programme coverage"}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {ind && (
                    <button type="button" className="link small mt-3" onClick={() => onIndicator?.(ind.name)}>
                      Trend and evidence <Icon name="arrow" size={14} />
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
          <Card title="Campus sustainability map" sub="Planned for the public showcase" icon="pin" id="campus-map">
            <div className="mapcard">
              <div className="mapcard__art" aria-hidden="true">
                <span style={{ left: "18%", top: "30%", background: "var(--ui)" }} />
                <span style={{ left: "42%", top: "58%", background: "var(--water)" }} />
                <span style={{ left: "64%", top: "26%", background: "var(--ui)" }} />
                <span style={{ left: "78%", top: "64%", background: "var(--gold-600)" }} />
                <span style={{ left: "30%", top: "72%", background: "var(--n-600)" }} />
              </div>
              <div>
                <p className="small text-2">
                  A digital campus map will show the operational evidence behind this ranking in place. Layers planned:
                </p>
                <div className="chips mt-3">
                  {["Green spaces", "Water systems", "Pedestrian areas", "Recycling stations", "Sustainable buildings"].map((c) => (
                    <span key={c} className="chip chip--outline">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </>
      );
    }

    case "wuri":
      return (
        <>
          <div className="grid cols-2">
            <Card title="Innovation pipeline" sub="Ideas identified to replicated, this cycle" icon="innovation" id="wuri-pipeline">
              <Funnel steps={wuriPipeline} color="var(--wuri)" label="WURI innovation pipeline" />
            </Card>
            <WuriCategories />
          </div>
          <Card title="Submitted projects" sub="Outcome strength, scalability, novelty, evidence readiness, replication and recognition" icon="layers" id="wuri-initiatives" bodyClass={WURI_INITIATIVES.length ? "card__body--flush" : undefined}>
            {!WURI_INITIATIVES.length ? (
              <Empty icon="layers" title="No projects submitted yet" />
            ) : (
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Initiative</th>
                    <th>WURI category</th>
                    <th>Outcome strength</th>
                    <th>Novelty</th>
                    <th>Scalability</th>
                    <th className="table__meter">Evidence readiness</th>
                    <th>Replication</th>
                    <th>Recognition</th>
                  </tr>
                </thead>
                <tbody>
                  {WURI_INITIATIVES.map((w) => (
                    <tr key={w.name}>
                      <td className="table__primary">{w.name}</td>
                      <td data-label="Category">{w.category}</td>
                      <td data-label="Outcome">{w.outcome}</td>
                      <td data-label="Novelty">{w.novelty}</td>
                      <td data-label="Scalability">{w.scale}</td>
                      <td data-label="Readiness">
                        <MeterRow value={w.ready} label={`${w.name} evidence readiness`} />
                      </td>
                      <td data-label="Replication">{w.replication}</td>
                      <td data-label="Recognition">
                        <span className={`chip${w.recognition === "Top 100" ? " chip--gold" : ""}`}>{w.recognition}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </Card>
        </>
      );

    default:
      return null;
  }
}
