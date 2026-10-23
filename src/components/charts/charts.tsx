"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { FAMILY, inkOn, type RankPoint, type Ranking } from "@/lib/data";
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
}: {
  title: string;
  sub?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}) {
  const [view, setView] = useState<"Chart" | "Table">("Chart");
  return (
    <Card
      title={title}
      sub={sub}
      id={id}
      className={className}
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
function useStepper(count: number) {
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

/* ---------- Rank trajectory: band ribbon + midpoint line, rank 1 at the top ---------- */
export function RankTrajectory({ ranking, height = 150, compact }: { ranking: Ranking; height?: number; compact?: boolean }) {
  const pts = ranking.history;
  const color = FAMILY[ranking.family].color;
  const W = 280;
  const H = height;
  const padX = 8;
  const padT = 24;
  const padB = 22;
  const ranked = pts.filter((p) => p.hi !== null && p.lo !== null) as { year: number; hi: number; lo: number; label: string }[];
  const minR = ranked.length ? Math.min(...ranked.map((p) => p.hi)) : 1;
  const maxR = ranked.length ? Math.max(...ranked.map((p) => p.lo)) : 2;
  const span = Math.max(60, maxR - minR);
  const d0 = Math.max(1, minR - span * 0.45);
  const d1 = maxR + span * 0.2;
  const y = (r: number) => padT + ((r - d0) / (d1 - d0)) * (H - padT - padB);
  const x = (i: number) => padX + ((i + 0.5) * (W - padX * 2)) / pts.length;
  const mid = (p: RankPoint) => ((p.hi ?? 0) + (p.lo ?? 0)) / 2;
  const { active, setActive, onKeyDown, onFocus, onBlur } = useStepper(pts.length);

  // Contiguous ranked segments
  const segments: number[][] = [];
  pts.forEach((p, i) => {
    if (p.hi === null) return;
    const last = segments[segments.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else segments.push([i]);
  });
  const lineD = segments
    .map((seg) => seg.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(mid(pts[i])).toFixed(1)}`).join(" "))
    .join(" ");
  const bandD = segments
    .filter((seg) => seg.length > 1)
    .map((seg) => {
      const top = seg.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(pts[i].hi as number).toFixed(1)}`).join(" ");
      const bot = [...seg].reverse().map((i) => `L${x(i).toFixed(1)},${y(pts[i].lo as number).toFixed(1)}`).join(" ");
      return `${top} ${bot} Z`;
    })
    .join(" ");
  const lastIdx = pts.length - 1;
  const last = pts[lastIdx];
  const summary = pts.map((p) => `${p.year}: ${p.label}`).join("; ");
  const tipIdx = active;
  const lineLen = segments.reduce((sum, seg) => sum + seg.length * 60, 0) + 40;

  return (
    <div className="chart" onPointerLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart__svg"
        role="img"
        aria-label={`${ranking.name} by year, rank 1 at the top. ${summary}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {ranked.length > 0 && (
          <>
            <line className="chart__grid" x1={0} x2={W} y1={y(minR)} y2={y(minR)} />
            <line className="chart__grid" x1={0} x2={W} y1={y(maxR)} y2={y(maxR)} />
            {!compact && (
              <>
                <text className="chart__tick" x={0} y={y(minR) - 4}>
                  {minR.toLocaleString()}
                </text>
                <text className="chart__tick" x={0} y={y(maxR) - 4}>
                  {maxR.toLocaleString()}
                </text>
              </>
            )}
          </>
        )}
        <line className="chart__axis" x1={0} x2={W} y1={H - padB} y2={H - padB} />
        {tipIdx !== null && <line className="chart__crosshair" x1={x(tipIdx)} x2={x(tipIdx)} y1={padT - 8} y2={H - padB} />}
        {bandD && <path d={bandD} className="traj__band" fill={color} />}
        {lineD && (
          <path d={lineD} className="traj__line" stroke={color} style={{ ["--len" as string]: lineLen } as CSSProperties} />
        )}
        {pts.map((p, i) => (
          <g key={p.year}>
            {p.hi === null ? (
              <circle className="traj__nr" cx={x(i)} cy={H - padB - 8} r={3.5} />
            ) : (
              <circle className="traj__dot" cx={x(i)} cy={y(mid(p))} r={i === lastIdx || i === tipIdx ? 5 : 3.5} fill={color} />
            )}
            <text className="chart__tick" x={x(i)} y={H - 6} textAnchor="middle">
              {`’${String(p.year).slice(2)}`}
            </text>
            <rect
              className="chart__hit"
              x={x(i) - (W - padX * 2) / pts.length / 2}
              y={0}
              width={(W - padX * 2) / pts.length}
              height={H}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            />
          </g>
        ))}
        {last.hi !== null && tipIdx === null && (
          <text className="chart__label" x={x(lastIdx) + 6} y={y(mid(last)) - 10} textAnchor="end">
            {last.label}
          </text>
        )}
        {ranked.length === 0 && (
          <text className="chart__tick" x={W / 2} y={H / 2 - 6} textAnchor="middle">
            Baseline year: not yet ranked
          </text>
        )}
      </svg>
      {tipIdx !== null && (
        <div className="tip" style={{ left: `${(x(tipIdx) / W) * 100}%`, top: 8 }}>
          <span className="tip__value">{pts[tipIdx].label}</span>
          <span className="tip__label">{pts[tipIdx].year} edition</span>
        </div>
      )}
    </div>
  );
}

export function TrajectoryTable({ rankings }: { rankings: Ranking[] }) {
  const years = rankings[0]?.history.map((h) => h.year) ?? [];
  return (
    <table className="chart-table">
      <thead>
        <tr>
          <th>Ranking</th>
          {years.map((y) => (
            <th key={y}>{y}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rankings.map((r) => (
          <tr key={r.slug}>
            <td>{r.short}</td>
            {r.history.map((h) => (
              <td key={h.year}>{h.label}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
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

export function RadarLegend() {
  return (
    <>
      <span className="legend__item">
        <i className="legend__dot" style={{ ["--k" as string]: "var(--gold-700)" } as CSSProperties} /> Current
      </span>
      <span className="legend__item">
        <i className="legend__line legend__line--outline" style={{ ["--k" as string]: "var(--n-600)" } as CSSProperties} /> Target
      </span>
    </>
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

/* ---------- Heat map (sequential gold ramp + scale legend) ---------- */
const RAMP = ["#fdf3d1", "#fbe29a", "#f5c94a", "#e0a800", "#a87a00"];
export function heatColor(v: number, min: number, max: number) {
  const t = max === min ? 0.5 : (v - min) / (max - min);
  return RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor(t * RAMP.length)))];
}

export function Heatmap({
  columns,
  rows,
  min,
  max,
  format = (v) => String(v),
  caption,
}: {
  columns: (string | number)[];
  rows: { label: string; values: (number | null)[] }[];
  min: number;
  max: number;
  format?: (v: number) => string;
  caption: string;
}) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "10px" } as CSSProperties}>
      <div className="table-wrap">
        <table className="heat">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Row</span>
              </th>
              {columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {r.values.map((v, k) =>
                  v === null ? (
                    <td key={k} className="is-empty">
                      —
                    </td>
                  ) : (
                    <td
                      key={k}
                      style={{ background: heatColor(v, min, max), color: inkOn(heatColor(v, min, max)) }}
                      title={`${r.label}, ${columns[k]}: ${format(v)}`}
                    >
                      {format(v)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="scale" aria-hidden="true">
        <span>Lower</span>
        <span className="scale__ramp">
          {RAMP.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
        <span>Higher</span>
      </div>
    </div>
  );
}

/* ---------- Funnel: ordinal stages with step conversion ---------- */
export function Funnel({ steps, color = "var(--ink)", label }: { steps: { step: string; count: number }[]; color?: string; label: string }) {
  const max = Math.max(...steps.map((s) => s.count));
  return (
    <ol className="funnel" aria-label={label}>
      {steps.map((s, i) => {
        const conv = i > 0 ? Math.round((s.count / steps[i - 1].count) * 100) : null;
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
  if (v.length < 2) return <span className="small muted">New</span>;
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
export function LineWithTarget({
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
