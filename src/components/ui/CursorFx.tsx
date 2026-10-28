"use client";

import { useEffect, useRef } from "react";

/*
 * Behaviour for the custom cursor (src/styles/cursors.css), mounted once in the root layout.
 * - Click: the arrow pulses, easing smaller while pressed, then swelling slightly past full
 *   size on release and settling back. Cursor images can't be scaled, so this steps through
 *   pre-drawn frames (cursor-frames.css) by setting data-cursor on <html>.
 * - Hover: native `title` tooltips are replaced by the Hub's own tooltip at the cursor tail.
 *   The title is lifted off the element while hovered so the browser's bubble never shows,
 *   and put back on leave.
 * Mouse only. The pulse is off for reduced motion; the tooltip stays.
 */

// [frame, ms from start]; null is full size. Frames match PULSE in scripts/cursors/shapes.mjs.
type Step = [string | null, number];
const PRESS: Step[] = [["92", 0], ["86", 50]];
const RELEASE: Step[] = [["92", 0], [null, 45], ["104", 95], ["108", 150], ["104", 215], [null, 285]];
// Every cursor image, loaded up front: a browser shows its native cursor until a custom one
// has loaded, which otherwise happens the first time each is needed (the text bar at a field).
const IMAGES = [
  "arrow",
  "pointer",
  "text",
  "not-allowed",
  "gold",
  ...["86", "92", "104", "108"].flatMap((k) => [`arrow-${k}`, `pointer-${k}`, `gold-${k}`]),
];
const TIP_DELAY = 350;
const TIP_X = 14; // below and right of the arrow's tail
const TIP_Y = 22;
const GAP = 8;

const canPopover = () => typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;

function lift(el: HTMLElement | null) {
  if (!canPopover() || !el) return;
  if (el.matches(":popover-open")) el.hidePopover();
  el.showPopover();
}

export function CursorFx() {
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const tip = tipRef.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hiDpi = window.devicePixelRatio > 1 ? "@2x" : "";
    const preload = IMAGES.map((f) => {
      const img = new Image();
      img.src = `/cursors/${f}${hiDpi}.png`;
      return img;
    });

    let pulse: number[] = [];
    let showTimer = 0;
    let frame = 0;
    let x = 0;
    let y = 0;
    let pressed = false;
    let owner: HTMLElement | null = null;
    let text = "";

    /* ---------- Click pulse ---------- */
    const setFrame = (k: string | null) => {
      if (k) root.dataset.cursor = k;
      else delete root.dataset.cursor;
    };

    const endPulse = () => {
      pulse.forEach((t) => window.clearTimeout(t));
      pulse = [];
      setFrame(null);
    };

    const play = (steps: Step[]) => {
      pulse.forEach((t) => window.clearTimeout(t));
      pulse = steps.map(([k, at]) => window.setTimeout(() => setFrame(k), at));
    };

    /* ---------- Tooltip ---------- */
    const place = () => {
      frame = 0;
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let left = x + TIP_X;
      let top = y + TIP_Y;
      if (left + w > window.innerWidth - GAP) left = Math.max(GAP, x - w - 6);
      if (top + h > window.innerHeight - GAP) top = Math.max(GAP, y - h - 8);
      tip.style.translate = `${Math.round(left)}px ${Math.round(top)}px`;
    };

    const hideTip = () => {
      window.clearTimeout(showTimer);
      tip.classList.remove("is-on");
    };

    const showTip = () => {
      if (!owner || !text) return;
      tip.textContent = text;
      const dotColor = owner.dataset.tooltipColor;
      if (dotColor) tip.style.setProperty("--cursor-tip-dot", dotColor);
      else tip.style.removeProperty("--cursor-tip-dot");
      lift(tip);
      place();
      tip.classList.add("is-on");
    };

    // React may set the title again while it's hovered (a label that changes on click).
    const watch = new MutationObserver(() => {
      if (!owner) return;
      const next = owner.getAttribute("title");
      if (next === null) return;
      owner.removeAttribute("title");
      if (next) {
        text = next;
        if (tip.classList.contains("is-on")) {
          tip.textContent = text;
          place();
        }
      }
    });

    const release = () => {
      hideTip();
      watch.disconnect();
      if (owner && text && !owner.hasAttribute("title")) owner.setAttribute("title", text);
      owner = null;
      text = "";
    };

    const titled = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const el = target.closest<HTMLElement>("[title]:not([title=''])");
      return el instanceof HTMLElement ? el : null;
    };

    /* ---------- Events ---------- */
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = titled(e.target);
      if (el === owner) return;
      release();
      if (!el) return;
      owner = el;
      text = el.getAttribute("title") ?? "";
      el.removeAttribute("title");
      watch.observe(el, { attributes: true, attributeFilter: ["title"] });
      x = e.clientX;
      y = e.clientY;
      showTimer = window.setTimeout(showTip, TIP_DELAY);
    };

    const onOut = (e: PointerEvent) => {
      if (!owner) return;
      const to = e.relatedTarget;
      if (to instanceof Node && owner.contains(to)) return;
      release();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (tip.classList.contains("is-on") && !frame) frame = requestAnimationFrame(place);
    };

    const onDown = (e: PointerEvent) => {
      hideTip();
      if (e.pointerType !== "mouse" || e.button !== 0 || reduce.matches) return;
      pressed = true;
      play(PRESS);
    };

    const onUp = () => {
      if (!pressed) return;
      pressed = false;
      play(RELEASE);
    };

    const onLeave = () => {
      release();
      pressed = false;
      endPulse();
    };

    window.addEventListener("pointerover", onOver, true);
    window.addEventListener("pointerout", onOut, true);
    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onLeave, true);
    window.addEventListener("scroll", hideTip, { capture: true, passive: true });
    window.addEventListener("keydown", hideTip, true);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointerover", onOver, true);
      window.removeEventListener("pointerout", onOut, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onLeave, true);
      window.removeEventListener("scroll", hideTip, true);
      window.removeEventListener("keydown", hideTip, true);
      window.removeEventListener("blur", onLeave);
      cancelAnimationFrame(frame);
      onLeave();
      preload.length = 0;
    };
  }, []);

  return <div ref={tipRef} className="cursor-tip" popover="manual" aria-hidden="true" />;
}
