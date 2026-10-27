"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { citation, readerLink } from "@/lib/governance/documents";
import type { DocumentView } from "@/lib/governance/hub-types";
import { documentPublicPath } from "@/lib/publications";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon } from "@/components/ui/Icon";
import { Tabs, TabPanel } from "@/components/ui/interactive";
import { SearchField } from "@/components/ui/search-field";
import { CiteButton } from "./CiteButton";
import { byline, fileLabel, issuedDayMonth } from "./doc-format";

const ALL = "All";

/**
 * Research articles as a journal's contents page. Unfiltered, the featured article (or the newest) leads and the
 * rest follow by year; a type or a search turns it into one list of matches.
 */
export function ResearchList({ articles }: { articles: DocumentView[] }) {
  const { articleTypes, sdgNames } = useViews();
  // The reference list's order first, then any type it doesn't list.
  const types = useMemo(() => [...new Set([...articleTypes, ...articles.map((a) => a.type)])].filter((t) => articles.some((a) => a.type === t)), [articleTypes, articles]);
  const [type, setType] = useState(ALL);
  const [query, setQuery] = useState("");

  if (!articles.length)
    return (
      <div className="w-news__empty" data-reveal>
        <p className="w-lead">No articles are published yet.</p>
        <p>Each one appears here once the Office adds it.</p>
      </div>
    );

  const q = query.trim().toLowerCase();
  const shown = articles.filter(
    (a) =>
      (type === ALL || a.type === type) &&
      (!q || [a.title, a.venue, a.type, a.unit ?? "", a.doi ?? "", ...a.authors, ...a.keywords, ...a.sdgs.map((n) => `sdg ${n} ${sdgNames[n] ?? ""}`)].join(" ").toLowerCase().includes(q)),
  );
  const filtered = type !== ALL || !!q;
  const lead = filtered ? null : (shown.find((a) => a.featured) ?? shown[0]);
  const rest = shown.filter((a) => a !== lead);
  const years = [...new Set(rest.map((a) => a.issued.slice(0, 4)))];
  const tabs = [{ key: ALL, label: "All articles", count: articles.length }, ...types.map((t) => ({ key: t, label: t, count: articles.filter((a) => a.type === t).length }))];

  return (
    <div className="w-news">
      <div className="w-news__bar">
        <Tabs
          tabs={tabs}
          value={type}
          onChange={setType}
          label="Article types"
          idBase="research-types"
          search={<SearchField value={query} onChange={setQuery} placeholder="Search articles" label="Search articles" examples={["author name", "journal", "SDG 6"]} shortcuts />}
        />
      </div>

      <TabPanel idBase="research-types" index={Math.max(0, tabs.findIndex((t) => t.key === type))} className="w-news__panel">
        {!shown.length ? (
          <div className="w-news__empty">
            <p className="w-lead">No articles match.</p>
            <button
              type="button"
              className="w-link w-news__clear"
              onClick={() => {
                setType(ALL);
                setQuery("");
              }}
            >
              Show every article
            </button>
          </div>
        ) : (
          <>
            {lead && <LeadArticle article={lead} />}
            {filtered && (
              <p className="w-news__count" aria-live="polite">
                {shown.length === 1 ? "One article" : `${shown.length} articles`}
              </p>
            )}
            <div className={lead ? "w-papers w-papers--after" : "w-papers"}>
              {years.map((y) => (
                <section key={y} className="w-news__year" aria-labelledby={`papers-${y}`}>
                  <h2 id={`papers-${y}`} className="w-news__yearhead w-figure" data-reveal>
                    {y}
                  </h2>
                  <ul className="w-papers__list">
                    {rest
                      .filter((a) => a.issued.startsWith(y))
                      .map((a, i) => (
                        <li key={a.id} data-reveal style={{ "--d": `${Math.min(i, 4) * 50}ms` } as CSSProperties}>
                          <PaperRow article={a} />
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </TabPanel>
    </div>
  );
}

/** The featured article: a stone panel with the title large, the abstract beside it and every way to read it. */
function LeadArticle({ article: a }: { article: DocumentView }) {
  const read = readerLink(a);
  const href = documentPublicPath(a.kind, a.slug);
  return (
    <article className="w-paperlead" data-reveal aria-labelledby={`lead-${a.id}`}>
      <div className="w-paperlead__main">
        <p className="w-paper__kicker">
          <span className="w-paperlead__flag">{a.featured ? "Featured" : "Latest"}</span>
          {a.type}
          {a.venue && (
            <>
              <span aria-hidden="true"> · </span>
              <i>{a.venue}</i>
            </>
          )}
        </p>
        <h2 id={`lead-${a.id}`} className="w-paperlead__title">
          <Link href={href}>{a.title}</Link>
        </h2>
        <p className="w-paperlead__authors">{byline(a.authors, 6)}</p>
      </div>
      <div className="w-paperlead__side">
        {a.abstract && <p className="w-paperlead__abstract">{a.abstract}</p>}
        <PaperActions article={a} read={read} />
      </div>
    </article>
  );
}

function PaperRow({ article: a }: { article: DocumentView }) {
  const { sdgColors, sdgNames } = useViews();
  const href = documentPublicPath(a.kind, a.slug);
  return (
    <article className="w-paper">
      <time className="w-paper__when" dateTime={a.issued}>
        {issuedDayMonth(a.issued)}
      </time>
      <div className="w-paper__body">
        <p className="w-paper__kicker">
          {a.type}
          {a.venue && (
            <>
              <span aria-hidden="true"> · </span>
              <i>{a.venue}</i>
            </>
          )}
        </p>
        <h3 className="w-paper__title">
          <Link href={href}>{a.title}</Link>
        </h3>
        <p className="w-paper__authors">{byline(a.authors)}</p>
        {(a.unit || a.sdgs.length > 0) && (
          <p className="w-paper__meta">
            {a.unit && <span className="w-paper__unit">{a.unit}</span>}
            {a.sdgs.length > 0 && (
              <span className="w-paper__sdgs" aria-label={`SDG ${a.sdgs.join(", ")}`}>
                {a.sdgs.map((n) => (
                  <i key={n} title={`SDG ${n}: ${sdgNames[n] ?? ""}`} style={{ background: sdgColors[n] }}>
                    {n}
                  </i>
                ))}
              </span>
            )}
          </p>
        )}
      </div>
      <PaperActions article={a} read={readerLink(a)} compact />
    </article>
  );
}

/** Read it at the publisher, download the PDF, or copy its citation. */
function PaperActions({ article: a, read, compact }: { article: DocumentView; read: string | null; compact?: boolean }) {
  return (
    <div className={`w-paper__acts${compact ? " w-paper__acts--compact" : ""}`}>
      {read && (
        <a className="w-docbtn w-docbtn--ink" href={read} target="_blank" rel="noopener noreferrer">
          {a.doi ? "DOI" : "Read"}
          <Icon name="arrow-up-right" size={15} />
          <span className="sr-only"> (opens the publisher’s page)</span>
        </a>
      )}
      {a.file && (
        <a className="w-docbtn" href={a.file.src} download={a.file.name}>
          <Icon name="download" size={15} />
          {compact ? "PDF" : fileLabel(a.file)}
        </a>
      )}
      <CiteButton text={citation(a)} />
    </div>
  );
}
