import Image from "next/image";
import type { UnitEmblem } from "@/lib/governance/unit-emblems";

/**
 * A unit's mark wherever the unit is listed: its logo or the University's arms when it has one, else its
 * code on the tile the caller styles. Decorative: the unit's name is always next to it.
 */
export function UnitMark({ emblem, code, className }: { emblem: UnitEmblem | null; code: string; className: string }) {
  if (!emblem) {
    return (
      <span className={className} aria-hidden="true">
        {code}
      </span>
    );
  }
  return (
    <span className={`${className} unit-mark unit-mark--${emblem.form}`} aria-hidden="true">
      {/* Already sized for display; uploaded logos come from the private /media route, which the optimizer can't read. */}
      <Image src={emblem.src} width={emblem.width} height={emblem.height} alt="" unoptimized />
    </span>
  );
}
