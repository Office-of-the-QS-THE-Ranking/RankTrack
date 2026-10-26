"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { Ranking } from "@/lib/data";
import { Segmented } from "@/components/ui/interactive";
import { RankingName } from "@/components/ui/primitives";
import { useRankings } from "@/components/hub/HubProvider";

type Metric = "readiness" | "pending";

/** One bar per framework: readiness against the goal, or pending items. Family colour sits on the dot beside each name, never on the bar. */
export function ReadinessChart({ goal }: { goal: number }) {
  const [metric, setMetric] = useState<Metric>("readiness");
  const rankings = useRankings();
  const pending = rankings.reduce((n, r) => n + r.pending, 0);
  const value = (r: Ranking) => (metric === "readiness" ? r.readiness : r.pending);
  const max = metric === "readiness" ? 100 : Math.max(10, Math.ceil(Math.max(0, ...rankings.map((r) => r.pending)) / 10) * 10);
  const suffix = metric === "readiness" ? "%" : "";

  return (
    <>
      <header className="ov-tile__head">
        <h2 id="ov-rk" className="ov-tile__title">
          By ranking
        </h2>
        <Segmented
          options={[
            { value: "readiness", label: "Readiness" },
            { value: "pending", label: "Pending", count: pending },
          ]}
          value={metric}
          onChange={setMetric}
          label="Measure"
          className="ov-seg"
        />
      </header>
      {rankings.length ? (
        <ul className={`ov-bars is-${metric}`} style={{ "--goal": `${goal}%` } as CSSProperties}>
          {rankings.map((r) => (
            <li key={r.slug}>
              <Link href={`/admin/rankings/${r.slug}`} className="ov-bars__row">
                <RankingName slug={r.slug} />
                <span className="ov-bars__track">
                  <span className="ov-bars__fill" style={{ width: `${(value(r) / max) * 100}%` }} />
                </span>
                <span className="ov-bars__value">
                  {value(r)}
                  {suffix}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ov-none">No rankings in use</p>
      )}
    </>
  );
}
