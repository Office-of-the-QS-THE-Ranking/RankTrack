import Image from "next/image";
import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { LATEST_EDITION } from "@/lib/data";
import { PHOTOS, movement, splitResult } from "@/lib/site";
import { siteData } from "@/lib/governance/server/site";
import { ArchDrawing } from "./ArchDrawing";
import { ArchMotion } from "./ArchMotion";

/** The ticker's order: what rose first, then what held, then the first entry. Only rankings shown publicly run;
 * one without a result yet runs by name alone. */
const TICKER_ORDER = ["qs-sustainability", "wuri", "the-impact", "qs-wur", "the-subject", "qs-subject", "the-wur", "greenmetric"];

const ordinal = (v: string) => {
  if (!/^\d+$/.test(v)) return v;
  const n = +v % 100;
  return v + (n >= 11 && n <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[+v % 10] ?? "th");
};

/** The headline, split by the opening: the half to its left, then the half to its right. */
const HEADLINE: [string, string] = ["Measured", "by the world"];

/**
 * One half of the headline, each letter its own span so the line can rise a letter at a time; `from`
 * carries the count on from the first half. Spaces stay plain text. A digit is set on a counter wheel
 * instead: it stays in the text (transparent, so it is read, copied and indexed), and the wheel beside it,
 * drawn by CSS, spins up from 0 to stop on it, so a year in the headline rolls in.
 */
function Half({ text, from }: { text: string; from: number }) {
  let c = from;
  let wheel = 0;
  return [...text].map((ch, i) => {
    if (ch === " ") return <Fragment key={i}> </Fragment>;
    const style = { "--c": c++ } as CSSProperties;
    return /\d/.test(ch) ? (
      <span key={i} className="w-arch__wheel" style={{ ...style, "--n": +ch, "--w": wheel++ } as CSSProperties}>
        {ch}
      </span>
    ) : (
      <span key={i} className="w-arch__char" style={style}>
        {ch}
      </span>
    );
  });
}

async function TickerItems({ hidden }: { hidden?: boolean }) {
  const site = await siteData();
  const TICKER = TICKER_ORDER.flatMap((slug) => (site.ranking(slug) ? [site.ranking(slug)!] : []));
  return TICKER.map((r) => {
    const { label, value } = splitResult(r.current);
    return (
      <li key={r.slug}>
        <Link href={`/rankings/${r.slug}`} className="w-arch__tick" tabIndex={hidden ? -1 : undefined}>
          {r.current && <span className="w-arch__tick-fig">{ordinal(value)}</span>}
          <span className="w-arch__tick-name">
            {r.short}
            {label ? `, ${label}` : ""}
          </span>
          {r.direction === "up" && (
            <svg className="w-arch__tick-up" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M5 1.5 9 8H1z" />
            </svg>
          )}
          {r.current && <span className="sr-only">. {movement(r)}.</span>}
        </Link>
      </li>
    );
  });
}

/**
 * The arch: the one place the public site steps outside the identity system, at the user's request. A
 * dark room in the header's black. The central bay of the Arch of the Centuries (the gate of the first
 * campus, which every Thomasian passes through twice) draws itself in gold line and lights climb its
 * lines, its opening lights up on the Main Building at dusk, gold dust drifts through the light, the
 * headline is split by the opening, and the eight results run along the ground. Scrolling walks the
 * visitor through it (ArchMotion). The entrance is CSS and waits for the loader; without script or under
 * reduced motion the hero is a still composition.
 */
export async function HomeHero() {
  const results = (await siteData()).rankings.some((r) => r.current);
  return (
    <section className="w-arch" id="hero" aria-labelledby="hero-title">
      <div className="w-arch__stage w-on-dark">
        <h1 id="hero-title" className="w-arch__title">
          <span className="w-arch__half w-arch__half--a">
            <span data-text={HEADLINE[0]}>
              <Half text={HEADLINE[0]} from={0} />
            </span>
          </span>{" "}
          <span className="w-arch__half w-arch__half--b">
            <span data-text={HEADLINE[1]}>
              <Half text={HEADLINE[1]} from={HEADLINE[0].replaceAll(" ", "").length} />
            </span>
          </span>
        </h1>
        <div className="w-arch__foot">
          <p className="w-arch__lead">
            Where Asia&rsquo;s oldest existing university stands in eight global rankings, each result as published.
          </p>
          <p className="w-arch__caption">
            Thomasians pass through the Arch of the Centuries twice: as freshmen, and again at graduation.
          </p>
        </div>
        <div className="w-arch__actions">
          <Link href="/rankings" className="w-btn w-btn--light w-arch__cta">
            {results ? `See the ${LATEST_EDITION} results` : "See the eight rankings"}
          </Link>
          <Link href="/impact" className="w-link">
            Read the impact stories
          </Link>
        </div>
        <div className="w-arch__door">
          {/* data-focus: how far down the photograph the tower stands, kept in the opening */}
          <div className="w-arch__view" data-focus="0.46">
            <span className="w-arch__pan">
              {/* covers the stage with a little bleed and grows as the visitor walks in; on a tall screen the
                  height decides, so the picture is wider than the screen */}
              <Image src={PHOTOS.hero.src} alt={PHOTOS.hero.alt} fill preload sizes="(max-aspect-ratio: 3/2) 165vh, 118vw" />
            </span>
          </div>
          <div className="w-arch__monument">
            <ArchDrawing />
          </div>
        </div>
        {/* the light of the room: the opening's glow, the lantern and the gold dust (ArchDust) */}
        <canvas className="w-arch__dust" aria-hidden="true" />
        <nav className="w-arch__ticker" aria-label={`Where UST stands in the ${LATEST_EDITION} editions`}>
          <div className="w-arch__ticker-track">
            <ul className="w-arch__ticker-list">
              <TickerItems />
            </ul>
            <ul className="w-arch__ticker-list" aria-hidden="true" inert>
              <TickerItems hidden />
            </ul>
          </div>
        </nav>
      </div>
      <ArchMotion />
    </section>
  );
}
