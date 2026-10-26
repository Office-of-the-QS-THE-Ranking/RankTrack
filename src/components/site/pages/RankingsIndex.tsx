import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { DIMENSIONS, LATEST_EDITION, MATRIX } from "@/lib/data";
import { PHOTOS, RANKING_PHOTO, movement, splitResult } from "@/lib/site";
import { siteData } from "@/lib/governance/server/site";
import { PageHero } from "../PageHero";
import { PageTabs } from "../PageTabs";
import { CountsWhere } from "../home/CountsWhere";
import { Calendar } from "../Calendar";
import { PhotoBand } from "../PhotoBand";

const TABS = [
  { id: "results", label: "Results" },
  { id: "counts", label: "Where work counts" },
  { id: "matrix", label: "What each measures" },
  { id: "calendar", label: "Calendar" },
  { id: "indicators", label: "Shared indicators" },
];

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** Rankings overview: how the rankings shown publicly relate to UST, the results as published, and when each collects data. */
export async function RankingsIndex() {
  const { rankings: RANKINGS, bodies: BODIES, dictionary: DICTIONARY } = await siteData();
  const bodyOf = (slug: string) => BODIES.find((b) => b.rankings.some((r) => r.slug === slug))!;
  const n = RANKINGS.length;
  return (
    <>
      <PageHero
        title={
          <>
            {WORDS[n] ?? n} {n === 1 ? "ranking" : "rankings"}, <br className="w-br" />
            one university
          </>
        }
        lead={<p>What each ranking measures, where UST stands in the {LATEST_EDITION} editions, and which evidence counts in several at once.</p>}
        actions={
          <>
            <a href="#results" className="w-btn">
              See the results
            </a>
            <Link href="/knowledge#methodologies" className="w-link">
              How each ranking works
            </Link>
          </>
        }
        photo={PHOTOS.aerial}
      />
      <PageTabs items={TABS} label="On this page" />

      <section id="results" className="w-section w-wrap" aria-labelledby="results-title">
        <div className="w-intro w-grid">
          <h2 id="results-title" className="w-head" data-reveal>
            Results as published
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">
              The {LATEST_EDITION} edition of each ranking beside the one before it. Open a ranking for what it measures and the stories behind it.
            </p>
          </div>
        </div>
        <div className="w-tablewrap" data-reveal>
          <table className="w-results">
            <caption className="sr-only">UST in eight global rankings, {LATEST_EDITION} editions</caption>
            <thead>
              <tr>
                <th scope="col">Ranking</th>
                <th scope="col">{LATEST_EDITION}</th>
                <th scope="col">Movement</th>
                <th scope="col">What it measures</th>
              </tr>
            </thead>
            <tbody>
              {RANKINGS.map((r) => {
                const b = bodyOf(r.slug);
                const res = splitResult(r.current);
                return (
                  <tr key={r.slug}>
                    <th scope="row">
                      <span className="w-results__cell">
                        <span className="w-results__pic">
                          <Image src={RANKING_PHOTO[r.slug].src} alt="" fill sizes="56px" style={{ objectPosition: RANKING_PHOTO[r.slug].pos }} />
                        </span>
                        <Link href={`/rankings/${r.slug}`} className="w-results__name">
                          {r.name}
                        </Link>
                        <span className="w-results__body">
                          <i className="w-dot" style={{ background: b.color } as CSSProperties} aria-hidden="true" />
                          {b.name}
                        </span>
                      </span>
                    </th>
                    <td className="w-results__now">
                      {res.label && <span className="w-results__label">{res.label}</span>}
                      <span className="w-figure">{res.value}</span>
                    </td>
                    <td className={r.direction === "up" ? "w-up" : undefined}>{movement(r)}</td>
                    <td className="w-results__what">{r.measures}.</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <PhotoBand photo={PHOTOS.field} caption="Students cross the open field in front of the Main Building, España." />

      <div id="counts">
        <CountsWhere />
      </div>

      <section id="matrix" className="w-section w-wrap" aria-labelledby="matrix-title">
        <div className="w-intro w-grid">
          <h2 id="matrix-title" className="w-head" data-reveal>
            What each ranking measures
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">Nine kinds of work, eight rankings. A filled circle means the ranking measures that kind of work.</p>
          </div>
        </div>
        <div className="w-tablewrap w-matrix-wrap" data-reveal>
          <table className="w-matrix">
            <caption className="sr-only">Kinds of work measured by each ranking</caption>
            <thead>
              <tr>
                <th scope="col">Kind of work</th>
                {RANKINGS.map((r) => (
                  <th key={r.slug} scope="col">
                    <Link href={`/rankings/${r.slug}`}>{r.short}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DIMENSIONS.map((d) => (
                <tr key={d}>
                  <th scope="row">{d}</th>
                  {RANKINGS.map((r) => {
                    const on = MATRIX[r.slug]?.includes(d);
                    return (
                      <td key={r.slug}>
                        {on ? (
                          <span className="w-matrix__on">
                            <span className="sr-only">Measured</span>
                          </span>
                        ) : (
                          <span className="sr-only">Not measured</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* phones: the same matrix read as a list, one kind of work at a time */}
        <ul className="w-matrix-list">
          {DIMENSIONS.map((d) => {
            const rks = RANKINGS.filter((r) => MATRIX[r.slug]?.includes(d));
            return (
              <li key={d}>
                <b>{d}</b>
                {rks.length} of {RANKINGS.length}: {rks.map((r) => r.short).join(", ")}
              </li>
            );
          })}
        </ul>
      </section>

      <Calendar />

      <section id="indicators" className="w-section w-wrap" aria-labelledby="ind-title">
        <div className="w-intro w-grid">
          <h2 id="ind-title" className="w-head" data-reveal>
            One definition, several rankings
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">The same figure is asked for by more than one ranking body. These are the ones that travel furthest.</p>
            <Link href="/knowledge#dictionary" className="w-link">
              Search the indicator dictionary
            </Link>
          </div>
        </div>
        <div className="w-terms-wrap">
          <ul className="w-terms">
            {DICTIONARY.slice(0, 6).map((d, i) => {
              const names = [...new Set(d.links.map((l) => l.ranking))];
              return (
                <li key={d.term} data-reveal style={{ ["--d" as string]: `${(i % 3) * 70}ms` }}>
                  <Link href={`/knowledge?q=${encodeURIComponent(d.term)}#dictionary`} className="w-term">
                    <span className="w-term__n w-figure">{names.length}</span>
                    <span className="w-term__body">
                      <span className="w-term__name">{d.term}</span>
                      <span className="w-term__def">{d.definition}</span>
                      <span className="w-term__in">
                        Counts in {names.length} {names.length === 1 ? "ranking" : "rankings"}: {names.join(", ")}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="w-terms__pic" data-reveal="shutter">
            <Image
              src={PHOTOS.library.src}
              alt={PHOTOS.library.alt}
              fill
              sizes="(max-width: 900px) 100vw, 30vw"
              style={{ objectPosition: PHOTOS.library.pos }}
            />
          </div>
        </div>
      </section>
    </>
  );
}
