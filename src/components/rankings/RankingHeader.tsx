"use client";

import type { CSSProperties } from "react";
import { daysUntil, formatAsOf, formatDate, readinessLevel, type Indicator, type Ranking } from "@/lib/data";
import type { RankingAction } from "@/lib/analytics/desk-types";
import { familyOf } from "@/lib/reference";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { Direction, cx } from "@/components/ui/primitives";
import { useReference } from "@/components/reference/ReferenceProvider";
import { DeadlineControl } from "./DeadlineDrawer";
import { Gauge, RankArc, weightOf } from "./RankingCharts";

const gapOf = (i: Indicator) => (i.current !== null && i.target ? (i.target - i.current) / i.target : 0);

/** The indicators that drive the result: heaviest weights first, then the widest gap to target. */
export function drivers(r: Ranking, n = 2) {
  return [...r.indicators].sort((a, b) => weightOf(b) - weightOf(a) || gapOf(b) - gapOf(a)).slice(0, n);
}

/** The ranking's next open action item (its plan is soonest first), else the first thing an indicator still needs. */
export function nextAction(r: Ranking, plan: RankingAction[]) {
  const a = plan.find((x) => x.status !== "Complete");
  if (a) return { action: a.action, unit: a.ownerName ?? "", due: a.due };
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
