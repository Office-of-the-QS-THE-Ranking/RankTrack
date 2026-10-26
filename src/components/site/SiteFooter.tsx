import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/Icon";
import credits from "@/lib/credits.json";
import { formatAsOf } from "@/lib/data";
import { siteData, type SiteData } from "@/lib/governance/server/site";
import { UNIT, UNIVERSITY } from "./Lockup";
import { Stars } from "./Stars";
import { OFFICE } from "@/lib/office";

type Credit = { file: string; title: string; creator: string; license: string; page: string };

/* The footer lists only what the public website currently shows (System Configuration). */
const columns = (site: SiteData) => [
  { id: "ft-rk", label: "Rankings", links: site.rankings.map((r) => ({ href: `/rankings/${r.slug}`, label: r.short })) },
  {
    id: "ft-ex",
    label: "Explore",
    links: [
      { href: "/rankings", label: "All rankings" },
      ...(site.features.impact ? [{ href: "/impact", label: "Impact and innovation" }] : []),
      ...(site.features.recognition ? [{ href: "/recognition", label: "Recognition" }] : []),
      ...(site.features.knowledge ? [{ href: "/knowledge", label: "Knowledge center" }] : []),
      { href: "/about", label: "About the Office" },
      { href: "/signin", label: "Sign in to contribute" },
    ],
  },
  {
    id: "ft-po",
    label: "Policies",
    links: [
      { href: "/about#privacy", label: "Data privacy statement" },
      { href: "/about#accessibility", label: "Accessibility" },
      { href: "/about#disclaimer", label: "Methodology disclaimer" },
      { href: "/about#governance", label: "Data governance" },
    ],
  },
];

/**
 * The close of every page, in the header's night: the Office's address set as the last heading, the
 * site's links filed like the header's panels, and the unit mark built large as the signature, with the
 * reverse seal the manual requires on a dark ground.
 */
export async function SiteFooter() {
  const site = await siteData();
  const year = site.asOf.slice(0, 4);
  const COLUMNS = columns(site).filter((c) => c.links.length);
  return (
    <footer className="w-footer">
      <div className="w-footer__panel w-on-dark">
        <Stars sky="field" />
        <div className="w-footer__in w-wrap">
          <div className="w-footer__top">
            <div className="w-footer__ask">
              <h2 className="w-footer__title" data-reveal>
                Write to the Office
              </h2>
              <address className="w-footer__contact">
                <a href="mailto:rankings.office@ust.edu.ph" className="w-footer__email" data-reveal style={{ "--d": "70ms" } as CSSProperties}>
                  rankings.office@ust.edu.ph
                </a>
                <span className="w-footer__address" data-reveal style={{ "--d": "140ms" } as CSSProperties}>
                  {OFFICE.name}
                  <br />
                  {OFFICE.location}
                  <br />
                  {OFFICE.landmark}
                  <br />
                  {OFFICE.phone}
                  <br />
                  {UNIVERSITY}
                  <br />
                  España Boulevard, Sampaloc
                  <br />
                  Manila 1008, Philippines
                </span>
              </address>
            </div>

            <div className="w-mlists w-footer__cols">
              {COLUMNS.map((col, ci) => (
                <nav key={col.id} aria-labelledby={col.id} className="w-mgroup" data-reveal style={{ "--d": `${ci * 70}ms` } as CSSProperties}>
                  <h2 id={col.id} className="w-mgroup__label">
                    {col.label}
                  </h2>
                  <ul className="w-mgroup__list">
                    {col.links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="w-mlink">
                          <span className="w-mlink__label">
                            {l.label}
                            <Icon name="arrow" size={14} className="w-mlink__icon" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          </div>

          <Link href="/" className="w-footer__mark" aria-label={`${UNIT}, ${UNIVERSITY}: home`} data-reveal>
            <Image className="w-footer__seal" src="/brand/ust-seal-reverse.png" alt="" width={640} height={634} sizes="(max-width: 700px) 72px, 152px" />
            <span className="w-footer__words">
              <span className="w-footer__name">{UNIVERSITY}</span>
              <span className="w-footer__unit">{UNIT}</span>
            </span>
          </Link>
        </div>

        <div className="w-footer__base">
          <div className="w-footer__legal w-wrap">
            <p>
              © {year} {UNIVERSITY}. Results belong to the ranking bodies and are reported exactly as published. Last updated {formatAsOf(site.asOf)}.
            </p>
            <a href="#top" className="w-cta w-footer__totop">
              <span>Back to top</span>
              <span className="w-cta__disc" aria-hidden="true">
                <Icon name="arrow-up" size={16} />
              </span>
            </a>
            <details className="w-footer__credits">
              <summary>Photograph credits</summary>
              <ul>
                {(credits as Credit[]).map((c) => (
                  <li key={c.file}>
                    <a href={c.page}>{c.title}</a>, {c.creator}, {c.license}, via Wikimedia Commons
                  </li>
                ))}
                <li>The registered seal of the University of Santo Tomas is used from the official file at ust.edu.ph, unaltered.</li>
                <li>
                  SDG icons: <a href="https://www.un.org/sustainabledevelopment/">United Nations Sustainable Development Goals</a>.
                  This website is independently produced. Its content is not approved by the UN and does not represent the views of the UN, its officials or Member States.
                </li>
              </ul>
            </details>
          </div>
        </div>
      </div>
    </footer>
  );
}
