import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { siteData } from "@/lib/governance/server/site";
import { PHOTOS } from "@/lib/site";
import { Calendar } from "../Calendar";
import { PageHero } from "../PageHero";
import { PageTabs } from "../PageTabs";
import { PhotoBand } from "../PhotoBand";
import { Dictionary } from "./Dictionary";
import { Templates } from "./Templates";

const TABS = [
  { id: "dictionary", label: "Dictionary" },
  { id: "methodologies", label: "Methods" },
  { id: "standards", label: "Evidence standards" },
  { id: "calendar", label: "Calendar" },
  { id: "templates", label: "Templates" },
  { id: "faq", label: "Questions" },
  { id: "policies", label: "Policies" },
];

const STANDARDS = [
  "States the reporting period the ranking asks for",
  "Gives a measurable result, not only an activity",
  "Names who benefited and how the change was verified",
  "Links to an approved, dated document",
  "Uses a public address where the ranking requires one",
];

const EXAMPLES: [string, string][] = [
  ["Clinic records showing blood-pressure control rose from 41% to 63% among 1,150 patients", "A list of clinic dates with photographs"],
  ["Metered water reuse for January to December 2025, with a metering certificate", "An estimate of water saved, with no meter data"],
  ["An approved policy with its approval date and a public address", "A draft policy behind a link that needs a login"],
];

const TRAINING = [
  ["Orientation: evidence that counts", "Recorded, 42 minutes"],
  ["Orientation: public addresses and policies", "Recorded, 18 minutes"],
  ["Writing outcome evidence, not activity reports", "Workshop, 90 minutes"],
  ["Mapping one record to several rankings", "Guide, 6 pages"],
];

const FAQ = [
  [
    "Can one document count for several rankings?",
    "Yes. Submit it once; the Office maps it to every indicator it supports and credits your unit each time.",
  ],
  [
    "What makes evidence acceptable?",
    "It names the reporting period, the measurable result, who benefited and how that was verified, and links to an approved document.",
  ],
  ["Why was a submission returned?", "Most returns are for the wrong reporting period, a missing approval date or a link that needs a login."],
  ["Who confirms official figures?", "The data owner for each indicator. The Office checks consistency but does not change official values."],
  [
    "When will a unit know where its evidence counts?",
    "As soon as a reviewer accepts it. The unit's dashboard lists every ranking and indicator it supports.",
  ],
];

const POLICIES = [
  ["UST Aquinas Framework", "Institutional framework for research, teaching and community engagement"],
  ["Social Transformation Framework", "How Thomasian programmes measure change in the communities they serve"],
  ["Sustainability policy", "Campus operations, procurement and climate commitments"],
  ["Data governance for ranking evidence", "Ownership, validation and retention of submitted evidence"],
  ["Lifelong learning access policy", "Public access to short courses and the library"],
];

