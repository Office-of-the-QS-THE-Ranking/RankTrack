import type { Ranking } from "@/lib/data";

const W = 1000;
const H = 380;
const PAD = { top: 56, right: 48, bottom: 56, left: 132 };

/**
 * A ranking's published band at each edition, rank 1 at the top. Each band is a capsule (the page's
 * circle, stretched); the latest edition is gold. Editions without a ranked result are marked on the
 * baseline. A table with the same figures follows for screen readers.
 */
export function Trajectory({ ranking: r }: { ranking: Ranking }) {
  const ranked = r.history.filter((h) => h.hi !== null && h.lo !== null);
  const worst = Math.max(...ranked.map((h) => h.lo!), 200);
  const max = Math.ceil((worst * 1.06) / 200) * 200;
  const y = (rank: number) => PAD.top + ((rank - 1) / (max - 1)) * (H - PAD.top - PAD.bottom);
  const step = (W - PAD.left - PAD.right) / Math.max(1, r.history.length - 1);
  const x = (i: number) => PAD.left + i * step;
  const ticks = [1, ...Array.from({ length: 4 }, (_, k) => Math.round(((k + 1) * max) / 4))];
  const last = r.history.length - 1;
  const mid = (h: (typeof r.history)[number]) => (h.hi !== null && h.lo !== null ? y((h.hi + h.lo) / 2) : null);
  const path = r.history
    .map((h, i) => ({ i, m: mid(h) }))
    .filter((p): p is { i: number; m: number } => p.m !== null)
    .map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${p.m.toFixed(1)}`)
    .join(" ");
  const bw = Math.min(56, step * 0.42);

  return (
    <figure className="w-traj">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${r.name}: ${r.history.map((h) => `${h.year} ${h.label}`).join(", ")}`}>
        {ticks.map((t) => (
          <text key={t} className="w-traj__tick" x={PAD.left - 64} y={y(t) + 5} textAnchor="end">
            {t === 1 ? "1st" : t.toLocaleString("en-US")}
          </text>
        ))}
        {path && <path d={path} className="w-traj__line" />}
        {r.history.map((h, i) => {
          const cx = x(i);
          if (h.hi === null || h.lo === null) {
            return (
              <g key={h.year}>
                <circle cx={cx} cy={H - PAD.bottom} r={9} className="w-traj__none" />
                <text x={cx} y={H - PAD.bottom - 22} textAnchor="middle" className="w-traj__label w-traj__label--muted">
                  {h.label}
                </text>
                <text x={cx} y={H - 14} textAnchor="middle" className="w-traj__year">
                  {h.year}
                </text>
              </g>
            );
          }
          const top = y(h.hi);
          const height = Math.max(bw, y(h.lo) - top);
          return (
            <g key={h.year}>
              <rect
                x={cx - bw / 2}
                y={top}
                width={bw}
                height={height}
                rx={bw / 2}
                className={i === last ? "w-traj__band w-traj__band--now" : "w-traj__band"}
              />
              <text x={cx} y={top - 16} textAnchor="middle" className={i === last ? "w-traj__label w-traj__label--now" : "w-traj__label"}>
                {h.label}
              </text>
              <text x={cx} y={H - 14} textAnchor="middle" className="w-traj__year">
                {h.year}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="w-traj__cap">Published band at each edition. Rank 1 is at the top; a taller capsule is a wider band.</figcaption>
      <table className="sr-only">
        <caption>{r.name} by edition</caption>
        <thead>
          <tr>
            <th scope="col">Edition</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {r.history.map((h) => (
            <tr key={h.year}>
              <th scope="row">{h.year}</th>
              <td>{h.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Four cycles of one indicator as a short line ending in a dot. */
export function Spark({ values, label }: { values: number[]; label: string }) {
  const w = 96;
  const h = 30;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (w - 8) + 4, h - 5 - ((v - lo) / span) * (h - 10)] as const);
  const end = pts[pts.length - 1];
  return (
    <svg className="w-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`${label}: ${values.join(", ")} over four cycles`}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} />
      <circle cx={end[0]} cy={end[1]} r={4} />
    </svg>
  );
}
