import Image from "next/image";
import { OFFICE } from "@/lib/office";

export const UNIVERSITY = "University of Santo Tomas";
export const UNIT = OFFICE.name;

/**
 * Unit mark from the Visual Identity Manual ("Unit Marks and Name Hierarchy"): the registered seal on
 * the left, the University name on the first line, the unit on the second, aligned left because the
 * Office has no logo of its own. The seal is the official file from ust.edu.ph, never redrawn, and is
 * shown at 48px or more (the manual's 0.5 inch minimum beside a logotype). On dark grounds the reverse
 * seal (white ring text) is required.
 */
export function Lockup({
  reverse,
  className,
  sizes = "(max-width: 700px) 48px, 60px",
  preload,
}: {
  reverse?: boolean;
  className?: string;
  sizes?: string;
  preload?: boolean;
}) {
  return (
    <span className={`w-lockup${reverse ? " w-lockup--reverse" : ""}${className ? ` ${className}` : ""}`}>
      <Image
        className="w-lockup__seal"
        src={reverse ? "/brand/ust-seal-reverse.png" : "/brand/ust-seal.png"}
        alt=""
        width={640}
        height={634}
        sizes={sizes}
        preload={preload}
      />
      <span className="w-lockup__words">
        <span className="w-lockup__name">{UNIVERSITY}</span>
        <span className="w-lockup__unit">{UNIT}</span>
      </span>
    </span>
  );
}
