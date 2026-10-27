import Link from "next/link";
import type { ReactNode } from "react";
import { PUBLICATION_SECTIONS, PUBLICATIONS_LABEL, publicationsPath, sectionLabel, type PublicationSection } from "@/lib/publications";
import { siteData } from "@/lib/governance/server/site";

/**
 * The top of each Publications page: the section's name under "Publications", one line about it, and the three
 * sections as a numbered index, each with how many it holds. The index is navigation between pages, so it is links.
 */
export async function PublicationsMasthead({ section, lead, note }: { section: PublicationSection; lead: string; note?: ReactNode }) {
  const site = await siteData();
  const counts: Record<PublicationSection, number> = { stories: site.stories.length, research: site.articles.length, reports: site.reports.length };
  return (
    <>
      <section className="w-masthead w-pubhead w-wrap" aria-labelledby="page-title">
        <div className="w-pubhead__title">
          <p className="w-pubhead__eyebrow">
            <span className="w-dot" aria-hidden="true" />
            {PUBLICATIONS_LABEL}
          </p>
          <h1 id="page-title" className="w-masthead__title w-display">
            {sectionLabel(section)}
          </h1>
        </div>
        <div className="w-masthead__aside">
          <p className="w-lead">{lead}</p>
          {note && <p className="w-masthead__note">{note}</p>}
        </div>
      </section>

      <nav className="w-pubnav w-wrap" aria-label={PUBLICATIONS_LABEL}>
        <ol className="w-pubnav__list">
          {PUBLICATION_SECTIONS.map((s, i) => {
            const here = s.key === section;
            return (
              <li key={s.key}>
                <Link href={publicationsPath(s.key)} className="w-pubnav__link" aria-current={here ? "page" : undefined}>
                  <span className="w-pubnav__no" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="w-pubnav__label">{s.label}</span>
                  <span className="w-pubnav__count">
                    <span className="sr-only">, </span>
                    {counts[s.key]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
