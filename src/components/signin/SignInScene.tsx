import Image from "next/image";
// imported rather than referenced by path: the URL then carries the file's hash, so a re-render is never served stale
import benavides from "../../../public/images/benavides-3d.webp";
import building from "../../../public/images/main-building-3d.webp";
import { TOWN_LIGHTS } from "./sceneGeometry";
import { SceneMotion } from "./SceneMotion";

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
 * crescent moon and the campus below, with a few gold stars, and the Main Building with the Benavides monument
 * before it, low-poly renders lit for the night. Every layer is drawn here and still without script; SceneMotion lights the canvases, gives
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
