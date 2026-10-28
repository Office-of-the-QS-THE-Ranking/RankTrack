import Link from "next/link";
import type { CSSProperties } from "react";
import { citation, docParagraphs, doiUrl, readerLink } from "@/lib/governance/documents";
import type { DocumentView } from "@/lib/governance/hub-types";
import { documentPublicPath, PUBLICATIONS_LABEL, publicationsPath, SECTION_OF, sectionLabel } from "@/lib/publications";
import { serverViews } from "@/lib/governance/server/views";
import { Icon } from "@/components/ui/Icon";
import { CiteButton } from "./CiteButton";
import { DocCover } from "./DocCover";
import { byline, fileLabel, issuedDay, issuedMonth } from "./doc-format";

/**
 * One research article or report. An article reads like a journal's landing page: the title, the authors, every way
 * to read it, the abstract and how to cite it. A report stands its cover beside the title and leads with the download.
 */
export async function DocumentDetail({ doc, more }: { doc: DocumentView; more: DocumentView[] }) {
  const { sdgIcons, sdgNames } = await serverViews();
  const section = SECTION_OF[doc.kind];
  const read = readerLink(doc);
  const report = doc.kind === "report";
  const cite = citation(doc);
  const year = doc.issued.slice(0, 4);

  const actions = (
    <div className="w-paper__acts w-doc__acts">
      {report && doc.file && (
        <a className="w-docbtn w-docbtn--ink w-docbtn--lg" href={doc.file.src} download={doc.file.name}>
          <Icon name="download" size={17} />
          Download {fileLabel(doc.file)}
        </a>
      )}
      {read && (
        <a className={`w-docbtn w-docbtn--lg${report && doc.file ? "" : " w-docbtn--ink"}`} href={read} target="_blank" rel="noopener noreferrer">
          {report ? "Read online" : doc.doi ? "Read at the publisher" : "Read the article"}
          <Icon name="arrow-up-right" size={17} />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {!report && doc.file && (
        <a className="w-docbtn w-docbtn--lg" href={doc.file.src} download={doc.file.name}>
          <Icon name="download" size={17} />
          {fileLabel(doc.file)}
        </a>
      )}
      <CiteButton text={cite} className="w-docbtn w-docbtn--lg" />
    </div>
  );

  return (
    <article className={`w-doc w-doc--${doc.kind}`}>
      <header className={`w-doc__head w-wrap${report ? " w-doc__head--cover" : ""}`}>
        <div className="w-doc__headtext">
          <nav className="w-article__crumbs" aria-label="Breadcrumb">
            <Link href={publicationsPath("stories")}>{PUBLICATIONS_LABEL}</Link>
            <Icon name="chevron" size={14} />
            <Link href={publicationsPath(section)}>{sectionLabel(section)}</Link>
          </nav>
          <p className="w-paper__kicker w-doc__kicker">
            {doc.type}
            {doc.venue && (
              <>
                <span aria-hidden="true"> · </span>
                <i>{doc.venue}</i>
              </>
            )}
          </p>
          <h1 className="w-doc__title w-display">{doc.title}</h1>
          {doc.authors.length > 0 && (
            <p className="w-doc__authors">
              {report ? "Prepared by " : ""}
              {byline(doc.authors, 12)}
            </p>
          )}
          <dl className="w-doc__facts">
            <div>
              <dt>Published</dt>
              <dd>
                <time dateTime={doc.issued}>{report ? issuedMonth(doc.issued) : issuedDay(doc.issued)}</time>
              </dd>
            </div>
            {doc.unit && (
              <div>
                <dt>Unit</dt>
                <dd>{doc.unit}</dd>
              </div>
            )}
            {doc.doi && (
              <div>
                <dt>DOI</dt>
                <dd>
                  <a href={doiUrl(doc.doi)} className="w-link w-doc__doi" target="_blank" rel="noopener noreferrer">
                    {doc.doi}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          {actions}
        </div>
        {report && (
          <div className="w-doc__cover" data-reveal>
            <DocCover tone={doc.coverTone} title={doc.title} type={doc.type} year={year} size="lg" />
          </div>
        )}
      </header>

      <div className="w-doc__main w-wrap">
        <section className="w-doc__abstract" aria-labelledby="abstract-title">
          <h2 id="abstract-title" className="w-doc__label">
            {report ? "Summary" : "Abstract"}
          </h2>
          <div className="w-post__body">
            {docParagraphs(doc.abstract).map((p, i) => (
              <p key={i} className={i === 0 ? "w-post__first" : undefined}>
                {p}
              </p>
            ))}
          </div>
        </section>

        <aside className="w-doc__aside" aria-label="About this publication">
          <section className="w-doc__cite">
            <h2 className="w-doc__label">Cite</h2>
            <p className="w-doc__citetext">{cite}</p>
            <CiteButton text={cite} className="w-docbtn w-docbtn--sm" label="Copy" />
          </section>
          {doc.keywords.length > 0 && (
            <section>
              <h2 className="w-doc__label">Keywords</h2>
              <ul className="w-doc__keys">
                {doc.keywords.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </section>
          )}
          {doc.sdgs.length > 0 && (
            <section>
              <h2 className="w-doc__label">Sustainable Development Goals</h2>
              <ul className="w-doc__sdgs">
                {doc.sdgs.map((n) => (
                  <li key={n}>
                    {sdgIcons[n] ? <img src={sdgIcons[n]} alt={`SDG ${n}: ${sdgNames[n] ?? ""}`} width={64} height={64} loading="lazy" /> : `SDG ${n}`}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {more.length > 0 && (
        <section className="w-band w-band--stone w-article__more" aria-labelledby="more-title">
          <div className="w-wrap">
            <div className="w-article__morehead">
              <h2 id="more-title" className="w-head" data-reveal>
                {report ? "More reports" : "More research"}
              </h2>
              <Link href={publicationsPath(section)} className="w-link" data-reveal>
                All {report ? "reports" : "articles"} <Icon name="arrow" size={16} />
              </Link>
            </div>
            {report ? (
              <ul className="w-shelf__grid">
                {more.map((r, i) => (
                  <li key={r.id} data-reveal style={{ "--d": `${i * 60}ms` } as CSSProperties}>
                    <Link href={documentPublicPath(r.kind, r.slug)} className="w-rcard">
                      <DocCover tone={r.coverTone} title={r.title} type={r.type} year={r.issued.slice(0, 4)} size="sm" />
                      <span className="w-rcard__text">
                        <span className="w-rcard__kicker">
                          {r.type} · <time dateTime={r.issued}>{issuedMonth(r.issued)}</time>
                        </span>
                        <span className="w-rcard__title">{r.title}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="w-doc__morelist">
                {more.map((a, i) => (
                  <li key={a.id} data-reveal style={{ "--d": `${i * 60}ms` } as CSSProperties}>
                    <Link href={documentPublicPath(a.kind, a.slug)} className="w-docmore">
                      <span className="w-paper__kicker">
                        {a.type} · {a.issued.slice(0, 4)}
                      </span>
                      <span className="w-docmore__title">{a.title}</span>
                      <span className="w-docmore__by">{byline(a.authors, 3)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </article>
  );
}

/** Up to three others of the same kind: the closest by shared SDGs, unit and type, then the newest. */
export function relatedDocuments(doc: DocumentView, all: DocumentView[]) {
  const score = (o: DocumentView) => o.sdgs.filter((n) => doc.sdgs.includes(n)).length * 2 + (o.unitSlug && o.unitSlug === doc.unitSlug ? 2 : 0) + (o.type === doc.type ? 1 : 0);
  return all
    .filter((o) => o.id !== doc.id)
    .sort((a, b) => score(b) - score(a) || b.issued.localeCompare(a.issued))
    .slice(0, 3);
}