/** Knowledge and methodology center: how each ranking works, in plain language. */
export async function KnowledgePage() {
  const { rankings: RANKINGS, dictionary } = await siteData();
  return (
    <>
      <PageHero
        title={
          <>
            How the rankings <br className="w-br" />
            work
          </>
        }
        lead={
          <p>
            Each ranking&rsquo;s method in plain language, a dictionary of the indicators they share, and the standard UST&rsquo;s evidence is held
            to.
          </p>
        }
        actions={
          <>
            <a href="#dictionary" className="w-btn">
              Search the dictionary
            </a>
            <a href="#calendar" className="w-link">
              See the calendar
            </a>
          </>
        }
        photo={PHOTOS.library}
      />
      <PageTabs items={TABS} label="On this page" />

      <section id="dictionary" className="w-section w-wrap" aria-labelledby="dict-title">
        <div className="w-intro w-grid">
          <h2 id="dict-title" className="w-head" data-reveal>
            Indicator dictionary
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">Search one term and see every ranking it touches, with the indicator each one files it under.</p>
          </div>
        </div>
        <Suspense>
          <Dictionary entries={dictionary} rankings={RANKINGS.map((r) => ({ short: r.short, family: r.family }))} />
        </Suspense>
      </section>

      <section id="methodologies" className="w-band w-band--stone" aria-labelledby="meth-title">
        <div className="w-wrap">
          <div className="w-intro w-grid">
            <h2 id="meth-title" className="w-head" data-reveal>
              Every method, in plain language
            </h2>
            <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
              <p className="w-lead">What each ranking measures, the period it looks at and what changed in its method recently.</p>
            </div>
          </div>
          <div className="w-tablewrap" data-reveal>
            <table className="w-meth">
              <caption className="sr-only">Ranking methodologies</caption>
              <thead>
                <tr>
                  <th scope="col">Ranking</th>
                  <th scope="col">What it measures</th>
                  <th scope="col">Reporting period</th>
                  <th scope="col">Recent changes</th>
                </tr>
              </thead>
              <tbody>
                {RANKINGS.map((r) => (
                  <tr key={r.slug}>
                    <th scope="row">
                      <Link href={`/rankings/${r.slug}`}>{r.name}</Link>
                    </th>
                    <td>{r.measures}.</td>
                    <td>{r.reportingPeriod}</td>
                    <td>{r.methodologyChanges}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <PhotoBand photo={PHOTOS.courtyard} caption="The main courtyard of the University in the nineteenth century." />

      <section id="standards" className="w-section w-wrap" aria-labelledby="std-title">
        <div className="w-grid w-std">
          <div className="w-std__head">
            <h2 id="std-title" className="w-head" data-reveal>
              Evidence that counts
            </h2>
            <p className="w-lead" data-reveal style={{ ["--d" as string]: "90ms" }}>
              Five things every accepted piece of evidence does.
            </p>
          </div>
          <div className="w-std__pic" data-reveal="shutter">
            <Image
              src={PHOTOS.cabinet.src}
              alt={PHOTOS.cabinet.alt}
              fill
              sizes="(max-width: 900px) 100vw, 36vw"
              style={{ objectPosition: PHOTOS.cabinet.pos }}
            />
          </div>
          <ul className="w-std__list">
            {STANDARDS.map((s, i) => (
              <li key={s} data-reveal style={{ ["--d" as string]: `${i * 60}ms` }}>
                <i className="w-dot" aria-hidden="true" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="w-examples">
          <div className="w-examples__col w-examples__col--yes" data-reveal>
            <h3>Counts</h3>
            <ul>
              {EXAMPLES.map(([yes]) => (
                <li key={yes}>{yes}</li>
              ))}
            </ul>
          </div>
          <div className="w-examples__col" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <h3>Does not count</h3>
            <ul>
              {EXAMPLES.map(([, no]) => (
                <li key={no}>{no}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Calendar title="The submission year" />

      <section id="templates" className="w-section w-wrap" aria-labelledby="tpl-title">
        <div className="w-intro w-grid">
          <h2 id="tpl-title" className="w-head" data-reveal>
            Templates and training
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">The forms units fill in, with the columns the reviewers check, and the sessions that explain them.</p>
          </div>
        </div>
        <Templates />
        <h3 className="w-training__title" data-reveal>
          Training materials
        </h3>
        <ul className="w-training">
          {TRAINING.map(([t, d], i) => (
            <li key={t} data-reveal style={{ ["--d" as string]: `${i * 60}ms` }}>
              <span className="w-training__name">{t}</span>
              <span className="w-training__meta">{d}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" className="w-band w-band--ink w-on-dark" aria-labelledby="faq-title">
        <div className="w-wrap w-grid w-faq">
          <h2 id="faq-title" className="w-head w-faq__title" data-reveal>
            Questions units ask
          </h2>
          <div className="w-faq__list">
            {FAQ.map(([q, a], i) => (
              <details key={q} className="w-faq__item" data-reveal style={{ ["--d" as string]: `${i * 60}ms` }} open={i === 0}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="policies" className="w-section w-wrap" aria-labelledby="pol-title">
        <h2 id="pol-title" className="w-head w-rows__title" data-reveal>
          Policies and frameworks
        </h2>
        <dl className="w-rows">
          {POLICIES.map(([t, d]) => (
            <div key={t} data-reveal>
              <dt>{t}</dt>
              <dd>{d}.</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
