"use client";

import { useEffect } from "react";
import { GoldDust } from "./ArchDust";

/** The opening is fully passed through at this share of the travel; the rest holds the building full screen. */
const THROUGH = 0.82;
/** The opening's crown, in opening widths (ArchDrawing's units / 100). */
const CROWN = 1.5;
/** Seconds after the loader has gone at which the opening is lit (site-home.css, "motion": w-arch-open). */
const LIT_AT = 1.1;
/** Seconds after the loader has gone at which the drawing is complete and lights begin to climb it. */
const DRAWN_AT = 3.6;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The hero's live layer (site-home.css, "hero"). CSS draws everything from a few numbers this sets on the
 * stage: --s, the opening's scale as the visitor walks through it; --pass, 0 at rest and 1 once through;
 * --mx and --my, the pointer's offset from the centre (-1 to 1); --shift, how far below its place the
 * picture starts; --arch-ink, the stroke width that keeps the drawing a hairline; and on a phone the opening's
 * width, measured from the room left under the words. It also runs the light of the room (ArchDust), with
 * the lights that climb the drawing, and the slight pull of the main button toward the pointer. Reduced motion keeps the still composition.
 */
export function ArchMotion() {
  useEffect(() => {
    const hero = document.getElementById("hero");
    const stage = hero?.querySelector<HTMLElement>(".w-arch__stage");
    const door = hero?.querySelector<HTMLElement>(".w-arch__door");
    const view = hero?.querySelector<HTMLElement>(".w-arch__view");
    const ticker = hero?.querySelector<HTMLElement>(".w-arch__ticker");
    const canvas = hero?.querySelector<HTMLCanvasElement>(".w-arch__dust");
    const cta = hero?.querySelector<HTMLElement>(".w-arch__cta");
    if (!hero || !stage || !door || !view || !ticker || !canvas || !cta) return;

    const img = view.querySelector("img");
    const focus = parseFloat(view.dataset.focus ?? "0.5");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const dust = new GoldDust(canvas);
    let live = false;
    let begun = false;
    let onScreen = true;
    let frame = 0;
    let cover = 1;
    let stickyTop = 0;
    let archW = 0;
    let ground = 0;
    let ink = 0.3;
    const aim = { x: 0, y: 0 };
    const at = { x: 0, y: 0 };

    const clear = () => {
      for (const name of ["--s", "--pass", "--mx", "--my", "--shift", "--arch-ink", "--arch-w"]) stage.style.removeProperty(name);
    };

    const measure = () => {
      stage.style.removeProperty("--arch-w");
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      ground = H - ticker.offsetHeight;
      // on a phone the opening stands in the door, the room left under the words
      const box = door.getBoundingClientRect();
      if (box.height > 0) {
        const room = stage.getBoundingClientRect().top + ground - box.top;
        stage.style.setProperty("--arch-w", `${Math.max(80, Math.min(box.width * 0.56, room / 1.62)).toFixed(1)}px`);
      }
      archW = parseFloat(getComputedStyle(view).getPropertyValue("--arch-w")) || 300;
      cover = Math.max(W / archW, ground / ((CROWN - 0.5) * archW)) * 1.04;
      stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
      // one device pixel of gold, a touch finer on dense screens
      ink = (100 / archW) * (window.devicePixelRatio >= 2 ? 0.8 : 1);
      // the picture is cover-fitted into the pan, which overhangs the view by 3% on every side
      if (img?.naturalWidth) {
        const pw = W * 1.06;
        const ph = ground * 1.06;
        const k = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
        const fitted = img.naturalHeight * k;
        const posY = parseFloat(getComputedStyle(img).objectPosition.split(" ")[1] ?? "50") / 100;
        const focusY = -0.03 * ground + (ph - fitted) * posY + fitted * focus;
        const target = ground - CROWN * archW * 0.6;
        stage.style.setProperty("--shift", `${Math.min(ground * 0.35, Math.max(0, target - focusY)).toFixed(1)}px`);
      }
      dust.resize(W, ground);
    };

    const draw = () => {
      frame = 0;
      if (!live) return;
      const travel = hero.offsetHeight - stage.offsetHeight;
      const p = travel > 0 ? Math.min(1, Math.max(0, (stickyTop - hero.getBoundingClientRect().top) / travel)) : 0;
      const pass = easeInOut(Math.min(1, p / THROUGH));
      const s = Math.exp(Math.log(cover) * pass);
      at.x += (aim.x - at.x) * 0.08;
      at.y += (aim.y - at.y) * 0.08;
      stage.style.setProperty("--s", s.toFixed(4));
      stage.style.setProperty("--pass", pass.toFixed(4));
      stage.style.setProperty("--mx", at.x.toFixed(4));
      stage.style.setProperty("--my", at.y.toFixed(4));
      stage.style.setProperty("--arch-ink", (ink / s).toFixed(4));
      hero.classList.toggle("is-through", pass > 0.5);
      // the light spills from the opening as it is now, however far the visitor has walked in,
      // and the lights climb the drawing where it stands now (site-home.css, .w-arch__monument)
      dust.pass = pass;
      dust.light = { x: stage.clientWidth / 2, w: archW * s * 1.2, top: ground - CROWN * archW * s, bottom: ground };
      dust.bay = { x: stage.clientWidth / 2, y: ground, k: (archW / 100) * s };
      dust.bayShown = Math.max(0, 1 - pass * 1.6);
      if (Math.abs(aim.x - at.x) > 0.001 || Math.abs(aim.y - at.y) > 0.001) frame = window.requestAnimationFrame(draw);
    };
    const schedule = () => {
      if (live && !frame) frame = window.requestAnimationFrame(draw);
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches || !live) return;
      const r = stage.getBoundingClientRect();
      aim.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      aim.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      const inside = e.clientY >= r.top && e.clientY <= r.top + ground;
      dust.pointer = inside ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
      // the main button leans toward a pointer that comes near it
      const b = cta.getBoundingClientRect();
      const dx = e.clientX - (b.left + b.width / 2);
      const dy = e.clientY - (b.top + b.height / 2);
      const near = Math.abs(dx) < b.width / 2 + 70 && Math.abs(dy) < b.height / 2 + 50;
      cta.style.setProperty("--pull-x", near ? `${(dx * 0.16).toFixed(1)}px` : "0px");
      cta.style.setProperty("--pull-y", near ? `${(dy * 0.22).toFixed(1)}px` : "0px");
      schedule();
    };
    const onLeave = () => {
      aim.x = aim.y = 0;
      dust.pointer = null;
      cta.style.setProperty("--pull-x", "0px");
      cta.style.setProperty("--pull-y", "0px");
      schedule();
    };

    const runDust = () => {
      if (live && begun && onScreen && !document.hidden) dust.start();
      else dust.stop();
    };
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      runDust();
    });
    io.observe(stage);

    // the light wakes when the loader has gone, in step with the entrance
    const site = hero.closest<HTMLElement>(".site");
    const begin = () => {
      if (begun || !live || site?.dataset.intro === "load") return;
      begun = true;
      dust.ignite(LIT_AT);
      dust.climb(DRAWN_AT);
      canvas.classList.add("is-on");
      runDust();
    };
    const mo = site ? new MutationObserver(begin) : null;
    if (site) mo!.observe(site, { attributes: true, attributeFilter: ["data-intro"] });

    // live only with motion allowed and room for the stage; otherwise the still composition
    const sync = () => {
      const want = !reduce.matches && window.innerHeight >= 520;
      if (want !== live) {
        live = want;
        hero.classList.toggle("is-live", live);
        if (!live) {
          window.cancelAnimationFrame(frame);
          frame = 0;
          hero.classList.remove("is-through");
          canvas.classList.remove("is-on");
          clear();
        }
      }
      if (live) {
        measure();
        schedule();
        begin();
      }
      runDust();
    };

    sync();
    reduce.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    img?.addEventListener("load", sync);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", runDust);
    return () => {
      live = false;
      dust.stop();
      io.disconnect();
      mo?.disconnect();
      window.cancelAnimationFrame(frame);
      reduce.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      img?.removeEventListener("load", sync);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", runDust);
      hero.classList.remove("is-live", "is-through");
      canvas.classList.remove("is-on");
      clear();
    };
  }, []);

  return null;
}
