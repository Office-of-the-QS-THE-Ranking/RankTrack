"use client";

import { useEffect } from "react";
import { SceneLight } from "./SceneLight";
import { SKY_THEME, type Sky } from "./sky";
import { skyOverride } from "./skyOverride";

/** Seconds after the page opens at which the canvases light up, once the bands have slid in (signin.css). */
const LIGHTS_AT = 1.1;
/** How often to look at the clock for sunrise or sunset, and how long a turning sky may wait for its renders. */
const CLOCK_EVERY = 30_000;
const RENDERS_WAIT = 8_000;
/** How long the sky button's icon takes to turn in (signin.css, the sky button); the scene turns after it. */
const FLIP_SETTLES = 420;
/** How long a time-lapse runs, in seconds: brisk after a flip, slower when the real sun rises or sets. */
const LAPSE = { flip: 2.8, sun: 4.2 };
/** The hours a time-lapse runs on the clock: twelve bring its hands back round to the time. */
const LAPSE_HOURS = 12;
/** How often the clock's hands move, outside a time-lapse. */
const HANDS_EVERY = 10_000;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * The scene's live layer (signin.css, "scene"). It sets --mx and --my on the scene, the pointer's offset
 * from the centre (-1 to 1), which the layers read as depth: the stars barely move, the monument most. With
 * no pointer (touch, or the mouse at rest) the scene drifts on its own, slowly. It also runs SceneLight: the
 * sky, the halftone and the building's lights; and the clock tower's hands, at the viewer's own time. Reduced
 * motion keeps the still composition.
 *
 * It keeps the sky too (sky.ts): the sky outside, or the other one while the viewer has flipped it with the sky
 * button (skyOverride). The page opens on the sky SKY_BOOT chose; when the viewer flips it, or the sun rises or
 * sets while the page is open, the scene turns, after the incoming renders have loaded, as a time-lapse
 * (signin.css, "the time-lapse"): a view transition in which the moon or the sun sets and the other rises, a
 * glow of dawn or dusk swells and fades, the rest of the page cross-fades, the new sky runs fast (clouds race,
 * stars trail) and the clock whirls through twelve hours. Brisk for a flip, slower for the sun; at once when the
 * page has only just come (a client-side navigation), under reduced motion, or where there are no view
 * transitions.
 */
export function SceneMotion() {
  useEffect(() => {
    const scene = document.querySelector<HTMLElement>(".sx");
    const page = scene?.closest<HTMLElement>(".signin");
    if (!scene || !page) return;

    const fields = [
      { canvas: scene.querySelector<HTMLCanvasElement>(".sx__dots--a canvas"), toward: "end" as const, dense: 1.9 },
      { canvas: scene.querySelector<HTMLCanvasElement>(".sx__dots--b canvas"), toward: "start" as const, dense: 1.25 },
    ].flatMap((f) => (f.canvas ? [{ ...f, canvas: f.canvas }] : []));
    let time: Sky = page.dataset.sky === "day" ? "day" : "night";
    const light = new SceneLight({
      fields,
      town: scene.querySelector<HTMLCanvasElement>(".sx__lights"),
      sky: scene.querySelector<HTMLCanvasElement>(".sx__sky"),
      moon: scene.querySelector<HTMLElement>(".sx__moon"),
      sun: scene.querySelector<HTMLElement>(".sx__sun"),
      time,
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
    let turning = false;
    let gone = false;
    let lapse: { from: number; takes: number } | null = null;

    // the clock's hands at the viewer's own time, `extra` minutes on while time runs fast
    const hands = scene.querySelectorAll<SVGPathElement>(".sx__hand");
    const tell = (extra = 0) => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + extra;
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
      // a time-lapse: the sky runs fast while the new one comes in, slowing to its own pace, and the clock whirls
      if (lapse) {
        const p = Math.min(1, (performance.now() - lapse.from) / (lapse.takes * 1000));
        light.rush = 1 + 26 * (1 - smooth(0.3, 1, p));
        tell(LAPSE_HOURS * 60 * smooth(0.04, 0.96, p));
        if (p >= 1) {
          lapse = null;
          light.rush = 1;
          tell();
        }
      }
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

    // the sky: load the other renders, then turn the whole page over; `pace` is why it turns: the viewer
    // flipped it, the sun rose or set, or the page has only just come and turns at once
    const turn = async (next: Sky, pace: "flip" | "sun" | "now") => {
      turning = true;
      const renders = [...scene.querySelectorAll<HTMLImageElement>(`.sx__art--${next}`)];
      for (const img of renders) img.loading = "eager";
      if (pace !== "now") {
        await Promise.all([
          Promise.race([
            Promise.all(renders.map((img) => img.decode().catch(() => undefined))),
            new Promise((done) => window.setTimeout(done, RENDERS_WAIT)),
          ]),
          // after a flip, let the sky button's icon settle first, so the cross-fade never catches it on the way
          pace === "flip" ? new Promise((done) => window.setTimeout(done, FLIP_SETTLES)) : null,
        ]);
      }
      if (gone) return;
      const apply = () => {
        time = next;
        page.dataset.sky = next;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", SKY_THEME[next]);
        light.setTime(next);
        measure();
      };
      const root = document.documentElement;
      if (pace !== "now" && live && "startViewTransition" in document && !document.hidden) {
        // the orbs travel half the scene's height down to the horizon, and a little to the right
        const takes = LAPSE[pace];
        const lengths = { "--lapse": `${takes}s`, "--lapse-drop": `${Math.round(scene.offsetHeight * 0.5)}px`, "--lapse-drift": `${Math.round(scene.offsetWidth * 0.05)}px` };
        for (const [k, v] of Object.entries(lengths)) root.style.setProperty(k, v);
        root.classList.add("is-lapse", next === "day" ? "is-dawn" : "is-dusk");
        await document
          .startViewTransition(() => {
            apply();
            scene.classList.add("is-turned", "is-lapsing");
            lapse = { from: performance.now(), takes };
          })
          .finished.catch(() => undefined);
        root.classList.remove("is-lapse", "is-dawn", "is-dusk");
        scene.classList.remove("is-lapsing");
        for (const k of Object.keys(lengths)) root.style.removeProperty(k);
      } else {
        apply();
        scene.classList.add("is-turned");
        tell();
      }
      turning = false;
      // the sun's turn shows on the sky button too; and the viewer may have flipped again while this one ran
      if (pace === "sun") skyOverride.settle();
      check(pace === "flip" ? "flip" : "sun");
    };
    // the sky to show: the flipped one, or the sky outside; checked also when the page came by a client-side
    // navigation (SKY_BOOT runs only on a full load) or a server render has rewritten the attribute
    const check = (pace: "flip" | "sun" | "now" = "sun") => {
      const next = skyOverride.sky();
      if ((next !== time || next !== page.dataset.sky) && !turning) void turn(next, pace);
    };
    const unflip = skyOverride.subscribe((cause) => {
      if (cause === "flip") check("flip");
    });
    // the clock, now and then: a flip the sun has come round to ends, and the sky turns if the sun rose or set
    const hourly = window.setInterval(() => {
      skyOverride.settle();
      check();
    }, CLOCK_EVERY);
    const ticking = window.setInterval(() => {
      if (!lapse) tell();
    }, HANDS_EVERY);
    const onVisible = () => {
      run();
      if (!document.hidden) check();
    };

    tell();
    sync();
    check("now");
    reduce.addEventListener("change", sync);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      unflip();
      light.stop();
      window.clearTimeout(wake);
      window.clearInterval(hourly);
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
