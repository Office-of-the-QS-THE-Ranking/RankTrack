"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { readerLink } from "@/lib/governance/documents";
import type { DocumentView } from "@/lib/governance/hub-types";
import { documentPublicPath } from "@/lib/publications";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon } from "@/components/ui/Icon";
import { Tabs, TabPanel } from "@/components/ui/interactive";
import { SearchField } from "@/components/ui/search-field";
import { DocCover } from "./DocCover";
import { fileLabel, issuedMonth } from "./doc-format";

const ALL = "All";

/**
 * Reports as a shelf of covers. Unfiltered, the featured report (or the newest) stands open beside its summary;
 * the rest line up by date. A type or a search narrows the shelf.
 */
export function ReportShelf({ reports }: { reports: DocumentView[] }) {
  const { insightTypes } = useViews();
  // The reference list's order first, then any type it doesn't list.
  const types = useMemo(() => [...new Set([...insightTypes, ...reports.map((r) => r.type)])].filter((t) => reports.some((r) => r.type === t)), [insightTypes, reports]);
  const [type, setType] = useState(ALL);
  const [query, setQuery] = useState("");

  if (!reports.length)
    return (
      <div className="w-news__empty" data-reveal>
        <p className="w-lead">No reports are published yet.</p>
        <p>Each one appears here once the Office releases it.</p>
      </div>
    );

  const q = query.trim().toLowerCase();
  const shown = reports.filter(
    (r) => (type === ALL || r.type === type) && (!q || [r.title, r.type, r.venue, r.abstract, r.unit ?? "", ...r.authors, ...r.keywords].join(" ").toLowerCase().includes(q)),
  );
  const filtered = type !== ALL || !!q;
  const lead = filtered ? null : (shown.find((r) => r.featured) ?? shown[0]);
  const rest = shown.filter((r) => r !== lead);
  const tabs = [{ key: ALL, label: "All reports", count: reports.length }, ...types.map((t) => ({ key: t, label: t, count: reports.filter((r) => r.type === t).length }))];

  return (
    <div className="w-news">
      <div className="w-news__bar">
        <Tabs
          tabs={tabs}
          value={type}
          onChange={setType}
          label="Report types"
          idBase="report-types"
          search={<SearchField value={query} onChange={setQuery} placeholder="Search reports" label="Search reports" examples={["annual report", "sustainability", "QS"]} shortcuts />}
        />
      </div>

      <TabPanel idBase="report-types" index={Math.max(0, tabs.findIndex((t) => t.key === type))} className="w-news__panel">
        {!shown.length ? (
          <div className="w-news__empty">
            <p className="w-lead">No reports match.</p>
            <button
              type="button"
              className="w-link w-news__clear"
              onClick={() => {
                setType(ALL);
                setQuery("");
              }}
            >
              Show every report
            </button>
          </div>
        ) : (
          <>
            {lead && <LeadReport report={lead} />}
            {filtered && (
              <p className="w-news__count" aria-live="polite">
                {shown.length === 1 ? "One report" : `${shown.length} reports`}
              </p>
            )}
            {rest.length > 0 && (
              <section className={lead ? "w-shelf w-shelf--after" : "w-shelf"} aria-labelledby={lead ? "shelf-title" : undefined}>
                {lead && (
                  <h2 id="shelf-title" className="w-news__head" data-reveal>
                    More reports
                  </h2>
                )}
                <ul className="w-shelf__grid">
                  {rest.map((r, i) => (
                    <li key={r.id} data-reveal style={{ "--d": `${(i % 4) * 60}ms` } as CSSProperties}>
                      <ReportCard report={r} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </TabPanel>
    </div>
  );
}

function LeadReport({ report: r }: { report: DocumentView }) {
  const href = documentPublicPath(r.kind, r.slug);
  const read = readerLink(r);
  return (
    <article className="w-replead" data-reveal aria-labelledby={`lead-${r.id}`}>
      <Link href={href} className="w-replead__cover" tabIndex={-1} aria-hidden="true">
        <DocCover title={r.title} type={r.type} year={r.issued.slice(0, 4)} size="lg" />
      </Link>
      <div className="w-replead__text">
        <p className="w-paper__kicker">
          <span className="w-paperlead__flag">{r.featured ? "Featured" : "Latest"}</span>
          {r.type}
          <span aria-hidden="true"> · </span>
          <time dateTime={r.issued}>{issuedMonth(r.issued)}</time>
        </p>
        <h2 id={`lead-${r.id}`} className="w-replead__title">
          <Link href={href}>{r.title}</Link>
        </h2>
        {r.abstract && <p className="w-replead__summary">{r.abstract}</p>}
        <div className="w-paper__acts">
          {r.file && (
            <a className="w-docbtn w-docbtn--ink" href={r.file.src} download={r.file.name}>
              <Icon name="download" size={15} />
              {fileLabel(r.file)}
            </a>
          )}
          {read && (
            <a className="w-docbtn" href={read} target="_blank" rel="noopener noreferrer">
              Read online
              <Icon name="arrow-up-right" size={15} />
            </a>
          )}
          <Link className="w-link w-replead__more" href={href}>
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}

function ReportCard({ report: r }: { report: DocumentView }) {
  return (
    <Link href={documentPublicPath(r.kind, r.slug)} className="w-rcard">
      <DocCover title={r.title} type={r.type} year={r.issued.slice(0, 4)} size="sm" />
      <span className="w-rcard__text">
        <span className="w-rcard__kicker">
          {r.type} · <time dateTime={r.issued}>{issuedMonth(r.issued)}</time>
        </span>
        <span className="w-rcard__title">{r.title}</span>
        {r.file && (
          <span className="w-rcard__file">
            <Icon name="download" size={13} /> {fileLabel(r.file)}
          </span>
        )}
      </span>
    </Link>
  );
}
