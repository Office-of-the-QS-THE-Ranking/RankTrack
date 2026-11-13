import type { Ranking } from "@/lib/data";
import { movement } from "@/lib/site";

const SIGN: Record<string, string> = {
  up: "M5 1.5 9 8.5H1z",
  down: "M5 8.5 1 1.5h8z",
  same: "M1.5 4h7v2h-7z",
};

/**
 * How a result moved since the edition before, as a sign beside plain words. The sign and the fill
 * repeat what the words say, so the meaning never rests on colour alone.
 */
export function Move({ r, className = "" }: { r: Ranking; className?: string }) {
  const kind = r.direction === "up" ? "up" : r.direction === "down" ? "down" : "same";
  return (
    <span className={`w-move w-move--${kind}${className ? ` ${className}` : ""}`}>
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d={SIGN[kind]} />
      </svg>
      {movement(r)}
    </span>
  );
}
