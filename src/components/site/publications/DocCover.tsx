import type { CSSProperties } from "react";
import { documentCoverTone } from "@/lib/governance/documents";
import type { DocumentCoverTone } from "@/lib/governance/types";

/**
 * A report's cover, set from its own details: the type and year at the top, the title in the display face, and
 * the unit mark at the foot. The seal's circle runs as rings from the top corner, the motif the site cuts every
 * picture with. Decorative: the title and type are always written beside it, so it is hidden from screen readers.
 */
export function DocCover({ title, type, year, tone, size = "md", style }: { title: string; type: string; year: string; tone?: DocumentCoverTone; size?: "xs" | "sm" | "md" | "lg"; style?: CSSProperties }) {
  return (
    <span className={`w-cover w-cover--${documentCoverTone(type, tone)} w-cover--${size}`} style={style} aria-hidden="true">
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
