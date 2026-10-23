import type { CSSProperties } from "react";
import type { RankPoint } from "@/lib/data";

/** The foot of the rank scale: the lowest band any of the four has held. Rank 1 is at the top. */
const FLOOR = 1200;
/** The ladder behind the lines changes tone every 200 places. */
const RUNG = 200;

const yOf = (rank: number) => (rank - 1) / (FLOOR - 1);
const r4 = (n: number) => +n.toFixed(4);

export type ChartSeries = { slug: string; short: string; figure: string; history: RankPoint[] };

type Point = { k: number; x: number; y: number; top: number; bottom: number; exact: boolean };

/** The ranked editions as chart points, x and y from 0 to 1: y is the middle of the band. */
function chartPoints(history: RankPoint[]): Point[] {
  const last = history.length - 1;
  return history.flatMap((h, k) =>
    h.hi !== null && h.lo !== null
      ? [{ k, x: k / last, y: yOf((h.hi + h.lo) / 2), top: yOf(h.hi), bottom: yOf(h.lo), exact: h.hi === h.lo }]
      : [],
  );
}

/**
 * The line through the points in a 1000-unit box. Each step leaves one edition level and arrives level at
 * the next, so the line never overshoots a published band. AscentMotion finds the head of the line on the
 * same curve: x = x0 + dx(1.5s - 1.5s² + s³), y = y0 + dy(3s² - 2s³).
 */
function curve(points: Point[]) {
  return points
    .map((p, i) => {
      const X = (p.x * 1000).toFixed(1);
      const Y = (p.y * 1000).toFixed(1);
      if (!i) return `M${X},${Y}`;
      const q = points[i - 1];
      const mid = (((q.x + p.x) / 2) * 1000).toFixed(1);
      return `C${mid},${(q.y * 1000).toFixed(1)} ${mid},${Y} ${X},${Y}`;
    })
    .join(" ");
}

/**
 * Published results on a ladder of ranks, rank 1 at the top. Each edition's band is an arch (the opening of
 * the Arch of the Centuries, as in the hero) spanning the band's best and worst rank; an exact rank is a dot;
 * the latest edition is lit in UST Gold. Every position is a fraction of the plot, so the chart fills any
 * box: the lines are SVG with a non-scaling stroke, and everything that must keep its shape is HTML.
 * Drawn state is one number per line, --hx, the edition the line has reached (0 to 1): AscentMotion sets
 * it from the scroll, and without script it is 1, the finished chart. The figures are given to screen
 * readers by the table in Movers.tsx, so the drawing itself is hidden from them.
 */
export function AscentChart({
  series,
  variant,
  ticks = [1, 200, 400, 600, 800, 1000, 1200],
}: {
  series: ChartSeries[];
  variant: "stage" | "mini";
  ticks?: number[];
}) {
  const years = series[0].history.map((h) => h.year);
  const last = years.length - 1;
  const rungs = Array.from({ length: Math.ceil(FLOOR / RUNG) }, (_, i) => ({
    top: Math.max(0, yOf(i * RUNG + 0.5)),
    bottom: Math.min(1, yOf((i + 1) * RUNG + 0.5)),
  }));

  return (
    <div className={`w-asc-chart w-asc-chart--${variant}`} aria-hidden="true">
      <div className="w-asc-chart__plot">
        {rungs.map((g, i) => (
          <span key={i} className="w-asc-chart__rung" style={{ "--top": r4(g.top), "--bottom": r4(g.bottom) } as CSSProperties} />
        ))}
        {variant === "stage" && (
          <span className="w-asc-chart__gate" style={{ "--y": r4(yOf(1000.5)) } as CSSProperties}>
            <span>Top 1,000</span>
          </span>
        )}
        {ticks.map((t) => (
          <span key={t} className="w-asc-chart__tick" style={{ "--y": r4(yOf(t)) } as CSSProperties}>
            {t.toLocaleString("en-US")}
          </span>
        ))}
        <div className="w-asc-chart__inner">
          {years.map((y, k) => (
            <span key={y} className={`w-asc-chart__year${k === last ? " is-now" : ""}`} style={{ "--x": r4(k / last) } as CSSProperties}>
              {y}
            </span>
          ))}
          {series.map((s, i) => {
            const pts = chartPoints(s.history);
            const end = pts[pts.length - 1];
            // a line that began below the top 1,000 and ends inside it brings up the line of the top 1,000
            const crossed = pts.some((p) => p.top > yOf(1000)) && end.bottom <= yOf(1000);
            return (
              <div
                key={s.slug}
                className="w-asc-chart__series"
                data-i={i}
                data-gate={crossed ? "" : undefined}
                data-x={pts.map((p) => r4(p.x)).join(" ")}
                data-y={pts.map((p) => r4(p.y)).join(" ")}
                data-labels={s.history.map((h) => h.label).join("|")}
                data-name={s.short}
                style={{ "--x0": r4(pts[0].x), "--x1": r4(end.x) } as CSSProperties}
              >
                <div className="w-asc-chart__line">
                  <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
                    <path d={curve(pts)} vectorEffect="non-scaling-stroke" />
                  </svg>
                </div>
                {pts.map((p) => (
                  <span
                    key={p.k}
                    className={`w-asc-chart__band${p.exact ? " is-exact" : ""}${p === end ? " is-now" : ""}`}
                    style={{ "--x": r4(p.x), "--top": r4(p.top), "--bottom": r4(p.bottom), "--y": r4(p.y) } as CSSProperties}
                  />
                ))}
                <span className="w-asc-chart__end" style={{ "--y": r4(end.y) } as CSSProperties}>
                  <b>{s.figure}</b>
                  {variant === "stage" && <span>{s.short}</span>}
                </span>
              </div>
            );
          })}
          <span className="w-asc-chart__head" />
          {variant === "stage" && (
            <>
              <span className="w-asc-chart__hover" />
              <div className="w-asc-chart__tip">
                <p className="w-asc-chart__tip-year" />
                <ul className="w-asc-chart__tip-rows" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
