import { useId, type CSSProperties } from "react";

/** The ribbon's shape while nothing has been counted yet: a gentle narrowing, drawn as an outline. */
const GHOST = [1, 0.84, 0.7, 0.58, 0.46, 0.34, 0.26];

/**
 * The ribbon's outline in a (steps × 100) by 100 box: each stage holds flat across its middle and eases into
 * the next at the seam; both ends are rounded.
 */
function ribbon(half: number[]) {
  const n = half.length;
  const w = n * 100;
  const top = half.map((h) => 50 - h);
  const bottom = half.map((h) => 50 + h);
  const r0 = Math.min(8, half[0]);
  const r1 = Math.min(8, half[n - 1]);
  let d = `M0,${top[0] + r0} Q0,${top[0]} ${r0},${top[0]}`;
  for (let i = 0; i < n; i++) {
    d += ` L${i * 100 + 82},${top[i]}`;
    if (i < n - 1) d += ` C${(i + 1) * 100},${top[i]} ${(i + 1) * 100},${top[i + 1]} ${(i + 1) * 100 + 18},${top[i + 1]}`;
  }
  d += ` L${w - r1},${top[n - 1]} Q${w},${top[n - 1]} ${w},${top[n - 1] + r1} L${w},${bottom[n - 1] - r1} Q${w},${bottom[n - 1]} ${w - r1},${bottom[n - 1]}`;
  for (let i = n - 1; i >= 0; i--) {
    d += ` L${i * 100 + 18},${bottom[i]}`;
    if (i > 0) d += ` C${i * 100},${bottom[i]} ${i * 100},${bottom[i - 1]} ${(i - 1) * 100 + 82},${bottom[i - 1]}`;
  }
  return `${d} L${r0},${bottom[0]} Q0,${bottom[0]} 0,${bottom[0] - r0} Z`;
}

/**
 * The contribution pipeline as one ribbon that narrows at each stage, its thickness the stage's count.
 * Counts sit above, stage names below, and the share carried over from the previous stage on each seam.
 */
export function PipelineFlow({ steps, label }: { steps: { step: string; count: number }[]; label: string }) {
  const id = useId();
  const max = Math.max(0, ...steps.map((s) => s.count));
  const empty = max === 0;
  const d = ribbon(steps.map((s, i) => (empty ? GHOST[i] ?? 0.26 : Math.max(0.05, s.count / max)) * 46));
  return (
    <figure className={`cv-flow${empty ? " is-empty" : ""}`} style={{ ["--n" as string]: steps.length } as CSSProperties}>
      <div className="cv-flow__track">
        <svg className="cv-flow__ribbon" viewBox={`0 0 ${steps.length * 100} 100`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" className="cv-flow__stop-a" />
              <stop offset="1" className="cv-flow__stop-b" />
            </linearGradient>
            <linearGradient id={`${id}-sheen`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={d} className="cv-flow__body" fill={empty ? "none" : `url(#${id}-fill)`} vectorEffect="non-scaling-stroke" />
          {!empty && <path d={d} className="cv-flow__sheen" fill={`url(#${id}-sheen)`} />}
        </svg>
        <ol className="cv-flow__cols" aria-label={label}>
          {steps.map((s, i) => {
            const prev = steps[i - 1]?.count;
            const kept = i > 0 && prev ? Math.round((s.count / prev) * 100) : null;
            return (
              <li key={s.step} className="cv-flow__col" style={{ ["--i" as string]: i } as CSSProperties}>
                <b className="cv-flow__n">{s.count}</b>
                <span className="cv-flow__label">{s.step}</span>
                {kept !== null && (
                  <span className="cv-flow__kept" title={`${kept}% of ${steps[i - 1].step.toLowerCase()}`}>
                    {kept}%<span className="sr-only"> carried over</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </figure>
  );
}
