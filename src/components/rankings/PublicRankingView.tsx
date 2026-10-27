import Link from "next/link";
import type { CSSProperties } from "react";
import { PUBLISHED_STORIES, type Ranking } from "@/lib/data";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Card, Direction, Swatch, Trend } from "@/components/ui/primitives";
import { ChartFrame, RankTrajectory, Sparkline, TrajectoryTable } from "@/components/charts/charts";
import { StoryCard } from "@/components/publications/StoryCard";
import { PublicRankingHeader } from "./RankingHeader";
import { AreaLegend, Quadrant, SdgBoard, WuriCategories } from "./SpecialDashboard";
import { serverViews } from "@/lib/governance/server/views";

const GM_ICONS: IconName[] = ["tree", "energy", "waste", "water", "transport", "education"];

/** Public page for one ranking: published results and plain-language methodology, no internal evidence data. */
export async function PublicRankingView({ ranking: r }: { ranking: Ranking }) {
  const { qssPillars, rankings } = await serverViews();
  const stories = PUBLISHED_STORIES.filter((s) => s.rankings.includes(r.short));
  const family = rankings.filter((x) => x.family === r.family && x.slug !== r.slug);

  return (
    <>
      <PublicRankingHeader ranking={r} />

      <div className="grid cols-1-2">
        <ChartFrame title="Trajectory" sub="Published band by edition; rank 1 at the top" table={<TrajectoryTable rankings={[r]} />}>
          <RankTrajectory ranking={r} height={210} />
        </ChartFrame>
        <Card title="What this ranking measures" sub={`Indicators and weights, ${r.reportingPeriod.split(";")[0].toLowerCase()}`} icon="knowledge" id="measures" bodyClass="card__body--flush">
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Indicator</th>
                  <th>Weight</th>
                  <th>Four cycles</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {r.indicators.map((i) => (
                  <tr key={i.name}>
                    <td>
                      <span className="table__primary">{i.name}</span>
                      <span className="table__sub">{i.definition}</span>
                    </td>
                    <td data-label="Weight" className="num nowrap">
                      {i.weight}
                    </td>
                    <td data-label="Four cycles">
                      <Sparkline values={i.history} label={i.name} />
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
      </div>

      {r.slug === "the-impact" && <SdgBoard publicMode />}
      {r.slug === "wuri" && <WuriCategories publicMode />}
      {(r.slug === "the-subject" || r.slug === "qs-subject") && (
        <Card title="Subject portfolio" sub="Ranked subjects and those approaching a ranking threshold" icon="grid" foot={<AreaLegend />}>
          <Quadrant id="subject-portfolio" />
        </Card>
      )}
      {r.slug === "qs-sustainability" && (
        <div className="grid cols-3">
          {qssPillars.map((p) => (
            <Card key={p.name} title={p.name} sub={`${p.weight} of the score`} icon={p.name === "Governance" ? "governance" : p.name === "Social Impact" ? "collaboration" : "sustainability"}>
              <ul className="bullets bullets--ink">
                {p.lenses.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {r.slug === "greenmetric" && (
        <Card title="Six categories of campus operations" sub="UST is building the evidence for a first ranked entry" icon="sustainability">
          <ul className="gm-cats">
            {r.indicators.map((i, k) => (
              <li key={i.name}>
                <span className="kpi__icon">
                  <Icon name={GM_ICONS[k]} size={17} />
                </span>
                <span>
                  <b>{i.name}</b>
                  <span>{i.definition}</span>
                </span>
                <span className="chip">{i.weight}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid cols-2">
        <Card title="Highlights" sub="What the latest result reflects" icon="spark">
          {r.strengths.length > 0 && (
            <ul className="bullets">
              {r.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          <p className={r.strengths.length ? "small text-2 mt-4" : "small text-2"}>
            <b style={{ fontWeight: 600 }}>Focus for the next cycle:</b> {r.message.charAt(0).toLowerCase() + r.message.slice(1)}.
          </p>
        </Card>
        <Card title="Methodology notes" icon="info">
          <dl className="kv kv--stack">
            <dt>Data sources</dt>
            <dd>{r.dataSources.join("; ")}</dd>
            <dt>Reporting period</dt>
            <dd>{r.reportingPeriod}</dd>
            <dt>Recent changes</dt>
            <dd>{r.methodologyChanges}</dd>
          </dl>
        </Card>
      </div>

      {stories.length > 0 && (
        <section className="stack" style={{ ["--gap" as string]: "14px" } as CSSProperties} aria-labelledby="rel-title">
          <div className="section-head">
            <div>
              <h2 id="rel-title">Stories behind this result</h2>
              <p>Published practices that count in {r.short}</p>
            </div>
          </div>
          <div className="grid cols-3 grid--stretch">
            {stories.slice(0, 3).map((s) => (
              <StoryCard key={s.slug} story={s} href={`/publications/stories/${s.slug}`} />
            ))}
          </div>
        </section>
      )}

      {family.length > 0 && (
        <nav className="card card--pad related" aria-label="Related rankings">
          <span className="small text-2">Also from this ranking body</span>
          <div className="row" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
            {family.map((x) => (
              <Link key={x.slug} href={`/rankings/${x.slug}`} className="pill">
                <Swatch family={x.family} /> {x.short} · {x.current} <Direction dir={x.direction} short />
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
