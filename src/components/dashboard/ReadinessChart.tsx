"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import { FAMILY } from "@/lib/data";
import { Segmented } from "@/components/ui/interactive";
import { useRankings } from "@/components/hub/HubProvider";

const TICK: Record<string, string> = { "THE by Subject": "THE Subj.", "QS by Subject": "QS Subj.", "QS Sustainability": "QS Sust.", "UI GreenMetric": "UI GM" };

type Metric = "readiness" | "pending";
const METRICS = [
  { value: "readiness" as const, label: "Readiness" },
  { value: "pending" as const, label: "Pending" },
];

/** Column chart of the eight frameworks; family colour sits beside each short name, never alone. */
export function ReadinessChart() {
  const [metric, setMetric] = useState<Metric>("readiness");
  const RANKINGS = useRankings();
  const rows = RANKINGS.map((r) => ({ slug: r.slug, short: r.short, color: FAMILY[r.family].color, value: metric === "readiness" ? r.readiness : r.pending }));
  const max = metric === "readiness" ? 100 : Math.max(10, Math.ceil(Math.max(0, ...rows.map((r) => r.value)) / 10) * 10);
  const ticks = [max, max / 2, 0];
  const suffix = metric === "readiness" ? "%" : "";

  return (
    <div className="ov-cols">
      <Segmented options={METRICS} value={metric} onChange={setMetric} label="Chart metric" className="ov-cols__seg" />
      <div className="ov-cols__plot" role="list" aria-label={metric === "readiness" ? "Readiness by ranking" : "Pending items by ranking"}>
        <div className="ov-cols__axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t}>
              {t}
              {suffix}
            </span>
          ))}
        </div>
        {metric === "readiness" && <span className="ov-cols__line" style={{ bottom: "calc((100% - 18px) * 0.8)" }} aria-hidden="true" title="80% readiness" />}
        {rows.map((r) => (
          <Link key={r.slug} href={`/admin/rankings/${r.slug}`} className="ov-cols__col" role="listitem" aria-label={`${r.short}: ${r.value}${suffix}`}>
            <span className="ov-cols__val num">
              {r.value}
              {suffix}
            </span>
            <span className="ov-cols__track">
              <span className="ov-cols__bar" style={{ height: `${(r.value / max) * 100}%`, ["--c" as string]: r.color } as CSSProperties} />
            </span>
          </Link>
        ))}
      </div>
      <div className="ov-cols__names" aria-hidden="true">
        <span />
        {rows.map((r) => (
          <span key={r.slug}>
            <i style={{ background: r.color }} />
            {TICK[r.short] ?? r.short}
          </span>
        ))}
      </div>
    </div>
  );
}
