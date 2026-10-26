"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/*
 * Aceternity's glowing effect (ui.aceternity.com/components/glowing-effect) in the Hub's CSS: a lit arc on
 * a box's rim that faces the pointer once it comes within reach. Put it inside any positioned, rounded box.
 * One listener and one animation frame drive every rim on the page, `.glow` in components.css draws the
 * arc, and touch never lights it.
 */

interface Rim {
  el: HTMLElement;
  /** Where the arc points, in degrees clockwise from the top. */
  angle: number;
  lit: boolean;
  proximity: number;
  inactiveZone: number;
}

/** Seconds the arc takes to settle: it stays with the pointer and still turns smoothly when the pointer crosses a box. */
const SETTLE = 0.025;

const rims = new Set<Rim>();
let pointer: { x: number; y: number } | null = null;
let frame = 0;
let last = 0;
let still: MediaQueryList | null = null;

/** The shortest way round, from -180 to 180 degrees. */
const turn = (deg: number) => ((((deg % 360) + 540) % 360) - 180);

function step(now: number) {
  frame = 0;
  const k = still?.matches ? 1 : 1 - Math.exp(-Math.min(0.05, (now - last) / 1000) / SETTLE);
  last = now;
  const p = pointer;
  const all = [...rims];
  // Measure every box before changing any, so each frame lays the page out once.
  const boxes = all.map((rim) => rim.el.getBoundingClientRect());
  let settling = false;
  all.forEach((rim, i) => {
    const box = boxes[i];
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const lit =
      !!p &&
      p.x > box.left - rim.proximity &&
      p.x < box.right + rim.proximity &&
      p.y > box.top - rim.proximity &&
      p.y < box.bottom + rim.proximity &&
      Math.hypot(p.x - cx, p.y - cy) >= (Math.min(box.width, box.height) / 2) * rim.inactiveZone;
    const fresh = lit && !rim.lit;
    if (lit !== rim.lit) {
      rim.lit = lit;
      rim.el.toggleAttribute("data-lit", lit);
    }
    if (!lit || !p) return;
    const delta = turn((Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90 - rim.angle);
    if (Math.abs(delta) < 0.1) return;
    // A rim that has just lit points straight at the pointer; a lit one eases the rest of the way.
    const move = fresh ? delta : delta * k;
    rim.angle += move;
    rim.el.style.setProperty("--glow-start", rim.angle.toFixed(2));
    if (Math.abs(delta - move) >= 0.1) settling = true;
  });
  if (settling) frame = requestAnimationFrame(step);
}

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(step);
};
const onMove = (e: PointerEvent) => {
  if (e.pointerType === "touch") return;
  pointer = { x: e.clientX, y: e.clientY };
  schedule();
};
const onLeave = () => {
  pointer = null;
  schedule();
};

function listen() {
  still = matchMedia("(prefers-reduced-motion: reduce)");
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("scroll", schedule, { passive: true, capture: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);
}

function unlisten() {
  document.removeEventListener("pointermove", onMove);
  document.removeEventListener("scroll", schedule, { capture: true });
  document.documentElement.removeEventListener("pointerleave", onLeave);
  window.removeEventListener("blur", onLeave);
  cancelAnimationFrame(frame);
  frame = 0;
  pointer = null;
}

export function GlowingEffect({
  spread = 40,
  proximity = 64,
  inactiveZone = 0.01,
  borderWidth = 1,
}: {
  /** Half the arc's length, in degrees. */
  spread?: number;
  /** How far beyond the box, in pixels, the pointer starts to light it. */
  proximity?: number;
  /** Share of the box's half-size, round its centre, where the rim stays dark. */
  inactiveZone?: number;
  borderWidth?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rim: Rim = { el, angle: 0, lit: false, proximity, inactiveZone };
    rims.add(rim);
    if (rims.size === 1) listen();
    schedule();
    return () => {
      rims.delete(rim);
      if (!rims.size) unlisten();
    };
  }, [proximity, inactiveZone]);

  // A faint halo, the line and a white glint. The halo is a blurred copy of the line: the blur has to sit
  // on a parent of the masked ring.
  return (
    <span
      ref={ref}
      className="glow"
      aria-hidden="true"
      style={{ "--glow-spread": spread, "--glow-bw": `${borderWidth}px` } as CSSProperties}
    >
      <span className="glow__bloom" />
      <span className="glow__line" />
      <span className="glow__gloss" />
    </span>
  );
}
