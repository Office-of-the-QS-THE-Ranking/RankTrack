import type { CSSProperties } from "react";
import { inkOn } from "@/lib/data";
import { siteData } from "@/lib/governance/server/site";
import { AdaptCoupon } from "../home/AdaptCoupon";
import { byDate, storyCard } from "./cards";
import { Newsroom } from "./Newsroom";
import type { PublicationFilters } from "./NewsFilters";
import { serverViews } from "@/lib/governance/server/views";

/** Stories & News as a newsroom: the published stories, newest first, then the stories in figures. */
export async function StoriesIndex({ theme, sdgs: selectedSdgs, publication }: { theme?: string; sdgs?: number[]; publication?: Partial<PublicationFilters> }) {
  const { photos, sdgColors, sdgNames } = await serverViews();
  // Published stories only: the publication workflow, the stories dataset's classification and the library switch decide.
  const { stories: PUBLISHED_STORIES, rankings: RANKINGS } = await siteData();
  const cards = PUBLISHED_STORIES.map((s) => storyCard(s, photos)).sort(byDate);
  const sdgs = new Set(PUBLISHED_STORIES.flatMap((s) => s.sdgs));
  const rankings = new Set(PUBLISHED_STORIES.flatMap((s) => s.rankings));
  const units = new Set(PUBLISHED_STORIES.map((s) => s.unit));

  return (
    <>
      <section id="stories" className="w-wrap w-news-section" aria-label="Stories">
        <Newsroom cards={cards} theme={theme} sdgs={selectedSdgs} publication={publication} />
      </section>

      {cards.length > 0 && (
        <section className="w-band w-band--ink w-on-dark w-tally" aria-labelledby="tally-title">
          <div className="w-wrap">
            <h2 id="tally-title" className="w-head w-tally__title" data-reveal>
              The stories in figures
            </h2>
            <dl className="w-tally__stats">
              <div data-reveal>
                <dt>Stories published</dt>
                <dd className="w-figure">{cards.length}</dd>
              </div>
              <div data-reveal style={{ ["--d" as string]: "80ms" }}>
                <dt>Units telling them</dt>
                <dd className="w-figure">{units.size}</dd>
              </div>
              <div data-reveal style={{ ["--d" as string]: "160ms" }}>
                <dt>Rankings they count in</dt>
                <dd className="w-figure">
                  {rankings.size}
                  <small> of {RANKINGS.length}</small>
                </dd>
              </div>
            </dl>
            <div className="w-tally__sdgs" data-reveal style={{ ["--d" as string]: "200ms" }}>
              <p>{sdgs.size} of the 17 Sustainable Development Goals addressed</p>
              <ul aria-label={`SDGs addressed: ${[...sdgs].sort((a, b) => a - b).join(", ")}`}>
                {Array.from({ length: 17 }, (_, i) => i + 1).map((n) => (
                  <li
                    key={n}
                    title={`SDG ${n}: ${sdgNames[n]}${sdgs.has(n) ? "" : " (no story yet)"}`}
                    className={sdgs.has(n) ? "is-on" : undefined}
                    style={sdgs.has(n) ? ({ background: sdgColors[n], color: inkOn(sdgColors[n]) } as CSSProperties) : undefined}
                  >
                    {sdgs.has(n) ? (
                      <a href={`/publications/stories?sdg=${n}#stories`} aria-label={`Stories serving SDG ${n}, ${sdgNames[n]}`}>
                        {n}
                      </a>
                    ) : (
                      n
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {cards.length > 0 && <AdaptCoupon stories={PUBLISHED_STORIES.map(({ slug, title, unit }) => ({ slug, title, unit }))} />}
    </>
  );
}
