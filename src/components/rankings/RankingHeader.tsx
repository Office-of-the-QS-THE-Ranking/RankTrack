import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ACTIONS,
  EVIDENCE,
  FAMILY,
  LATEST_EDITION,
  daysUntil,
  formatAsOf,
  formatDate,
  groupOf,
  readinessLevel,
  type Indicator,
  type Ranking,
} from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Crumbs, Direction, Meter, Pattern, Trend } from "@/components/ui/primitives";

const weightOf = (i: Indicator) => {
  const n = parseFloat(i.weight);
  return Number.isFinite(n) ? n : 0;
};
const gapOf = (i: Indicator) => (i.current !== null && i.target ? (i.target - i.current) / i.target : 0);

/** The indicators that drive the result: heaviest weights first, then the widest gap to target. */
export function drivers(r: Ranking, n = 2) {
  return [...r.indicators].sort((a, b) => weightOf(b) - weightOf(a) || gapOf(b) - gapOf(a)).slice(0, n);
}

export function nextAction(r: Ranking) {
  const a = ACTIONS.filter((x) => x.ranking === r.slug && x.status !== "Validated").sort((x, y) => x.due.localeCompare(y.due))[0];
  if (a) return { action: a.action, unit: a.unit, due: a.due as string | undefined };
  const ind = r.indicators.find((i) => i.actions.length);
  return ind ? { action: ind.actions[0], unit: ind.owner, due: undefined } : null;
}

export function RankingHeader({ ranking: r, actions, asOf }: { ranking: Ranking; actions?: ReactNode; asOf?: string }) {
  const fam = FAMILY[r.family];
  const days = daysUntil(r.deadline);
  const lvl = readinessLevel(r.readiness);
  return (
    <header className="card rhead" style={{ ["--band" as string]: fam.band } as CSSProperties}>
      <span className="rhead__band" aria-hidden="true" />
      <Pattern className="rhead__pattern" fade="left" />
      <div className="rhead__in">
        <div className="rhead__row">
          <div className="rhead__titles">
            <p className="rhead__fam">
              <i className="sw sw--lg" style={{ background: fam.band }} aria-hidden="true" />
              {fam.name}
            </p>
            <h1 className="rhead__title">{r.name}</h1>
            <p className="rhead__msg">{r.message}</p>
          </div>
          {actions && <div className="ph__actions">{actions}</div>}
        </div>
        <dl className="rhead__facts">
          <div>
            <dt>Target</dt>
            <dd className="num">{r.target || <span className="muted">Not set</span>}</dd>
          </div>
          <div>
            <dt>Next submission deadline</dt>
            <dd>
              {formatDate(r.deadline, { day: "numeric", month: "short", year: "numeric" })}
              <span className="muted"> · in {days} days</span>
            </dd>
          </div>
          <div className="rhead__ready">
            <dt>Overall readiness</dt>
            <dd>
              <span className="row" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
                <b className="num">{r.readiness}%</b>
                <span className="muted">{lvl.label}</span>
              </span>
              <Meter value={r.readiness} label="Overall readiness" tone={lvl.tone === "ok" ? "ok" : lvl.tone === "revise" ? "revise" : "missing"} />
            </dd>
          </div>
          <div>
            <dt>Data last updated</dt>
            <dd>
              {r.current && asOf ? formatAsOf(asOf) : "No data yet"}
              <span className="muted"> · {r.reportingPeriod.split(";")[0]}</span>
            </dd>
          </div>
        </dl>
      </div>
    </header>
  );
}

