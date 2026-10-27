import Image from "next/image";
import Link from "next/link";
import { RECOGNITION, WURI_PLACEMENTS } from "@/lib/data";
import { siteData } from "@/lib/governance/server/site";
import { PageHero } from "../PageHero";
import { PageTabs } from "../PageTabs";
import { PhotoBand } from "../PhotoBand";
import { serverViews } from "@/lib/governance/server/views";

const TABS = [
  { id: "achievements", label: "Achievements" },
  { id: "awards", label: "Cycle awards" },
  { id: "units", label: "Contributing units" },
  { id: "champions", label: "Evidence champions" },
  { id: "innovation", label: "Innovation" },
  { id: "international", label: "International" },
  { id: "archive", label: "Archive" },
];

/** Awards given in earlier cycles, newest first. */
const ARCHIVE: { cycle: string; awards: number }[] = [];

/** Rankings whose evidence the sustainability partners supply. */
const SUSTAINABILITY = ["UI GreenMetric", "QS Sustainability", "THE Impact"];

/** Recognition follows verified evidence quality, measurable outcomes and collaboration (proposal §8). */
export async function RecognitionPage() {
  const { latestEdition, photos } = await serverViews();
  // Active units from the directory, published stories and the movers shown publicly.
  const { units: UNITS, stories: PUBLISHED_STORIES, movers: MOVERS, currentCycle } = await siteData();
  const topUnits = UNITS.filter((u) => u.validated > 0).sort((a, b) => b.validated - a.validated || b.rankingsServed - a.rankingsServed).slice(0, 6);
  const champions = UNITS.filter((u) => u.coordinatorId && u.rankingsServed > 0).sort((a, b) => b.rankingsServed - a.rankingsServed).slice(0, 4);
  const innovation = PUBLISHED_STORIES.filter((s) => s.themes.includes("Thomasian Innovations"));
  const partners = UNITS.filter((u) => PUBLISHED_STORIES.some((s) => s.unit.startsWith(u.name) && s.rankings.some((r) => SUSTAINABILITY.includes(r))));
  const shown: Record<string, boolean> = {
    achievements: MOVERS.length > 0,
    awards: RECOGNITION.length > 0,
    units: topUnits.length > 0,
    champions: champions.length > 0,
    innovation: innovation.length > 0 || partners.length > 0,
    international: WURI_PLACEMENTS.length > 0,
    archive: ARCHIVE.length > 0,
  };
  const tabs = TABS.filter((t) => shown[t.id]);

  return (
    <>
      <PageHero
        title={
          <>
            The units behind <br className="w-br" />
            the results
          </>
        }
        lead={<p>Recognition follows verified evidence quality, measurable outcomes and collaboration, never the number of files uploaded.</p>}
        actions={
          <>
            {shown.awards && (
              <a href="#awards" className="w-btn">
                See this cycle&rsquo;s awards
              </a>
            )}
            <Link href="/signin" className="w-link">
              Sign in to contribute
            </Link>
          </>
        }
        photo={photos.field}
      />
      {tabs.length > 1 && <PageTabs items={tabs} label="On this page" />}

      {!tabs.length && (
        <section className="w-section w-wrap" aria-labelledby="none-title">
          <div className="w-intro w-grid">
            <h2 id="none-title" className="w-head" data-reveal>
              The {currentCycle} cycle
            </h2>
            <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
              <p className="w-lead">Awards, leading units and evidence champions appear here once the Office has reviewed this cycle&rsquo;s evidence.</p>
            </div>
          </div>
        </section>
      )}

      {shown.achievements && (
      <section id="achievements" className="w-section w-wrap" aria-labelledby="ach-title">
        <div className="w-intro w-grid">
          <h2 id="ach-title" className="w-head" data-reveal>
            What moved in {latestEdition}
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">These results rose in the latest editions. Each counted evidence from several units at once.</p>
          </div>
        </div>
        <ul className="w-ach">
          {MOVERS.map((r, i) => (
            <li key={r.slug} data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
              <Link href={`/rankings/${r.slug}`} className="w-ach__item">
                <span className="w-ach__fig w-figure">{r.current}</span>
                <span className="w-ach__name">{r.name}</span>
                <span className="w-ach__from w-up">Up from {r.previous}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      )}

      {shown.awards && (
      <section id="awards" className="w-band w-band--gold" aria-labelledby="awards-title">
        <div className="w-wrap">
          <div className="w-intro w-grid">
            <h2 id="awards-title" className="w-head" data-reveal>
              The {latestEdition} cycle awards
            </h2>
            <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
              <p className="w-lead">
                Given for quality: complete and early submissions, outcome evidence, collaboration, reuse, improvement, stories and innovation.
              </p>
            </div>
          </div>
          <ul className="w-awards">
            {RECOGNITION.map((a, i) => (
              <li key={a.award} className="w-award" data-reveal style={{ ["--d" as string]: `${(i % 3) * 70}ms` }}>
                <span className="w-award__name">{a.award}</span>
                <span className="w-award__unit">{a.unit}</span>
                <span className="w-award__why">{a.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      )}

      <PhotoBand photo={photos.festive} caption="The Main Building and its plaza lit in December." />

      {shown.units && (
      <section id="units" className="w-section w-wrap" aria-labelledby="units2-title">
        <div className="w-intro w-grid">
          <h2 id="units2-title" className="w-head" data-reveal>
            Most validated evidence
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">Units ordered by the evidence reviewers accepted this cycle, and the rankings it counts in.</p>
          </div>
        </div>
        <ol className="w-leaders">
          {topUnits.map((u, i) => (
            <li key={u.slug} className="w-leader" data-reveal style={{ ["--d" as string]: `${i * 60}ms` }}>
              <span className="w-leader__n w-figure">{u.validated}</span>
              <span className="w-leader__name">{u.name}</span>
              <span className="w-leader__meta">validated items, counted in {u.rankingsServed} rankings</span>
            </li>
          ))}
        </ol>
      </section>
      )}

      {shown.champions && (
      <section id="champions" className="w-band w-band--ink w-on-dark" aria-labelledby="champ-title">
        <div className="w-wrap w-grid w-champs">
          <div className="w-champs__head">
            <h2 id="champ-title" className="w-head" data-reveal>
              Evidence champions
            </h2>
            <p className="w-lead" data-reveal style={{ ["--d" as string]: "90ms" }}>
              Coordinators whose evidence is reused most widely across the rankings.
            </p>
          </div>
          <ul className="w-champs__list">
            {champions.map((u, i) => (
              <li key={u.slug} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                <span className="w-champs__name">{u.coordinator}</span>
                <span className="w-champs__unit">{u.name}</span>
                <span className="w-champs__n">
                  <b className="w-figure">{u.rankingsServed}</b> rankings
                </span>
              </li>
            ))}
          </ul>
          <div className="w-champs__disc" data-reveal="disc">
            <Image src={photos.courtyard.src} alt={photos.courtyard.alt} fill sizes="(max-width: 900px) 70vw, 28vw" />
          </div>
        </div>
      </section>
      )}

      {shown.innovation && (
      <section id="innovation" className="w-section w-wrap" aria-labelledby="inno-title">
        <div className="w-intro w-grid">
          <h2 id="inno-title" className="w-head" data-reveal>
            Innovation leaders
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">Programmes documented for WURI and the public showcase.</p>
          </div>
        </div>
        <ul className="w-storyrows">
          {innovation.map((s, i) => (
            <li key={s.slug} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
              <Link href={`/publications/stories/${s.slug}`} className="w-storyrow">
                <span className="w-storyrow__pic">
                  <Image src={s.images[0]} alt="" fill sizes="120px" />
                </span>
                <span className="w-storyrow__title">{s.title}</span>
                <span className="w-storyrow__unit">{s.unit}</span>
                <span className="w-storyrow__fig">
                  {s.outcomeFigure && <b className="w-figure">{s.outcomeFigure}</b>} {s.outcomeLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {partners.length > 0 && (
          <div className="w-partners" data-reveal>
            <h3 className="w-partners__title">Sustainability partners</h3>
            <p>Units behind the GreenMetric, QS Sustainability and THE Impact evidence:</p>
            <ul>
              {partners.map((u) => (
                <li key={u.slug}>
                  <i className="w-dot" aria-hidden="true" />
                  {u.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      )}

      {shown.international && (
      <section id="international" className="w-band w-band--stone" aria-labelledby="intl-title">
        <div className="w-wrap">
          <div className="w-intro w-grid">
            <h2 id="intl-title" className="w-head" data-reveal>
              International recognition
            </h2>
            <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
              <p className="w-lead">WURI Top 100 placements, as confirmed in the official result letter.</p>
            </div>
          </div>
          <ul className="w-cats">
            {WURI_PLACEMENTS.map((c, i) => (
              <li key={c} data-reveal style={{ ["--d" as string]: `${(i % 4) * 60}ms` }}>
                <i className="w-dot" aria-hidden="true" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>
      )}

      {shown.archive && (
      <section id="archive" className="w-section w-wrap" aria-labelledby="arch-title">
        <h2 id="arch-title" className="w-head w-rows__title" data-reveal>
          Recognition archive
        </h2>
        <dl className="w-rows">
          {ARCHIVE.map((a) => (
            <div key={a.cycle} data-reveal>
              <dt>{a.cycle} cycle</dt>
              <dd>{a.awards} awards to units for evidence quality, outcomes and collaboration.</dd>
            </div>
          ))}
        </dl>
      </section>
      )}
    </>
  );
}
