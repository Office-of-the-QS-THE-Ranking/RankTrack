import Link from "next/link";
import type { CSSProperties } from "react";
import { ACTIONS, DIMENSION_SCORES, daysUntil } from "@/lib/data";
import type { Hub } from "@/lib/governance/server/hub";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { Due, Empty, RankingName, Status, cx } from "@/components/ui/primitives";
import { StatusMix, TickMeter } from "./Gauges";
import { NextDeadline } from "./NextDeadline";
import { ReadinessChart } from "./ReadinessChart";
import { Tile } from "./Tile";

/** The readiness each ranking works toward before its deadline. */
const GOAL = 80;

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : 0);

/** The Submissions view of the executive dashboard: one bento of readiness, deadlines, units, dimensions, rankings and actions. */
export function SubmissionsBoard({ h, viewer }: { h: Hub; viewer: Viewer | null }) {
  const evidence = h.evidence.filter((e) => viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }));
  const readiness = mean(h.rankings.map((r) => r.readiness));

  const units = h.activeUnits
    .map((u) => ({ slug: u.slug, on: h.evidence.some((e) => e.unitSlug === u.slug) }))
    .sort((a, b) => Number(b.on) - Number(a.on));
  const engaged = units.filter((u) => u.on).length;

  const dimNow = mean(DIMENSION_SCORES.map((d) => d.current));
  const dimTarget = mean(DIMENSION_SCORES.map((d) => d.target));

  const open = ACTIONS.filter((a) => h.isActive(a.ranking) && a.status !== "Validated").sort((a, b) => a.due.localeCompare(b.due));
  const shown = open.slice(0, 5);

  return (
    <div className="ov-bento">
      <Tile id="ov-ready" title="Readiness" className="ov-hero">
        <div className="ov-figrow">
          <p className="ov-hero__value">
            {readiness}
            <small>%</small>
          </p>
          <p className="ov-stat">
            <span>{readiness < GOAL ? "To goal" : "Goal"}</span>
            <b>{readiness < GOAL ? `${GOAL - readiness} pts` : "Met"}</b>
          </p>
        </div>
        <TickMeter value={readiness} goal={GOAL} label="Readiness" />
        <StatusMix items={evidence} />
      </Tile>

      <NextDeadline id="ov-next" rankings={h.rankings} href={(slug) => `/admin/rankings/${slug}`} />

      <Tile id="ov-units" title="Units engaged" className="ov-units" href="/admin/units">
        {units.length ? (
          <>
            <p className="ov-value">
              {engaged}
              <small>of {units.length}</small>
            </p>
            <span className="ov-dots" aria-hidden="true">
              {units.map((u) => (
                <i key={u.slug} className={u.on ? "is-on" : undefined} />
              ))}
            </span>
          </>
        ) : (
          <p className="ov-none">No active units</p>
        )}
      </Tile>

      <Tile id="ov-dim" title="Dimension index" className="ov-dims" href="/admin?view=rankings">
        {DIMENSION_SCORES.length ? (
          <>
            <div className="ov-figrow">
              <p className="ov-value">
                {dimNow}
                <small>/100</small>
              </p>
              <p className="ov-stat">
                <span>Target</span>
                <b>{dimTarget}</b>
              </p>
            </div>
            <span
              className="ov-cols"
              role="img"
              aria-label={DIMENSION_SCORES.map((d) => `${d.dimension} ${d.current} of target ${d.target}`).join("; ")}
            >
              {DIMENSION_SCORES.map((d) => (
                <i
                  key={d.dimension}
                  style={{ "--v": `${d.current}%`, "--t": `${d.target}%` } as CSSProperties}
                  data-tip={`${d.dimension}: ${d.current} of ${d.target}`}
                >
                  <b />
                </i>
              ))}
            </span>
          </>
        ) : (
          <p className="ov-none">Not scored yet</p>
        )}
      </Tile>

      <Tile id="ov-rk" className="ov-rank">
        <ReadinessChart goal={GOAL} />
      </Tile>

      <Tile
        id="ov-act"
        title={
          <>
            Open actions <span className="count">{open.length}</span>
          </>
        }
        className="ov-acts"
        aside={
          open.length > shown.length && (
            <Link href="/admin/contribute" className="btn btn--sm">
              View all
            </Link>
          )
        }
      >
        {shown.length ? (
          <ul className="ov-acts__list">
            {shown.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/rankings/${a.ranking}`} className="ov-act">
                  <span className="ov-act__what">{a.action}</span>
                  <Status status={a.status} />
                  <span className="ov-act__meta">
                    <RankingName slug={a.ranking} />
                    <span>{a.unit}</span>
                  </span>
                  <span className={cx("ov-act__due", daysUntil(a.due) <= h.dashboard.deadlineWarningDays && "is-soon")}>
                    <Due iso={a.due} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="check" title="No open actions" />
        )}
      </Tile>
    </div>
  );
}
