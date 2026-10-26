import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { TEAM } from "@/lib/data";
import { OFFICE, OFFICE_OBJECTIVES, OFFICE_WORKPLAN, OFFICE_PORTFOLIO, OFFICE_DELIVERABLES } from "@/lib/office";
import { Icon } from "@/components/ui/Icon";
import { Card, PageHeader, Pattern } from "@/components/ui/primitives";
import { hub } from "@/lib/governance/server/hub";

const GOVERNANCE = [
  ["University leadership", "Approves priorities, targets and public disclosures"],
  ["Office of QS/THE Rankings", "Coordinates methodologies, validation and reporting"],
  ["Data owners", "Confirm accuracy, reporting period and official values"],
  ["Contributing units", "Submit evidence and respond to review comments"],
  ["System administration", "Controls access, retention and audit records"],
];

const PHASES = [
  ["Phase 1", "Dashboard prototype", "Confirm page hierarchy, indicators and language", true],
  ["Phase 2", "Ranking pages", "Build the eight framework dashboards and methodology pages", false],
  ["Phase 3", "Contributor workspace", "Add assignments, evidence submission and validation", false],
  ["Phase 4", "Reports and public showcase", "Generate management reports and publish approved impact stories", false],
] as const;

export async function AboutOffice({ mode }: { mode: "internal" | "public" }) {
  const privacy = (await hub()).privacy;
  const internal = mode === "internal";
  return (
    <>
      <PageHeader
        title="About the Office of QS/THE Rankings"
        lede={OFFICE.summary}
      />

      <section className="card office" id="profile" aria-label="Office profile">
        <div className="office__photo">
          <Image src="/images/carillon.jpg" alt="The UST Carillon beside the Main Building, España, Manila" fill sizes="(max-width: 900px) 100vw, 40vw" />
        </div>
        <div className="office__text">
          <Pattern fade="left" />
          <p className="eyebrow">Office profile</p>
          <h2 className="office__title">UST’s global ranking strategy</h2>
          <p className="text-2">
            {OFFICE.summary}
          </p>
          <dl className="office__facts">
            <div>
              <dt>Founded</dt>
              <dd>University est. 1611</dd>
            </div>
            <div>
              <dt>Ranking and assessment frameworks</dt>
              <dd>{OFFICE_PORTFOLIO.length}</dd>
            </div>
            <div>
              <dt>Reports to</dt>
              <dd>{OFFICE.reportsTo}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="grid cols-2" id="mission">
        <Card title="Mission and objectives" icon="target" tone="dark">
          <p>{OFFICE.mission}</p>
          <ul className="bullets">
            {OFFICE_OBJECTIVES.map((item) => <li key={item.title}><b>{item.title}:</b> {item.text}</li>)}
          </ul>
          <p><b>Vision for 2030:</b> {OFFICE.vision}</p>
        </Card>
        <Card title="Ranking portfolio" icon="rankings" id="portfolio">
          <ul className="list">
            {OFFICE_PORTFOLIO.map((ranking) => (
              <li key={ranking.name}><Link href={internal && ranking.href.startsWith("/rankings/") ? `/admin${ranking.href}` : ranking.href}>{ranking.name}</Link></li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Roles and responsibilities" sub="As described in the September 2026 office profile" icon="layers" id="process">
        <ul className="list">
          {OFFICE_WORKPLAN.map((task) => <li key={task.title}><span className="list__main">{task.title}</span><span className="list__sub">{task.owners} {task.timing}</span></li>)}
        </ul>
      </Card>

      <div className="grid cols-2">
        <Card title="Office deliverables" icon="globe" id="international">
          <ul className="list">
            {OFFICE_DELIVERABLES.map((item) => <li key={item.title}><span className="list__main">{item.title}</span><span className="list__sub">{item.text}</span></li>)}
          </ul>
        </Card>
        <Card title="Leadership and team" icon="collaboration" id="team">
          <ul className="team">
            {TEAM.map((t) => (
              <li key={t.role}>
                <span className="avatar avatar--sm avatar--gold" aria-hidden="true">
                  {t.role
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")}
                </span>
                <span>
                  <b>{t.role}</b>
                  {t.who && <span className="team__who"> · {t.who}</span>}
                  <span className="team__focus">{t.focus}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid cols-3-2" id="data-governance">
        <Card title="Data governance" sub="Who is responsible for ranking data" icon="governance">
          <ol className="gov">
            {GOVERNANCE.map(([who, does], i) => (
              <li key={who} style={{ ["--i" as string]: i } as CSSProperties}>
                <b>{who}</b>
                <span>{does}</span>
              </li>
            ))}
          </ol>
        </Card>
        <div className="stack" style={{ ["--gap" as string]: "16px" } as CSSProperties}>
          <Card title="Data privacy statement" icon="lock" id="privacy" headingLevel={3}>
            <p className="small text-2">
              Personal data in submissions is processed under the Data Privacy Act of 2012 (Republic Act No. 10173). Only approved data,
              documents and narratives appear in the public view; confidential evidence stays in the internal workspace, where every change
              is logged.
            </p>
            <p className="small text-2" style={{ marginTop: 8 }}>
              Questions or requests about your personal data: {privacy.officer},{" "}
              <a className="link small" style={{ display: "inline" }} href={`mailto:${privacy.email}`}>
                {privacy.email}
              </a>
              . Notice updated {new Date(privacy.noticeUpdated + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.
            </p>
          </Card>
          <Card title="Accessibility" icon="eye" id="accessibility" headingLevel={3}>
            <p className="small text-2">
              The Hub aims to meet WCAG 2.2 AA: keyboard access throughout, visible focus, text alternatives and table views for every chart,
              and status shown with a shape and a word, never colour alone. Report a barrier to the Office by email.
            </p>
          </Card>
          <Card title="Methodology disclaimer" icon="info" id="disclaimer" headingLevel={3}>
            <p className="small text-2">
              Results belong to the ranking bodies and follow their published methods. The Office reports them as published and does not
              alter them. Figures marked as sample are placeholders for review.
            </p>
          </Card>
        </div>
      </div>

      {internal && (
        <Card title="Development phases" icon="flag">
          <ol className="phases">
            {PHASES.map(([p, t, d, now]) => (
              <li key={p} className={now ? "is-now" : undefined}>
                <span className="phases__p">{p}</span>
                <b>{t}</b>
                <span>{d}</span>
                <span className={`chip${now ? " chip--gold" : ""}`}>{now ? "This prototype" : "Planned"}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <section className="card contact" id="contact" aria-labelledby="contact-title">
        <Pattern fade="left" />
        <div>
          <p className="eyebrow">Contact us</p>
          <h2 className="contact__title" id="contact-title">
            {internal ? "Questions about a requirement or a review?" : "Working on rankings at your institution?"}
          </h2>
          <p className="text-2">
            Contact the Office about ranking requirements, data submissions and coordination with University units.
          </p>
        </div>
        <div className="contact__lines">
          <a className="btn btn--primary btn--lg" href="mailto:rankings.office@ust.edu.ph">
            <Icon name="mail" size={18} /> rankings.office@ust.edu.ph
          </a>
          <p className="small text-2 row" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
            <Icon name="pin" size={16} /> {OFFICE.location}, {OFFICE.landmark}
          </p>
          <p className="small text-2">{OFFICE.phone}</p>
        </div>
      </section>
    </>
  );
}
