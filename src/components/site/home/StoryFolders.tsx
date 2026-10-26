import Image from "next/image";
import Link from "next/link";
import { siteData } from "@/lib/governance/server/site";

/**
 * Stacked folders with tabs: each published story is a band of flat colour that sticks under the
 * previous one's strip as the page scrolls, filed like the folders of a dossier.
 */
export async function StoryFolders() {
  // Only stories that passed the publication workflow, with photographs to show.
  const PUBLISHED_STORIES = (await siteData()).stories.filter((s) => s.images.length);
  if (!PUBLISHED_STORIES.length) return null;
  return (
    <section className="w-folders" aria-labelledby="folders-title">
      <div className="w-folders__head w-wrap w-grid">
        <h2 id="folders-title" className="w-head" data-reveal>
          Stories behind the results
        </h2>
        <div className="w-folders__intro" data-reveal style={{ ["--d" as string]: "90ms" }}>
          <p className="w-lead">Each started with a problem on or near the campus and ended with a result someone measured.</p>
          <Link href="/impact" className="w-link">
            All impact stories
          </Link>
        </div>
      </div>
      {/* each folder names a view timeline; the folder above it fades its text as this one slides over (site-home.css) */}
      <div className="w-folders__stack" style={{ ["timelineScope" as string]: PUBLISHED_STORIES.map((_, i) => `--w-folder-${i}`).join(", ") }}>
        {PUBLISHED_STORIES.map((s, i) => (
          <article
            key={s.slug}
            className={`w-folder w-folder--${(i % 6) + 1}`}
            style={{
              ["--i" as string]: i,
              ["viewTimelineName" as string]: `--w-folder-${i}`,
              ["--next" as string]: i < PUBLISHED_STORIES.length - 1 ? `--w-folder-${i + 1}` : "none",
            }}
            aria-labelledby={`folder-${s.slug}`}
          >
            <div className="w-folder__strip w-wrap">
              <span className="w-folder__tab">{s.kind}</span>
              <span className="w-folder__kind">
                {s.kind}, {s.year}
              </span>
            </div>
            <div className="w-folder__body w-wrap w-grid">
              <div className="w-folder__pic">
                <Image src={s.images[0]} alt="" fill sizes="(max-width: 900px) 100vw, 56vw" />
              </div>
              <div className="w-folder__text">
                <h3 id={`folder-${s.slug}`} className="w-folder__title">
                  {s.title}
                </h3>
                <p className="w-folder__fig">
                  {s.outcomeFigure && <span className="w-figure">{s.outcomeFigure}</span>}
                  <span>{s.outcomeLabel}</span>
                </p>
                <p className="w-folder__unit">{s.unit}</p>
                <p className="w-folder__desc">
                  {s.challenge} {s.response}
                </p>
                <Link href={`/impact/${s.slug}`} className="w-btn w-btn--sm w-folder__btn">
                  Read the story
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
