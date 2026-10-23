import Image from "next/image";
import type { CSSProperties } from "react";
// imported rather than referenced by path: the URL then carries the file's hash, so a re-render is never served stale
import benavidesDay from "../../../public/images/benavides-3d-day.webp";
import benavides from "../../../public/images/benavides-3d.webp";
import buildingDay from "../../../public/images/main-building-3d-day.webp";
import building from "../../../public/images/main-building-3d.webp";
import { FACET_BOX, GOLD_FACETS, SILVER_FACETS, TOWN_LIGHTS, type Facets } from "./sceneGeometry";
import { SceneMotion } from "./SceneMotion";
import type { Sky } from "./sky";

/** A band's cut facets: darker and lighter shades over its own gradient, and the facets that catch the light. */
function Cut({ facets }: { facets: Facets }) {
  return (
    <svg className="sx__cut" viewBox={`0 0 ${FACET_BOX.w} ${FACET_BOX.h}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      {facets.dark.map((d, i) => (
        <path key={`d${i}`} d={d} className={`sx__dk${i}`} />
      ))}
      {facets.light.map((d, i) => (
        <path key={`l${i}`} d={d} className={`sx__lt${i}`} />
      ))}
      {facets.glints.map((g, i) => (
        <path key={`g${i}`} d={g.d} className="sx__glint" style={{ "--d": `${g.delay}s` } as CSSProperties} />
      ))}
    </svg>
  );
}

/**
 * The clock's hands over the face of the building's render, which leaves them out: SceneMotion turns them to the
 * viewer's own time and, when the sky turns, whirls them through twelve hours. A circle of 100 in its box is the
 * face, stretched to the face as the camera sees it.
 */
function Clock() {
  const [cx, cy] = TOWN_LIGHTS.clock;
  const [rx, ry] = TOWN_LIGHTS.clockR;
  const box = { left: `${(cx - rx) * 100}%`, top: `${(cy - ry) * 100}%`, width: `${rx * 200}%`, height: `${ry * 200}%` };
  return (
    <svg className="sx__clock" viewBox="-100 -100 200 200" preserveAspectRatio="none" style={box} focusable="false">
      <path className="sx__hand sx__hand--h" d="M-4.2 11.6L-2.6 -55.2L2.6 -55.2L4.2 11.6Z" />
      <path className="sx__hand sx__hand--m" d="M-3 14.5L-1.7 -80.2L1.7 -80.2L3 14.5Z" />
      <circle r="7.6" />
    </svg>
  );
}

/**
 * The scene behind the sign-in, after the Office's own title slide, by night or by day (sky.ts; .signin's
 * data-sky picks). By night a faceted black-and-gold sky lit by a crescent moon and the campus below, with a few
 * gold stars; by day a pale faceted sky lit by the sun, with low-poly clouds and now and then a few birds. Either
 * way it is cut by bands of gold and silver, a gold hairline with halftone dots either side, and the Main
 * Building with the Benavides monument before it, low-poly renders of each time of day. Only the renders of the
 * sky the server chose load at once; the others wait until the sky turns, which it does as a time-lapse (the
 * orbs set and rise, a glow of dawn or dusk swells and fades, the clock whirls). Every layer is drawn here and
 * still without script; SceneMotion lights the canvases, gives the layers depth and runs the clock, and
 * signin.css (scene) choreographs the entrance, the light that keeps moving and the time-lapse. Decorative
 * throughout: the page says everything in text.
 */
export function SignInScene({ sky }: { sky: Sky }) {
  // the renders of the other sky stay lazy (and hidden) until it comes
  const town = (time: Sky) => (time === sky ? { preload: true } : { loading: "lazy" as const });
  const statue = (time: Sky) => ({ loading: time === sky ? ("eager" as const) : ("lazy" as const) });
  return (
    <div className="sx" aria-hidden="true">
      {/* the faceted sky with its stars or its clouds and birds, lit by SceneLight */}
      <canvas className="sx__sky" />
      {/* the glow of dawn or dusk along the horizon, only while the sky turns */}
      <div className="sx__dusk" />
      {/* by night a slim crescent in champagne, its dark side faintly lit by earthshine; it lights the facets */}
      <div className="sx__moon" />
      {/* by day the sun, white-hot in a wide warm bloom; it lights the facets */}
      <div className="sx__sun" />
      <div className="sx__horizon" />

      {/* the bands, right to left on the page (signin.css mirrors them): dots, hairline, dark band with dots, gold, a cut of black, silver, a gold edge */}
      <div className="sx__bands">
        <div className="sx__band sx__dots sx__dots--a">
          <canvas />
        </div>
        <i className="sx__band sx__line" />
        <div className="sx__band sx__dark">
          <div className="sx__dots sx__dots--b">
            <canvas />
          </div>
        </div>
        <div className="sx__band sx__gold">
          <Cut facets={GOLD_FACETS} />
        </div>
        <i className="sx__band sx__gap" />
        <div className="sx__band sx__silver">
          <Cut facets={SILVER_FACETS} />
        </div>
        <i className="sx__band sx__edge" />
      </div>

      {/* the building, a low-poly model rendered by scripts/signin-scene/render.py by night and by day; its lights shine on the canvas */}
      <div className="sx__town">
        <div className="sx__pan">
          <Image src={building} className="sx__art sx__art--night" alt="" fill {...town("night")} sizes="(max-width: 860px) 190vw, (min-aspect-ratio: 27/16) 73vw, 122vh" />
          <Image src={buildingDay} className="sx__art sx__art--day" alt="" fill {...town("day")} sizes="(max-width: 860px) 190vw, (min-aspect-ratio: 27/16) 73vw, 122vh" />
          <canvas className="sx__lights" />
          <Clock />
        </div>
      </div>
      {/* the monument, modelled and rendered with the building, stands before it */}
      <div className="sx__monument">
        <Image src={benavides} className="sx__art sx__art--night" alt="" fill {...statue("night")} sizes="(max-width: 860px) 46vw, (min-aspect-ratio: 27/16) 21vw, 35vh" />
        <Image src={benavidesDay} className="sx__art sx__art--day" alt="" fill {...statue("day")} sizes="(max-width: 860px) 46vw, (min-aspect-ratio: 27/16) 21vw, 35vh" />
      </div>

      <i className="sx__rail" />
      <SceneMotion />
    </div>
  );
}
