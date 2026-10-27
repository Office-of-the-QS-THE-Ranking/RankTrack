"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { DictionaryEntry, Ranking } from "@/lib/data";
import type { Family } from "@/lib/reference";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";

/* One row of the fan: its height and the gap below it, in px (knowledge.css keeps the same). */
const ROW = 52;
const GAP = 8;

/**
 * The indicator dictionary: the terms beside the one open, whose rankings fan out from it, one wire per
 * indicator in the ranking family's colour.
 */
export function Dictionary({
  terms,
  selected,
  onSelect,
  rankings,
  families,
  rankingHref,
}: {
  terms: DictionaryEntry[];
  selected: DictionaryEntry;
  onSelect: (term: string) => void;
  rankings: Ranking[];
  families: Record<string, Family>;
  rankingHref: (slug: string) => string;
}) {
  const rankingOf = (short: string) => rankings.find((r) => r.short === short);
  const colorOf = (short: string) => {
    const r = rankingOf(short);
    return (r && families[r.family]?.color) || "var(--text-3)";
  };
  const links = selected.links;
  const reach = new Set(links.map((l) => l.ranking)).size;
  const h = links.length * ROW + Math.max(0, links.length - 1) * GAP;

  return (
    <div className="kc-dict">
      <Tile id="kc-terms-h" className="kc-terms">
        <h2 id="kc-terms-h" className="sr-only">
          Terms
        </h2>
        <ul className="kc-terms__list">
          {terms.map((t) => {
            const fams = [...new Set(t.links.map((l) => rankingOf(l.ranking)?.family).filter((f): f is string => !!f))];
            const n = new Set(t.links.map((l) => l.ranking)).size;
            return (
              <li key={t.term}>
                <button type="button" className="kc-term" aria-current={t.term === selected.term ? "true" : undefined} onClick={() => onSelect(t.term)}>
                  <span className="kc-term__name">{t.term}</span>
                  <span className="kc-term__dots" aria-hidden="true">
                    {fams.map((f) => (
                      <i key={f} style={{ background: families[f]?.color }} />
                    ))}
                  </span>
                  <span className="kc-term__n" aria-label={`${n} ${n === 1 ? "ranking" : "rankings"}`}>
                    {n}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Tile>

      <Tile id="kc-term-h" className="kc-entry">
        <article key={selected.term} className="kc-entry__doc">
          <header className="kc-entry__head">
            <span className="kc-entry__mono" aria-hidden="true">
              {selected.term.charAt(0)}
            </span>
            <h2 id="kc-term-h" className="kc-entry__term">
              {selected.term}
            </h2>
          </header>
          <p className="kc-entry__def">{selected.definition}</p>

          {links.length ? (
            <div className="kc-fan" style={{ ["--n" as string]: links.length } as CSSProperties}>
              <div className="kc-fan__hub" aria-hidden="true">
                <b>{reach}</b>
                <span>{reach === 1 ? "ranking" : "rankings"}</span>
              </div>
              <svg className="kc-fan__wires" viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden="true">
                {links.map((l, i) => {
                  const y = i * (ROW + GAP) + ROW / 2;
                  return (
                    <path
                      key={l.ranking + l.indicator}
                      d={`M0 ${h / 2} C 55 ${h / 2}, 45 ${y}, 100 ${y}`}
                      pathLength={1}
                      style={{ stroke: colorOf(l.ranking), ["--i" as string]: i } as CSSProperties}
                    />
                  );
                })}
              </svg>
              <ul className="kc-fan__ends" aria-label={`Counts in ${reach} ${reach === 1 ? "ranking" : "rankings"}`}>
                {links.map((l, i) => {
                  const r = rankingOf(l.ranking);
                  const body = (
                    <>
                      <span className="kc-end__text">
                        <b>{l.ranking}</b>
                        <span>{l.indicator}</span>
                      </span>
                      {r && <Icon name="chevron" size={15} className="kc-end__go" />}
                    </>
                  );
                  return (
                    <li key={l.ranking + l.indicator} style={{ ["--i" as string]: i, ["--c" as string]: colorOf(l.ranking) } as CSSProperties}>
                      {r ? (
                        <Link href={rankingHref(r.slug)} className="kc-end">
                          {body}
                        </Link>
                      ) : (
                        <span className="kc-end">{body}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="kc-quiet">Not mapped to a ranking yet.</p>
          )}
        </article>
      </Tile>
    </div>
  );
}
