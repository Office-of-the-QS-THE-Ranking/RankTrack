import Image from "next/image";
import type { CSSProperties } from "react";
// imported rather than referenced by path: the URL then carries the file's hash, so a re-render is never served stale
import benavides from "../../../public/images/benavides-3d.webp";
import building from "../../../public/images/main-building-3d.webp";
import { FACET_BOX, GOLD_FACETS, SILVER_FACETS, TOWN_LIGHTS, type Facets } from "./sceneGeometry";
import { SceneMotion } from "./SceneMotion";

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
 * viewer's own time. A circle of 100 in its box is the
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
 * The scene behind the sign-in, after the Office's own title slide: a faceted black-and-gold night sky lit by a
 * crescent moon and the campus below, with a few gold stars, cut by bands of gold and silver, a gold hairline
 * with halftone dots either side, and the Main Building with the Benavides monument before it, low-poly renders
 * lit for the night. Every layer is drawn here and still without script; SceneMotion lights the canvases, gives
 * the layers depth and runs the clock, and signin.css (scene) choreographs the entrance and the light that keeps
 * moving. Decorative throughout: the page says everything in text.
 */
export function SignInScene() {
  return (
    <div className="sx" aria-hidden="true">
      {/* the faceted sky with its stars, lit by SceneLight */}
      <canvas className="sx__sky" />
      {/* a slim crescent in champagne, its dark side faintly lit by earthshine; it lights the facets */}
      <div className="sx__moon" />
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

      {/* the building, a low-poly model rendered by scripts/signin-scene/render.py; its lights shine on the canvas */}
      <div className="sx__town">
        <div className="sx__pan">
          <Image src={building} className="sx__art" alt="" fill preload sizes="(max-width: 860px) 190vw, (min-aspect-ratio: 27/16) 73vw, 122vh" />
          <canvas className="sx__lights" />
          <Clock />
        </div>
      </div>
      {/* the monument, modelled and rendered with the building, stands before it */}
      <div className="sx__monument">
        <Image src={benavides} className="sx__art" alt="" fill loading="eager" sizes="(max-width: 860px) 46vw, (min-aspect-ratio: 27/16) 21vw, 35vh" />
      </div>

      <i className="sx__rail" />
      <SceneMotion />
    </div>
  );
}
