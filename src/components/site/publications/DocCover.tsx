import type { CSSProperties } from "react";

/** The cover tones, from the identity's palette: night, gold, stone and onyx. */
const TONES = ["night", "gold", "stone", "onyx"] as const;

/** The same type always gets the same tone, so a shelf reads by kind at a glance. */
function toneOf(type: string) {
  let h = 0;
  for (const c of type) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

/**
 * A report's cover, set from its own details: the type and year at the top, the title in the display face, and
 * the unit mark at the foot. The seal's circle runs as rings from the top corner, the motif the site cuts every
 * picture with. Decorative: the title and type are always written beside it, so it is hidden from screen readers.
 */
export function DocCover({ title, type, year, size = "md", style }: { title: string; type: string; year: string; size?: "xs" | "sm" | "md" | "lg"; style?: CSSProperties }) {
  return (
    <span className={`w-cover w-cover--${toneOf(type)} w-cover--${size}`} style={style} aria-hidden="true">
      <span className="w-cover__rings" />
      <span className="w-cover__top">
        <span className="w-cover__type">{type}</span>
        <span className="w-cover__year">{year}</span>
      </span>
      <span className="w-cover__title">{title}</span>
      <span className="w-cover__mark">
        <span className="w-cover__uni">University of Santo Tomas</span>
        <span className="w-cover__unit">Office of QS/THE Rankings</span>
      </span>
    </span>
  );
}
