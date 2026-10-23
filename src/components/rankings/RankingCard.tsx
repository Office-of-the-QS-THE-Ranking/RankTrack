import Link from "next/link";
import type { CSSProperties } from "react";
import { FAMILY, LATEST_EDITION, daysUntil, formatDate, groupOf, readinessLevel, type Ranking } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Direction, Meter } from "@/components/ui/primitives";

/** "Education 501–600" → subject + band; "834" → world rank; "Baseline" → status. Keeps rows aligned. */
export function splitResult(current: string) {
  const m = current.match(/^([A-Za-z ]+?)\s+(\d.*)$/);
  if (m) return { label: m[1], value: m[2] };
  if (/^\d+$/.test(current)) return { label: "World rank", value: current };
  if (/^\d/.test(current)) return { label: "Rank band", value: current };
  return { label: "Status", value: current };
}

/**
 * One of the eight ranking cards. Internal: current, previous, direction, readiness, next deadline,
 * pending items (proposal §2C). Public: published results only, no readiness or deadlines.
 */
export function RankingCard({ ranking: r, mode }: { ranking: Ranking; mode: "internal" | "public" }) {
  const fam = FAMILY[r.family];
  const href = mode === "internal" ? `/admin/rankings/${r.slug}` : `/rankings/${r.slug}`;
  const days = daysUntil(r.deadline);
  const lvl = readinessLevel(r.readiness);
  const { label, value } = splitResult(r.current);
  return (
    <Link href={href} className="card card--link rcard" style={{ ["--band" as string]: fam.band } as CSSProperties}>
      <span className="rcard__band" aria-hidden="true" />
      <span className="rcard__top">
        <span className="rcard__fam">{groupOf(r.slug)}</span>
        <Direction dir={r.direction} />
      </span>
      <span className="rcard__name">{r.short}</span>
      <span className="rcard__now">
        <span className="rcard__subj">{label}</span>
        {value}
      </span>
      <span className="rcard__prev">
        Previous <b className="num">{r.previous}</b>
      </span>

      {mode === "internal" ? (
        <>
          <span className="rcard__ready">
            <span className="row row--between" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
              <span className="small text-2">
                Readiness <b className="num">{r.readiness}%</b>
              </span>
              <span className="small muted">{lvl.label}</span>
            </span>
            <Meter value={r.readiness} label={`${r.short} readiness`} tone={lvl.tone === "ok" ? "ok" : lvl.tone === "revise" ? "revise" : "missing"} />
          </span>
          <span className="rcard__meta">
            <span>
              <Icon name="deadline" size={15} />
              <span>
                {formatDate(r.deadline, { day: "numeric", month: "short", year: "numeric" })}
                <span className="muted"> · {days} days</span>
              </span>
            </span>
            <span>
              <Icon name="evidence" size={15} />
              <span>
                <b className="num">{r.pending}</b> evidence items pending
              </span>
            </span>
          </span>
          <span className="rcard__go">
            View dashboard <Icon name="arrow" size={16} />
          </span>
        </>
      ) : (
        <>
          <span className="rcard__msg">{r.message}</span>
          <span className="rcard__go">
            <span className="muted small">{LATEST_EDITION} edition</span>
            <span className="row" style={{ ["--gap" as string]: "6px" } as CSSProperties}>
              Explore <Icon name="arrow" size={16} />
            </span>
          </span>
        </>
      )}
    </Link>
  );
}
