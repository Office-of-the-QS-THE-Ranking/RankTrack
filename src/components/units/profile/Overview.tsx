import Link from "next/link";
import { useId, type CSSProperties } from "react";
import { daysUntil, formatDate, type EvidenceItem } from "@/lib/data";
import type { UnitProfileData } from "@/lib/governance/hub-types";
import { ROMAN, metalOf, meritOf, rankingsOf, type AchievementState, type Season } from "@/lib/merit";
import { Icon } from "@/components/ui/Icon";
import { Card, Due, Empty, Meter, RankingName, Ring, SdgList, Status } from "@/components/ui/primitives";
import { StageTrack } from "@/components/contributions/StageTrack";
import { CountUp, HonourDial, Medal } from "./Medal";
import { ItemTitle, SectionTitle, useSectionLevel, type ProfileTab } from "./shared";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const gap = (px: number) => ({ ["--gap" as string]: `${px}px` }) as CSSProperties;

/** The cycle at a glance: the season's honour, readiness, what needs doing, and where accepted evidence counts. */
export function Overview({
  data,
  season,
  badges,
  current,
  onOpen,
}: {
  data: UnitProfileData;
  season: Season;
  badges: AchievementState[];
  /** The chosen cycle is the current one, so requirements, actions and deadlines apply. */
  current: boolean;
  onOpen: (tab: ProfileTab) => void;
}) {
  const id = useId();
  const level = useSectionLevel();
  const reqs = current ? data.requirements : [];
  const items = season.items;
  const total = reqs.length || items.length;
  const ready = reqs.length ? reqs.filter((r) => r.status === "Validated").length : season.validated.length;
  const submitted = reqs.length ? reqs.filter((r) => r.status !== "Not yet submitted").length : items.filter((e) => e.status !== "Not yet submitted").length;
  const readiness = total ? Math.round((ready / total) * 100) : 0;
  const revisions = items.filter((e) => e.status === "Needs revision");
  const reviewing = items.filter((e) => e.status === "For review").length;
  const open = reqs.filter((r) => r.status !== "Validated").sort((a, b) => a.due.localeCompare(b.due));
  const actions = current ? data.actions : [];
  const next = current ? data.deadlines.find((d) => daysUntil(d.deadline) >= 0) : undefined;
  const recent = badges
    .filter((b) => b.tier > 0)
    .sort((a, b) => b.earned[b.tier - 1].localeCompare(a.earned[a.tier - 1]) || b.tier - a.tier)
    .slice(0, 4);
  const ahead = badges.filter((b) => b.goal).sort((a, b) => b.count / b.goal! - a.count / a.goal!);
  const closest = ahead.find((b) => b.count > 0) ?? ahead[0];

  return (
    <div className="up-grid">
      <section className="up-standing" aria-labelledby={`${id}-standing`}>
        <div className="up-standing__seal">
          <HonourDial
            numeral={season.honour.numeral}
            progress={season.progress}
            label={`${season.honour.name}${season.next ? `, ${pct(season.progress)} of the way to ${season.next.name}` : ""}`}
          />
        </div>
        <div className="up-standing__text">
          <p className="up-eyebrow up-eyebrow--gold">Honours · {season.cycle}</p>
          <SectionTitle id={`${id}-standing`} className="up-standing__title">
            {season.honour.name}
          </SectionTitle>
          <p className="up-standing__merit">
            <CountUp value={season.merit} /> <span>merit</span>
          </p>
          <p className="up-standing__next">
            {season.next ? (
              <>
                <b>{(season.next.at - season.merit).toLocaleString("en-PH")}</b> to {season.next.name}
              </>
            ) : (
              "The season’s highest honour"
            )}
          </p>
        </div>
        <dl className="up-standing__stats">
          <div>
            <dt>Validated</dt>
            <dd>{season.validated.length}</dd>
          </div>
          <div>
            <dt>First pass</dt>
            <dd>{season.firstPassRate === null ? "—" : pct(season.firstPassRate)}</dd>
          </div>
          <div>
            <dt>Rankings</dt>
            <dd>{season.rankings.length}</dd>
          </div>
          <div>
            <dt>SDGs</dt>
            <dd>{season.sdgs.length}</dd>
          </div>
        </dl>
      </section>

      <section className="up-tile up-ready" aria-labelledby={`${id}-ready`}>
        <SectionTitle id={`${id}-ready`} className="up-tile__title">
          Submission-ready
        </SectionTitle>
        <Ring value={readiness} size={128} stroke={9} label={<span className="up-ready__pct">{readiness}%</span>} />
        <p className="up-tile__meta">{total ? `${ready} of ${total} ${reqs.length ? "requirements" : "submissions"} validated` : "Nothing assigned this cycle"}</p>
      </section>

      <div className="up-kpis">
        <div className="up-tile up-kpi">
          <p className="up-kpi__label">
            <Icon name="upload" size={16} /> Submitted
          </p>
          <p className="up-kpi__value">
            {submitted}
            {total > 0 && <small> of {total}</small>}
          </p>
          {total > 0 ? <Meter value={(submitted / total) * 100} label="Submitted share" /> : <p className="up-tile__meta">Nothing assigned this cycle</p>}
        </div>
        <div className="up-tile up-kpi">
          <p className="up-kpi__label">
            <Icon name="flag" size={16} /> Remaining
          </p>
          <p className="up-kpi__value">{total - ready}</p>
          <p className="up-tile__meta">
            {count(revisions.length, "revision")} · {reviewing} in review
          </p>
        </div>
        <div className="up-tile up-kpi">
          <p className="up-kpi__label">
            <Icon name="deadline" size={16} /> Next deadline
          </p>
          <p className="up-kpi__value">
            {!next ? (
              "—"
            ) : daysUntil(next.deadline) === 0 ? (
              "Today"
            ) : (
              <>
                {daysUntil(next.deadline)}
                <small>{daysUntil(next.deadline) === 1 ? " day" : " days"}</small>
              </>
            )}
          </p>
          <p className="up-tile__meta up-kpi__line">
            {next ? (
              <>
                <RankingName slug={next.slug} /> closes {formatDate(next.deadline)}
              </>
            ) : current ? (
              "No open deadlines"
            ) : (
              "Closed cycle"
            )}
          </p>
        </div>
      </div>

      <section className="up-tile up-honours" aria-labelledby={`${id}-honours`}>
        <header className="up-tile__head">
          <SectionTitle id={`${id}-honours`} className="up-tile__title">
            Achievements
          </SectionTitle>
          <button type="button" className="link small" onClick={() => onOpen("Recognitions")}>
            All achievements <Icon name="arrow" size={14} />
          </button>
        </header>
        <div className="up-honours__row">
          <ul className="up-honours__earned">
            {recent.length
              ? recent.map((b) => {
                  const when = b.earned[b.tier - 1];
                  return (
                    <li key={b.id}>
                      <Medal icon={b.icon} metal={metalOf(b, b.tier)} tier={b.goals.length > 1 ? b.tier : undefined} size={60} fresh={when === season.cycle} />
                      <span className="up-honours__name">{b.name}</span>
                      <span className="up-honours__when">{when === season.cycle ? "New this cycle" : when}</span>
                    </li>
                  );
                })
              : ahead
                  .filter((b) => b !== closest)
                  .slice(0, 4)
                  .map((b) => (
                    <li key={b.id} className="is-locked">
                      <Medal icon={b.icon} progress={b.count / b.goal!} size={60} />
                      <span className="up-honours__name">{b.name}</span>
                      <span className="up-honours__when">Not yet earned</span>
                    </li>
                  ))}
          </ul>
          {closest?.goal && (
            <div className="up-honours__next">
              <Medal icon={closest.icon} progress={closest.count / closest.goal} size={48} />
              <div className="up-honours__goal">
                <p className="up-eyebrow">Next to unlock</p>
                <p className="up-honours__goalname">
                  {closest.name}
                  {closest.goals.length > 1 && ` ${ROMAN[closest.tier + 1]}`}
                </p>
                <Meter value={(closest.count / closest.goal) * 100} tone="gold" label={`${closest.name} progress`} />
                <p className="up-tile__meta">
                  {closest.count} of {closest.goal} · {closest.how}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <Card
        className="up-wide"
        headingLevel={level}
        title={reqs.length ? "Next up" : "Open actions"}
        sub={reqs.length ? "Open requirements, soonest first" : "Actions assigned to this unit"}
        icon="clipboard"
      >
        {reqs.length && open.length ? (
          <ul className="list">
            {open.map((r) => (
              <li key={r.id}>
                <span className="list__main">{r.title}</span>
                <span className="list__aside">
                  <Status status={r.status} />
                </span>
                <span className="list__sub row" style={gap(6)}>
                  <RankingName slug={r.ranking} /> · {r.indicator} · <Due iso={r.due} withDays />
                </span>
              </li>
            ))}
          </ul>
        ) : !reqs.length && actions.length ? (
          <ul className="list">
            {actions.map((a) => (
              <li key={a.id}>
                <span className="list__main">{a.action}</span>
                <span className="list__aside">
                  <Status status={a.status} />
                </span>
                <span className="list__sub row" style={gap(6)}>
                  <RankingName slug={a.ranking} /> · <Due iso={a.due} withDays />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="check-circle" title="Nothing open">
            {total > 0 && `${ready} of ${total} validated.`}
          </Empty>
        )}
      </Card>

      {revisions.length ? (
        <Card className="up-side" headingLevel={level} title="Revision requested" icon="comment" tone="tint">
          <div className="stack" style={gap(18)}>
            {revisions.map((e) => (
              <div key={e.id} className="stack" style={gap(10)}>
                <ItemTitle className="up-item-title">{e.title}</ItemTitle>
                {e.comments[0] && (
                  <div className="comment" style={{ background: "var(--surface)" }}>
                    <p className="comment__who">
                      {e.comments[0].by} · {formatDate(e.comments[0].date)}
                    </p>
                    <p>{e.comments[0].text}</p>
                  </div>
                )}
                <Link href={`/admin/contributions?item=${e.id}`} className="btn btn--dark">
                  <Icon name="comment" size={18} /> Open in the queue
                </Link>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="up-side" headingLevel={level} title="Deadlines" icon="deadline" sub="Rankings this unit contributes to">
          {current && data.deadlines.length ? (
            <ul className="list">
              {data.deadlines.map((d) => (
                <li key={d.slug}>
                  <span className="list__main">
                    <RankingName slug={d.slug} />
                  </span>
                  <span className="list__aside small num" style={{ fontWeight: 600 }}>
                    {formatDate(d.deadline, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="list__sub">{daysUntil(d.deadline) >= 0 ? `in ${daysUntil(d.deadline)} days` : "Closed"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">{current ? "No deadlines assigned." : "Deadlines apply to the current cycle."}</p>
          )}
        </Card>
      )}

      <Card className="up-full" headingLevel={level} title="Accepted evidence and where it counts" sub="Each validated item, the rankings it supports and the merit it earned" icon="layers">
        {season.validated.length ? (
          <div className="up-accepted">
            {season.validated.map((e) => (
              <Accepted key={e.id} e={e} />
            ))}
          </div>
        ) : (
          <Empty icon="evidence" title={`No validated evidence in ${season.cycle}`}>
            Accepted items appear here with every ranking they count in.
          </Empty>
        )}
      </Card>

      {data.insights && season.validated.length > 0 && (
        <Card className="up-full" headingLevel={level} title="Evidence reuse insights" sub="Experiment: how many rankings each accepted item feeds" icon="layers" tone="tint">
          <ul className="list">
            {[...season.validated]
              .sort((a, b) => rankingsOf(b).length - rankingsOf(a).length)
              .map((e) => (
                <li key={e.id}>
                  <span className="list__main">{e.title}</span>
                  <span className="list__aside small num" style={{ fontWeight: 600 }}>
                    {count(rankingsOf(e).length, "ranking")}
                  </span>
                  <span className="list__sub">{e.mappedTo.length} indicators · submitted once</span>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <Card className="up-half" headingLevel={level} title="Institutional outcomes supported" icon="target">
        {season.rankings.length ? (
          <>
            <p className="small text-2">Rankings</p>
            <div className="chips mt-2">
              {season.rankings.map((r) => (
                <span key={r} className="chip chip--outline">
                  {r}
                </span>
              ))}
            </div>
            <p className="small text-2 mt-4">Sustainable Development Goals</p>
            <div className="mt-2">
              <SdgList sdgs={season.sdgs} />
            </div>
          </>
        ) : (
          <p className="small muted">Outcomes appear once evidence is validated.</p>
        )}
      </Card>
      <Card className="up-half" headingLevel={level} title="Indicators owned" icon="target" sub="Where this unit is the data owner">
        {data.owned.length ? (
          <ul className="list">
            {data.owned.map((o) => (
              <li key={o.ranking + o.name}>
                <span className="list__main">{o.name}</span>
                <span className="list__aside">
                  <Status status={o.status} />
                </span>
                <span className="list__sub">
                  <RankingName slug={o.ranking} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">None owned directly; this unit feeds indicators other offices own.</p>
        )}
      </Card>
    </div>
  );
}

function Accepted({ e }: { e: EvidenceItem }) {
  return (
    <article className="used up-used">
      <div className="up-used__head">
        <ItemTitle className="up-item-title">{e.title}</ItemTitle>
        <span className="up-merit">+{meritOf(e)}</span>
      </div>
      <p className="small muted">
        <span className="num">{e.id}</span>
        {e.result && <> · {e.result}</>}
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
  );
}
