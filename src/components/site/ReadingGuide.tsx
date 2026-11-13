import { bandExample } from "@/lib/site";
import { siteData } from "@/lib/governance/server/site";

/**
 * How to read a result, for a visitor who has never opened a ranking table: which way is better, what a
 * range means and what "up" means. Each point leads with a specimen set in the figures' own face, and
 * the range and the movement are taken from a result UST really holds, so the guide matches the page.
 */
export async function ReadingGuide({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const ex = bandExample((await siteData()).rankings);
  return (
    <aside className="w-guide" aria-labelledby="guide-title" data-reveal>
      <H id="guide-title" className="w-guide__title">
        How to read a result
      </H>
      <ul className="w-guide__points">
        <li>
          <span className="w-guide__spec w-figure" aria-hidden="true">
            1<sup>st</sup>
          </span>
          <b>A smaller number is a better place.</b>
          <span>First is the top of every ranking, so 97th is ahead of 112th.</span>
        </li>
        <li>
          <span className="w-guide__spec w-figure" aria-hidden="true">
            {ex?.band ?? "401–600"}
          </span>
          <b>A range is a band, not a score.</b>
          <span>
            Past the top places, publishers group universities together.{" "}
            <span className="w-nowrap">{ex?.band ?? "401–600"}</span>{" "}
            {ex ? `means UST is placed somewhere from ${ex.from} to ${ex.to} in the ${ex.name}.` : "means a place somewhere from 401 to 600."}
          </span>
        </li>
        <li>
          <span className="w-guide__spec w-guide__spec--move" aria-hidden="true">
            <svg viewBox="0 0 10 10">
              <path d="M5 1.5 9 8.5H1z" />
            </svg>
            Up
          </span>
          <b>Up means a better place than last time.</b>
          <span>
            {ex?.previous ? (
              <>
                Each result is compared with the edition before it: <span className="w-nowrap">{ex.band}</span> is up from{" "}
                <span className="w-nowrap">{ex.previous}</span>.
              </>
            ) : (
              "Each result is compared with the edition before it."
            )}{" "}
            Every figure is shown exactly as the publisher released it.
          </span>
        </li>
      </ul>
    </aside>
  );
}
