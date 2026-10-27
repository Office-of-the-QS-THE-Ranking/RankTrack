"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { Indicator, RankPoint } from "@/lib/data";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import { QueueArt } from "@/components/contribute/QueueArt";

/*
 * The ranking page's charts, drawn in the dashboard's vocabulary (ranking.css): the family colour for the
 * ranking's own line, gold for progress toward a target, ink for targets and the other measures.
 */

/** An indicator's weight as a number ("30%" → 30); 0 when it has none. */
export function weightOf(i: Indicator) {
  const n = parseFloat(i.weight);
  return Number.isFinite(n) ? n : 0;
}

/** An indicator's value as a share of its target, 0–100, or null until it has both. */
export function shareOf(i: Indicator) {
  return i.current !== null && i.target ? Math.max(0, Math.min(100, Math.round((i.current / i.target) * 100))) : null;
}

/** An indicator's value with its unit. */
export const valueOf = (i: Indicator) => (i.current === null ? "—" : `${i.current}${i.unit === "% of threshold" ? "%" : ""}`);

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const yy = (year: number) => `’${String(year).slice(2)}`;

/** A smooth path through points (Catmull–Rom as cubic Béziers). */
function smooth(pts: [number, number][]) {
  const f = (p: [number, number]) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  if (!pts.length) return "";
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return d;
}

/** What a tile shows when it has nothing to draw yet. */
export function Quiet({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p className="rk-quiet">
      <Icon name={icon} size={16} />
      {children}
    </p>
  );
}

/** An illustrated empty view (the validation queue's illustrations). */
export function EmptyArt({ kind, children }: { kind: "clear" | "start" | "search"; children: ReactNode }) {
  return (
    <div className="rk-empty">
      <QueueArt kind={kind} />
      <p>{children}</p>
    </div>
  );
}

/**
 * The ranking's result by edition as one curve, rank 1 at the top, in the family's colour. Unranked
 * editions sit as hollow marks on the baseline; each mark names its band on hover.
 */
