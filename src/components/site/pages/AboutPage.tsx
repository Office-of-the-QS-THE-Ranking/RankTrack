import Image from "next/image";
import Link from "next/link";
import { OFFICE, OFFICE_FUNCTIONS, OFFICE_OBJECTIVES, OFFICE_DELIVERABLES, OFFICE_WORKPLAN, OFFICE_TEAM, OFFICE_PORTFOLIO } from "@/lib/office";
import { PHOTOS } from "@/lib/site";
import { siteData } from "@/lib/governance/server/site";
import { PageHero } from "../PageHero";
import { PageTabs } from "../PageTabs";
import { PhotoBand } from "../PhotoBand";

const TABS = [
  { id: "mission", label: "Purpose" },
  { id: "vision", label: "Vision & mission" },
  { id: "portfolio", label: "Rankings" },
  { id: "deliverables", label: "Deliverables" },
  { id: "since-1611", label: "Since 1611" },
  { id: "process", label: "How it works" },
  { id: "team", label: "Team" },
  { id: "governance", label: "Data governance" },
  { id: "privacy", label: "Policies" },
  { id: "contact", label: "Contact" },
];

const GOVERNANCE = [
  ["Office of the Rector", "The Office of QS/THE Rankings operates under the Office of the Rector."],
  ["Director", "Engr. Nestor R. Ong heads the Office. The Office Clerk, Office Assistant and Ranking Specialists report directly to the Director."],
  ["Functional supervision", "Engr. Rodablas P. Nicolas provides functional or indirect supervision to the Ranking Specialists."],
  ["Academic and support units", "Coordinate with the Office to collect and consolidate data and implement action plans."],
  ["Office of International Relations & Programs", "Works with the Office on data collection and stakeholder coordination."],
];

