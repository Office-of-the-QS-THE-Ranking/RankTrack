"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { DictionaryEntry, Ranking } from "@/lib/data";
import type { Family } from "@/lib/reference";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";

/**
 * The indicator dictionary: a term index beside its definition and related ranking indicators.
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

  return (
    <div className="kb-dict">
      <Tile id="kb-terms-h" className="kb-terms">
        <header className="kb-terms__head">
          <h2 id="kb-terms-h">Terms</h2>
          <span>{terms.length}</span>
        </header>
        <ul className="kb-terms__list">
          {terms.map((t) => {
            const fams = [...new Set(t.links.map((l) => rankingOf(l.ranking)?.family).filter((f): f is string => !!f))];
            const n = new Set(t.links.map((l) => l.ranking)).size;
            return (
              <li key={t.term}>
                <button type="button" className="kb-term" aria-current={t.term === selected.term ? "true" : undefined} onClick={() => onSelect(t.term)}>
                  <span className="kb-term__name">{t.term}</span>
                  <span className="kb-term__dots" aria-hidden="true">
                    {fams.map((f) => (
                      <i key={f} style={{ background: families[f]?.color }} />
                    ))}
                  </span>
                  <span className="kb-term__n" aria-label={`${n} ${n === 1 ? "ranking" : "rankings"}`}>
                    {n}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Tile>

      <Tile id="kb-term-h" className="kb-entry">
        <article key={selected.term} className="kb-entry__doc">
          <span className="kb-entry__label">Indicator dictionary</span>
          <header className="kb-entry__head">
            <h2 id="kb-term-h" className="kb-entry__term">
              {selected.term}
            </h2>
          </header>
          <p className="kb-entry__def">{selected.definition}</p>

          {links.length ? (
            <div className="kb-mapping">
              <header className="kb-mapping__head">
                <h3>Where it counts</h3>
                <span>{reach} {reach === 1 ? "ranking" : "rankings"}</span>
              </header>
              <ul className="kb-mapping__list" aria-label={`Indicators across ${reach} ${reach === 1 ? "ranking" : "rankings"}`}>
                {links.map((l) => {
                  const r = rankingOf(l.ranking);
                  const body = (
                    <>
                      <span className="kb-end__text">
                        <b>{l.ranking}</b>
                        <span>{l.indicator}</span>
                      </span>
                      {r && <Icon name="chevron" size={15} className="kb-end__go" />}
                    </>
                  );
                  return (
                    <li key={l.ranking + l.indicator} style={{ ["--c" as string]: colorOf(l.ranking) } as CSSProperties}>
                      {r ? (
                        <Link href={rankingHref(r.slug)} className="kb-end">
                          {body}
                        </Link>
                      ) : (
                        <span className="kb-end">{body}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="kb-quiet">Not mapped to a ranking yet.</p>
          )}
        </article>
      </Tile>
    </div>
  );
}
