import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  LATEST_EDITION,
  QSS_PILLARS,
  SDG_COLORS,
  SDG_NAMES,
  SDG_TILES,
  SUBJECT_AREAS,
  SUBJECT_PORTFOLIO,
  WURI_CATEGORIES,
  inkOn,
  type Ranking,
} from "@/lib/data";
import { PHOTOS, RANKING_PHOTO, movement, splitResult } from "@/lib/site";
import { siteData } from "@/lib/governance/server/site";
import { PageHero } from "../PageHero";
import { PageTabs } from "../PageTabs";
import { PhotoBand } from "../PhotoBand";
import { Spark, Trajectory } from "./Trajectory";

const FOCUS_TITLE: Record<string, string> = {
  "the-impact": "The SDGs UST was rated on",
  wuri: "Top 100 in twelve categories",
  "the-subject": "Subjects ranked and rising",
  "qs-subject": "Subjects ranked and rising",
  "qs-sustainability": "Three lenses, weighted",
  greenmetric: "Six parts of campus life",
};

function Focus({ r }: { r: Ranking }): ReactNode {
  if (r.slug === "the-impact") {
    const rated = SDG_TILES.filter((t) => t.submittedForRating).map((t) => t.sdg);
    return (
      <>
        <ul className="w-sdgs">
          {rated.map((n, i) => (
            <li
              key={n}
              className="w-sdg"
              style={{ background: SDG_COLORS[n], color: inkOn(SDG_COLORS[n]), ["--d" as string]: `${i * 80}ms` } as CSSProperties}
              data-reveal
            >
              <span className="w-sdg__n w-figure">{n}</span>
              <span className="w-sdg__name">{SDG_NAMES[n]}</span>
            </li>
          ))}
        </ul>
        <p className="w-focus__note">{r.methodologyChanges}</p>
      </>
    );
  }
  if (r.slug === "wuri") {
    return (
      <>
        <ul className="w-cats">
          {WURI_CATEGORIES.map((c, i) => (
            <li key={c} data-reveal style={{ ["--d" as string]: `${(i % 4) * 60}ms` }}>
              <i className="w-dot" aria-hidden="true" />
              {c}
            </li>
          ))}
        </ul>
        <p className="w-focus__note">Category names are listed for review; the Office confirms them against the official result letter.</p>
      </>
    );
  }
  if (r.slug === "the-subject" || r.slug === "qs-subject") {
    return (
      <div className="w-quads">
        {SUBJECT_PORTFOLIO.map((q, i) => (
          <div key={q.quadrant} className="w-quad" data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
            <h3 className="w-quad__title">{q.quadrant}</h3>
            <ul>
              {q.subjects.map((s) => (
                <li key={s.name}>
                  <i className="w-dot" style={{ background: SUBJECT_AREAS[s.area] } as CSSProperties} aria-hidden="true" />
                  <span>
                    <b>{s.name}</b>
                    {s.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  if (r.slug === "qs-sustainability") {
    return (
      <div className="w-pillars">
        {QSS_PILLARS.map((p, i) => (
          <div key={p.name} className="w-pillar" data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
            <span className="w-pillar__w w-figure">{p.weight}</span>
            <h3 className="w-pillar__name">{p.name}</h3>
            <ul>
              {p.lenses.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  if (r.slug === "greenmetric") {
    return (
      <ul className="w-gm">
        {r.indicators.map((i, k) => (
          <li key={i.name} data-reveal style={{ ["--d" as string]: `${(k % 3) * 70}ms` }}>
            <span className="w-gm__w w-figure">{i.weight}</span>
            <span>
              <b className="w-gm__name">{i.name}</b>
              <span className="w-gm__def">{i.definition}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

/** One ranking: the published result, its trajectory, what it measures and the Thomasian work behind it. */
export function RankingDetail({ ranking: r }: { ranking: Ranking }) {
  // Siblings, neighbours and stories are limited to what the public website may show.
  const { rankings: RANKINGS, bodies: BODIES, stories: PUBLISHED_STORIES } = siteData();
  const body = BODIES.find((b) => b.rankings.some((x) => x.slug === r.slug))!;
  const siblings = body.rankings.filter((x) => x.slug !== r.slug);
  const stories = PUBLISHED_STORIES.filter((s) => s.rankings.includes(r.short));
  const at = RANKINGS.findIndex((x) => x.slug === r.slug);
  const prev = RANKINGS[(at - 1 + RANKINGS.length) % RANKINGS.length];
  const next = RANKINGS[(at + 1) % RANKINGS.length];
  const res = splitResult(r.current);
  const focus = FOCUS_TITLE[r.slug];

  const tabs = [
    { id: "trajectory", label: "Five editions" },
    { id: "measures", label: "What it measures" },
    ...(focus ? [{ id: "focus", label: focus.split(",")[0] }] : []),
    { id: "highlights", label: "Highlights" },
    { id: "method", label: "Method" },
    ...(stories.length ? [{ id: "stories", label: "Stories" }] : []),
    { id: "related", label: "Related rankings" },
  ];

  return (
    <>
      <PageHero
        long
        title={r.name}
        lead={
          <p>
            Published by {body.name}. {r.publicNote}
          </p>
        }
        actions={
          <>
            <a href="#measures" className="w-btn">
              What it measures
            </a>
            <Link href="/rankings" className="w-link">
              All eight rankings
            </Link>
          </>
        }
        figure={{
          label: res.label,
          value: res.value,
          note: (
            <>
              {LATEST_EDITION} edition
              <br />
              {movement(r)}
            </>
          ),
        }}
      />
      <PageTabs items={tabs} label="On this page" />

      <section id="trajectory" className="w-band w-band--stone" aria-labelledby="traj-title">
        <div className="w-wrap">
          <div className="w-intro w-grid">
            <h2 id="traj-title" className="w-head" data-reveal>
              Five editions
            </h2>
            <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
              <p className="w-lead">{r.publicNote} Each capsule is the band published for that edition.</p>
            </div>
          </div>
          <div data-reveal style={{ ["--d" as string]: "140ms" }}>
            <Trajectory ranking={r} />
          </div>
        </div>
      </section>

      <section id="measures" className="w-section w-wrap" aria-labelledby="measures-title">
        <div className="w-intro w-grid">
          <h2 id="measures-title" className="w-head" data-reveal>
            What it measures
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">
              {r.measures}. Reporting period: {r.reportingPeriod.split(";")[0].toLowerCase()}.
            </p>
          </div>
        </div>
        <div className="w-tablewrap" data-reveal>
          <table className="w-ind">
            <caption className="sr-only">Indicators and weights of the {r.name}</caption>
            <thead>
              <tr>
                <th scope="col">Indicator</th>
                <th scope="col">Weight</th>
                <th scope="col">Four cycles</th>
              </tr>
            </thead>
            <tbody>
              {r.indicators.map((i) => (
                <tr key={i.name}>
                  <th scope="row">
                    <span className="w-ind__name">{i.name}</span>
                    <span className="w-ind__def">{i.definition}</span>
                  </th>
                  <td className="w-ind__w w-figure">{i.weight}</td>
                  <td>
                    <span className="w-ind__trend">
                      <Spark values={i.history.filter((v) => v > 0)} label={i.name} />
                      {i.trend}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PhotoBand photo={RANKING_PHOTO[r.slug]} caption={RANKING_PHOTO[r.slug].alt + "."} />

      {focus && (
        <section id="focus" className="w-band w-band--ink w-on-dark w-focus" aria-labelledby="focus-title">
          <div className="w-wrap">
            <h2 id="focus-title" className="w-head w-focus__title" data-reveal>
              {focus}
            </h2>
            <Focus r={r} />
          </div>
        </section>
      )}

      <section id="highlights" className="w-band w-band--gold" aria-labelledby="hl-title">
        <div className="w-wrap w-grid w-hl">
          <h2 id="hl-title" className="w-head w-hl__title" data-reveal>
            What the result reflects
          </h2>
          <ul className="w-hl__list">
            {r.strengths.map((s, i) => (
              <li key={s} data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
                {s}
              </li>
            ))}
          </ul>
          <p className="w-hl__next" data-reveal>
            <b>Next cycle.</b> {r.message}.
          </p>
          <div className="w-hl__disc" data-reveal="disc">
            <Image
              src={PHOTOS.field.src}
              alt={PHOTOS.field.alt}
              fill
              sizes="(max-width: 900px) 60vw, 24vw"
              style={{ objectPosition: PHOTOS.field.pos }}
            />
          </div>
        </div>
      </section>

      <section id="method" className="w-section w-wrap" aria-labelledby="method-title">
        <h2 id="method-title" className="w-head w-rows__title" data-reveal>
          How it is measured
        </h2>
        <dl className="w-rows">
          <div data-reveal>
            <dt>Data sources</dt>
            <dd>{r.dataSources.join("; ")}.</dd>
          </div>
          <div data-reveal>
            <dt>Reporting period</dt>
            <dd>{r.reportingPeriod}.</dd>
          </div>
          <div data-reveal>
            <dt>Recent changes</dt>
            <dd>{r.methodologyChanges}</dd>
          </div>
          <div data-reveal>
            <dt>The result</dt>
            <dd>
              Results belong to {body.name} and follow its published method. The Office reports them exactly as published.{" "}
              <Link href="/knowledge#methodologies" className="w-link">
                Every ranking&rsquo;s method in plain language
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      {stories.length > 0 && (
        <section id="stories" className="w-band w-band--stone" aria-labelledby="stories-title">
          <div className="w-wrap">
            <div className="w-intro w-grid">
              <h2 id="stories-title" className="w-head" data-reveal>
                Stories behind this result
              </h2>
              <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
                <p className="w-lead">Published Thomasian practices whose evidence counts in the {r.short}.</p>
              </div>
            </div>
            <ul className="w-storyrows">
              {stories.map((s, i) => (
                <li key={s.slug} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                  <Link href={`/impact/${s.slug}`} className="w-storyrow">
                    <span className="w-storyrow__pic">
                      <Image src={s.images[0]} alt="" fill sizes="120px" />
                    </span>
                    <span className="w-storyrow__title">{s.title}</span>
                    <span className="w-storyrow__unit">{s.unit}</span>
                    <span className="w-storyrow__fig">
                      <b className="w-figure">{s.outcomeFigure}</b> {s.outcomeLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section id="related" className="w-band w-band--ink w-on-dark" aria-labelledby="related-title">
        <div className="w-wrap">
          <h2 id="related-title" className="w-head" data-reveal>
            {siblings.length ? `More from ${body.name}` : "The other rankings"}
          </h2>
          <ul className="w-related">
            {(siblings.length ? siblings : [prev, next]).map((x, i) => (
              <li key={x.slug} data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
                <Link href={`/rankings/${x.slug}`} className="w-related__item">
                  <span className="w-related__pic">
                    <Image
                      src={RANKING_PHOTO[x.slug].src}
                      alt=""
                      fill
                      sizes="(max-width: 900px) 100vw, 40vw"
                      style={{ objectPosition: RANKING_PHOTO[x.slug].pos }}
                    />
                  </span>
                  <span className="w-related__name">{x.name}</span>
                  <span className="w-related__res w-figure">{x.current}</span>
                </Link>
              </li>
            ))}
          </ul>
          <nav className="w-pager" aria-label="Rankings">
            <Link href={`/rankings/${prev.slug}`} className="w-pager__link">
              <span>Previous</span> {prev.short}
            </Link>
            <Link href="/rankings" className="w-btn">
              All eight rankings
            </Link>
            <Link href={`/rankings/${next.slug}`} className="w-pager__link w-pager__link--next">
              <span>Next</span> {next.short}
            </Link>
          </nav>
        </div>
      </section>
    </>
  );
}
