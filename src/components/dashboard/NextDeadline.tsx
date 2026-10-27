import Link from "next/link";
import type { CSSProperties } from "react";
import { daysUntil, formatDate, type Ranking } from "@/lib/data";
import { RankingName, cx } from "@/components/ui/primitives";
import { serverViews } from "@/lib/governance/server/views";
import { Tile } from "./Tile";

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

/** The next deadline in days, then every upcoming deadline on one runway from today; each ranking's dot opens `href`. */
export async function NextDeadline({ id, rankings, href }: { id: string; rankings: Ranking[]; href: (slug: string) => string }) {
  const { families } = await serverViews();
  const upcoming = rankings.filter((r) => daysUntil(r.deadline) >= 0).sort((a, b) => a.deadline.localeCompare(b.deadline));
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

  return (
    <Tile id={id} title="Next deadline" className="ov-next">
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
            <Link href={href(next.slug)} className="ov-next__what">
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
                    href={href(r.slug)}
                    className={cx("ov-run__dot", r === next && "is-next")}
                    style={{ "--c": families[r.family].color } as CSSProperties}
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
  );
}
