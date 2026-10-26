import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { HONOURS, type Season } from "@/lib/merit";
import { Segmented } from "@/components/ui/interactive";
import { Card, cx } from "@/components/ui/primitives";
import { HonourDial } from "./Medal";
import { ItemTitle, useSectionLevel } from "./shared";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

/** Every season on record: merit by cycle against the honours' thresholds, then each season's standing. */
export function History({ seasons, cycle }: { seasons: Season[]; cycle: string }) {
  const level = useSectionLevel();
  const [view, setView] = useState<"Chart" | "Table">("Chart");
  const newest = [...seasons].reverse();
  return (
    <div className="up-stack">
      <Card
        headingLevel={level}
        title="Merit by cycle"
        sub="Earned from validated evidence; the dotted lines are the honours"
        icon="trend-up"
        actions={<Segmented className="viewtoggle" options={["Chart", "Table"] as const} value={view} onChange={setView} label="Merit by cycle: view as" />}
      >
        {view === "Chart" ? (
          <MeritChart seasons={seasons} cycle={cycle} />
        ) : (
          <div className="table-wrap">
            <table className="chart-table">
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Honour</th>
                  <th>Merit</th>
                  <th>Validated</th>
                  <th>First pass</th>
                </tr>
              </thead>
              <tbody>
                {newest.map((s) => (
                  <tr key={s.cycle}>
                    <td>{s.cycle}</td>
                    <td>{s.honour.name}</td>
                    <td>{s.merit.toLocaleString("en-PH")}</td>
                    <td>{s.validated.length}</td>
                    <td>{pct(s.firstPassRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ol className="up-seasons" aria-label="Seasons">
        {seasons.map((s) => (
          <li key={s.cycle} className={cx("up-season", s.cycle === cycle && "is-chosen")}>
            <HonourDial numeral={s.honour.numeral} progress={s.progress} size={76} label={`${s.honour.name} in ${s.cycle}`} />
            <div className="up-season__text">
              <p className="up-eyebrow">{s.cycle}</p>
              <ItemTitle className="up-season__honour">{s.honour.name}</ItemTitle>
              <p className="up-season__merit">{s.merit.toLocaleString("en-PH")} merit</p>
            </div>
            <dl className="up-season__stats">
              <div>
                <dt>Submitted</dt>
                <dd>{s.items.length}</dd>
              </div>
              <div>
                <dt>Validated</dt>
                <dd>{s.validated.length}</dd>
              </div>
              <div>
                <dt>First pass</dt>
                <dd>{pct(s.firstPassRate)}</dd>
              </div>
              <div>
                <dt>Rankings</dt>
                <dd>{s.rankings.length}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}

const W = 960;
const H = 280;
const PAD = { l: 44, r: 150, t: 24, b: 30 };
const BAR = 24;

/** Columns of merit, one per cycle, the chosen cycle in gold and the rest receding; honours as dotted thresholds. */
function MeritChart({ seasons, cycle }: { seasons: Season[]; cycle: string }) {
  const [active, setActive] = useState<number | null>(null);
  if (!seasons.length) return <p className="small muted">No cycles on record yet</p>;
  const top = Math.max(...seasons.map((s) => s.merit));
  const above = HONOURS.find((h) => h.at > top)?.at ?? top;
  const max = Math.max(top, above, HONOURS[1].at) * 1.08;
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / seasons.length;
  const x = (i: number) => PAD.l + slot * i + slot / 2;
  const lines = HONOURS.filter((h) => h.at > 0 && h.at <= max);
  // Rounded at the data end, square on the baseline.
  const bar = (v: number) => {
    const end = y(v);
    const base = H - PAD.b;
    const r = Math.min(4, base - end);
    const l = -BAR / 2;
    return `M${l},${base} V${end + r} Q${l},${end} ${l + r},${end} H${-l - r} Q${-l},${end} ${-l},${end + r} V${base} Z`;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const n = seasons.length;
    setActive((a) => {
      const cur = a ?? n - 1;
      if (e.key === "Home") return 0;
      if (e.key === "End") return n - 1;
      return (cur + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + n) % n;
    });
  };
  const shown = active === null ? null : seasons[active];

  return (
    <div className="chart up-chart" onPointerLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart__svg"
        role="img"
        tabIndex={0}
        aria-label={`Merit by cycle. ${seasons.map((s) => `${s.cycle}: ${s.merit} merit, ${s.honour.name}`).join("; ")}`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? seasons.length - 1)}
        onBlur={() => setActive(null)}
      >
        <line className="chart__axis" x1={PAD.l} x2={W - PAD.r + 8} y1={H - PAD.b} y2={H - PAD.b} />
        <text className="chart__tick" x={PAD.l - 8} y={H - PAD.b + 4} textAnchor="end">
          0
        </text>
        {lines.map((h) => (
          <g key={h.name} className="up-chart__honour">
            <line x1={PAD.l} x2={W - PAD.r + 8} y1={y(h.at)} y2={y(h.at)} />
            <text className="chart__tick" x={W - PAD.r + 14} y={y(h.at) + 4}>
              {h.numeral} · {h.name}
            </text>
            <text className="chart__tick" x={PAD.l - 8} y={y(h.at) + 4} textAnchor="end">
              {h.at.toLocaleString("en-PH")}
            </text>
          </g>
        ))}
        {seasons.map((s, i) => (
          <g key={s.cycle} transform={`translate(${x(i)},0)`} className={cx("up-chart__col", s.cycle === cycle && "is-chosen", active === i && "is-active")}>
            <path d={bar(s.merit)} style={{ ["--i" as string]: i } as CSSProperties} />
            <text className="chart__label" x={0} y={y(s.merit) - 8} textAnchor="middle">
              {s.merit.toLocaleString("en-PH")}
            </text>
            <text className={cx("chart__tick", s.cycle === cycle && "up-chart__chosen")} x={0} y={H - 10} textAnchor="middle">
              {s.cycle}
            </text>
            <rect className="chart__hit" x={-slot / 2} y={0} width={slot} height={H} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
          </g>
        ))}
      </svg>
      {shown && active !== null && (
        <div className="tip" style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(shown.merit) / H) * 100}%` }}>
          <span className="tip__value">{shown.merit.toLocaleString("en-PH")} merit</span>
          <span className="tip__label">{shown.cycle}</span>
          <span className="tip__row">
            Honour <b>{shown.honour.name}</b>
          </span>
          <span className="tip__row">
            Validated <b>{shown.validated.length}</b>
          </span>
        </div>
      )}
    </div>
  );
}
