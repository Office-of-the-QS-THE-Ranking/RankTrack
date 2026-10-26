"use client";

import { useEffect } from "react";
import { SceneLight } from "./SceneLight";

/** Seconds after the page opens at which the canvases light up, once the bands have slid in (signin.css). */
const LIGHTS_AT = 1.1;
/** How often the clock's hands move. */
const HANDS_EVERY = 10_000;

/**
 * The scene's live layer (signin.css, "scene"). It sets --mx and --my on the scene, the pointer's offset
 * from the centre (-1 to 1), which the layers read as depth: the stars barely move, the monument most. With
 * no pointer (touch, or the mouse at rest) the scene drifts on its own, slowly. It also runs SceneLight: the
 * sky, the halftone and the building's lights; and the clock tower's hands, at the viewer's own time. Reduced
 * motion keeps the still composition.
 */
export function SceneMotion() {
  useEffect(() => {
    const scene = document.querySelector<HTMLElement>(".sx");
    if (!scene) return;

    const fields = [
      { canvas: scene.querySelector<HTMLCanvasElement>(".sx__dots--a canvas"), toward: "end" as const, dense: 1.9 },
      { canvas: scene.querySelector<HTMLCanvasElement>(".sx__dots--b canvas"), toward: "start" as const, dense: 1.25 },
    ].flatMap((f) => (f.canvas ? [{ ...f, canvas: f.canvas }] : []));
    const light = new SceneLight({
      fields,
      town: scene.querySelector<HTMLCanvasElement>(".sx__lights"),
      sky: scene.querySelector<HTMLCanvasElement>(".sx__sky"),
      moon: scene.querySelector<HTMLElement>(".sx__moon"),
    });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const aim = { x: 0, y: 0 };
    const at = { x: 0, y: 0 };
    let clock = 0;
    let idleSince = 0;
    let pointed = false;
    let live = false;
    let lit = false;
    let resizing = 0;

    // the clock's hands at the viewer's own time
    const hands = scene.querySelectorAll<SVGPathElement>(".sx__hand");
    const tell = () => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
      hands[0]?.setAttribute("transform", `rotate(${((minutes / 2) % 360).toFixed(2)})`);
      hands[1]?.setAttribute("transform", `rotate(${((minutes * 6) % 360).toFixed(2)})`);
    };

    const measure = () => {
      resizing = 0;
      light.resize();
      if (!live) light.still();
    };
    const onResize = () => {
      if (!resizing) resizing = window.requestAnimationFrame(measure);
    };

    // depth: follow the pointer a little behind; at rest, a slow drift of its own
    light.onFrame = (t, dt) => {
      clock = t;
      if (!pointed && t - idleSince > 1.5) {
        aim.x = Math.sin(t / 7.3) * 0.32;
        aim.y = Math.sin(t / 9.1) * 0.22;
      }
      const k = Math.min(1, dt * (pointed ? 4.5 : 1.2));
      at.x += (aim.x - at.x) * k;
      at.y += (aim.y - at.y) * k;
      scene.style.setProperty("--mx", at.x.toFixed(4));
      scene.style.setProperty("--my", at.y.toFixed(4));
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches || !live) return;
      pointed = true;
      aim.x = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      aim.y = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
      light.pointer = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => {
      pointed = false;
      idleSince = clock;
      light.pointer = null;
    };

    const run = () => {
      if (live && lit && !document.hidden) light.start();
      else light.stop();
    };
    const wake = window.setTimeout(() => {
      lit = true;
      scene.classList.add("is-lit");
      run();
    }, LIGHTS_AT * 1000);

    const sync = () => {
      live = !reduce.matches;
      scene.classList.toggle("is-live", live);
      if (!live) {
        light.pointer = null;
        scene.style.removeProperty("--mx");
        scene.style.removeProperty("--my");
      }
      measure();
      run();
    };

    const ticking = window.setInterval(tell, HANDS_EVERY);
    const onVisible = () => {
      run();
      if (!document.hidden) tell();
    };

    tell();
    sync();
    reduce.addEventListener("change", sync);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      light.stop();
      window.clearTimeout(wake);
      window.clearInterval(ticking);
      window.cancelAnimationFrame(resizing);
      reduce.removeEventListener("change", sync);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisible);
      scene.classList.remove("is-live", "is-lit");
    };
  }, []);

  return null;
}
