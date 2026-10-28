import type { CSSProperties } from "react";
import { siteData } from "@/lib/governance/server/site";
import { ResearchList } from "./ResearchList";

/** Research Articles: published work by Thomasian authors, newest first, then the articles in figures. */
export async function ResearchIndex() {
  const { articles } = await siteData();
  const journals = new Set(articles.map((a) => a.venue.trim().toLowerCase()).filter(Boolean));
  const units = new Set(articles.flatMap((a) => (a.unit ? [a.unit] : [])));
  return (
    <>
      <section className="w-wrap w-news-section" aria-label="Articles">
        <ResearchList articles={articles} />
      </section>

      {articles.length > 2 && (
        <section className="w-band w-band--ink w-on-dark w-tally" aria-labelledby="tally-title">
          <div className="w-wrap">
            <h2 id="tally-title" className="w-head w-tally__title" data-reveal>
              The research in figures
            </h2>
            <dl className="w-tally__stats">
              <div data-reveal>
                <dt>Articles published</dt>
                <dd className="w-figure">{articles.length}</dd>
              </div>
              <div data-reveal style={{ "--d": "80ms" } as CSSProperties}>
                <dt>Journals and proceedings</dt>
                <dd className="w-figure">{journals.size}</dd>
              </div>
              <div data-reveal style={{ "--d": "160ms" } as CSSProperties}>
                <dt>Units represented</dt>
                <dd className="w-figure">{units.size}</dd>
              </div>
            </dl>
          </div>
        </section>
      )}
    </>
  );
}
