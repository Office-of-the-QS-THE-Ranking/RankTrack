import Link from "next/link";
import type { CSSProperties } from "react";
import { ACTIONS, DIMENSION_SCORES, FAMILY, daysUntil, formatDate, type EvidenceStatus, type Ranking } from "@/lib/data";
import type { Hub } from "@/lib/governance/server/hub";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { Due, Empty, RankingName, Status, cx } from "@/components/ui/primitives";
import { ReadinessChart } from "./ReadinessChart";
import { Tile } from "./Tile";

/** The readiness each ranking works toward before its deadline. */
const GOAL = 80;
/** Ticks on the readiness meter, two points each. */
const TICKS = 50;

const PIPELINE: { status: EvidenceStatus; label: string; tone: string }[] = [
  { status: "Validated", label: "Validated", tone: "ok" },
  { status: "For review", label: "For review", tone: "review" },
  { status: "Needs revision", label: "Revisions", tone: "revise" },
  { status: "Not yet submitted", label: "Not sent", tone: "missing" },
];

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : 0);

/** The deadline runway's axis: a tick where each month starts, and its name over the middle of its span. */
function monthAxis(horizon: number) {
  const now = new Date();
  const ticks: number[] = [];
  const spans: { label: string; from: number; to: number }[] = [];
  for (let m = 1, from = 0, label = ""; ; m++) {
    const iso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1)).toISOString().slice(0, 10);
    const d = daysUntil(iso);
    const at = Math.min(100, (d / horizon) * 100);
    // The current month's span belongs to "Today".
    if (label) spans.push({ label, from, to: at });
    if (d >= horizon) break;
    ticks.push(at);
    from = at;
    label = formatDate(iso, { month: "short" });
  }
  const named = spans.filter((s) => s.to - s.from >= 9);
  const step = Math.ceil(named.length / 6);
  return { ticks, labels: named.filter((_, i) => i % step === 0).map((s) => ({ label: s.label, at: (s.from + s.to) / 2 })) };
}

/** The Submissions view of the executive dashboard: one bento of readiness, deadlines, units, dimensions, rankings and actions. */
export function SubmissionsBoard({ h, viewer }: { h: Hub; viewer: Viewer | null }) {
  const evidence = h.evidence.filter((e) => viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }));
  const readiness = mean(h.rankings.map((r) => r.readiness));
  const lit = Math.round((readiness / 100) * TICKS);
  const goalTick = Math.round((GOAL / 100) * TICKS);
  const pipeline = PIPELINE.map((p) => ({ ...p, n: evidence.filter((e) => e.status === p.status).length }));

  const upcoming = h.rankings.filter((r) => daysUntil(r.deadline) >= 0).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const next = upcoming[0];
  const days = next ? daysUntil(next.deadline) : 0;
  const horizon = Math.max(30, upcoming.length ? daysUntil(upcoming[upcoming.length - 1].deadline) : 0);
  const stops: { iso: string; at: number; rankings: Ranking[] }[] = [];
  for (const r of upcoming) {
    const last = stops[stops.length - 1];
    if (last?.iso === r.deadline) last.rankings.push(r);
    else stops.push({ iso: r.deadline, at: (daysUntil(r.deadline) / horizon) * 100, rankings: [r] });
  }
  const axis = monthAxis(horizon);

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
        <div
          className="ov-meter"
          role="meter"
          aria-label="Readiness"
          aria-valuenow={readiness}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${readiness}%, goal ${GOAL}%`}
        >
          {Array.from({ length: TICKS }, (_, i) => (
            <i
              key={i}
              className={i < lit ? "is-on" : i < goalTick ? "is-gap" : undefined}
              style={i < lit ? ({ "--i": i } as CSSProperties) : undefined}
            />
          ))}
          <b className="ov-meter__goal" style={{ left: `${GOAL}%` }}>
            <span>Goal {GOAL}%</span>
          </b>
        </div>
        <div className="ov-pipe">
          <span className="ov-pipe__bar" aria-hidden="true">
            {pipeline
              .filter((p) => p.n)
              .map((p) => (
                <i key={p.status} className={`is-${p.tone}`} style={{ flexGrow: p.n }} />
              ))}
          </span>
          <dl className="ov-pipe__legend">
            {pipeline.map((p) => (
              <div key={p.status}>
                <dt>
                  <span className={`status status--${p.tone} ov-key`}>
                    <i className="status__shape" />
                  </span>
                  {p.label}
                </dt>
                <dd>{p.n}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Tile>

      <Tile id="ov-next" title="Next deadline" className="ov-next">
        {next ? (
          <>
            <div className="ov-figrow">
              <p className="ov-value">
                {days ? (
                  <>
                    {days}
                    <small>{days === 1 ? "day" : "days"}</small>
                  </>
                ) : (
                  "Today"
                )}
              </p>
              <Link href={`/admin/rankings/${next.slug}`} className="ov-next__what">
                <RankingName slug={next.slug} />
                <time dateTime={next.deadline}>{formatDate(next.deadline, { day: "numeric", month: "long" })}</time>
              </Link>
            </div>
            <div className="ov-run">
              <span className="ov-run__axis" aria-hidden="true">
                {axis.ticks.map((t) => (
                  <i key={t} style={{ left: `${t}%` }} />
                ))}
                <span>Today</span>
                {axis.labels.map((m) => (
                  <span key={m.at} className={m.at < 22 ? "is-near" : undefined} style={{ left: `${m.at}%` }}>
                    {m.label}
                  </span>
                ))}
              </span>
              {stops.map((s) => (
                <span key={s.iso} className="ov-run__stop" style={{ left: `${s.at}%` }}>
                  {s.rankings.map((r) => (
                    <Link
                      key={r.slug}
                      href={`/admin/rankings/${r.slug}`}
                      className={cx("ov-run__dot", r === next && "is-next")}
                      style={{ "--c": FAMILY[r.family].color } as CSSProperties}
                      data-tip={`${r.short}, ${formatDate(r.deadline)}`}
                      aria-label={`${r.short}, due ${formatDate(r.deadline)}`}
                    />
                  ))}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="ov-none">No upcoming deadlines</p>
        )}
      </Tile>

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
