"use client";

import { useEffect, useRef } from "react";

/** How far outside the card, in px, the pointer starts to draw the beam to itself. */
const REACH = 140;
/** Where the beam rests along the top rim, as a share of the card's width (signin.css, --bx). */
const REST = 0.39;
/** How quickly the beam catches up with the pointer, goes home, and brightens or dims (per second). */
const FOLLOW = 11;
const RETURN = 3.6;
const GLOW_IN = 7;
const GLOW_OUT = 2.6;

/** A point on the rim of a w × h box, as a distance along it clockwise from the top-left corner. */
const along = (x: number, y: number, w: number, h: number) => {
  const edge = Math.min(y, w - x, h - y, x);
  if (edge === y) return x;
  if (edge === w - x) return w + y;
  if (edge === h - y) return w + h + (w - x);
  return 2 * w + h + (h - y);
};

/** The point that far along the rim. */
const pointAt = (s: number, w: number, h: number): [number, number] => {
  if (s < w) return [s, 0];
  if (s < w + h) return [w, s - w];
  if (s < 2 * w + h) return [2 * w + h - s, h];
  return [0, 2 * (w + h) - s];
};

/**
 * The gold beam on the login card's gilt rim (signin.css, "the beam"). At rest it lies along the top rim.
 * With a mouse within REACH of the card it runs round the rim to the pointer: to the nearest point of the
 * rim from outside, and from inside to where a line from the card's centre through the pointer meets it.
 * It brightens as the pointer closes in (--bk) and glides home when it leaves. Touch keeps the resting
 * beam; reduced motion moves it without the glide.
 */
export function CardBeam() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const beam = ref.current;
    const card = beam?.parentElement;
    if (!beam || !card) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let pointer: { x: number; y: number } | null = null;
    // where the beam is and where it heads, as shares of the rim's length; how bright it is (0 to 1)
    let u = -1;
    let aim = 0;
    let k = 0;
    let frame = 0;
    let last = 0;

    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const r = card.getBoundingClientRect();
      const { width: w, height: h } = r;
      const rim = 2 * (w + h);
      if (!w || !h) return;

      let near = 0;
      let homing = true;
      if (pointer) {
        const x = pointer.x - r.left;
        const y = pointer.y - r.top;
        const d = Math.hypot(Math.max(-x, 0, x - w), Math.max(-y, 0, y - h));
        if (d < REACH) {
          const t = 1 - d / REACH;
          near = t * t * (3 - 2 * t);
          homing = false;
          if (d > 0) {
            aim = along(Math.min(w, Math.max(0, x)), Math.min(h, Math.max(0, y)), w, h) / rim;
          } else {
            const vx = x - w / 2;
            const vy = y - h / 2;
            const reach = Math.min(vx ? w / 2 / Math.abs(vx) : Infinity, vy ? h / 2 / Math.abs(vy) : Infinity);
            if (Number.isFinite(reach)) aim = along(w / 2 + vx * reach, h / 2 + vy * reach, w, h) / rim;
          }
        }
      }
      if (homing) aim = (REST * w) / rim;
      if (u < 0) u = (REST * w) / rim;

      const ease = (rate: number) => (reduce.matches ? 1 : 1 - Math.exp(-dt * rate));
      const turn = ((aim - u + 1.5) % 1) - 0.5;
      u = (u + turn * ease(homing ? RETURN : FOLLOW) + 1) % 1;
      k += (near - k) * ease(near > k ? GLOW_IN : GLOW_OUT);

      if (homing && Math.abs(turn) * rim < 0.5 && k < 0.002) {
        // home: hand the beam back to the stylesheet's resting place, which keeps up with the card's size
        u = -1;
        k = 0;
        last = 0;
        beam.style.removeProperty("--bx");
        beam.style.removeProperty("--by");
        beam.style.removeProperty("--bk");
        return;
      }
      const [bx, by] = pointAt(u * rim, w, h);
      beam.style.setProperty("--bx", `${bx.toFixed(1)}px`);
      beam.style.setProperty("--by", `${by.toFixed(1)}px`);
      beam.style.setProperty("--bk", k.toFixed(3));
      if (Math.abs(turn) * rim > 0.3 || Math.abs(near - k) > 0.002) frame = window.requestAnimationFrame(tick);
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
    const resized = new ResizeObserver(wake);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    resized.observe(card);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", wake);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      resized.disconnect();
    };
  }, []);

  return <span ref={ref} className="signin__beam" aria-hidden="true" />;
}
