import Link from "next/link";
import { calendarOf } from "@/lib/calendar";
import { Suspense } from "react";
import { daysUntil } from "@/lib/data";
import type { Hub } from "@/lib/governance/server/hub";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { rankingActions, requestsBrief } from "@/lib/analytics/server/desk";
import { Due, Empty, PlanStatus, RankingName, cx } from "@/components/ui/primitives";
import { StatusMix, TickMeter } from "./Gauges";
import { NextDeadlineTile, SubmissionCalendar } from "./NextDeadline";
import { ReadinessChart } from "./ReadinessChart";
import { Tile } from "./Tile";

/** The readiness each ranking works toward before its deadline. */
const GOAL = 80;

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : 0);

/** What the Office has asked of units and how much has come back. The detail is on Rankings › Data requests. */
async function RequestsTile() {
  const { open, requested, sent, overdue } = await requestsBrief();
  return (
    <Tile glow id="ov-reqs" title="Data requests" className="ov-reqs" href="/admin/rankings/data-requests">
      {open ? (
        <>
          <div className="ov-figrow">
            <p className="ov-value">
              {open}
              <small>open</small>
            </p>
            <p className="ov-stat">
              <span>Units overdue</span>
              <b>{overdue}</b>
            </p>
          </div>
          <TickMeter value={requested ? Math.round((sent / requested) * 100) : 0} label="Requested items sent" />
        </>
      ) : (
        <p className="ov-none">No open requests</p>
      )}
    </Tile>
  );
}

/** The plan's next steps, soonest first. Each opens its ranking's Action plan, where the whole plan is. */
async function ActionsTile({ warningDays }: { warningDays: number }) {
  const open = (await rankingActions()).filter((a) => a.status !== "Complete");
  const shown = open.slice(0, 5);
  return (
    <Tile
      glow
      id="ov-act"
      title={
        <>
          Open actions <span className="count">{open.length}</span>
        </>
      }
      className="ov-acts"
      aside={
        open.length > shown.length && (
          <Link href="/admin/rankings" className="btn btn--sm">
            View all
          </Link>
        )
      }
    >
      {shown.length ? (
        <ul className="ov-acts__list">
          {shown.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/rankings/${a.ranking}#action-plan`} className="ov-act">
                <span className="ov-act__what">{a.action}</span>
                <PlanStatus status={a.status} />
                <span className="ov-act__meta">
                  <RankingName slug={a.ranking} />
                  {a.ownerName && <span>{a.ownerName}</span>}
                </span>
                {a.due && (
                  <span className={cx("ov-act__due", daysUntil(a.due) <= warningDays && "is-soon")}>
                    <Due iso={a.due} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="check" title="No open actions" />
      )}
    </Tile>
  );
}

/**
 * The Submissions view of the executive dashboard: a quick look at where things stand. It holds nothing of its own;
 * each tile summarises a page and links to it.
 */
export function SubmissionsBoard({ h, viewer }: { h: Hub; viewer: Viewer | null }) {
  const evidence = h.evidence.filter((e) => viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }));
  const readiness = mean(h.rankings.map((r) => r.readiness));
  // The plan and the data requests are scoring data, for those who may read Rankings.
  const scoring = viewerCan(viewer, "rankings", "view");

  const units = h.activeUnits
    .map((u) => ({ slug: u.slug, on: h.evidence.some((e) => e.unitSlug === u.slug) }))
    .sort((a, b) => Number(b.on) - Number(a.on));
  const engaged = units.filter((u) => u.on).length;
  const calendar = calendarOf(h.rankings, h.state.config.calendar);

  return (
    <div className="ov-bento">
      <NextDeadlineTile id="ov-next" calendar={calendar} href={(slug) => `/admin/rankings/${slug}`} />

      <Tile glow id="ov-ready" title="Readiness" className="ov-hero" href="/admin/rankings">
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

      <SubmissionCalendar id="ov-next-calendar" calendar={calendar} />

      <Tile glow id="ov-units" title="Units engaged" className="ov-units" href="/admin/unit-submissions?tab=units">
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

      {scoring && (
        <Suspense
          fallback={
            <Tile glow id="ov-reqs" title="Data requests" className="ov-reqs" href="/admin/rankings/data-requests">
              <span />
            </Tile>
          }
        >
          <RequestsTile />
        </Suspense>
      )}

      <Tile glow id="ov-rk" className="ov-rank">
        <ReadinessChart goal={GOAL} />
      </Tile>

      {scoring && (
        <Suspense
          fallback={
            <Tile glow id="ov-act" title="Open actions" className="ov-acts">
              <span />
            </Tile>
          }
        >
          <ActionsTile warningDays={h.dashboard.deadlineWarningDays} />
        </Suspense>
      )}
    </div>
  );
}
