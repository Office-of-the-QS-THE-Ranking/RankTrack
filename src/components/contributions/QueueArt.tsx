import { useId } from "react";

/** A four-point sparkle centred on (x, y). */
const spark = (x: number, y: number, s: number) => `M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s} Z`;

/** Lines of text on a card, the first one bolder. */
function Lines({ x, y, widths }: { x: number; y: number; widths: number[] }) {
  return (
    <>
      {widths.map((w, i) => (
        <rect key={i} x={x} y={y + i * 12 + (i ? 4 : 0)} width={w} height={i ? 5 : 7} rx={i ? 2.5 : 3.5} className={i ? "a-line" : "a-line a-line--strong"} />
      ))}
    </>
  );
}

/**
 * Illustrations for the validation queue's empty views, drawn from the theme's tokens (contributions.css):
 * "clear" when a view has been worked through, "start" before any submission arrives, "search" for no match.
 */
export function QueueArt({ kind }: { kind: "clear" | "start" | "search" }) {
  const id = useId();
  return (
    <svg className={`cv-art cv-art--${kind}`} viewBox="0 0 200 140" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" className="a-gold-a" />
          <stop offset="1" className="a-gold-b" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="128" rx="62" ry="6" className="a-shadow" />
      {kind === "clear" && (
        <>
          <rect x="50" y="24" width="88" height="100" rx="13" className="a-card a-card--back" transform="rotate(-8 94 74)" />
          <rect x="60" y="18" width="88" height="104" rx="13" className="a-card" />
          <Lines x={74} y={36} widths={[42, 60, 50, 56]} />
          <rect x="74" y="98" width="30" height="11" rx="5.5" className="a-chip" />
          <g className="a-float">
            <circle cx="146" cy="102" r="21" fill={`url(#${id}-gold)`} className="a-badge" />
            <path d="M136.5 102.5 l6.5 6.5 l12.5 -13.5" className="a-tick" />
          </g>
        </>
      )}
      {kind === "start" && (
        <>
          <g className="a-float">
            <rect x="72" y="12" width="56" height="70" rx="9" className="a-card" />
            <Lines x={82} y={26} widths={[26, 36, 30]} />
            <circle cx="117" cy="68" r="7" fill={`url(#${id}-gold)`} />
          </g>
          <path d="M100 88 v10 m-5 -5 l5 5 l5 -5" className="a-arrow" />
          <rect x="38" y="84" width="124" height="40" rx="13" className="a-card" />
          <path d="M39 98 h33 l8 11 h40 l8 -11 h33" className="a-groove" />
        </>
      )}
      {kind === "search" && (
        <>
          <rect x="44" y="22" width="92" height="100" rx="13" className="a-card" />
          <Lines x={58} y={40} widths={[40, 62, 48, 56]} />
          <g className="a-float">
            <line x1="146" y1="100" x2="164" y2="118" className="a-handle" stroke={`url(#${id}-gold)`} />
            <circle cx="128" cy="82" r="23" className="a-lens" stroke={`url(#${id}-gold)`} />
          </g>
        </>
      )}
      <path d={spark(34, 40, 7)} className="a-spark" />
      <path d={spark(170, 34, 5)} className="a-spark a-spark--2" />
      <path d={spark(178, 74, 3.5)} className="a-spark a-spark--3" />
    </svg>
  );
}
