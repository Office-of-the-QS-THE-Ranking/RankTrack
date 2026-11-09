"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ChartFrame, useStepper } from "@/components/charts/charts";
import { Card } from "@/components/ui/primitives";
import { CHART_SERIES, formatTick, formatValue, niceTicks, type ChartSpec } from "@/lib/assistant/format";

const HEIGHT = 240;
/** Half of a tooltip's minimum width, to keep it inside the frame at either end. */
const TIP_HALF = 72;
const CHAR = 6.4;

/** One series wears the Hub's ink. Several take the fixed colours in assistant.css, in order, whatever their values. */
const colourOf = (index: number, count: number) => (count === 1 ? "var(--chart-ink)" : `var(--assist-series-${index + 1})`);
const key = (colour: string) => ({ "--k": colour, "--bar": colour }) as CSSProperties;
const present = (v: number | null): v is number => v !== null;

function useWidth() {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [box, width] as const;
}

const summary = ({ labels, series, unit }: ChartSpec) =>
  series.map((s) => `${series.length > 1 ? `${s.name}: ` : ""}${labels.map((l, i) => `${l} ${s.values[i] === null ? "no value" : formatValue(s.values[i]!, unit)}`).join(", ")}`).join(". ");

/* ---------- Bars: the default, since long names and small screens both suit them ---------- */
function Bars({ spec }: { spec: ChartSpec }) {
  const { labels, series, unit, title } = spec;
  const [active, setActive] = useState<string | null>(null);
  const all = series.flatMap((s) => s.values).filter(present);
  const low = Math.min(0, ...all);
  const span = Math.max(0, ...all) - low || 1;
  const at = (v: number) => ((v - low) / span) * 100;
  return (
    <ul className="assist-bars" aria-label={title}>
      {labels.map((label, i) => (
        <li key={i} className="assist-bars__group">
          <span className="assist-bars__label">{label}</span>
          {series.map((s, k) => {
            const v = s.values[i] ?? null;
            if (v === null) return null;
            const id = `${i}-${k}`;
            return (
              <div key={k} className="assist-bars__row" onPointerEnter={() => setActive(id)} onPointerLeave={() => setActive(null)}>
                <span className="bars__track" aria-hidden="true">
                  <span className="bars__fill" style={{ ...key(colourOf(k, series.length)), left: `${at(Math.min(v, 0))}%`, width: `${at(Math.max(v, 0)) - at(Math.min(v, 0))}%` }} />
                  {active === id && (
                    <span className="tip" style={{ left: `max(${TIP_HALF}px, ${at(v)}%)`, top: 0 }}>
                      <span className="tip__value">{formatValue(v, unit)}</span>
                      <span className="tip__label">{series.length > 1 ? `${label}, ${s.name}` : label}</span>
                    </span>
                  )}
                </span>
                <span className="bars__val">
                  {series.length > 1 && <span className="sr-only">{s.name}: </span>}
                  {formatValue(v, unit)}
                </span>
              </div>
            );
          })}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Columns, lines and areas: one measured plot, so its text is never scaled down ---------- */
function Plot({ spec }: { spec: ChartSpec }) {
  const { type, labels, series, unit, invert } = spec;
  const [box, width] = useWidth();
  const { active, setActive, onKeyDown, onFocus, onBlur } = useStepper(labels.length);
  const columns = type === "column";
  const all = series.flatMap((s) => s.values).filter(present);
  const min = Math.min(...all);
  const max = Math.max(...all);
  // Columns and areas are read by their size, so they start at zero. A line is read by its shape.
  const fromZero = columns || type === "area" || (min >= 0 && min <= max * 0.5);
  const raw = niceTicks(fromZero && !invert ? Math.min(0, min) : min, fromZero && !invert ? Math.max(0, max) : max);
  // There's no rank zero.
  const ticks = invert ? raw.filter((t) => t >= 1) : raw;
  const d0 = Math.min(ticks[0] ?? min, min);
  const d1 = Math.max(ticks.at(-1) ?? max, max);

  const padL = Math.max(...ticks.map((t) => formatTick(t, unit).length)) * CHAR + 10;
  const padR = 14;
  const padT = 24;
  const padB = 26;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = HEIGHT - padT - padB;
  const n = labels.length;
  const band = plotW / n;
  const x = (i: number) => (columns ? padL + (i + 0.5) * band : padL + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1)));
  const y = (v: number) => padT + ((invert ? v - d0 : d1 - v) / (d1 - d0 || 1)) * plotH;
  const zero = y(Math.max(d0, Math.min(d1, 0)));

  const shown = labels.map((l) => (l.length > 16 ? `${l.slice(0, 15)}…` : l));
  const labelWidth = (i: number) => shown[i]!.length * CHAR;
  const every = Math.max(1, Math.ceil((Math.max(...labels.map((_, i) => labelWidth(i))) + 12) / (columns ? band : plotW / Math.max(1, n - 1))));

  const lines = series.map((s) => {
    const parts: string[] = [];
    let length = 0;
    let previous: [number, number] | null = null;
    s.values.forEach((v, i) => {
      if (v === null) {
        previous = null;
        return;
      }
      const point: [number, number] = [x(i), y(v)];
      parts.push(`${previous ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`);
      if (previous) length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      previous = point;
    });
    return { d: parts.join(" "), length };
  });

  // Each line's last value, unless two would land on top of each other.
  const ends = series.map((s) => {
    const i = s.values.findLastIndex(present);
    return i < 0 ? null : { i, v: s.values[i]!, y: y(s.values[i]!) };
  });
  const endsClear = series.length <= 4 && ends.every((a, i) => ends.every((b, j) => i === j || !a || !b || Math.abs(a.y - b.y) >= 16));

  const barW = Math.min(24, (band * 0.72 - (series.length - 1) * 2) / series.length);
  const capLabels = columns && series.length === 1 && Math.max(...all.map((v) => formatValue(v, unit).length)) * CHAR + 4 <= band;

  const tipY = active === null ? 0 : Math.min(...series.map((s) => (s.values[active] === null ? HEIGHT : y(s.values[active]!))));

  return (
    <div ref={box} className="chart" style={{ minHeight: HEIGHT }} onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="chart__svg" role="img" aria-label={`${spec.title}. ${summary(spec)}`} tabIndex={0} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={onBlur}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart__grid" x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} />
              <text className="chart__tick" x={padL - 8} y={y(t) + 4} textAnchor="end">
                {formatTick(t, unit)}
              </text>
            </g>
          ))}
          {columns && <line className="chart__axis" x1={padL} x2={width - padR} y1={zero} y2={zero} />}
          {!columns && <line className="chart__axis" x1={padL} x2={width - padR} y1={HEIGHT - padB} y2={HEIGHT - padB} />}
          {active !== null && !columns && <line className="chart__crosshair" x1={x(active)} x2={x(active)} y1={padT} y2={HEIGHT - padB} />}

          {columns &&
            series.map((s, k) =>
              s.values.map((v, i) => {
                if (v === null || v === 0) return null;
                const left = x(i) - (barW * series.length + (series.length - 1) * 2) / 2 + k * (barW + 2);
                const top = y(v);
                const r = Math.min(4, barW / 2, Math.abs(zero - top));
                const dir = v >= 0 ? 1 : -1;
                const d = `M${left},${zero} V${top + r * dir} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r * dir} V${zero} Z`;
                return <path key={`${k}-${i}`} d={d} fill={colourOf(k, series.length)} opacity={active !== null && active !== i ? 0.35 : 1} />;
              }),
            )}
          {capLabels &&
            series[0]!.values.map((v, i) =>
              v === null ? null : (
                <text key={i} className="chart__label" x={x(i)} y={v >= 0 ? y(v) - 7 : y(v) + 16} textAnchor="middle">
                  {formatValue(v, unit)}
                </text>
              ),
            )}

          {!columns &&
            lines.map((line, k) => {
              const colour = colourOf(k, series.length);
              const first = series[k]!.values.findIndex(present);
              const last = series[k]!.values.findLastIndex(present);
              return (
                <g key={k}>
                  {type === "area" && last > first && <path d={`${line.d} L${x(last).toFixed(1)},${zero.toFixed(1)} L${x(first).toFixed(1)},${zero.toFixed(1)} Z`} fill={colour} opacity={0.1} />}
                  <path d={line.d} className="traj__line" stroke={colour} style={{ ["--len" as string]: Math.ceil(line.length) + 4 } as CSSProperties} />
                  {series[k]!.values.map((v, i) => {
                    if (v === null) return null;
                    const isolated = (series[k]!.values[i - 1] ?? null) === null && (series[k]!.values[i + 1] ?? null) === null;
                    if (!(n <= 14 || i === last || i === active || isolated)) return null;
                    return <circle key={i} className="traj__dot" cx={x(i)} cy={y(v)} r={i === active || i === last ? 5 : 4} fill={colour} />;
                  })}
                </g>
              );
            })}
          {!columns &&
            active === null &&
            endsClear &&
            ends.map((end, k) =>
              end ? (
                <text key={k} className="chart__label" x={x(end.i)} y={end.y - 11} textAnchor={end.i === 0 && n > 1 ? "start" : "end"}>
                  {formatValue(end.v, unit)}
                </text>
              ) : null,
            )}

          {labels.map((_, i) =>
            i % every ? null : (
              <text key={i} className="chart__tick" x={x(i)} y={HEIGHT - 8} textAnchor={columns || n === 1 ? "middle" : i === 0 && labelWidth(i) / 2 > padL ? "start" : i === n - 1 && labelWidth(i) / 2 > padR ? "end" : "middle"}>
                {shown[i]}
              </text>
            ),
          )}
          {labels.map((_, i) => {
            const slot = columns ? band : plotW / Math.max(1, n - 1);
            return <rect key={i} className="chart__hit" x={x(i) - slot / 2} y={0} width={slot} height={HEIGHT} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />;
          })}
        </svg>
      )}
      {active !== null && width > 0 && (
        <div className="tip" style={{ left: Math.max(TIP_HALF, Math.min(width - TIP_HALF, x(active))), top: Math.max(0, tipY) }}>
          {series.length === 1 ? (
            <>
              <span className="tip__value">{series[0]!.values[active] === null ? "No value" : formatValue(series[0]!.values[active]!, unit)}</span>
              <span className="tip__label">{labels[active]}</span>
            </>
          ) : (
            <>
              <span className="tip__label">{labels[active]}</span>
              {series.map((s, k) => (
                <span key={k} className="tip__row">
                  <i className="tip__key" style={key(colourOf(k, series.length))} />
                  {s.name}
                  <b>{s.values[active] === null ? "–" : formatValue(s.values[active]!, unit)}</b>
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Parts of a whole: a ring, with every part's name, amount and share written beside it ---------- */
function Ring({ spec }: { spec: ChartSpec }) {
  const { labels, series, unit } = spec;
  const values = series[0]!.values.map((v) => v ?? 0);
  const { active, setActive, onKeyDown, onFocus, onBlur } = useStepper(labels.length);
  const total = values.reduce((sum, v) => sum + v, 0);
  const R = 62;
  const around = 2 * Math.PI * R;
  let start = 0;
  const share = (v: number) => `${Math.round((v / total) * 1000) / 10}%`;
  return (
    <div className="assist-ring" onPointerLeave={() => setActive(null)}>
      <div className="assist-ring__plot">
        <svg viewBox="0 0 160 160" role="img" aria-label={`${spec.title}. ${summary(spec)}`} tabIndex={0} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={onBlur}>
          <g transform="rotate(-90 80 80)">
            {values.map((v, i) => {
              const length = (v / total) * around;
              const offset = start;
              start += length;
              return (
                <circle
                  key={i}
                  cx={80}
                  cy={80}
                  r={R}
                  fill="none"
                  stroke={colourOf(i, 6)}
                  strokeWidth={22}
                  strokeDasharray={`${Math.max(0, length - 2)} ${around}`}
                  strokeDashoffset={-offset}
                  opacity={active !== null && active !== i ? 0.3 : 1}
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                />
              );
            })}
          </g>
        </svg>
        <span className="assist-ring__middle" aria-hidden="true">
          <b>{active === null ? formatValue(total, unit) : formatValue(values[active]!, unit)}</b>
          <span>{active === null ? "Total" : labels[active]}</span>
        </span>
      </div>
      <ul className="assist-ring__parts">
        {labels.map((label, i) => (
          <li key={i} data-dim={active !== null && active !== i ? "" : undefined} onPointerEnter={() => setActive(i)}>
            <i className="legend__rect" style={key(colourOf(i, 6))} />
            <span className="assist-ring__name">{label}</span>
            <span className="assist-ring__value">
              {formatValue(values[i]!, unit)}
              {unit !== "%" && <span>{share(values[i]!)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataTable({ spec }: { spec: ChartSpec }) {
  return (
    <table className="chart-table">
      <thead>
        <tr>
          <th>
            <span className="sr-only">Item</span>
          </th>
          {spec.series.map((s, k) => (
            <th key={k}>{s.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {spec.labels.map((label, i) => (
          <tr key={i}>
            <td>{label}</td>
            {spec.series.map((s, k) => (
              <td key={k}>{s.values[i] === null ? "–" : formatValue(s.values[i]!, spec.unit)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A graph in an answer, in the Hub's own frame with its Chart and Table views. Too many series for a graph stay a table. */
export function AnswerChart({ spec }: { spec: ChartSpec }) {
  if (spec.series.length > CHART_SERIES) {
    return (
      <Card title={spec.title} sub={spec.sub} className="assist-chart" headingLevel={3}>
        <div className="table-wrap">
          <DataTable spec={spec} />
        </div>
      </Card>
    );
  }
  const lined = spec.type === "line" || spec.type === "area";
  return (
    <ChartFrame
      title={spec.title}
      sub={spec.sub}
      className="assist-chart"
      headingLevel={3}
      table={<DataTable spec={spec} />}
      legend={
        spec.series.length > 1
          ? spec.series.map((s, k) => (
              <span key={k} className="legend__item">
                <i className={lined ? "legend__line" : "legend__rect"} style={key(colourOf(k, spec.series.length))} />
                {s.name}
              </span>
            ))
          : undefined
      }
    >
      {spec.type === "bar" ? <Bars spec={spec} /> : spec.type === "pie" ? <Ring spec={spec} /> : <Plot spec={spec} />}
    </ChartFrame>
  );
}

/** Where a graph is still arriving, or where what arrived couldn't be drawn. */
export function ChartNote({ pending }: { pending: boolean }) {
  if (pending) {
    return (
      <div className="assist-chart-wait" role="status">
        Drawing the graph…
      </div>
    );
  }
  return <p className="assist-chart-failed">This graph couldn’t be drawn. Ask again and it should come through.</p>;
}
