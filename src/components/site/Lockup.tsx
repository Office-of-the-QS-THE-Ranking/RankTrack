import Image from "next/image";

export const UNIVERSITY = "University of Santo Tomas";

/**
 * Unit mark from the Visual Identity Manual ("Typography" and "Unit Marks and Name Hierarchy"): the
 * registered seal on the left, the University name in Trajan capitals, the unit in Minion capitals under it
 * and any department under the unit in the same face and size, no longer in capitals, all aligned left.
 * The seal is the official file from ust.edu.ph, whole with its ®, never redrawn, and is shown at 48px or
 * more (the manual's 0.5 inch minimum beside a logotype). On dark grounds the reverse seal (white ring
 * text) is required.
 */
export function Lockup({
  unit,
  department,
  reverse,
  className,
  sizes = "(max-width: 700px) 48px, 60px",
  preload,
}: {
  /** The unit's name: the Office (reference data: office_profile), a faculty, a college or an institute. */
  unit: string;
  /** A department under the unit. */
  department?: string;
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
        <span className="w-lockup__unit">{unit}</span>
        {department && <span className="w-lockup__unit w-lockup__dept">{department}</span>}
      </span>
    </span>
  );
}
