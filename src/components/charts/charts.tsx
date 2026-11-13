"use client";

import Link from "next/link";
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { Ranking } from "@/lib/data";
import { Card, Swatch } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/interactive";

/* ---------- Frame: title, legend and a table view for every chart ---------- */
export function ChartFrame({
  title,
  sub,
  legend,
  table,
  children,
  actions,
  className,
  id,
  headingLevel,
}: {
  title: string;
  sub?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
  headingLevel?: 2 | 3;
}) {
  const [view, setView] = useState<"Chart" | "Table">("Chart");
  return (
    <Card
      title={title}
      sub={sub}
      id={id}
      className={className}
      headingLevel={headingLevel}
      actions={
        <>
          {actions}
          <Segmented className="viewtoggle" options={["Chart", "Table"] as const} value={view} onChange={setView} label={`${title}: view as`} />
        </>
      }
    >
      {view === "Chart" ? (
        <>
          {legend && <div className="legend" style={{ marginBottom: 14 }}>{legend}</div>}
          {children}
        </>
      ) : (
        <div className="table-wrap">{table}</div>
      )}
    </Card>
  );
}

/* Arrow-key stepping for a focusable chart. */
export function useStepper(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    setActive((a) => {
      const cur = a ?? count - 1;
      if (e.key === "Home") return 0;
      if (e.key === "End") return count - 1;
      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      return (cur + dir + count) % count;
    });
  };
  return { active, setActive, onKeyDown, onFocus: () => setActive((a) => a ?? count - 1), onBlur: () => setActive(null) };
}

