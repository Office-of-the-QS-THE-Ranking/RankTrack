"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabPanel } from "@/components/ui/interactive";
import { Icon } from "@/components/ui/Icon";
import { EMPTY_FILTERS, NewsFilters, publicationDay, type PublicationFilters } from "./NewsFilters";
import { SearchField } from "@/components/ui/search-field";
import { useViews } from "@/components/reference/ReferenceProvider";
import { ArticleCard } from "./ArticleCard";
import type { StoryCard } from "./cards";

const ALL = "All";

/**
 * The published stories as a newsroom. Unfiltered, it reads like a front page: the newest story leads, the
 * next three follow, and older ones fall into an archive by year. A theme, a goal or a search turns it into
 * a plain grid of matches. Filters live in the address (theme, SDG and publication date) so a story's page can link into them.
 */
export function Newsroom({ cards, theme: initialTheme, sdgs: initialSdgs = [], publication = {} }: { cards: StoryCard[]; theme?: string; sdgs?: number[]; publication?: Partial<PublicationFilters> }) {
  const { storyThemes, sdgNames } = useViews();
  const themes = useMemo(() => storyThemes.filter((t) => cards.some((c) => c.themes.includes(t))), [storyThemes, cards]);
  const publicationYears = useMemo(() => [...new Set(cards.map((c) => publicationDay(c.date).slice(0, 4)))].sort().reverse(), [cards]);
  const [theme, setTheme] = useState(initialTheme && themes.includes(initialTheme) ? initialTheme : ALL);
  const [filters, setFilters] = useState<PublicationFilters>({ ...EMPTY_FILTERS, ...publication, sdgs: initialSdgs.filter((n) => Number.isInteger(n) && n >= 1 && n <= 17) });
  const [filterOpen, setFilterOpen] = useState(false);
  const { sdgs, year, from, to } = filters;
  const filterCount = sdgs.length + Number(!!year || !!from || !!to);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (theme === ALL) url.searchParams.delete("theme");
    else url.searchParams.set("theme", theme);
    if (sdgs.length) url.searchParams.set("sdg", sdgs.join(","));
    else url.searchParams.delete("sdg");
    for (const [key, value] of Object.entries({ year, from, to })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [theme, sdgs, year, from, to]);

  const q = query.trim().toLowerCase();
  const shown = cards.filter(
    (c) =>
      (theme === ALL || c.themes.includes(theme)) &&
      (!sdgs.length || sdgs.some((goal) => c.sdgs.includes(goal))) &&
      (!year || publicationDay(c.date).startsWith(year)) &&
      (!from || publicationDay(c.date) >= from) &&
      (!to || publicationDay(c.date) <= to) &&
      (!q || [c.title, c.dek, c.unit, c.section, ...c.themes, ...c.sdgs.map((n) => `sdg ${n} ${sdgNames[n] ?? ""}`)].join(" ").toLowerCase().includes(q)),
  );
  const filtered = theme !== ALL || filterCount > 0 || !!q;
  const filterTags = [
    ...sdgs.map((goal) => ({ key: `sdg-${goal}`, label: `SDG ${goal}: ${sdgNames[goal]}`, remove: () => setFilters((current) => ({ ...current, sdgs: current.sdgs.filter((n) => n !== goal) })) })),
    ...(year ? [{ key: "year", label: `Year: ${year}`, remove: () => setFilters((current) => ({ ...current, year: "" })) }] : []),
    ...(from ? [{ key: "from", label: `From: ${from}`, remove: () => setFilters((current) => ({ ...current, from: "" })) }] : []),
    ...(to ? [{ key: "to", label: `Through: ${to}`, remove: () => setFilters((current) => ({ ...current, to: "" })) }] : []),
  ];
  const tabs = [{ key: ALL, label: "All stories", count: cards.length }, ...themes.map((t) => ({ key: t, label: t, count: cards.filter((c) => c.themes.includes(t)).length }))];

  if (!cards.length)
    return (
      <div className="w-news__empty" data-reveal>
        <p className="w-lead">No stories are published yet.</p>
        <p>Each one appears here once it passes the Office&rsquo;s publication review.</p>
      </div>
    );

  const [lead, ...rest] = shown;
  const latest = rest.slice(0, 3);
  const older = rest.slice(3);
  const years = [...new Set(older.map((c) => c.date.slice(0, 4)))];

  return (
    <div className="w-news">
      <div className="w-news__bar">
        <Tabs
          tabs={tabs}
          value={theme}
          onChange={setTheme}
          label="Themes"
          idBase="news-themes"
          actions={
            <button type="button" className="content-tabs__action" aria-haspopup="dialog" aria-expanded={filterOpen} onClick={() => setFilterOpen(true)}>
              <Icon name="filter" size={16} /> Filters{filterCount > 0 && ` (${filterCount})`}
            </button>
          }
          search={<SearchField value={query} onChange={setQuery} placeholder="Search stories" label="Search stories" examples={["flood warning", "SDG 3", "solar"]} shortcuts />}
        />
      </div>

      {filterOpen && <NewsFilters value={filters} years={publicationYears} onApply={setFilters} onClose={() => setFilterOpen(false)} />}

      <TabPanel idBase="news-themes" index={Math.max(0, tabs.findIndex((t) => t.key === theme))} className="w-news__panel">
        {filtered && (
          <div className="w-news__results">
            <p className="w-news__count" role="status">{shown.length === 1 ? "One story" : `${shown.length} stories`}</p>
            {filterTags.length > 0 && (
              <ul className="w-news__filter-tags" aria-label="Applied filters">
                {filterTags.map((tag) => (
                  <li key={tag.key}>
                    <button type="button" className="w-news__filter-tag" aria-label={`Remove ${tag.label} filter`} onClick={tag.remove}>
                      <span>{tag.label}</span><Icon name="close" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!shown.length ? (
          <div className="w-news__empty">
            <p className="w-lead">No stories match.</p>
            <button
              type="button"
              className="w-link w-news__clear"
              onClick={() => {
                setTheme(ALL);
                setFilters({ ...EMPTY_FILTERS });
                setQuery("");
              }}
            >
              Show every story
            </button>
          </div>
        ) : filtered ? (
          <>
            <ul className="w-news__grid">
              {shown.map((c, i) => (
                <li key={c.slug} data-reveal style={{ ["--d" as string]: `${(i % 3) * 70}ms` }}>
                  <ArticleCard card={c} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="w-news__lead" data-reveal>
              <ArticleCard card={lead} variant="lead" headingLevel={2} priority />
            </div>

            {latest.length > 0 && (
              <section className="w-news__latest" aria-labelledby="news-latest">
                <h2 id="news-latest" className="w-news__head" data-reveal>
                  Latest
                </h2>
                <ul className="w-news__grid">
                  {latest.map((c, i) => (
                    <li key={c.slug} data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
                      <ArticleCard card={c} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {older.length > 0 && (
              <section className="w-news__archive" aria-labelledby="news-archive">
                <h2 id="news-archive" className="w-news__head" data-reveal>
                  Archive
                </h2>
                {years.map((y) => (
                  <div key={y} className="w-news__year">
                    <h3 className="w-news__yearhead w-figure" data-reveal>
                      {y}
                    </h3>
                    <ul className="w-news__rows">
                      {older
                        .filter((c) => c.date.startsWith(y))
                        .map((c) => (
                          <li key={c.slug} data-reveal>
                            <ArticleCard card={c} variant="row" />
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </TabPanel>
    </div>
  );
}
