"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLICATION_SECTIONS, PUBLICATIONS_LABEL, publicationsPath, sectionLabel, type PublicationSection } from "@/lib/publications";

/**
 * The top of each Publications page: the section's name under "Publications", one line about it, and the three
 * sections as a numbered index, each with how many it holds. Mounted in the shared layout so switching
 * sections keeps the navigation and its space on the page while the server renders the new content.
 */
export type PublicationMastheadData = Record<PublicationSection, { count: number; lead: string; latest?: string }>;

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" });

export function PublicationsMasthead({ sections }: { sections: PublicationMastheadData }) {
  const pathname = usePathname();
  const section = PUBLICATION_SECTIONS.find((s) => publicationsPath(s.key) === pathname)?.key;
  // Individual stories and documents supply their own article header.
  if (!section) return null;
  const { lead, latest } = sections[section];
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
          {latest && <p className="w-masthead__note">{section === "stories" ? "Updated" : "Latest"} <time dateTime={latest}>{DATE.format(new Date(latest))}</time></p>}
        </div>
      </section>

      <nav className="w-pubnav w-wrap" aria-label={PUBLICATIONS_LABEL}>
        <ol className="w-pubnav__list">
          {PUBLICATION_SECTIONS.map((s, i) => {
            const here = s.key === section;
            return (
              <li key={s.key}>
                <Link href={publicationsPath(s.key)} scroll={false} prefetch={true} className="w-pubnav__link" aria-current={here ? "page" : undefined}>
                  <span className="w-pubnav__no" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="w-pubnav__label">{s.label}</span>
                  <span className="w-pubnav__count">
                    <span className="sr-only">, </span>
                    {sections[s.key].count}
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