/** Every ranking page answers five questions immediately (proposal, "Design of each ranking dashboard"). */
export function FiveQuestions({ ranking: r, onTab, reviewing: inReview }: { ranking: Ranking; onTab?: (tab: string) => void; reviewing?: number }) {
  const top = drivers(r);
  const act = nextAction(r);
  const revisions = r.indicators.filter((i) => i.status === "Needs revision").length;
  const missing = r.indicators.filter((i) => i.status === "Not yet submitted").length;
  const reviewing = inReview ?? EVIDENCE.filter((e) => e.status === "For review" && e.mappedTo.some((m) => m.startsWith(r.short + " ·"))).length;
  const jump = (tab: string) =>
    onTab ? (
      <button type="button" className="link small" onClick={() => onTab(tab)}>
        {tab === "Indicators" ? "All indicators" : tab === "Evidence" ? "Open evidence" : "Action plan"} <Icon name="arrow" size={14} />
      </button>
    ) : null;

  return (
    <section className="fq" aria-label="Five questions">
      <div className="fq__cell">
        <p className="fq__q">Where is UST now?</p>
        <p className="fq__big">{r.current || "—"}</p>
        <p className="fq__note">{r.current ? `${r.short}, ${LATEST_EDITION} edition` : "No result recorded yet"}</p>
      </div>
      <div className="fq__cell">
        <p className="fq__q">What changed?</p>
        <p className="fq__mid">
          <Direction dir={r.direction} />
        </p>
        <p className="fq__note">
          {r.direction === "new" ? "Building a first ranked entry" : r.direction === "none" ? "Nothing to compare yet" : <>From {r.previous} in the previous edition</>}
        </p>
      </div>
      <div className="fq__cell fq__cell--wide">
        <p className="fq__q">Which indicators drive the result?</p>
        <ul className="fq__list">
          {top.map((i) => (
            <li key={i.name}>
              <span className="fq__ind">
                <b>{i.name}</b>
                <span className="muted"> · {i.weight}</span>
              </span>
              <span className="row nowrap" style={{ ["--gap" as string]: "10px" } as CSSProperties}>
                <span className="num small">
                  {i.current ?? "—"}
                  <span className="muted"> / {i.target ?? "—"}</span>
                </span>
                <Trend trend={i.trend} />
              </span>
            </li>
          ))}
        </ul>
        {jump("Indicators")}
      </div>
      <div className="fq__cell">
        <p className="fq__q">What evidence is still required?</p>
        <p className="fq__big">
          {r.pending}
          <span className="fq__unit"> items</span>
        </p>
        <p className="fq__note">
          {revisions} needs revision · {missing} not yet submitted · {reviewing} in review
        </p>
        {jump("Evidence")}
      </div>
      <div className="fq__cell fq__cell--wide">
        <p className="fq__q">Who needs to act next?</p>
        {act ? (
          <>
            <p className="fq__act">{act.action}</p>
            <p className="fq__note">
              {act.unit}
              {act.due && (
                <>
                  {" · due "}
                  {formatDate(act.due)} <span className="muted">(in {daysUntil(act.due)} days)</span>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="fq__note">No open actions.</p>
        )}
        {jump("Action Plan")}
      </div>
    </section>
  );
}

export function PublicRankingHeader({ ranking: r }: { ranking: Ranking }) {
  const fam = FAMILY[r.family];
  return (
    <header className="card rhead" style={{ ["--band" as string]: fam.band } as CSSProperties}>
      <span className="rhead__band" aria-hidden="true" />
      <Pattern className="rhead__pattern" fade="left" />
      <div className="rhead__in">
        <Crumbs items={[{ href: "/rankings", label: "Rankings" }, { href: "/rankings", label: groupOf(r.slug) }, { label: r.short }]} />
        <div className="rhead__row">
          <div className="rhead__titles">
            <p className="rhead__fam">
              <i className="sw sw--lg" style={{ background: fam.band }} aria-hidden="true" />
              {fam.name}
            </p>
            <h1 className="rhead__title">{r.name}</h1>
            <p className="rhead__msg">{r.publicNote}</p>
          </div>
          <div className="ph__actions">
            <Link href="/impact" className="btn">
              Related impact stories
            </Link>
          </div>
        </div>
      </div>
      <div className="fq fq--flush">
        <div className="fq__cell">
          <p className="fq__q">Where is UST now?</p>
          <p className="fq__big">{r.current || "—"}</p>
          <p className="fq__note">{r.current ? `${LATEST_EDITION} edition` : "Not yet published"}</p>
        </div>
        <div className="fq__cell">
          <p className="fq__q">What changed?</p>
          <p className="fq__mid">
            <Direction dir={r.direction} />
          </p>
          <p className="fq__note">{r.direction === "new" ? "Baseline year" : r.direction === "none" ? "Nothing to compare yet" : <>From {r.previous}</>}</p>
        </div>
        <div className="fq__cell fq__cell--wide">
          <p className="fq__q">What does it measure?</p>
          <p className="fq__note fq__note--strong">{r.measures}.</p>
        </div>
      </div>
    </header>
  );
}
