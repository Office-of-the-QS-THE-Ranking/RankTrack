"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { type DictionaryEntry, type FamilyKey } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { useViews } from "@/components/reference/ReferenceProvider";

/** Search one term and see every ranking it touches. Opens on ?q= from links elsewhere on the site. */
export function Dictionary({ entries: DICTIONARY, rankings: RANKINGS }: { entries: DictionaryEntry[]; rankings: { short: string; family: FamilyKey }[] }) {
  const { families } = useViews();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => {
    const next = params.get("q");
    if (next !== null) setQ(next);
  }, [params]);

  const term = q.trim().toLowerCase();
  const hits = DICTIONARY.filter(
    (d) =>
      !term ||
      d.term.toLowerCase().includes(term) ||
      d.definition.toLowerCase().includes(term) ||
      d.links.some((l) => `${l.ranking} ${l.indicator}`.toLowerCase().includes(term)),
  );

  return (
    <div className="w-dict">
      <label className="w-search">
        <Icon name="search" size={22} />
        <span className="sr-only">Search the indicator dictionary</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try citations, water or employer" autoComplete="off" />
        {q && (
          <button type="button" className="w-search__clear" onClick={() => setQ("")}>
            Clear
          </button>
        )}
      </label>
      <p className="w-dict__count" aria-live="polite">
        {hits.length} {hits.length === 1 ? "entry" : "entries"}
        {term && ` for “${q.trim()}”`}
      </p>
      {hits.length ? (
        <ul className="w-dict__list">
          {hits.map((d) => (
            <li key={d.term} className="w-dict__item">
              <h3 className="w-dict__term">{d.term}</h3>
              <p className="w-dict__def">{d.definition}</p>
              <ul className="w-dict__links">
                {d.links.map((l) => {
                  const r = RANKINGS.find((x) => x.short === l.ranking);
                  return (
                    <li key={l.ranking + l.indicator}>
                      <i className="w-dot" style={{ background: r ? families[r.family].color : "var(--gold)" } as CSSProperties} aria-hidden="true" />
                      <b>{l.ranking}</b> {l.indicator}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="w-dict__none">Nothing for “{q.trim()}”. Check the spelling, or try a broader term such as research or students.</p>
      )}
    </div>
  );
}
