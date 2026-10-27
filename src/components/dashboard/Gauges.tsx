import type { CSSProperties } from "react";
import type { EvidenceStatus } from "@/lib/data";

/** Ticks on a readiness meter, two points each. */
const TICKS = 50;

const MIX: { status: EvidenceStatus; label: string; tone: string }[] = [
  { status: "Validated", label: "Validated", tone: "ok" },
  { status: "For review", label: "For review", tone: "review" },
  { status: "Needs revision", label: "Revisions", tone: "revise" },
  { status: "Not yet submitted", label: "Not sent", tone: "missing" },
];

/** One tick per two points: gold up to `value`, pale gold for the shortfall to `goal`, an ink marker at the goal. */
export function TickMeter({ value, goal, label }: { value: number; goal?: number; label: string }) {
  const lit = Math.round((value / 100) * TICKS);
  const goalTick = goal === undefined ? 0 : Math.round((goal / 100) * TICKS);
  return (
    <div
      className="ov-meter"
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={goal === undefined ? `${value}%` : `${value}%, goal ${goal}%`}
    >
      {Array.from({ length: TICKS }, (_, i) => (
        <i
          key={i}
          className={i < lit ? "is-on" : i < goalTick ? "is-gap" : undefined}
          style={i < lit ? ({ "--i": i } as CSSProperties) : undefined}
        />
      ))}
      {goal !== undefined && (
        <b className="ov-meter__goal" style={{ left: `${goal}%` }}>
          <span>Goal {goal}%</span>
        </b>
      )}
    </div>
  );
}

/** Records by status: their proportions on one bar, then each count with its status shape. */
export function StatusMix({ items }: { items: { status: EvidenceStatus }[] }) {
  const mix = MIX.map((p) => ({ ...p, n: items.filter((e) => e.status === p.status).length }));
  return (
    <div className="ov-pipe">
      <span className="ov-pipe__bar" aria-hidden="true">
        {mix
          .filter((p) => p.n)
          .map((p) => (
            <i key={p.status} className={`is-${p.tone}`} style={{ flexGrow: p.n }} />
          ))}
      </span>
      <dl className="ov-pipe__legend">
        {mix.map((p) => (
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
  );
}
