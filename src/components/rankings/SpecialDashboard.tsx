"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { WURI_PLACEMENTS, inkOn, type Ranking } from "@/lib/data";
import { Tile } from "@/components/dashboard/Tile";
import { PipelineFlow } from "@/components/contribute/PipelineFlow";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Card, Meter, Status, cx } from "@/components/ui/primitives";
import { InfoTooltip } from "@/components/ui/interactive";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Bullet, EmptyArt, PillarRings, Spark, shareOf, valueOf } from "./RankingCharts";

/* ---------- Shared pieces ---------- */

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


/* ---------- Ranking-specific boards, on the dashboard's tiles ---------- */

/** Stages on one line, each a node with its figure above and its name below; one may be flagged. */
function Steps({ steps, warnAt }: { steps: { step: string; value: string; note: string }[]; warnAt?: number }) {
  return (
    <ol className="rk-steps" style={{ "--n": steps.length } as CSSProperties}>
      {steps.map((s, i) => (
        <li key={s.step} className={cx("rk-step", i === steps.length - 1 && "is-end", i === warnAt && "is-warn", s.value === "—" && "is-none")}>
          <b className={cx("rk-step__v", s.value.length > 6 && "is-long")}>{s.value}</b>
          <span className="rk-step__node" aria-hidden="true" />
          <span className="rk-step__name">{s.step}</span>
          <span className="rk-step__note">{s.note}</span>
        </li>
      ))}
    </ol>
  );
}