/* ---------- Radar: institutional profile, current against target ---------- */
export function Radar({ rows }: { rows: { label: string; current: number; target: number }[] }) {
  const W = 460;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = 104;
  const n = rows.length;
  // Trig results differ in the last digits between server and browser engines: round every coordinate.
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const cosA = (a: number) => r2(Math.cos(a) * 1000) / 1000;
  const sinA = (a: number) => r2(Math.sin(a) * 1000) / 1000;
  const pt = (i: number, v: number) => [r2(cx + ((R * v) / 100) * cosA(ang(i))), r2(cy + ((R * v) / 100) * sinA(ang(i)))];
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map((c) => c.toFixed(1)).join(",")).join(" ");
  const { active, setActive, onKeyDown, onFocus, onBlur } = useStepper(n);

  return (
    <div className="chart" onPointerLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart__svg"
        role="img"
        aria-label={`Performance by institutional dimension, index 0 to 100. ${rows.map((r) => `${r.label} ${r.current}, target ${r.target}`).join("; ")}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {[25, 50, 75, 100].map((v) => (
          <polygon key={v} className="radar__ring" points={poly(rows.map(() => v))} />
        ))}
        {rows.map((_, i) => {
          const [x2, y2] = pt(i, 100);
          return <line key={i} className="radar__spoke" x1={cx} y1={cy} x2={x2} y2={y2} />;
        })}
        <text className="radar__axis-val" x={cx + 4} y={cy - R * 0.5 - 3}>
          50
        </text>
        <text className="radar__axis-val" x={cx + 4} y={cy - R - 3}>
          100
        </text>
        <polygon className="radar__target" points={poly(rows.map((r) => r.target))} />
        <polygon className="radar__current" points={poly(rows.map((r) => r.current))} />
        {rows.map((r, i) => {
          const [px, py] = pt(i, r.current);
          const [lx, ly] = pt(i, 100);
          const cos = cosA(ang(i));
          const sin = sinA(ang(i));
          const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
          const tx = r2(lx + cos * 12);
          const ty = r2(ly + sin * 12 + (sin > 0.3 ? 10 : sin < -0.3 ? -2 : 4));
          // Wedge hit area for each axis
          const a0 = ang(i) - Math.PI / n;
          const a1 = ang(i) + Math.PI / n;
          const wedge = `M${cx},${cy} L${r2(cx + (R + 30) * cosA(a0))},${r2(cy + (R + 30) * sinA(a0))} A${R + 30},${R + 30} 0 0 1 ${r2(cx + (R + 30) * cosA(a1))},${r2(cy + (R + 30) * sinA(a1))} Z`;
          return (
            <g key={r.label}>
              <path d={wedge} className="radar__hit" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
              <circle className={`radar__dot${active === i ? " is-active" : ""}`} cx={px} cy={py} r={active === i ? 6 : 4} />
              <text className="radar__axis" x={tx} y={ty} textAnchor={anchor} style={active === i ? { fill: "var(--text)" } : undefined}>
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <div
          className="tip"
          style={{
            left: `${(pt(active, Math.max(rows[active].current, rows[active].target))[0] / W) * 100}%`,
            top: `${(pt(active, Math.max(rows[active].current, rows[active].target))[1] / H) * 100}%`,
          }}
        >
          <span className="tip__value">{rows[active].current} of 100</span>
          <span className="tip__label">{rows[active].label}</span>
          <span className="tip__row">
            <i className="tip__key" style={{ ["--k" as string]: "var(--n-400)" } as CSSProperties} />
            Target <b>{rows[active].target}</b>
          </span>
          <span className="tip__row">
            <i className="tip__key" />
            Gap <b>{rows[active].target - rows[active].current}</b>
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------- Horizontal bars (one series, one colour; identity by swatch + name) ---------- */
export function BarList({
  rows,
  max = 100,
  suffix = "%",
  label,
  marker,
}: {
  rows: { label: string; value: number; family?: Ranking["family"]; href?: string; detail?: string }[];
  max?: number;
  suffix?: string;
  label: string;
  marker?: { value: number; label: string };
}) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <ul className="bars" aria-label={label}>
      {rows.map((r, i) => {
        const inner = (
          <>
            <span className="bars__label">
              {r.family && <Swatch family={r.family} />}
              <span>{r.label}</span>
            </span>
            <span className="bars__track" aria-hidden="true">
              <span className="bars__fill" style={{ width: `${(r.value / max) * 100}%`, ["--i" as string]: i } as CSSProperties} />
              {marker && <span className="bars__mark" style={{ left: `calc(${(marker.value / max) * 100}% - 1px)` }} title={marker.label} />}
              {active === i && r.detail && (
                <span className="tip" style={{ left: `${(r.value / max) * 100}%`, top: 0 }}>
                  <span className="tip__value">
                    {r.value}
                    {suffix}
                  </span>
                  <span className="tip__label">{r.detail}</span>
                </span>
              )}
            </span>
            <span className="bars__val">
              {r.value.toLocaleString()}
              {suffix}
            </span>
          </>
        );
        return (
          <li key={r.label}>
            {r.href ? (
              <Link
                href={r.href}
                className="bars__row"
                style={{ textDecoration: "none", color: "inherit" }}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${r.label}: ${r.value}${suffix}${r.detail ? `. ${r.detail}` : ""}`}
              >
                {inner}
              </Link>
            ) : (
              <div className="bars__row" onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}>
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Dumbbell: current against target ---------- */
export function Dumbbell({ rows, max = 100, label }: { rows: { label: string; current: number; target: number }[]; max?: number; label: string }) {
  return (
    <div role="list" aria-label={label}>
      {rows.map((r) => {
        const c = (r.current / max) * 100;
        const t = (r.target / max) * 100;
        return (
          <div key={r.label} className="dumbbell__row" role="listitem" title={`${r.label}: ${r.current}, target ${r.target}`}>
            <span>{r.label}</span>
            <span className="dumbbell__track" aria-hidden="true">
              <span className="dumbbell__gap" style={{ left: `${Math.min(c, t)}%`, width: `${Math.abs(t - c)}%` }} />
              <span className="dumbbell__dot dumbbell__dot--tgt" style={{ left: `${t}%` }} />
              <span className="dumbbell__dot dumbbell__dot--cur" style={{ left: `${c}%` }} />
            </span>
            <span className="dumbbell__val">
              <b>{r.current}</b> / {r.target}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Funnel: ordinal stages with step conversion ---------- */
export function Funnel({ steps, color = "var(--ink)", label }: { steps: { step: string; count: number }[]; color?: string; label: string }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <ol className="funnel" aria-label={label}>
      {steps.map((s, i) => {
        const conv = i > 0 && steps[i - 1].count ? Math.round((s.count / steps[i - 1].count) * 100) : null;
        return (
          <li key={s.step} className="funnel__row" title={conv !== null ? `${s.step}: ${s.count} (${conv}% of the previous stage)` : `${s.step}: ${s.count}`}>
            <span className="funnel__label">
              <span className="funnel__step">{i + 1}</span>
              <span>{s.step}</span>
            </span>
            <span className="funnel__track" aria-hidden="true">
              <span className="funnel__fill" style={{ width: `${(s.count / max) * 100}%`, ["--bar" as string]: color, ["--i" as string]: i } as CSSProperties} />
            </span>
            <span className="funnel__val">
              {s.count}
              {conv !== null && <span className="sr-only">, {conv}% of the previous stage</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Sparkline ---------- */
export function Sparkline({ values, width = 88, height = 28, label }: { values: number[]; width?: number; height?: number; label: string }) {
  const v = values.filter((x) => x > 0);
  if (v.length < 2) return <span className="small muted">{v.length ? "New" : "—"}</span>;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const r = Math.max(0.0001, max - min);
  const p = v.map((val, i) => [4 + (i * (width - 8)) / (v.length - 1), height - 4 - ((val - min) / r) * (height - 8)]);
  const d = p.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");
  const last = p[p.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="spark" role="img" aria-label={`${label}: ${v.join(", ")}`}>
      <path d={d} />
      <circle cx={last[0]} cy={last[1]} r={3.5} />
    </svg>
  );
}

/* ---------- Indicator history against target (single series, target labelled directly) ---------- */
export function LineWithTarget(props: Parameters<typeof LineWithTargetPlot>[0]) {
  if (!props.values.some((v) => v > 0) && !props.target) return <p className="small muted">No values recorded yet</p>;
  return <LineWithTargetPlot {...props} />;
}

function LineWithTargetPlot({
  values,
  years,
  target,
  label,
  color = "var(--ink)",
  format,
}: {
  values: number[];
  years: number[];
  target: number | null;
  label: string;
  color?: string;
  format?: (v: number) => string;
}) {
  // One consistent precision for ticks, labels and target when the data has decimals.
  const decimals = [...values, target ?? 0].some((v) => v % 1 !== 0) ? 1 : 0;
  const fmt = (v: number) => (format ? format(v) : v.toFixed(decimals));
  const W = 560;
  const H = 220;
  const padL = 36;
  const padR = 64;
  const padT = 16;
  const padB = 26;
  const pts = values.map((v, i) => ({ v, year: years[i] })).filter((p) => p.v > 0);
  const all = [...pts.map((p) => p.v), ...(target ? [target] : [])];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo || hi || 1) * 0.25;
  const d0 = Math.max(0, lo - pad);
  const d1 = hi + pad;
  const x = (i: number) => padL + (pts.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (pts.length - 1));
  const y = (v: number) => H - padB - ((v - d0) / (d1 - d0)) * (H - padT - padB);
  const ticks = [0, 1, 2, 3].map((k) => d0 + (k * (d1 - d0)) / 3);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const { active, setActive, onKeyDown, onFocus, onBlur } = useStepper(pts.length);

  return (
    <div className="chart" onPointerLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart__svg"
        role="img"
        tabIndex={0}
        aria-label={`${label}. ${pts.map((p) => `${p.year}: ${fmt(p.v)}`).join("; ")}${target ? `. Target ${fmt(target)}` : ""}`}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart__grid" x1={padL} x2={W - padR + 8} y1={y(t)} y2={y(t)} />
            <text className="chart__tick" x={padL - 8} y={y(t) + 4} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {target && (
          <g>
            <line x1={padL} x2={W - padR + 8} y1={y(target)} y2={y(target)} stroke="var(--gold-700)" strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round" />
            <text className="chart__label" x={W - padR + 12} y={y(target) + 4}>
              Target {fmt(target)}
            </text>
          </g>
        )}
        {active !== null && <line className="chart__crosshair" x1={x(active)} x2={x(active)} y1={padT} y2={H - padB} />}
        <path d={line} className="traj__line" stroke={color} style={{ ["--len" as string]: 900 } as CSSProperties} />
        {pts.map((p, i) => (
          <g key={p.year}>
            <circle className="traj__dot" cx={x(i)} cy={y(p.v)} r={i === pts.length - 1 || i === active ? 5 : 4} fill={color} />
            <text className="chart__tick" x={x(i)} y={H - 6} textAnchor="middle">
              {p.year}
            </text>
            <rect
              className="chart__hit"
              x={x(i) - 30}
              y={0}
              width={60}
              height={H}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            />
          </g>
        ))}
        {active === null && pts.length > 0 && (
          <text className="chart__label" x={x(pts.length - 1)} y={y(pts[pts.length - 1].v) - 12} textAnchor="middle">
            {fmt(pts[pts.length - 1].v)}
          </text>
        )}
      </svg>
      {active !== null && (
        <div className="tip" style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(pts[active].v) / H) * 100}%` }}>
          <span className="tip__value">{fmt(pts[active].v)}</span>
          <span className="tip__label">{pts[active].year}</span>
          {target && (
            <span className="tip__row">
              <i className="tip__key" style={{ ["--k" as string]: "var(--gold-700)" } as CSSProperties} />
              Target <b>{fmt(target)}</b>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
