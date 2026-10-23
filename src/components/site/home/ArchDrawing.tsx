import type { CSSProperties } from "react";
import { INK } from "./archGeometry";

/**
 * The central bay of the Arch of the Centuries in fine gold line (archGeometry.ts). Every stroke has
 * pathLength 1, so CSS can draw it in, and a delay from the height it starts at, so the bay rises from the
 * ground as it is drawn. The lights that then climb its lines are ArchDust's, on the canvas above it.
 */
export function ArchDrawing() {
  return (
    <svg className="w-arch__drawing" viewBox="-176 -232 352 234" aria-hidden="true" focusable="false">
      <g className="w-arch__ink">
        {INK.map((s, i) => (
          <path
            key={i}
            d={s.d}
            pathLength={1}
            className={`t${s.tone}`}
            // drawn from the ground up and from the opening outwards, with a little unevenness
            style={{ "--d": `${Math.round((s.low / 230) * 1500 + (s.x / 176) * 260 + ((i * 37) % 11) * 14)}ms` } as CSSProperties}
          />
        ))}
      </g>
    </svg>
  );
}
