import Image from "next/image";
import { UNIT, UNIVERSITY } from "./Lockup";

/**
 * Opening screen after sei.dost.gov.ph: the reverse seal and the unit mark on black, lit by a sweep of
 * light that passes over them, then fading into the page. Timed entirely in CSS (site.css, "Loader"),
 * so it clears itself without JavaScript; SiteMotion removes it once its fade has run. Shown on full
 * page loads with the same four-second sweep on every visit, and skipped under reduced motion.
 */
export function SiteLoader() {
  return (
    <div className="w-loader" aria-hidden="true">
      <div className="w-loader__mark">
        <span className="w-loader__seal">
          <Image src="/brand/ust-seal-reverse.png" alt="" width={640} height={634} sizes="(max-width: 700px) 120px, 156px" preload />
        </span>
        <span className="w-loader__name">{UNIVERSITY}</span>
        <span className="w-loader__unit">{UNIT}</span>
      </div>
    </div>
  );
}