/** About the Office of the QS/THE Rankings. */
export async function AboutPage() {
  const { privacy } = await siteData();
  return (
    <>
      <PageHero
        title={
          <>
            About <br className="w-br" />
            the Office
          </>
        }
        lead={
          <p>
            {OFFICE.summary}
          </p>
        }
        actions={
          <>
            <a href="#contact" className="w-btn">
              Write to the Office
            </a>
            <a href="#governance" className="w-link">
              Who is responsible for the data
            </a>
          </>
        }
        photo={PHOTOS.day}
      />
      <PageTabs items={TABS} label="On this page" />

      <p className="w-office-source w-wrap">Office profile as of {OFFICE.profileDate}.</p>

      <section id="mission" className="w-section w-wrap" aria-labelledby="mission-title">
        <div className="w-grid w-mission">
          <div className="w-mission__head">
            <h2 id="mission-title" className="w-head" data-reveal>
              Our purpose
            </h2>
            <p className="w-lead" data-reveal style={{ ["--d" as string]: "90ms" }}>
              The Office addresses current and emerging challenges in UST’s international ranking performance, strengthening the University’s competitiveness and appeal on the global stage.
            </p>
          </div>
          <ul className="w-mission__list">
            {OFFICE_FUNCTIONS.map((o, i) => (
              <li key={o} data-reveal style={{ ["--d" as string]: `${i * 60}ms` }}>
                <i className="w-dot" aria-hidden="true" />
                {o}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="vision" className="w-band w-band--stone" aria-labelledby="vision-title">
        <div className="w-wrap">
          <h2 id="vision-title" className="w-head w-rows__title" data-reveal>Vision and mission</h2>
          <dl className="w-rows">
            <div data-reveal><dt>Vision for 2030</dt><dd>{OFFICE.vision}</dd></div>
            <div data-reveal><dt>Mission</dt><dd>{OFFICE.mission}</dd></div>
            {OFFICE_OBJECTIVES.map((objective) => (
              <div key={objective.title} data-reveal><dt>{objective.title}</dt><dd>{objective.text}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section id="portfolio" className="w-section w-wrap" aria-labelledby="portfolio-title">
        <div className="w-intro w-grid">
          <h2 id="portfolio-title" className="w-head" data-reveal>Our ranking portfolio</h2>
          <div className="w-intro__aside" data-reveal>
            <p className="w-lead">The Office’s scope covers these ten ranking, rating and special-project frameworks, as listed in the September 2026 office profile.</p>
          </div>
        </div>
        <ul className="w-office-portfolio">
          {OFFICE_PORTFOLIO.map((ranking) => (
            <li key={ranking.name} data-reveal><Link href={ranking.href} className="w-link">{ranking.name}</Link></li>
          ))}
        </ul>
      </section>

      <section id="deliverables" className="w-band w-band--gold" aria-labelledby="deliverables-title">
        <div className="w-wrap">
          <h2 id="deliverables-title" className="w-head w-rows__title" data-reveal>What we deliver</h2>
          <dl className="w-rows">
            {OFFICE_DELIVERABLES.map((item) => (
              <div key={item.title} data-reveal><dt>{item.title}</dt><dd>{item.text}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section id="since-1611" className="w-band w-band--ink w-on-dark w-heritage" aria-labelledby="heritage-title">
        <div className="w-wrap w-grid">
          <div className="w-heritage__map" data-reveal="shutter">
            <Image src={PHOTOS.map.src} alt={PHOTOS.map.alt} fill sizes="(max-width: 900px) 100vw, 58vw" />
          </div>
          <div className="w-heritage__text">
            <h2 id="heritage-title" className="w-head" data-reveal>
              Since 1611
            </h2>
            <p className="w-lead" data-reveal style={{ ["--d" as string]: "90ms" }}>
              The University was founded in 1611 inside Intramuros, the walled city of Manila, and moved to Sampaloc in 1927. The Arch of the
              Centuries, the gate of the first campus, now stands on España.
            </p>
            <p data-reveal style={{ ["--d" as string]: "160ms" }}>
              Global rankings are recent; the habit of keeping a record is not. The Office keeps the University&rsquo;s evidence the way its library
              keeps its books: dated, sourced and open to those who ask.
            </p>
          </div>
        </div>
      </section>

      <section id="process" className="w-section w-wrap" aria-labelledby="process2-title">
        <h2 id="process2-title" className="w-head w-rows__title" data-reveal>How the work is shared</h2>
        <dl className="w-rows">
          {OFFICE_WORKPLAN.map((task) => (
            <div key={task.title} data-reveal>
              <dt>{task.title}</dt>
              <dd><p>{task.owners}</p><p className="w-office-timing">{task.timing}</p></dd>
            </div>
          ))}
        </dl>
        <p className="w-office-note" data-reveal>Data collection and submission review follow the Calendar of Activities. <Link href="/knowledge#calendar" className="w-link">View the calendar</Link>.</p>
      </section>

      <PhotoBand photo={PHOTOS.night} caption="Lamps on a rain-wet walk behind the Main Building at night." />

      <section id="team" className="w-section w-wrap" aria-labelledby="team-title">
        <div className="w-intro w-grid">
          <h2 id="team-title" className="w-head" data-reveal>
            Meet the Office
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">The organizational structure in the 19 September 2026 presentation lists the Director, Office Clerk, Office Assistant and two Ranking Specialist positions.</p>
          </div>
        </div>
        <ul className="w-team">
          {OFFICE_TEAM.map((t, i) => (
            <li key={t.role} className="w-team__role" data-reveal style={{ ["--d" as string]: `${(i % 3) * 70}ms` }}>
              <span className="w-team__name">{t.role}</span>
              {t.who && <span className="w-team__who">{t.who}</span>}
              <span className="w-team__focus">{t.focus}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="governance" className="w-band w-band--gold" aria-labelledby="gov-title">
        <div className="w-wrap w-grid w-gov">
          <h2 id="gov-title" className="w-head w-gov__title" data-reveal>
            Reporting and coordination
          </h2>
          <ol className="w-gov__list">
            {GOVERNANCE.map(([who, does], i) => (
              <li key={who} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                <span className="w-gov__who">{who}</span>
                <span className="w-gov__does">{does}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="w-section w-wrap" aria-labelledby="policies-title">
        <h2 id="policies-title" className="w-head w-rows__title" data-reveal>
          Privacy, access and method
        </h2>
        <dl className="w-rows">
          <div id="privacy" data-reveal>
            <dt>Data privacy statement</dt>
            <dd>
              Personal data in submissions is processed under the Data Privacy Act of 2012 (Republic Act No. 10173). Only approved data, documents and
              narratives appear on this site; confidential evidence stays in the internal workspace, where every change is logged. Questions or requests
              about your personal data go to the {privacy.officer} at <a href={`mailto:${privacy.email}`}>{privacy.email}</a>. Notice updated{" "}
              {new Date(privacy.noticeUpdated + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.
            </dd>
          </div>
          <div id="accessibility" data-reveal>
            <dt>Accessibility</dt>
            <dd>
              This site aims to meet WCAG 2.2 AA: keyboard access throughout, visible focus, text alternatives and tables beside every chart, and
              results stated in words, never by colour alone. Report a barrier to the Office by email.
            </dd>
          </div>
          <div id="disclaimer" data-reveal>
            <dt>Methodology disclaimer</dt>
            <dd>
              Results belong to the ranking bodies and follow their published methods. The Office reports them as published and does not alter them.
              Figures for the current cycle that are not yet published are placeholders for review.
            </dd>
          </div>
        </dl>
      </section>

      <section id="contact" className="w-contact w-section" aria-labelledby="contact-title">
        <div className="w-wrap w-grid">
          <div className="w-contact__copy">
            <h2 id="contact-title" className="w-head" data-reveal>
              Write to the Office
            </h2>
            <p className="w-lead" data-reveal style={{ ["--d" as string]: "90ms" }}>
              Contact the Office for questions about ranking submissions, data requirements, performance analysis and coordination with University units.
            </p>
            <div className="w-actions" data-reveal style={{ ["--d" as string]: "160ms" }}>
              <a href="mailto:rankings.office@ust.edu.ph" className="w-btn">
                rankings.office@ust.edu.ph
              </a>
              <Link href="/impact#adapt" className="w-link">
                Adapt a practice
              </Link>
            </div>
          </div>
          <div className="w-contact__disc" data-reveal="disc">
            <Image
              src={PHOTOS.arch.src}
              alt={PHOTOS.arch.alt}
              fill
              sizes="(max-width: 900px) 70vw, 26vw"
              style={{ objectPosition: PHOTOS.arch.pos }}
            />
          </div>
          <address className="w-contact__address" data-reveal style={{ ["--d" as string]: "200ms" }}>
            {OFFICE.name}
            <br />
            {OFFICE.location}
            <br />
            {OFFICE.landmark}
            <br />
            {OFFICE.phone}
            <br />
            University of Santo Tomas
            <br />
            España Boulevard, Sampaloc
            <br />
            Manila 1008, Philippines
          </address>
        </div>
      </section>
    </>
  );
}
