"use client";

import gsap from "gsap";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Smooth wheel scrolling for the public site. GSAP eases the page's real scroll position toward where
 * the wheel asked to go, so position: sticky, scroll-driven CSS and anchors all keep working (a
 * transformed wrapper like ScrollSmoother would break the sticky header and page tabs).
 * Touch, keyboard, scrollbar and anchor scrolling stay native; reduced motion and touch-only devices
 * get no smoothing at all.
 */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const pos = { y: window.scrollY };
    let target = pos.y;
    let tween: gsap.core.Tween | null = null;

    const max = () => root.scrollHeight - window.innerHeight;

    // A wheel over something that can scroll itself in that direction belongs to that element.
    const ownScroller = (el: Element | null, dy: number) => {
      for (; el && el !== document.body && el !== root; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
          if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
        }
      }
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      if (reduce.matches || e.ctrlKey || e.defaultPrevented) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("dialog[open]") || root.style.overflow === "hidden" || getComputedStyle(root).overflowY === "hidden") return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const dy = e.deltaY * unit;
      if (ownScroller(t, dy)) return;
      e.preventDefault();
      if (!tween) pos.y = target = window.scrollY;
      target = gsap.utils.clamp(0, max(), target + dy);
      tween?.kill();
      tween = gsap.to(pos, {
        y: target,
        duration: 1,
        ease: "power3.out",
        // "instant" bypasses html { scroll-behavior: smooth }, which would fight every frame
        onUpdate: () => window.scrollTo({ top: pos.y, behavior: "instant" }),
        onComplete: () => {
          tween = null;
        },
      });
    };

    // Keys, the scrollbar and anchors take over from a glide in progress.
    const stop = () => {
      tween?.kill();
      tween = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) stop();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", stop);
    window.addEventListener("hashchange", stop);
    return () => {
      stop();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("hashchange", stop);
    };
    // A new page starts again from wherever the router put it, not from an old wheel target.
  }, [pathname]);

  return null;
}
