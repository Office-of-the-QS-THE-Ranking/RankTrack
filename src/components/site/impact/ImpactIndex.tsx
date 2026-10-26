import Link from "next/link";
import type { CSSProperties } from "react";
import { SDG_COLORS, SDG_NAMES, inkOn } from "@/lib/data";
import { siteData } from "@/lib/governance/server/site";
import { PHOTOS } from "@/lib/site";
import { PageHero } from "../PageHero";
import { AdaptCoupon } from "../home/AdaptCoupon";
import { StoryIndex } from "./StoryIndex";

/** Impact and innovation: the published Thomasian practices, filtered by theme. */
export async function ImpactIndex() {
  // Published stories only: the publication workflow, the stories dataset's classification and the library switch decide.
  const { stories: PUBLISHED_STORIES, rankings: RANKINGS } = await siteData();
  const sdgs = new Set(PUBLISHED_STORIES.flatMap((s) => s.sdgs));
  const rankings = new Set(PUBLISHED_STORIES.flatMap((s) => s.rankings));
  const replicable = PUBLISHED_STORIES.filter((s) => s.themes.includes("Replicable Practices")).length;

  return (
    <>
      <PageHero
        title={
          <>
            Impact and <br className="w-br" />
            innovation
          </>
        }
        lead={<p>Practices that changed something measurable, told from challenge to replication so other universities can adapt them.</p>}
        actions={
          <>
            <a href="#stories" className="w-btn">
              Read the stories
            </a>
            <a href="#adapt" className="w-link">
              Adapt a practice
            </a>
          </>
        }
        photo={PHOTOS.archAerial}
      />

      <section className="w-band w-band--ink w-on-dark w-tally" aria-labelledby="tally-title">
        <div className="w-wrap">
          <h2 id="tally-title" className="sr-only">
            The stories in figures
          </h2>
          <dl className="w-tally__stats">
            <div data-reveal>
              <dt>Practices published</dt>
              <dd className="w-figure">{PUBLISHED_STORIES.length}</dd>
            </div>
            <div data-reveal style={{ ["--d" as string]: "80ms" }}>
              <dt>Rankings they count in</dt>
              <dd className="w-figure">
                {rankings.size}
                <small> of {RANKINGS.length}</small>
              </dd>
            </div>
            <div data-reveal style={{ ["--d" as string]: "160ms" }}>
              <dt>With replication guidance</dt>
              <dd className="w-figure">{replicable}</dd>
            </div>
          </dl>
          <div className="w-tally__sdgs" data-reveal style={{ ["--d" as string]: "200ms" }}>
            <p>{sdgs.size} of the 17 Sustainable Development Goals addressed</p>
            <ul aria-label={`SDGs addressed: ${[...sdgs].sort((a, b) => a - b).join(", ")}`}>
              {Array.from({ length: 17 }, (_, i) => i + 1).map((n) => (
                <li
                  key={n}
                  title={`SDG ${n}: ${SDG_NAMES[n]}${sdgs.has(n) ? "" : " (no story yet)"}`}
                  className={sdgs.has(n) ? "is-on" : undefined}
                  style={sdgs.has(n) ? ({ background: SDG_COLORS[n], color: inkOn(SDG_COLORS[n]) } as CSSProperties) : undefined}
                >
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="stories" className="w-section w-wrap" aria-labelledby="stories-title">
        <div className="w-intro w-grid">
          <h2 id="stories-title" className="w-head" data-reveal>
            Published practices
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">Each one names a challenge, the Thomasian response, a measured outcome and how another institution can adapt it.</p>
            <Link href="/knowledge#standards" className="w-link">
              What counts as evidence
            </Link>
          </div>
        </div>
        <StoryIndex stories={PUBLISHED_STORIES} />
      </section>

      {PUBLISHED_STORIES.length > 0 && <AdaptCoupon stories={PUBLISHED_STORIES.map(({ slug, title, unit }) => ({ slug, title, unit }))} />}
    </>
  );
}