/** The subject portfolio's four quadrants, what each one means behind its info button. */
function Portfolio() {
  const { quadrantNotes, subjectAreas, subjectPortfolio } = useViews();
  return (
    <div className="rk-quad">
      {subjectPortfolio.map((q, k) => (
        <section key={q.quadrant} className={`rk-quad__cell is-${k}`} aria-label={q.quadrant}>
          <h3>
            {q.quadrant}
            {quadrantNotes[q.quadrant] && <InfoTooltip label={`About ${q.quadrant}`}>{quadrantNotes[q.quadrant]}</InfoTooltip>}
            <span className="rk-quad__n">{q.subjects.length}</span>
          </h3>
          {q.subjects.length ? (
            <ul>
              {q.subjects.map((s) => (
                <li key={s.name}>
                  <i className="sw" style={{ background: subjectAreas[s.area] }} aria-hidden="true" />
                  <span>{s.name}</span>
                  <small>{s.note}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rk-quad__none">None yet</p>
          )}
        </section>
      ))}
    </div>
  );
}

/** THE Impact: the seventeen goals as coloured tiles, the chosen goal's figures, and the evidence ladder. */
function ImpactBoard() {
  const { impactLadder, sdgColors, sdgNames, sdgTiles } = useViews();
  const [sel, setSel] = useState(3);
  const t = sdgTiles.find((s) => s.sdg === sel) ?? sdgTiles[0];
  if (!t) return null;
  const rated = sdgTiles.filter((s) => s.submittedForRating).length;
  const most = Math.max(1, ...impactLadder.map((l) => l.count));
  const stats: [string, string | number][] = [
    ["Evidence submitted", t.submitted],
    ["Validated", t.validated],
    ["Units", t.units],
    ["Research outputs", t.outputs],
    ["Policies", t.policies],
    ["Outcomes", t.outcomes],
  ];
  return (
    <div className="ov-bento rk-bento">
      <Tile
        id="sdg-board"
        title={
          <>
            Goals {rated > 0 && <span className="count">{rated} rated</span>}
          </>
        }
        className="rk-s7"
      >
        <div className="rk-sdgs" role="group" aria-label="Sustainable Development Goals">
          {sdgTiles.map((s) => (
            <button
              key={s.sdg}
              type="button"
              className="rk-sdg"
              aria-pressed={sel === s.sdg}
              onClick={() => setSel(s.sdg)}
              style={{ "--c": sdgColors[s.sdg], color: inkOn(sdgColors[s.sdg]) } as CSSProperties}
              data-tip={sdgNames[s.sdg]}
            >
              <span className="rk-sdg__n">{s.sdg}</span>
              {s.submittedForRating && <Icon name="check" size={12} strokeWidth={3} className="rk-sdg__rated" />}
              <span className="rk-sdg__bar" aria-hidden="true">
                <i style={{ width: `${s.readiness}%` }} />
              </span>
              <span className="sr-only">
                {sdgNames[s.sdg]}, {s.readiness}% ready{s.submittedForRating ? ", rated" : ""}
              </span>
            </button>
          ))}
        </div>
      </Tile>

      <Tile id="sdg-detail" className="rk-s5 rk-goal">
        <header className="rk-goal__head" style={{ "--c": sdgColors[t.sdg] } as CSSProperties}>
          <span className="rk-goal__n" style={{ color: inkOn(sdgColors[t.sdg]) }}>
            {t.sdg}
          </span>
          <span>
            <h2 id="sdg-detail" className="rk-goal__name">
              {sdgNames[t.sdg]}
            </h2>
            <span className={cx("rk-goal__rated", t.submittedForRating && "is-on")}>{t.submittedForRating ? "Rated this year" : "Not rated this year"}</span>
          </span>
        </header>
        <div className="rk-goal__ready">
          <span>
            Readiness <b>{t.readiness}%</b>
          </span>
          <Meter value={t.readiness} tone="gold" label={`SDG ${t.sdg} readiness`} />
        </div>
        <dl className="rk-goal__stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="rk-goal__who">
          <Icon name="users" size={14} />
          {t.beneficiaries}
        </p>
      </Tile>

      <Tile
        id="impact-ladder"
        title={
          <>
            Impact ladder
            <InfoTooltip label="About the ladder">
              Evidence climbs from activity reports to verified change, read through the UST Aquinas Framework and the Social Transformation Framework.
            </InfoTooltip>
          </>
        }
        className="rk-s12"
      >
        <ol className="rk-ladder">
          {impactLadder.map((l, i) => (
            <li key={l.step} style={{ "--w": `${l.count ? Math.max(6, (l.count / most) * 100) : 100 - i * 14}%` } as CSSProperties} className={cx(!l.count && "is-none")}>
              <span className="rk-ladder__n">{i + 1}</span>
              <span className="rk-ladder__step">{l.step}</span>
              <span className="rk-ladder__bar" aria-hidden="true">
                <i />
              </span>
              <b>{l.count}</b>
            </li>
          ))}
        </ol>
      </Tile>
    </div>
  );
}

/** Initiatives submitted to WURI this cycle, with the Office's assessment of each. */
const WURI_INITIATIVES: { name: string; category: string; outcome: string; novelty: string; scale: string; ready: number; replication: string; recognition: string }[] = [];

const QSS_ICON: Record<string, IconName> = { "Environmental Impact": "sustainability", "Social Impact": "collaboration", Governance: "governance" };
const GM_ICON: IconName[] = ["tree", "energy", "waste", "water", "transport", "education"];

export function SpecialDashboard({ ranking, onIndicator }: { ranking: Ranking; onIndicator?: (name: string) => void }) {
  const { greenmetricPanels, qssPillars, researchFunnel, wuriPipeline } = useViews();
  switch (ranking.slug) {
    case "qs-wur": {
      const reach = ranking.indicators.filter((i) => /Reputation|International/.test(i.name));
      return (
        <div className="ov-bento rk-bento">
          <Tile
            id="research-funnel"
            title="Research influence"
            className="rk-s12"
            aside={
              <Link href={`/admin/rankings/${ranking.slug}/diagnostic`} className="btn btn--sm">
                <Icon name="research" size={16} /> Diagnostic
              </Link>
            }
          >
            <Steps steps={researchFunnel} warnAt={4} />
          </Tile>
          <Tile id="qs-trends" title="Reputation and reach" className="rk-s12">
            <ul className="rk-minis">
              {reach.map((i) => (
                <li key={i.name}>
                  <button type="button" className="rk-mini" onClick={() => onIndicator?.(i.name)}>
                    <span className="rk-mini__name">
                      {i.name}
                      <small>{i.weight}</small>
                    </span>
                    <b className="rk-mini__v">{valueOf(i)}</b>
                    <Spark values={i.history} trend={i.trend} label={`${i.name} by year`} />
                  </button>
                </li>
              ))}
            </ul>
          </Tile>
        </div>
      );
    }

    case "the-wur": {
      const pillars = ranking.indicators.map((i) => ({ label: i.name, share: shareOf(i) }));
      const signals: [IconName, string, string, string][] = [
        ["research", "Research productivity", "—", "papers per academic"],
        ["data", "Research income", "—", "per academic staff"],
        ["education", "Doctoral capacity", "—", "doctorates this year"],
        ["quote", "Citations", "—", "field-weighted impact"],
        ["globe", "International co-authorship", "—", "of this year's papers"],
        ["building", "Industry income", "—", "from industry"],
      ];
      return (
        <div className="ov-bento rk-bento">
          <Tile id="the-pillars" title="Pillars" className="rk-s5">
            <div className="rk-ringrow">
              <PillarRings rows={pillars} />
              <ol className="rk-ringkey">
                {ranking.indicators.map((i, k) => (
                  <li key={i.name} style={{ "--k": k } as CSSProperties}>
                    <button type="button" onClick={() => onIndicator?.(i.name)}>
                      <i aria-hidden="true" />
                      <span>{i.name}</span>
                      <b>{shareOf(i) === null ? "—" : `${shareOf(i)}%`}</b>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </Tile>
          <Tile id="research-funnel" title="Research funnel" className="rk-s7">
            <Steps
              steps={[
                { step: "Capacity", value: "—", note: "faculty with research load" },
                { step: "Output", value: "—", note: "outputs this year" },
                { step: "Collaboration", value: "—", note: "co-authored abroad" },
                { step: "Influence", value: "—", note: "Research Quality score" },
                { step: "THE result", value: ranking.current || "—", note: "current band" },
              ]}
            />
          </Tile>
          <Tile id="the-signals" title="Research signals" className="rk-s12">
            <ul className="rk-signals">
              {signals.map(([icon, k, v, n]) => (
                <li key={k} className={cx("rk-signal", v === "—" && "is-none")}>
                  <span className="rk-medal">
                    <Icon name={icon} size={16} />
                  </span>
                  <span className="rk-signal__k">{k}</span>
                  <b className="rk-signal__v">{v}</b>
                  <small>{n}</small>
                </li>
              ))}
            </ul>
          </Tile>
        </div>
      );
    }

    case "the-impact":
      return <ImpactBoard />;

    case "the-subject":
      return (
        <div className="ov-bento rk-bento">
          <Tile id="subject-portfolio" title="Subject portfolio" className="rk-s7">
            <Portfolio />
            <AreaLegend />
          </Tile>
          <Tile id="subject-compare" title="Compare subjects" className="rk-s5">
            <EmptyArt kind="start">No subject scores yet</EmptyArt>
          </Tile>
        </div>
      );

    case "qs-subject": {
      const medicine = ranking.indicators.filter((i) => i.name.startsWith("Medicine"));
      return (
        <div className="ov-bento rk-bento">
          <Tile id="subject-portfolio" title="Subject portfolio" className="rk-s7">
            <Portfolio />
            <AreaLegend />
          </Tile>
          <Tile id="subject-threshold" title="Distance to threshold" className="rk-s5">
            <EmptyArt kind="search">No candidate subjects yet</EmptyArt>
          </Tile>
          {medicine.length > 0 && (
            <Tile id="subject-indicators" title="Medicine" className="rk-s12">
              <ul className="rk-bars">
                {medicine.map((i) => (
                  <li key={i.name}>
                    <button type="button" className="rk-bars__row" onClick={() => onIndicator?.(i.name)}>
                      <span className="rk-bars__name">
                        {i.name.replace("Medicine: ", "")}
                        <small>{i.weight}</small>
                      </span>
                      <Bullet share={shareOf(i)} label={`${i.name} toward target`} />
                      <span className="rk-bars__v">
                        {valueOf(i)}
                        <small> / {i.target ?? "—"}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Tile>
          )}
        </div>
      );
    }

    case "qs-sustainability": {
      const cols = ["Policies", "Teaching", "Research", "Operations", "Equality", "Health", "Knowledge exchange", "Outcomes"];
      const links: Record<string, string[]> = {
        "Environmental Impact": ["Policies", "Teaching", "Research", "Operations", "Outcomes"],
        "Social Impact": ["Policies", "Teaching", "Research", "Equality", "Health", "Knowledge exchange", "Outcomes"],
        Governance: ["Policies", "Operations", "Equality", "Outcomes"],
      };
      return (
        <div className="ov-bento rk-bento">
          {qssPillars.map((p, k) => (
            <Tile key={p.name} id={`qss-${k}`} title={p.name} className="rk-s4" aside={<Status status={p.status} />}>
              <button type="button" className="rk-pillar" onClick={() => onIndicator?.(p.name)}>
                <span className="rk-medal rk-medal--lg">
                  <Icon name={QSS_ICON[p.name] ?? "layers"} size={20} />
                </span>
                <span className="rk-pillar__w">
                  {p.weight}
                  <small>of the score</small>
                </span>
                <Icon name="chevron" size={16} className="rk-pillar__go" />
              </button>
              {p.lenses.length > 0 && (
                <ul className="rk-tags">
                  {p.lenses.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              <dl className="rk-pair">
                <div>
                  <dt>Policies</dt>
                  <dd>{p.policies}</dd>
                </div>
                <div>
                  <dt>Outcomes</dt>
                  <dd>{p.outcomes}</dd>
                </div>
              </dl>
              {p.offices.length > 0 && (
                <p className="rk-offices">
                  <Icon name="building" size={13} />
                  {p.offices.join(" · ")}
                </p>
              )}
            </Tile>
          ))}
          <Tile id="qss-connections" title="Connections" className="rk-s12">
            <div className="rk-matrix-wrap">
              <table className="rk-matrix">
                <caption className="sr-only">Where each pillar draws its evidence</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Pillar</span>
                    </th>
                    {cols.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qssPillars.map((p) => (
                    <tr key={p.name}>
                      <th scope="row">{p.name}</th>
                      {cols.map((c) => (
                        <td key={c}>
                          {links[p.name]?.includes(c) ? (
                            <span className="rk-dot is-on" data-tip={`${p.name} · ${c}`}>
                              <span className="sr-only">Connected</span>
                            </span>
                          ) : (
                            <span className="rk-dot">
                              <span className="sr-only">Not connected</span>
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tile>
        </div>
      );
    }

    case "greenmetric":
      return (
        <div className="ov-bento rk-bento">
          {greenmetricPanels.map((p, k) => {
            const ind = ranking.indicators.find((i) => i.name === p.name);
            return (
              <Tile key={p.name} id={`gm-${k}`} title={p.name} className="rk-s4" aside={ind && <Status status={ind.status} />}>
                <button type="button" className="rk-pillar" onClick={() => ind && onIndicator?.(ind.name)} disabled={!ind}>
                  <span className="rk-medal rk-medal--lg">
                    <Icon name={GM_ICON[k] ?? "sustainability"} size={20} />
                  </span>
                  <span className="rk-pillar__w">
                    {ind?.weight ?? "—"}
                    <small>of the score</small>
                  </span>
                  {ind && <Icon name="chevron" size={16} className="rk-pillar__go" />}
                </button>
                <ul className="rk-gm">
                  {p.metrics.map(([m, now, tgt]) => {
                    const a = parseFloat(now.replace(/,/g, ""));
                    const b = parseFloat(tgt.replace(/,/g, ""));
                    const lower = /per person/i.test(m);
                    const pct = Number.isFinite(a) && Number.isFinite(b) && a > 0 ? Math.min(100, Math.round((lower ? b / a : a / b) * 100)) : null;
                    return (
                      <li key={m}>
                        <span className="rk-gm__m">{m}</span>
                        <span className="rk-gm__v">
                          <b>{now}</b>
                          {tgt !== "—" && <small> → {tgt}</small>}
                        </span>
                        <Bullet share={pct} label={`${m} toward target`} />
                      </li>
                    );
                  })}
                </ul>
              </Tile>
            );
          })}
          <Tile
            id="campus-map"
            title={
              <>
                Campus map <span className="chip">Planned</span>
              </>
            }
            className="rk-s12"
          >
            <div className="rk-map">
              <div className="rk-map__art" aria-hidden="true">
                <span style={{ left: "18%", top: "30%" }} />
                <span style={{ left: "42%", top: "58%" }} className="is-water" />
                <span style={{ left: "64%", top: "26%" }} />
                <span style={{ left: "78%", top: "64%" }} className="is-gold" />
                <span style={{ left: "30%", top: "72%" }} className="is-ink" />
              </div>
              <ul className="rk-tags">
                {["Green spaces", "Water systems", "Pedestrian areas", "Recycling stations", "Sustainable buildings"].map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </Tile>
        </div>
      );

    case "wuri":
      return (
        <div className="ov-bento rk-bento">
          <Tile id="wuri-pipeline" title="Innovation pipeline" className="rk-s8">
            <PipelineFlow steps={wuriPipeline} label="WURI innovation pipeline" />
          </Tile>
          <Tile id="wuri-categories" className="rk-s4 rk-onyx">
            <header className="rk-onyx__head">
              <p>From the result letter</p>
              <h2 id="wuri-categories" className="rk-onyx__title">
                {WURI_PLACEMENTS.length ? `Top 100 in ${WURI_PLACEMENTS.length} categories` : "Top 100 placements"}
              </h2>
            </header>
            {WURI_PLACEMENTS.length ? (
              <ol className="rk-onyx__list">
                {WURI_PLACEMENTS.map((c, i) => (
                  <li key={c}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {c}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rk-onyx__none">No placements yet</p>
            )}
          </Tile>
          <Tile id="wuri-initiatives" title="Submitted projects" className="rk-s12">
            {WURI_INITIATIVES.length ? (
              <ul className="rk-bars">
                {WURI_INITIATIVES.map((w) => (
                  <li key={w.name} className="rk-bars__row">
                    <span className="rk-bars__name">
                      {w.name}
                      <small>{w.category}</small>
                    </span>
                    <Bullet share={w.ready} label={`${w.name} evidence readiness`} />
                    <span className={cx("chip", w.recognition === "Top 100" && "chip--gold")}>{w.recognition}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyArt kind="start">No projects submitted yet</EmptyArt>
            )}
          </Tile>
        </div>
      );

    default:
      return null;
  }
}
