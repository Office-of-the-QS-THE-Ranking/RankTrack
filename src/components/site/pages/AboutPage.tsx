import Image from "next/image";
import Link from "next/link";
import { siteData } from "@/lib/governance/server/site";
import { PageHero } from "../PageHero";
import { PageTabs } from "../PageTabs";
import { PhotoBand } from "../PhotoBand";
import { serverViews } from "@/lib/governance/server/views";
import { ABOUT_PARTS } from "@/lib/office-about";

const TABS = ABOUT_PARTS.map((p) => ({ id: p.anchor, label: p.label }));

/**
 * About the Office of QS/THE Rankings. Everything but the ranking portfolio is edited in the Knowledge Base's
 * About tab; the portfolio lists the rankings System Configuration tracks and publishes, by ranking body.
 */
export async function AboutPage() {
  const { office, photos } = await serverViews();
  const { privacy, bodies, rankings } = await siteData();
  const noticeDate = new Date(privacy.noticeUpdated + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
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
            {office.summary}
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
        photo={photos.day}
      />
      <PageTabs items={TABS} label="On this page" />

      <p className="w-office-source w-wrap">Office profile as of {office.profileDate}.</p>

      <section id="mission" className="w-section w-wrap" aria-labelledby="mission-title">
        <div className="w-grid w-mission">
          <div className="w-mission__head">
            <h2 id="mission-title" className="w-head" data-reveal>
              Our purpose
            </h2>
            <p className="w-lead" data-reveal style={{ ["--d" as string]: "90ms" }}>
              {office.purpose}
            </p>
          </div>
          <ul className="w-mission__list">
            {office.functions.map((o, i) => (
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
            <div data-reveal><dt>Vision for 2030</dt><dd>{office.vision}</dd></div>
            <div data-reveal><dt>Mission</dt><dd>{office.mission}</dd></div>
            {office.objectives.map((objective) => (
              <div key={objective.title} data-reveal><dt>{objective.title}</dt><dd>{objective.text}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section id="portfolio" className="w-section w-wrap" aria-labelledby="portfolio-title">
        <div className="w-intro w-grid">
          <h2 id="portfolio-title" className="w-head" data-reveal>Our ranking portfolio</h2>
          <div className="w-intro__aside" data-reveal>
            <p className="w-lead">
              The Office tracks {rankings.length} {rankings.length === 1 ? "ranking" : "rankings, ratings and special projects"} on this site, from {bodies.length} {bodies.length === 1 ? "ranking body" : "ranking bodies"}.
            </p>
          </div>
        </div>
        <dl className="w-rows">
          {bodies.map((b) => (
            <div key={b.id} data-reveal>
              <dt>{b.name}</dt>
              <dd>
                <ul className="w-office-portfolio w-office-portfolio--list">
                  {b.rankings.map((r) => (
                    <li key={r.slug}><Link href={`/rankings/${r.slug}`} className="w-link">{r.name}</Link></li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="deliverables" className="w-band w-band--gold" aria-labelledby="deliverables-title">
        <div className="w-wrap">
          <h2 id="deliverables-title" className="w-head w-rows__title" data-reveal>What we deliver</h2>
          <dl className="w-rows">
            {office.deliverables.map((item) => (
              <div key={item.title} data-reveal><dt>{item.title}</dt><dd>{item.text}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section id="since-1611" className="w-band w-band--ink w-on-dark w-heritage" aria-labelledby="heritage-title">
        <div className="w-wrap w-grid">
          <div className="w-heritage__map" data-reveal="shutter">
            <Image src={photos.map.src} alt={photos.map.alt} fill sizes="(max-width: 900px) 100vw, 58vw" />
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

      <PhotoBand photo={photos.night} caption="Lamps on a rain-wet walk behind the Main Building at night." />

      <section id="team" className="w-section w-wrap" aria-labelledby="team-title">
        <div className="w-intro w-grid">
          <h2 id="team-title" className="w-head" data-reveal>
            Meet the Office
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">{office.team.length} roles carry the Office’s work, under the {office.reportsTo}.</p>
          </div>
        </div>
        <ul className="w-team">
          {office.team.map((t, i) => (
            <li key={t.role} className="w-team__role" data-reveal style={{ ["--d" as string]: `${(i % 3) * 70}ms` }}>
              <span className="w-team__name">{t.role}</span>
              {t.who && <span className="w-team__who">{t.who}</span>}
              <span className="w-team__focus">{t.focus}</span>
            </li>
          ))}
        </ul>
        {office.workplan.length > 0 && (
          <div className="w-office-sub">
            <h3 className="w-head w-rows__title" data-reveal>How the work is shared</h3>
            <dl className="w-rows">
              {office.workplan.map((task) => (
                <div key={task.title} data-reveal>
                  <dt>{task.title}</dt>
                  <dd><p>{task.owners}</p><p className="w-office-timing">{task.timing}</p></dd>
                </div>
              ))}
            </dl>
            <p className="w-office-note" data-reveal>Data collection and submission review follow the Calendar of Activities. <Link href="/knowledge-base#calendar" className="w-link">View the calendar</Link>.</p>
          </div>
        )}
      </section>

      <section id="governance" className="w-band w-band--gold" aria-labelledby="gov-title">
        <div className="w-wrap w-grid w-gov">
          <h2 id="gov-title" className="w-head w-gov__title" data-reveal>
            Reporting and coordination
          </h2>
          <ol className="w-gov__list">
            {office.coordination.map(({ title: who, text: does }, i) => (
              <li key={who} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                <span className="w-gov__who">{who}</span>
                <span className="w-gov__does">{does}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="policies" className="w-section w-wrap" aria-labelledby="policies-title">
        <h2 id="policies-title" className="w-head w-rows__title" data-reveal>
          Privacy, access and method
        </h2>
        <dl className="w-rows">
          {office.policies.map((p) => (
            <div key={p.anchor || p.title} id={p.anchor || undefined} data-reveal>
              <dt>{p.title}</dt>
              <dd>
                {p.text}
                {p.anchor === "privacy" && (
                  <>
                    {" "}Questions or requests about your personal data go to the {privacy.officer} at <a href={`mailto:${privacy.email}`}>{privacy.email}</a>. Notice updated {noticeDate}.
                  </>
                )}
              </dd>
            </div>
          ))}
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
              <a href={`mailto:${office.email}`} className="w-btn">
                {office.email}
              </a>
              <Link href="/publications/stories#adapt" className="w-link">
                Adapt a practice
              </Link>
            </div>
          </div>
          <div className="w-contact__disc" data-reveal="disc">
            <Image
              src={photos.arch.src}
              alt={photos.arch.alt}
              fill
              sizes="(max-width: 900px) 70vw, 26vw"
              style={{ objectPosition: photos.arch.pos }}
            />
          </div>
          <address className="w-contact__address" data-reveal style={{ ["--d" as string]: "200ms" }}>
            {office.name}
            <br />
            {office.location}
            <br />
            {office.landmark}
            <br />
            {office.phone}
            <br />
            University of Santo Tomas
            <br />
            {office.street}
            <br />
            {office.city}
          </address>
        </div>
      </section>

      {office.faq.length > 0 && (
        <section id="faq" className="w-band w-band--ink w-on-dark" aria-labelledby="about-faq-title">
          <div className="w-wrap w-grid w-faq">
            <h2 id="about-faq-title" className="w-head w-faq__title" data-reveal>
              Questions people ask
            </h2>
            <div className="w-faq__list">
              {office.faq.map(({ q, a }, i) => (
                <details key={q} className="w-faq__item" data-reveal style={{ ["--d" as string]: `${i * 60}ms` }} open={i === 0}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
