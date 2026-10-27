"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ACTIONS, daysUntil, formatAsOf, formatDate, readinessLevel, type Indicator, type Ranking } from "@/lib/data";
import { familyOf } from "@/lib/reference";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { Crumbs, Direction, Pattern, cx } from "@/components/ui/primitives";
import { useReference, useViews } from "@/components/reference/ReferenceProvider";
import { DeadlineControl } from "./DeadlineDrawer";
import { Gauge, RankArc, weightOf } from "./RankingCharts";

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

/**
 * The ranking at a glance: where UST stands and how it got there, in the family's colour, beside the
 * readiness dial and the days left before the next submission.
 */
export function RankingHero({ ranking: r, asOf }: { ranking: Ranking; asOf?: string }) {
  const fam = familyOf(useReference(), r.family);
  const days = daysUntil(r.deadline);
  const lvl = readinessLevel(r.readiness);
  const compared = r.direction !== "new" && r.direction !== "none" && r.previous;
  return (
    <div className="ov-bento rk-top" style={{ "--fam": fam.color } as CSSProperties}>
      <Tile id="rk-title" className="rk-hero">
        <header className="rk-hero__head">
          <p className="rk-hero__fam">
            <i aria-hidden="true" />
            {fam.name}
          </p>
          <h1 id="rk-title" className="rk-hero__title">
            {r.name}
          </h1>
          {r.current && asOf && (
            <p className="rk-hero__asof">
              <Icon name="clock" size={13} />
              Updated {formatAsOf(asOf)}
            </p>
          )}
        </header>
        <div className="rk-hero__body">
          <div className="rk-hero__now">
            <p className={cx("rk-hero__rank", !r.current && "is-none")}>{r.current || "—"}</p>
            <p className="rk-hero__move">
              <Direction dir={r.direction} />
              {compared && <span>from {r.previous}</span>}
            </p>
            <p className="rk-hero__target">
              <Icon name="target" size={14} />
              Target <b>{r.target || "not set"}</b>
            </p>
          </div>
          <RankArc points={r.history} color={fam.color} label={`${r.short} by edition`} />
        </div>
      </Tile>

      <Tile id="rk-ready" title="Readiness" className="rk-ready" aside={<span className={`rk-lvl is-${lvl.tone}`}>{lvl.label}</span>}>
        <Gauge value={r.readiness} label="Readiness" />
        <div className={cx("rk-due", days >= 0 && days <= 30 && "is-soon")}>
          <span className="rk-due__icon">
            <Icon name="calendar" size={16} />
          </span>
          <span className="rk-due__when">
            <b>{formatDate(r.deadline, { day: "numeric", month: "short", year: "numeric" })}</b>
            <small>Submission due</small>
          </span>
          <span className="rk-due__days">{days > 1 ? `${days} days` : days === 1 ? "1 day" : days === 0 ? "Today" : "Closed"}</span>
          <DeadlineControl ranking={r} />
        </div>
      </Tile>
    </div>
  );
}

export function PublicRankingHeader({ ranking: r }: { ranking: Ranking }) {
  const { families, groupOf, latestEdition } = useViews();
  const fam = families[r.family];
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
            <Link href="/publications/stories" className="btn">
              Related stories
            </Link>
          </div>
        </div>
      </div>
      <div className="fq fq--flush">
        <div className="fq__cell">
          <p className="fq__q">Where is UST now?</p>
          <p className="fq__big">{r.current || "—"}</p>
          <p className="fq__note">{r.current ? `${latestEdition} edition` : "Not yet published"}</p>
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
