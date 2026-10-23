import Link from "next/link";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { FAMILY, LATEST_EDITION, WURI_CATEGORIES, type Ranking } from "@/lib/data";
import { siteData } from "@/lib/governance/server/site";
import { Stars } from "../Stars";
import { AscentChart, type ChartSeries } from "./AscentChart";
import { AscentMotion } from "./AscentMotion";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (n: number) => WORDS[n] ?? String(n);

const ordinalSuffix = (v: string) => {
  const n = +v % 100;
  return n >= 11 && n <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[+v % 10] ?? "th";
};
const exact = (r: Ranking) => /^\d+$/.test(r.current);
const shown = (r: Ranking) => (exact(r) ? `${r.current}${ordinalSuffix(r.current)}` : r.current);
/** The edition before the latest one, as published. */
const before = (r: Ranking) => r.history[r.history.length - 2];
/** A band kept on one line: a break after its dash would read as two numbers. */
const band = (label: string) => <span className="w-asc__nb">{label}</span>;

/**
 * A figure set on counter wheels, as the hero sets its year. Each digit stays in the text (transparent, so
 * it is read, copied and indexed as published) and a wheel drawn by CSS beside it rolls from the digit in
 * the same place of `from` to its own. `start` carries the stagger on from earlier wheels in the block.
 */
function Wheels({ text, from = "", start = 0 }: { text: string; from?: string; start?: number }) {
  let w = start;
  return [...text].map((ch, i) =>
    /\d/.test(ch) ? (
      <span key={i} className="w-asc__wheel" style={{ "--n": +ch, "--f": /\d/.test(from[i] ?? "") ? +from[i] : 0, "--w": w++ } as CSSProperties}>
        {ch}
      </span>
    ) : (
      <span key={i} className="w-asc__glyph">
        {ch}
      </span>
    ),
  );
}

/** THE Impact: unaltered goal icons from the United Nations SDG website. */
const SDGS = [
  { n: 3, name: "Good health and well-being", color: "#4C9F38" },
  { n: 17, name: "Partnerships for the goals", color: "#19486A" },
];

