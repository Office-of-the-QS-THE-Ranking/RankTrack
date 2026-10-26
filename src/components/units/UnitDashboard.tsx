import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ACTIONS,
  RECOGNITION,
  daysUntil,
  formatDate,
  type EvidenceItem,
  type Ranking,
  type Requirement,
} from "@/lib/data";
import type { HubUnit } from "@/lib/governance/hub-types";
import { Icon } from "@/components/ui/Icon";
import { Card, Due, Empty, Kpi, Meter, Notice, PageHeader, Pattern, RankingName, Ring, SdgList, Status } from "@/components/ui/primitives";
import { StageTrack } from "@/components/contribute/StageTrack";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const asWord = (n: number) => WORDS[n] ?? String(n);

/**
 * A unit's own page (proposal §12): assigned requirements, completion, accepted evidence, items needing
 * revision, deadlines, contributions used in several rankings, outcomes supported and recognition.
 */
export function UnitDashboard({
  unit,
  mode,
  evidence,
  rankings,
  requirements,
  canSubmit,
  insights,
  scopeNote,
}: {
  unit: HubUnit;
  mode: "portal" | "admin";
  /** This unit's submissions, already limited to what the viewer may reach. */
  evidence: EvidenceItem[];
  /** The rankings System Configuration tracks. */
  rankings: Ranking[];
  requirements: Requirement[];
  /** The contributor workspace only: whether this unit's own coordinator may file evidence. */
  canSubmit?: boolean;
  /** The "evidence reuse insights" experiment. */
  insights?: boolean;
  scopeNote?: string;
}) {
  const portal = mode === "portal";
  const RANKINGS = rankings;
  const tracked = new Set(rankings.map((r) => r.short));
  const counts = (m: string) => tracked.has(m.split(" · ")[0]) || !RANKINGS.length;
  const accepted = evidence.filter((e) => e.status === "Validated").map((e) => ({ ...e, mappedTo: e.mappedTo.filter(counts) }));
  const revisions = evidence.filter((e) => e.status === "Needs revision");
  const reqs = requirements.filter((r) => rankings.some((x) => x.slug === r.ranking));
  const done = reqs.length ? reqs.filter((r) => r.status === "Validated").length : unit.completed;
  const total = reqs.length || unit.assigned;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const open = reqs.filter((r) => r.status !== "Validated").sort((a, b) => a.due.localeCompare(b.due));
  const actions = ACTIONS.filter((a) => a.unit === unit.name);
  const owned = RANKINGS.flatMap((r) => r.indicators.filter((i) => i.owner === unit.name).map((i) => ({ r, i })));
  const recognition = RECOGNITION.filter((r) => r.unit === unit.name);
  const rankingsTouched = [...new Set(accepted.flatMap((e) => e.mappedTo.map((m) => m.split(" · ")[0])))];
  const sdgs = [...new Set(accepted.flatMap((e) => e.sdgs))].sort((a, b) => a - b);
  const served = RANKINGS.filter((r) => reqs.some((q) => q.ranking === r.slug) || owned.some((o) => o.r.slug === r.slug)).sort((a, b) =>
    a.deadline.localeCompare(b.deadline),
  );
  const impactItems = accepted.filter((e) => e.mappedTo.some((m) => m.startsWith("THE Impact"))).length;
  const impact = RANKINGS.find((r) => r.slug === "the-impact" && r.current);

  return (
    <>
      <PageHeader
        title={portal ? `Welcome back, ${unit.name}` : unit.name}
        lede={
          portal
            ? "Here is what your evidence is doing for UST, and what needs attention next."
            : `${unit.kind} · ${unit.code} · ${unit.coordinatorId ? `coordinated by ${unit.coordinator}` : "no coordinator yet"} · serves ${unit.rankingsServed} rankings`
        }
        actions={
          <>
            <Link href={portal ? "/portal/assistance" : `mailto:rankings.office@ust.edu.ph?subject=${encodeURIComponent(unit.name)}`} className="btn">
              <Icon name="help" size={18} /> {portal ? "Request assistance" : "Contact coordinator"}
            </Link>
            {portal && canSubmit && unit.status === "Active" && (
              <Link href="/portal/submit" className="btn btn--primary">
                <Icon name="upload" size={18} /> Submit evidence
              </Link>
            )}
          </>
        }
      />

      {scopeNote && <Notice tone="plain" icon="lock">{scopeNote}</Notice>}
      {unit.status === "Archived" && (
        <Notice tone="warn" icon="archive">
          {unit.mergedIntoName ? `Merged into ${unit.mergedIntoName}. ` : "Archived. "}
          {unit.archivedReason} Its submissions stay credited to it and appear in every report.
        </Notice>
      )}

      {/* Progress, not pressure */}
      <div className="grid cols-4 grid--stretch">
        <div className="card card--dark">
          <div className="kpi">
            <p className="kpi__label">
              <span className="kpi__icon">
                <Icon name="check-circle" size={17} />
              </span>
              Submission-ready
            </p>
            <div className="row" style={{ ["--gap" as string]: "14px", marginTop: 6 } as CSSProperties}>
              <Ring value={pct} size={52} stroke={6} track="rgb(255 255 255 / 0.12)" label={<span style={{ fontSize: 12 }}>{pct}%</span>} />
              <p className="kpi__meta" style={{ marginTop: 0 }}>
                {portal ? "Your unit is" : "This unit is"} {pct}% submission-ready
              </p>
            </div>
          </div>
        </div>
        <Kpi label="Requirements" icon="clipboard" value={`${done} of ${total}`} meta="requirements completed" href={portal ? "/portal/requirements" : undefined}>
          <Meter value={pct} label="Requirements completed" />
        </Kpi>
        <Kpi
          label="Remaining"
          icon="flag"
          value={total - done}
          meta={`${revisions.length} revision ${revisions.length === 1 ? "request" : "requests"} · ${Math.max(0, total - done - revisions.length)} still open`}
          href={portal ? "/portal/feedback" : undefined}
        />
        <Kpi
          tone="gold"
          label="Reused evidence"
          icon="layers"
          value={accepted.length}
          meta={`validated contributions used across ${rankingsTouched.length} rankings`}
        />
      </div>

      {insights && accepted.length > 0 && (
        <Card title="Evidence reuse insights" sub="Experiment: how many rankings each accepted item feeds" icon="layers" tone="tint">
          <ul className="list">
            {[...accepted]
              .sort((a, b) => new Set(b.mappedTo.map((m) => m.split(" · ")[0])).size - new Set(a.mappedTo.map((m) => m.split(" · ")[0])).size)
              .map((e) => {
                const n = new Set(e.mappedTo.map((m) => m.split(" · ")[0])).size;
                return (
                  <li key={e.id}>
                    <span className="list__main">{e.title}</span>
                    <span className="list__aside small num" style={{ fontWeight: 600 }}>
                      {n} {n === 1 ? "ranking" : "rankings"}
                    </span>
                    <span className="list__sub">{e.mappedTo.length} indicators · submitted once</span>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}

      {impactItems > 0 && (
        <section className="helped" aria-label={portal ? "You helped achieve this" : "Contribution to results"}>
          <div className="helped__text">
            <Pattern fade="right" className="helped__pattern" />
            <p className="helped__eyebrow">{portal ? "You helped achieve this" : "Contribution to results"}</p>
            <blockquote>
              “{portal ? "Your faculty" : "This unit"} contributed {asWord(impactItems)} validated {impactItems === 1 ? "item" : "items"} supporting UST&rsquo;s
              advancement in the THE Impact Ratings.”
            </blockquote>
            <p className="helped__note">
              {accepted.map((e) => e.title.split(",")[0]).join(" · ")}
              {portal && ". Thank you to everyone who documented them."}
            </p>
          </div>
          {impact && (
            <div className="helped__fig">
              <span>{impact.name}</span>
              <b>{impact.current}</b>
              {impact.previous && impact.direction === "up" && (
                <span className="row" style={{ ["--gap" as string]: "6px" } as CSSProperties}>
                  <Icon name="arrow-up" size={16} strokeWidth={2.2} /> up from {impact.previous}
                </span>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid cols-2-1">
        <Card
          title={reqs.length ? "Next up" : "Open actions"}
          sub={reqs.length ? "Open requirements, soonest first" : "Actions assigned to this unit"}
          icon="clipboard"
          actions={
            portal ? (
              <Link href="/portal/requirements" className="link small">
                All requirements <Icon name="arrow" size={14} />
              </Link>
            ) : undefined
          }
        >
          {reqs.length ? (
            <ul className="list">
              {open.map((r) => (
                <li key={r.id}>
                  <span className="list__main">{r.title}</span>
                  <span className="list__aside">
                    <Status status={r.status} />
                  </span>
                  <span className="list__sub row" style={{ ["--gap" as string]: "6px" } as CSSProperties}>
                    <RankingName slug={r.ranking} /> · {r.indicator} · <Due iso={r.due} withDays />
                  </span>
                </li>
              ))}
            </ul>
          ) : actions.length ? (
            <ul className="list">
              {actions.map((a) => (
                <li key={a.id}>
                  <span className="list__main">{a.action}</span>
                  <span className="list__aside">
                    <Status status={a.status} />
                  </span>
                  <span className="list__sub row" style={{ ["--gap" as string]: "6px" } as CSSProperties}>
                    <RankingName slug={a.ranking} /> · <Due iso={a.due} withDays />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="check-circle" title="Nothing open">
              {unit.assigned > 0 && <>{unit.validated} of {unit.assigned} requirements are validated. The remainder are with reviewers.</>}
            </Empty>
          )}
        </Card>
        {revisions.length ? (
          <Card title="Revision requested" icon="comment" tone="tint">
            {revisions.map((e) => (
              <div key={e.id} className="stack" style={{ ["--gap" as string]: "10px" } as CSSProperties}>
                <h3 className="small" style={{ fontSize: 14, fontWeight: 600 }}>
                  {e.title}
                </h3>
                {e.comments[0] && (
                  <div className="comment" style={{ background: "var(--surface)" }}>
                    <p className="comment__who">
                      {e.comments[0].by} · {formatDate(e.comments[0].date)}
                    </p>
                    <p>{e.comments[0].text}</p>
                  </div>
                )}
                <Link href={portal ? "/portal/feedback" : `/admin/contribute?item=${e.id}`} className="btn btn--dark">
                  <Icon name="comment" size={18} /> {portal ? "Respond to comment" : "Open in the queue"}
                </Link>
              </div>
            ))}
          </Card>
        ) : (
          <Card title="Deadlines" icon="deadline" sub="Rankings this unit contributes to">
            <DeadlineList slugs={served.map((r) => r.slug)} rankings={rankings} />
          </Card>
        )}
      </div>

      <Card
        title={portal ? "Where your accepted evidence is used" : "Accepted evidence and where it counts"}
        sub="Every validated item shows the rankings and indicators it supports"
        icon="layers"
      >
        {accepted.length ? (
          <div className="grid cols-2">
            {accepted.map((e) => (
              <article key={e.id} className="used">
                <h3>{e.title}</h3>
                <p className="small muted">
                  <span className="num">{e.id}</span> · {e.result}
                </p>
                <p className="used__line">This submission supports</p>
                <ul className="used__list">
                  {e.mappedTo.map((m) => (
                    <li key={m}>
                      <Icon name="check" size={15} strokeWidth={2.2} /> {m}
                    </li>
                  ))}
                </ul>
                <StageTrack stage={e.stage} status={e.status} />
              </article>
            ))}
          </div>
        ) : (
          <Empty icon="evidence" title="No validated evidence yet this cycle">
            Accepted items will appear here with every ranking they count in.
          </Empty>
        )}
      </Card>

      <div className="grid cols-3">
        <Card title="Institutional outcomes supported" icon="target">
          {rankingsTouched.length ? (
            <>
              <p className="small text-2">Rankings</p>
              <div className="chips mt-2">
                {rankingsTouched.map((r) => (
                  <span key={r} className="chip chip--outline">
                    {r}
                  </span>
                ))}
              </div>
              <p className="small text-2 mt-4">Sustainable Development Goals</p>
              <div className="mt-2">
                <SdgList sdgs={sdgs} />
              </div>
            </>
          ) : (
            <p className="small muted">Outcomes appear once evidence is validated.</p>
          )}
        </Card>
        <Card title="Recognition earned" icon="recognition" tone={recognition.length ? "gold" : undefined}>
          {recognition.length ? (
            recognition.map((r) => (
              <div key={r.award}>
                <p className="small" style={{ fontWeight: 700 }}>
                  {r.award} · 2026 cycle
                </p>
                <p className="serif" style={{ fontSize: 22, lineHeight: 1.2, marginTop: 6 }}>
                  {r.reason}.
                </p>
              </div>
            ))
          ) : (
            <p className="small muted">Recognition follows validated quality and reuse, never the number of files uploaded.</p>
          )}
        </Card>
        <Card title="Indicators owned" icon="target" sub="Where this unit is the data owner">
          {owned.length ? (
            <ul className="list">
              {owned.map(({ r, i }) => (
                <li key={r.slug + i.name}>
                  <span className="list__main">{i.name}</span>
                  <span className="list__aside">
                    <Status status={i.status} />
                  </span>
                  <span className="list__sub">
                    <RankingName slug={r.slug} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No indicators are owned directly; this unit contributes evidence to indicators owned by other offices.</p>
          )}
        </Card>
      </div>
    </>
  );
}

export function DeadlineList({ slugs, rankings }: { slugs: string[]; rankings: Ranking[] }) {
  const rs = rankings.filter((r) => slugs.includes(r.slug)).sort((a, b) => a.deadline.localeCompare(b.deadline));
  if (!rs.length) return <p className="small muted">No deadlines assigned.</p>;
  return (
    <ul className="list">
      {rs.map((r) => (
        <li key={r.slug}>
          <span className="list__main">
            <RankingName slug={r.slug} />
          </span>
          <span className="list__aside small num" style={{ fontWeight: 600 }}>
            {formatDate(r.deadline, { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <span className="list__sub">in {daysUntil(r.deadline)} days</span>
        </li>
      ))}
    </ul>
  );
}