export function RankArc({ points, color, label }: { points: RankPoint[]; color: string; label: string }) {
  const id = useId();
  const n = points.length;
  const mid = (p: RankPoint) => ((p.hi ?? 0) + (p.lo ?? 0)) / 2;
  const ranked = points.flatMap((p, i) => (p.hi !== null && p.lo !== null ? [{ p, i }] : []));
  const x = (i: number) => (n > 1 ? 5 + (i / (n - 1)) * 90 : 50);
  const best = Math.min(...ranked.map(({ p }) => mid(p)));
  const worst = Math.max(...ranked.map(({ p }) => mid(p)));
  const y = (p: RankPoint) => (worst > best ? 14 + ((mid(p) - best) / (worst - best)) * 58 : 40);
  const line: [number, number][] = ranked.map(({ p, i }) => [x(i), y(p)]);
  // A gentle rise stands in for the curve until there is a result to plot.
  const ghost: [number, number][] = [0, 1, 2, 3, 4].map((i) => [5 + i * 22.5, 70 - i * i * 2.6]);
  const empty = !ranked.length;
  const d = smooth(empty ? ghost : line);
  const first = (empty ? ghost : line)[0];
  const last = (empty ? ghost : line).at(-1)!;

  return (
    <figure
      className={cx("rk-arc", empty && "is-empty")}
      style={{ "--c": color } as CSSProperties}
      role="img"
      aria-label={empty ? `${label}: no result yet` : `${label}, rank 1 at the top. ${points.map((p) => `${p.year}: ${p.label || "not ranked"}`).join("; ")}`}
    >
      <svg className="rk-arc__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[14, 43, 72].map((g) => (
          <line key={g} x1="0" x2="100" y1={g} y2={g} className="rk-arc__grid" vectorEffect="non-scaling-stroke" />
        ))}
        {!empty && line.length > 1 && <path d={`${d} L${last[0]},100 L${first[0]},100 Z`} fill={`url(#${id}-area)`} />}
        <path d={d} className="rk-arc__line" stroke={empty ? undefined : color} vectorEffect="non-scaling-stroke" />
      </svg>
      {!empty &&
        points.map((p, i) => (
          <span
            key={p.year}
            className={cx("rk-arc__pt", p.hi === null && "is-nr", i === n - 1 && "is-last", i === 0 && "is-start", i === n - 1 && "is-end")}
            style={{ left: `${x(i)}%`, top: `${p.hi === null ? 86 : y(p)}%` }}
            data-tip={`${p.year} · ${p.label || "Not ranked"}`}
            aria-hidden="true"
          />
        ))}
      {empty && <figcaption className="rk-arc__none">No result yet</figcaption>}
      <ol className="rk-arc__years" aria-hidden="true">
        {points.map((p, i) => (
          <li key={p.year} style={{ left: `${x(i)}%` }}>
            {yy(p.year)}
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** Readiness as a half dial in gold, ticked every ten points. */
export function Gauge({ value, label, children }: { value: number; label: string; children?: ReactNode }) {
  const id = useId();
  const v = clamp(Math.round(value));
  const arc = "M12,62 A50,50 0 0 1 112,62";
  return (
    <div className="rk-gauge" role="meter" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${v}%`}>
      <svg viewBox="0 0 124 68" className="rk-gauge__svg" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" className="rk-gauge__a" />
            <stop offset="1" className="rk-gauge__b" />
          </linearGradient>
        </defs>
        {Array.from({ length: 11 }, (_, k) => {
          const a = Math.PI * (1 - k / 10);
          const r0 = 57.5;
          const r1 = k % 5 ? 59.5 : 61.5;
          return (
            <line
              key={k}
              className={cx("rk-gauge__tick", v > 0 && k * 10 <= v && "is-on")}
              x1={62 + r0 * Math.cos(a)}
              y1={62 - r0 * Math.sin(a)}
              x2={62 + r1 * Math.cos(a)}
              y2={62 - r1 * Math.sin(a)}
            />
          );
        })}
        <path d={arc} pathLength={100} className="rk-gauge__track" />
        {v > 0 && <path d={arc} pathLength={100} className="rk-gauge__fill" stroke={`url(#${id}-fill)`} strokeDasharray={`${v} 100`} />}
      </svg>
      <div className="rk-gauge__read">
        <p className="rk-gauge__v">
          {v}
          <small>%</small>
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * Every indicator as one column: its width is the indicator's weight, its gold fill the share of target it
 * has reached. Heavy, short columns are where the result is won or lost.
 */
export function WeightMosaic({ indicators, onPick }: { indicators: Indicator[]; onPick: (i: Indicator) => void }) {
  const weighted = indicators.some((i) => weightOf(i) > 0);
  return (
    <ol className="rk-mosaic" aria-label="Indicators by weight and share of target">
      {indicators.map((ind, k) => {
        const w = weightOf(ind);
        const s = shareOf(ind);
        return (
          <li key={ind.name} style={{ flexGrow: weighted ? Math.max(w, 2) : 1 }}>
            <button
              type="button"
              className={cx("rk-mosaic__col", s === null && "is-empty", k === 0 && "is-start", k === indicators.length - 1 && "is-end")}
              style={{ "--s": `${s ?? 0}%` } as CSSProperties}
              onClick={() => onPick(ind)}
              data-tip={`${ind.name} · ${ind.weight}${s === null ? "" : ` · ${s}% of target`}`}
              aria-label={`${ind.name}, weight ${ind.weight}, ${s === null ? "no data yet" : `${s}% of target`}`}
            >
              <span className="rk-mosaic__fill" />
              {w >= 10 && <span className="rk-mosaic__w">{w}%</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export type Part = { key: string; label: string; tone: "ok" | "review" | "revise" | "missing"; n: number };

/** Shares of a whole as one ring of status-coloured arcs, a figure in the middle. */
export function StatusDonut({ parts, label, children }: { parts: Part[]; label: string; children: ReactNode }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  const shown = parts.filter((p) => p.n > 0);
  const gap = shown.length > 1 ? 1.6 : 0;
  let at = 0;
  return (
    <div className="rk-donut" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.n}`).join(", ")}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" className="rk-donut__track" />
        {shown.map((p) => {
          const len = (p.n / total) * 100;
          const seg = (
            <circle
              key={p.key}
              cx="50"
              cy="50"
              r="42"
              pathLength={100}
              className={`rk-donut__seg is-${p.tone}`}
              strokeDasharray={`${Math.max(0.01, len - gap)} ${100 - Math.max(0.01, len - gap)}`}
              strokeDashoffset={-at}
            />
          );
          at += len;
          return seg;
        })}
      </svg>
      <div className="rk-donut__mid">{children}</div>
    </div>
  );
}

/** One ring per pillar, outermost first, each closing toward its target. */
export function PillarRings({ rows }: { rows: { label: string; share: number | null }[] }) {
  return (
    <svg className="rk-rings" viewBox="0 0 160 160" role="img" aria-label={rows.map((r) => `${r.label}: ${r.share === null ? "no data" : `${r.share}% of target`}`).join("; ")}>
      {rows.map((r, k) => {
        const rad = 74 - k * 13;
        return (
          <g key={r.label} style={{ "--k": k } as CSSProperties}>
            <circle cx="80" cy="80" r={rad} className="rk-rings__track" />
            {r.share !== null && r.share > 0 && (
              <circle cx="80" cy="80" r={rad} pathLength={100} className="rk-rings__fill" strokeDasharray={`${r.share} 100`} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** A peer's published result as one number: the middle of its band. */
const rankOf = (value: string) => {
  const [a, b] = value.split(/[–-]/).map((s) => parseFloat(s.replace(/[^\d.]/g, "")));
  return Number.isFinite(a) ? (Number.isFinite(b) ? (a + b) / 2 : a) : null;
};

/** Peers on one rank axis, best at the left; UST's own row in gold. */
export function PeerLadder({ rows }: { rows: { name: string; value: string; own: boolean }[] }) {
  const placed = rows.map((r) => ({ ...r, rank: rankOf(r.value) })).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const ranks = placed.flatMap((r) => (r.rank === null ? [] : [r.rank]));
  const lo = Math.min(...ranks);
  const hi = Math.max(...ranks);
  const at = (r: number) => (hi > lo ? 4 + ((r - lo) / (hi - lo)) * 92 : 50);
  return (
    <ol className="rk-peers">
      {placed.map((r) => (
        <li key={r.name} className={cx("rk-peers__row", r.own && "is-own")}>
          <span className="rk-peers__name">{r.name}</span>
          <span className="rk-peers__track" aria-hidden="true">
            {r.rank !== null && <i style={{ left: `${at(r.rank)}%` }} />}
          </span>
          <b className="rk-peers__v">{r.value}</b>
        </li>
      ))}
    </ol>
  );
}

/** Each indicator's value as a share of target by year, warmer as it nears the target. */
export function HeatGrid({ years, rows, caption }: { years: number[]; rows: { label: string; values: (number | null)[] }[]; caption: string }) {
  return (
    <div className="rk-heat-wrap">
      <table className="rk-heat">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Indicator</span>
            </th>
            {years.map((y) => (
              <th key={y} scope="col">
                {yy(y)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {years.map((y, k) => {
                const v = r.values[k] ?? null;
                const heat = v === null ? 0 : clamp((v - 40) / 60, 0, 1);
                return (
                  <td key={y}>
                    <span className={cx("rk-heat__cell", v === null && "is-none", heat > 0.6 && "is-hot")} style={{ "--k": heat } as CSSProperties}>
                      {v === null ? "–" : `${v}%`}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A small trend line with a soft fill, coloured by the indicator's direction. */
export function Spark({ values, trend, label }: { values: number[]; trend?: Indicator["trend"]; label: string }) {
  const id = useId();
  const v = values.filter((x) => x > 0);
  if (v.length < 2) {
    return (
      <span className="rk-spark is-none" role="img" aria-label={`${label}: not enough data`}>
        <i />
      </span>
    );
  }
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const pts: [number, number][] = v.map((x, i) => [(i / (v.length - 1)) * 100, hi > lo ? 86 - ((x - lo) / (hi - lo)) * 72 : 50]);
  const d = smooth(pts);
  const end = pts.at(-1)!;
  const tone = trend === "Improving" ? "up" : trend === "Declining" || trend === "Critical" ? "down" : "flat";
  return (
    <span className={`rk-spark is-${tone}`} role="img" aria-label={`${label}: ${v.join(", ")}${trend ? `, ${trend.toLowerCase()}` : ""}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-a`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L100,100 L0,100 Z`} fill={`url(#${id}-a)`} />
        <path d={d} className="rk-spark__line" vectorEffect="non-scaling-stroke" />
      </svg>
      <i style={{ left: `${end[0]}%`, top: `${end[1]}%` }} />
    </span>
  );
}

/** Share of target as a short gold bar. */
export function Bullet({ share, label }: { share: number | null; label: string }) {
  return (
    <span
      className={cx("rk-bullet", share === null && "is-none")}
      role="meter"
      aria-label={label}
      aria-valuenow={share ?? 0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={share === null ? "No data yet" : `${share}% of target`}
    >
      <i style={{ width: `${share ?? 0}%` }} />
    </span>
  );
}