function SdgProof() {
  return (
    <ul className="w-asc__sdgs">
      {SDGS.map((g, k) => (
        <li key={g.n} style={{ "--sdg": g.color, "--k": k } as CSSProperties}>
          <span className="w-asc__sdg" aria-hidden="true">
            <Image src={`/images/sdg/goal-${String(g.n).padStart(2, "0")}.jpg`} alt="" width={80} height={80} sizes="80px" />
          </span>
          <span className="w-asc__sdg-name">
            SDG {g.n}
            <span>{g.name}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** WURI: one small arch for each category placed in the Top 100, standing up in turn. */
function PlacementsProof({ count }: { count: number }) {
  return (
    <div className="w-asc__count">
      <span className="w-asc__count-num">
        <Wheels text={String(count)} start={8} />
      </span>
      <div className="w-asc__count-body">
        <ul className="w-asc__count-row" aria-hidden="true">
          {Array.from({ length: count }, (_, k) => (
            <li key={k} style={{ "--k": k } as CSSProperties} />
          ))}
        </ul>
        <p className="w-asc__proof-cap">categories placed in the WURI Top 100</p>
      </div>
    </div>
  );
}

/** QS: the band crossing the 1,000 line, on a scale from 1,200 (left) to 900 (right). */
function GateProof({ from, to }: { from: { hi: number; lo: number; label: string }; to: { hi: number; lo: number; label: string } }) {
  const pos = (rank: number) => +((1200 - rank) / 300).toFixed(4);
  return (
    <div className="w-asc__gate">
      <div
        className="w-asc__gate-scale"
        aria-hidden="true"
        style={
          {
            "--a0": pos(from.lo),
            "--a1": pos(from.hi - 1),
            "--b0": pos(to.lo),
            "--b1": pos(to.hi - 1),
            "--cut": pos(1000),
          } as CSSProperties
        }
      >
        <span className="w-asc__gate-zone" />
        <span className="w-asc__gate-band" />
        <span className="w-asc__gate-cut">1,000</span>
        <span className="w-asc__gate-from">{from.label}</span>
        <span className="w-asc__gate-to">{to.label}</span>
      </div>
      <p className="w-asc__proof-cap">
        From {band(from.label)} to {band(to.label)}, across the line of the top 1,000
      </p>
    </div>
  );
}

/** QS Sustainability: the fewest places the exact rank can have climbed from last year's band. */
function ClimbProof({ places, bandTop }: { places: number; bandTop: number }) {
  return (
    <div className="w-asc__count w-asc__count--climb">
      <span className="w-asc__count-num">
        <Wheels text={String(places)} start={8} />
      </span>
      <p className="w-asc__proof-cap">
        places higher at least: last year&rsquo;s band began at {bandTop.toLocaleString("en-US")}
      </p>
    </div>
  );
}

type Story = { proof: ReactNode };

function storyOf(r: Ranking): Story {
  switch (r.slug) {
    case "the-impact":
      return { proof: <SdgProof /> };
    case "wuri":
      return { proof: <PlacementsProof count={WURI_CATEGORIES.length} /> };
    case "qs-wur": {
      const prev = before(r);
      const now = r.history[r.history.length - 1];
      return {
        proof: <GateProof from={{ hi: prev.hi!, lo: prev.lo!, label: prev.label }} to={{ hi: now.hi!, lo: now.lo!, label: now.label }} />,
      };
    }
    default: {
      const top = before(r).hi!;
      return {
        proof: <ClimbProof places={top - +r.current} bandTop={top} />,
      };
    }
  }
}

function Block({ r, i }: { r: Ranking; i: number }) {
  const story = storyOf(r);
  const series: ChartSeries[] = [{ slug: r.slug, short: r.short, figure: shown(r), history: r.history }];
  return (
    <article className={`w-asc__block${i === 0 ? " is-active" : ""}`} data-i={i} aria-labelledby={`asc-${r.slug}`}>
      <div className="w-asc__who" style={{ "--s": 0 } as CSSProperties}>
        <span className="w-asc__dot" style={{ "--fam": FAMILY[r.family].color } as CSSProperties} aria-hidden="true" />
        <h3 id={`asc-${r.slug}`}>
          {r.name} <span className="w-asc__ed">{LATEST_EDITION}</span>
        </h3>
      </div>
      <p className="w-asc__fig" style={{ "--s": 1, "--len": r.current.length + (exact(r) ? 1 : 0) } as CSSProperties}>
        <span className="w-asc__digits" data-text={r.current}>
          <Wheels text={r.current} from={r.previous} />
        </span>
        {exact(r) && <span className="w-asc__sup">{ordinalSuffix(r.current)}</span>}
      </p>
      <p className="w-asc__move" style={{ "--s": 2 } as CSSProperties}>
        <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
          <path d="M5 1.5 9 8H1z" />
        </svg>
        <span>Up from {band(r.previous)}</span>
      </p>
      <div className="w-asc__mini" style={{ "--s": 3 } as CSSProperties}>
        <AscentChart series={series} variant="mini" ticks={[1, 400, 800, 1200]} />
      </div>
      <div className="w-asc__proof" style={{ "--s": 5 } as CSSProperties}>
        {story.proof}
      </div>
      <Link href={`/rankings/${r.slug}`} className="w-asc__link" style={{ "--s": 6 } as CSSProperties}>
        Open the result<span className="sr-only"> for {r.name}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
        </svg>
      </Link>
    </article>
  );
}

/**
 * "Up in four rankings this year": the four results that rose in the latest editions, as a climb. The room
 * stays the hero's night. An intro sets the claim beside a tally of the eight results, four of them lit.
 * Then, on a wide screen with motion allowed, the stage holds still while the visitor scrolls (AscentMotion):
 * one result at a time, its figure rolls from last year's band to this year's on counter wheels, its five
 * editions draw themselves as gold arches on a ladder of ranks (AscentChart) while gold dust drifts through
 * the light (AscentDust), and the proof of that rise plays beside it; the rail beneath shows the way through
 * and jumps to any of the four. Everywhere else (phones, reduced motion, no script) the four stand as
 * blocks, each with its own small chart drawn to the same scale. Every figure is the published one.
 */
export function Movers() {
  // Only results shown on the public website take part; the section steps aside if none of the movers is public.
  const { rankings: RANKINGS, movers: MOVERS } = siteData();
  if (!MOVERS.length) return null;
  const claim = `Up in ${word(MOVERS.length)} ${MOVERS.length === 1 ? "ranking" : "rankings"}`;
  const others = RANKINGS.filter((r) => !MOVERS.includes(r));
  const stage: ChartSeries[] = MOVERS.map((r) => ({ slug: r.slug, short: r.short, figure: shown(r), history: r.history }));
  const years = MOVERS[0].history.map((h) => h.year);

  return (
    <section className="w-asc w-on-dark" id="ascent" aria-labelledby="movers-title">
      <div className="w-asc__intro w-wrap">
        <Stars sky="field" />
        <h2 id="movers-title" className="w-asc__title">
          <span className="w-asc__lineup" style={{ "--l": 0 } as CSSProperties}>
            <span data-text={claim}>{claim}</span>
          </span>{" "}
          <span className="w-asc__lineup" style={{ "--l": 1 } as CSSProperties}>
            <span data-text="this year">this year</span>
          </span>
        </h2>
        <div className="w-asc__aside">
          <p className="w-asc__lead">
            {word(MOVERS.length)[0].toUpperCase() + word(MOVERS.length).slice(1)} of the {word(RANKINGS.length)} results the
            Office follows rose in the {LATEST_EDITION} editions. Every figure is the rank or band the ranking body published.
          </p>
          <div className="w-asc__tally">
            <ul className="w-asc__arches">
              {[...MOVERS, ...others].map((r, k) => {
                const rose = MOVERS.includes(r);
                return (
                  <li key={r.slug} style={{ "--k": k } as CSSProperties}>
                    <Link href={`/rankings/${r.slug}`} className={`w-asc__arch${rose ? " is-rose" : ""}`}>
                      <span className="w-asc__arch-tip">
                        <b>{r.short}</b> {r.current}
                        {rose && <span className="sr-only">, up from {r.previous}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="w-asc__key" aria-hidden="true">
              <span className="is-rose">Rose in {LATEST_EDITION}</span>
              <span>The other {word(others.length)}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="w-asc__track">
        <div className="w-asc__stage w-wrap">
          <canvas className="w-asc__dust" aria-hidden="true" />
          <span className="w-asc__lamp" aria-hidden="true" />
          <div className="w-asc__blocks">
            {MOVERS.map((r, i) => (
              <Block key={r.slug} r={r} i={i} />
            ))}
          </div>
          <figure className="w-asc__board" aria-hidden="true">
            <figcaption className="w-asc__legend">
              <span className="w-asc__legend-arch">Published band</span>
              <span className="w-asc__legend-dot">Exact rank</span>
              <span>Rank 1 at the top</span>
            </figcaption>
            <AscentChart series={stage} variant="stage" />
          </figure>
          <nav className="w-asc__rail" aria-label={`The ${word(MOVERS.length)} results that rose`}>
            {MOVERS.map((r, i) => (
              <button key={r.slug} type="button" className={`w-asc__stop${i === 0 ? " is-current" : ""}`} data-i={i}>
                <span className="w-asc__fill" aria-hidden="true" />
                <span className="w-asc__dot" style={{ "--fam": FAMILY[r.family].color } as CSSProperties} aria-hidden="true" />
                <span className="w-asc__stop-name">{r.short}</span>
                <span className="w-asc__stop-fig">{shown(r)}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      <table className="sr-only">
        <caption>The {word(MOVERS.length)} results that rose, by edition</caption>
        <thead>
          <tr>
            <th scope="col">Ranking</th>
            {years.map((y) => (
              <th key={y} scope="col">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOVERS.map((r) => (
            <tr key={r.slug}>
              <th scope="row">{r.name}</th>
              {r.history.map((h) => (
                <td key={h.year}>{h.label}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <AscentMotion />
    </section>
  );
}
