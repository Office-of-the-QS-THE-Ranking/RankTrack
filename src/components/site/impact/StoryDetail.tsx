import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { SDG_COLORS, SDG_NAMES, inkOn, type Story } from "@/lib/data";
import { siteData } from "@/lib/governance/server/site";
import { PHOTOS, type Photo } from "@/lib/site";
import { PageHero } from "../PageHero";
import { AdaptCoupon } from "../home/AdaptCoupon";

const photoFor = (src: string): Photo => Object.values(PHOTOS).find((p) => p.src === src) ?? { src, alt: "" };

/** One practice, in the order the proposal sets: challenge, response, implementation, outcome, beneficiaries, alignment, replication. */
export async function StoryDetail({ story: s }: { story: Story }) {
  const { stories: PUBLISHED_STORIES, rankings: RANKINGS } = await siteData();
  const related = PUBLISHED_STORIES.filter((o) => o.slug !== s.slug && o.themes.some((t) => s.themes.includes(t))).slice(0, 3);
  const counts = s.rankings.map((short) => RANKINGS.find((r) => r.short === short)).filter((r): r is (typeof RANKINGS)[number] => !!r);
  const [, second, third] = s.images;

  const steps: [string, string][] = [
    ["Challenge", s.challenge],
    ["Thomasian response", s.response],
    ["Implementation", s.implementation],
    ["Measurable outcome", s.outcome],
    ["Beneficiaries", s.beneficiaries],
    ["Evidence", s.evidence],
  ];

  return (
    <>
      <PageHero
        long
        title={s.title}
        lead={
          <p>
            {s.unit}. {s.kind}, {s.year}.
          </p>
        }
        actions={
          <>
            <a href="#adapt" className="w-btn">
              Adapt this practice
            </a>
            <Link href="/impact" className="w-link">
              All impact stories
            </Link>
          </>
        }
        photo={photoFor(s.images[0])}
      />

      <section className="w-band w-band--gold w-outcome" aria-labelledby="outcome-title">
        <div className="w-wrap w-grid">
          <h2 id="outcome-title" className="sr-only">
            The result
          </h2>
          <p className="w-outcome__fig w-figure" data-reveal>
            {s.outcomeFigure}
          </p>
          <div className="w-outcome__text" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">{s.outcomeLabel.charAt(0).toUpperCase() + s.outcomeLabel.slice(1)}.</p>
            <p>{s.outcome}</p>
          </div>
        </div>
      </section>

      <section className="w-section w-wrap" aria-labelledby="journey-title">
        <h2 id="journey-title" className="w-head w-rows__title" data-reveal>
          From challenge to result
        </h2>
        <dl className="w-rows">
          {steps.map(([k, v]) => (
            <div key={k} data-reveal>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="w-band w-band--ink w-on-dark w-lesson" aria-labelledby="lesson-title">
        <div className="w-wrap w-grid">
          <h2 id="lesson-title" className="w-head w-lesson__title" data-reveal>
            How to adapt it
          </h2>
          <div className="w-lesson__body">
            <blockquote className="w-lesson__quote" data-reveal style={{ ["--d" as string]: "90ms" }}>
              {s.lessons}
            </blockquote>
            <p data-reveal style={{ ["--d" as string]: "160ms" }}>
              <b>Replication guidance.</b> {s.replication}
            </p>
          </div>
          {second && (
            <div className="w-lesson__disc" data-reveal="disc">
              <Image src={second} alt={photoFor(second).alt} fill sizes="(max-width: 900px) 80vw, 30vw" />
            </div>
          )}
        </div>
      </section>

      <section className="w-section w-wrap" aria-labelledby="align-title">
        <div className="w-intro w-grid">
          <h2 id="align-title" className="w-head" data-reveal>
            Where it counts
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">
              The evidence behind this practice supports {s.sdgs.length === 1 ? "one goal" : `${s.sdgs.length} goals`} and counts in {counts.length}{" "}
              {counts.length === 1 ? "ranking" : "rankings"}.
            </p>
          </div>
        </div>
        <div className="w-align">
          <ul className="w-sdgs w-sdgs--sm">
            {s.sdgs.map((n, i) => (
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
          <ul className="w-align__rk">
            {counts.map((r, i) => (
              <li key={r.slug} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                <Link href={`/rankings/${r.slug}`} className="w-align__link">
                  <span>{r.name}</span>
                  <span className="w-figure">{r.current}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {third && (
          <div className="w-align__pic" data-reveal="shutter">
            <Image src={third} alt={photoFor(third).alt} fill sizes="(max-width: 900px) 100vw, 60vw" />
          </div>
        )}
      </section>

      <AdaptCoupon practice={s.slug} stories={PUBLISHED_STORIES.map(({ slug, title, unit }) => ({ slug, title, unit }))} />

      {related.length > 0 && (
        <section className="w-section w-wrap w-related-stories" aria-labelledby="more-title">
          <h2 id="more-title" className="w-head" data-reveal>
            Related practices
          </h2>
          <ul className="w-storyrows">
            {related.map((o, i) => (
              <li key={o.slug} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                <Link href={`/impact/${o.slug}`} className="w-storyrow">
                  <span className="w-storyrow__pic">
                    <Image src={o.images[0]} alt="" fill sizes="120px" />
                  </span>
                  <span className="w-storyrow__title">{o.title}</span>
                  <span className="w-storyrow__unit">{o.unit}</span>
                  <span className="w-storyrow__fig">
                    {o.outcomeFigure && <b className="w-figure">{o.outcomeFigure}</b>} {o.outcomeLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
