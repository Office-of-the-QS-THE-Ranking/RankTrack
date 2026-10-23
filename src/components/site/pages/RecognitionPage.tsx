import Image from "next/image";
import Link from "next/link";
import { LATEST_EDITION, RECOGNITION, WURI_CATEGORIES } from "@/lib/data";
import { PHOTOS } from "@/lib/site";
import { siteData } from "@/lib/governance/server/site";
import { PageHero } from "../PageHero";
import { PageTabs } from "../PageTabs";
import { PhotoBand } from "../PhotoBand";

const TABS = [
  { id: "achievements", label: "Achievements" },
  { id: "awards", label: "Cycle awards" },
  { id: "units", label: "Contributing units" },
  { id: "champions", label: "Evidence champions" },
  { id: "innovation", label: "Innovation" },
  { id: "international", label: "International" },
  { id: "archive", label: "Archive" },
];

const PARTNERS = [
  "Facilities Management Office",
  "Faculty of Engineering",
  "Office for Community Development (SIMBAHAYAN)",
  "Miguel de Benavides Library",
];

const ARCHIVE = [
  { cycle: "2025–2026", awards: 7 },
  { cycle: "2024–2025", awards: 5 },
  { cycle: "2023–2024", awards: 4 },
];

/** Recognition follows verified evidence quality, measurable outcomes and collaboration (proposal §8). */
export function RecognitionPage() {
  // Active units from the directory, published stories and the movers shown publicly.
  const { units: UNITS, stories: PUBLISHED_STORIES, movers: MOVERS } = siteData();
  const topUnits = [...UNITS].sort((a, b) => b.validated - a.validated || b.rankingsServed - a.rankingsServed).slice(0, 6);
  const champions = [...UNITS].sort((a, b) => b.rankingsServed - a.rankingsServed).slice(0, 4);
  const innovation = PUBLISHED_STORIES.filter((s) => s.themes.includes("Thomasian Innovations"));

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
            <a href="#awards" className="w-btn">
              See this cycle&rsquo;s awards
            </a>
            <Link href="/signin" className="w-link">
              Sign in to contribute
            </Link>
          </>
        }
        photo={PHOTOS.field}
      />
      <PageTabs items={TABS} label="On this page" />

      <section id="achievements" className="w-section w-wrap" aria-labelledby="ach-title">
        <div className="w-intro w-grid">
          <h2 id="ach-title" className="w-head" data-reveal>
            What moved in {LATEST_EDITION}
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">Four results rose in the latest editions. Each counted evidence from several units at once.</p>
          </div>
        </div>
        <ul className="w-ach">
          {MOVERS.map((r, i) => (
            <li key={r.slug} data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
              <Link href={`/rankings/${r.slug}`} className="w-ach__item">
                <span className="w-ach__fig w-figure">{r.current}</span>
                <span className="w-ach__name">{r.name}</span>
                <span className="w-ach__from w-up">{r.slug === "wuri" ? "Top 100 in 12 categories" : `Up from ${r.previous}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="awards" className="w-band w-band--gold" aria-labelledby="awards-title">
        <div className="w-wrap">
          <div className="w-intro w-grid">
            <h2 id="awards-title" className="w-head" data-reveal>
              The {LATEST_EDITION} cycle awards
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

      <PhotoBand photo={PHOTOS.festive} caption="The Main Building and its plaza lit in December." />

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
            <Image src={PHOTOS.courtyard.src} alt={PHOTOS.courtyard.alt} fill sizes="(max-width: 900px) 70vw, 28vw" />
          </div>
        </div>
      </section>

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
        <div className="w-partners" data-reveal>
          <h3 className="w-partners__title">Sustainability partners</h3>
          <p>Units behind the GreenMetric, QS Sustainability and THE Impact evidence:</p>
          <ul>
            {PARTNERS.map((p) => (
              <li key={p}>
                <i className="w-dot" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="international" className="w-band w-band--stone" aria-labelledby="intl-title">
        <div className="w-wrap">
          <div className="w-intro w-grid">
            <h2 id="intl-title" className="w-head" data-reveal>
              International recognition
            </h2>
            <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
              <p className="w-lead">WURI 151–200, with Top 100 placements in twelve categories and a place in the WURI mentorship network.</p>
            </div>
          </div>
          <ul className="w-cats">
            {WURI_CATEGORIES.map((c, i) => (
              <li key={c} data-reveal style={{ ["--d" as string]: `${(i % 4) * 60}ms` }}>
                <i className="w-dot" aria-hidden="true" />
                {c}
              </li>
            ))}
          </ul>
          <p className="w-focus__note">Category names are listed for review; the Office confirms them against the official result letter.</p>
        </div>
      </section>

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
    </>
  );
}
