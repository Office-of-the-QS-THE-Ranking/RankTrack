"use client";

import { useEffect, useRef } from "react";

/** How far from the seam, in px, the pointer starts to draw the beam to itself. */
const REACH = 140;
/** Where the beam rests along the seam, as a share of its length (signin.css, --bx/--by): down the sidebar's
 *  left edge, or across the sheet's top edge on narrow windows. */
const REST = { side: 0.38, sheet: 0.39 };
/** How quickly the beam catches up with the pointer, goes home, and brightens or dims (per second). */
const FOLLOW = 11;
const RETURN = 3.6;
const GLOW_IN = 7;
const GLOW_OUT = 2.6;

/**
 * The gold beam on the sign-in sidebar's gilt seam (signin.css, "the beam"): the seam down its left edge, or
 * along the top of the sheet it becomes on narrow windows. At rest the beam lies a little above the middle of
 * the seam; with a mouse within REACH of it, on either side, it slides along the seam to the pointer, brightens
 * as the pointer closes in (--bk) and glides home when it leaves. Touch keeps the resting beam; reduced motion
 * moves it without the glide.
 */
export function CardBeam() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const beam = ref.current;
    const card = beam?.parentElement;
    if (!beam || !card) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 861px)");
    let pointer: { x: number; y: number } | null = null;
    // where the beam is and where it heads, as shares of the seam's length; how bright it is (0 to 1)
    let u = -1;
    let aim = 0;
    let k = 0;
    let frame = 0;
    let last = 0;

    const home = () => {
      u = -1;
      k = 0;
      last = 0;
      beam.style.removeProperty("--bx");
      beam.style.removeProperty("--by");
      beam.style.removeProperty("--bk");
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const r = card.getBoundingClientRect();
      const side = wide.matches;
      // the seam's length, and the pointer as a distance along it and a distance off it
      const len = side ? r.height : r.width;
      if (!len) return;
      const rest = side ? REST.side : REST.sheet;

      let near = 0;
      let homing = true;
      if (pointer) {
        const at = side ? pointer.y - r.top : pointer.x - r.left;
        const off = side ? pointer.x - r.left : pointer.y - r.top;
        const d = Math.hypot(off, Math.max(-at, 0, at - len));
        if (d < REACH) {
          const t = 1 - d / REACH;
          near = t * t * (3 - 2 * t);
          homing = false;
          aim = Math.min(1, Math.max(0, at / len));
        }
      }
      if (homing) aim = rest;
      if (u < 0) u = rest;

      const ease = (rate: number) => (reduce.matches ? 1 : 1 - Math.exp(-dt * rate));
      u += (aim - u) * ease(homing ? RETURN : FOLLOW);
      k += (near - k) * ease(near > k ? GLOW_IN : GLOW_OUT);

      const gap = Math.abs(aim - u) * len;
      // home: hand the beam back to the stylesheet's resting place, which keeps up with the sidebar's size
      if (homing && gap < 0.5 && k < 0.002) return home();
      const s = `${(u * len).toFixed(1)}px`;
      beam.style.setProperty("--bx", side ? "0px" : s);
      beam.style.setProperty("--by", side ? s : "0px");
      beam.style.setProperty("--bk", k.toFixed(3));
      if (gap > 0.3 || Math.abs(near - k) > 0.002) frame = window.requestAnimationFrame(tick);
      else last = 0;
    };
    const wake = () => {
      if (!frame && (pointer || u >= 0)) frame = window.requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !fine.matches) return;
      pointer = { x: e.clientX, y: e.clientY };
      wake();
    };
    const onLeave = () => {
      pointer = null;
      wake();
    };
    // the seam moves from the side to the top (or back): start again from its resting place
    const onWide = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      home();
      wake();
    };
    const resized = new ResizeObserver(wake);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    wide.addEventListener("change", onWide);
    resized.observe(card);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", wake);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      wide.removeEventListener("change", onWide);
      resized.disconnect();
    };
  }, []);

  return <span ref={ref} className="signin__beam" aria-hidden="true" />;
}
