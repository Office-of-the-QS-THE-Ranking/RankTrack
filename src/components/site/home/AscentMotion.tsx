"use client";

import { useEffect } from "react";
import { AscentDust } from "./AscentDust";

/** Shares of the stage's travel: before the first line starts, and at the end with all four lit. */
const INTRO = 0.05;
const OUTRO = 0.14;
/** Share of each result's stretch of scroll spent drawing its line; the rest holds it finished. */
const DRAW = 0.62;
/** Seconds the wheels take to settle, after which a gilt glint crosses the figure. */
const GLINT_AT = 1.35;
/** Share of the stage that must be on screen before its figure rolls. */
const SETTLED = 0.4;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

type Curve = { x: number[]; y: number[]; labels: string[]; name: string };

/** y on a chart line at x, on the same level-to-level segments AscentChart draws. */
function curveY(c: Curve, x: number) {
  const n = c.x.length;
  if (x <= c.x[0]) return c.y[0];
  for (let k = 1; k < n; k++) {
    if (x > c.x[k]) continue;
    const u = (x - c.x[k - 1]) / (c.x[k] - c.x[k - 1]);
    let s = u;
    for (let i = 0; i < 6; i++) s = clamp(s - (1.5 * s - 1.5 * s * s + s * s * s - u) / (1.5 - 3 * s + 3 * s * s));
    return c.y[k - 1] + (c.y[k] - c.y[k - 1]) * (3 * s * s - 2 * s * s * s);
  }
  return c.y[n - 1];
}

/**
 * The live layer of the ascent (Movers.tsx, site-ascent.css). On a wide screen with motion allowed it marks
 * the section .is-live: the stage holds still for the track's travel, and the scroll decides which of the
 * four results is shown and how far its line is drawn (--hx on each line, --fill on each stop of the rail).
 * Each result's figure rolls on its wheels when it arrives, then catches a glint; the dust follows the head
 * of the line and bursts when it reaches this year's edition; the pointer is a lamp over the stage, leans
 * the figures a few pixels, and reads out every result at the edition under it. Elsewhere the blocks roll
 * and their small charts draw as they come into view. Under reduced motion nothing moves and nothing waits.
 */
export function AscentMotion() {
  useEffect(() => {
    const root = document.getElementById("ascent");
    const track = root?.querySelector<HTMLElement>(".w-asc__track");
    const stage = root?.querySelector<HTMLElement>(".w-asc__stage");
    const board = root?.querySelector<HTMLElement>(".w-asc__board .w-asc-chart");
    const canvas = root?.querySelector<HTMLCanvasElement>(".w-asc__dust");
    const inner = board?.querySelector<HTMLElement>(".w-asc-chart__inner");
    const tip = board?.querySelector<HTMLElement>(".w-asc-chart__tip");
    const tipYear = tip?.querySelector<HTMLElement>(".w-asc-chart__tip-year");
    const tipRows = tip?.querySelector<HTMLElement>(".w-asc-chart__tip-rows");
    if (!root || !track || !stage || !board || !canvas || !inner || !tip || !tipYear || !tipRows) return;

    const intro = root.querySelector<HTMLElement>(".w-asc__intro");
    const blocks = [...root.querySelectorAll<HTMLElement>(".w-asc__block")];
    const stops = [...root.querySelectorAll<HTMLButtonElement>(".w-asc__stop")];
    const lines = [...board.querySelectorAll<HTMLElement>(".w-asc-chart__series")];
    const minis = [...root.querySelectorAll<HTMLElement>(".w-asc__mini .w-asc-chart")];
    const years = [...board.querySelectorAll<HTMLElement>(".w-asc-chart__year")].map((y) => y.textContent ?? "");
    const curves: Curve[] = lines.map((el) => ({
      x: (el.dataset.x ?? "0").split(" ").map(Number),
      y: (el.dataset.y ?? "0").split(" ").map(Number),
      labels: (el.dataset.labels ?? "").split("|"),
      name: el.dataset.name ?? "",
    }));
    const steps = lines.length;
    const len = (1 - INTRO - OUTRO) / steps;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const dust = new AscentDust(canvas);
    const timers = new Map<HTMLElement, number>();
    let live = false;
    let visible = false;
    let settled = false;
    let frame = 0;
    let drift = 0;
    let active = -1;
    let hoverK = -1;
    // the plot's inner box, in stage pixels
    let box = { x: 0, y: 0, w: 1, h: 1 };
    const aim = { x: 0, y: 0 };
    const at = { x: 0, y: 0 };

    // from here on the wheels may wait on last year's digits: the script that rolls them is running
    root.classList.add("is-armed");

    // nothing plays under the loader: a visitor who lands mid-page sees the entrance when it lifts
    const site = root.closest<HTMLElement>(".site");
    const loading = () => site?.dataset.intro === "load";
    const waiting: HTMLElement[] = [];
    let rollWaits = false;

    const roll = (block: HTMLElement) => {
      window.clearTimeout(timers.get(block));
      block.classList.remove("is-rolled", "is-glint");
      void block.offsetWidth;
      block.classList.add("is-rolled");
      timers.set(
        block,
        window.setTimeout(() => block.classList.add("is-glint"), GLINT_AT * 1000),
      );
    };

    const activate = (i: number) => {
      if (i === active) return;
      active = i;
      hoverK = -1;
      blocks.forEach((b, k) => {
        const on = k === i;
        b.classList.toggle("is-active", on);
        b.inert = !on;
        if (on && settled) {
          if (loading()) rollWaits = true;
          else roll(b);
        }
      });
      lines.forEach((l, k) => l.classList.toggle("is-on", k === i));
      stops.forEach((s, k) => {
        s.classList.toggle("is-current", k === i);
        if (k === i) s.setAttribute("aria-current", "step");
        else s.removeAttribute("aria-current");
      });
    };

    const measure = () => {
      const s = stage.getBoundingClientRect();
      const r = inner.getBoundingClientRect();
      box = { x: r.left - s.left, y: r.top - s.top, w: r.width || 1, h: r.height || 1 };
      dust.resize(stage.clientWidth, stage.clientHeight);
    };

    const update = () => {
      frame = 0;
      if (!live) return;
      const travel = track.offsetHeight - stage.offsetHeight;
      const p = travel > 0 ? clamp(-track.getBoundingClientRect().top / travel) : 0;
      activate(clamp(Math.floor((p - INTRO) / len), 0, steps - 1));
      let head: { x: number; y: number } | null = null;
      for (let i = 0; i < steps; i++) {
        const el = lines[i];
        const c = curves[i];
        const t = (p - INTRO - i * len) / len;
        const d = easeInOut(clamp(t / DRAW));
        const x0 = c.x[0];
        const x1 = c.x[c.x.length - 1];
        const hx = x0 + (x1 - x0) * d;
        el.style.setProperty("--hx", hx.toFixed(4));
        stops[i]?.style.setProperty("--fill", clamp(t).toFixed(4));
        const full = d >= 0.999;
        if (full !== el.classList.contains("is-full")) {
          el.classList.toggle("is-full", full);
          // the line has arrived at this year's edition: sparks fly from its arch
          if (full && i === active && visible) dust.burst(box.x + box.w * x1, box.y + box.h * c.y[c.y.length - 1]);
        }
        if (i === active && d > 0.001 && d < 0.999) head = { x: hx, y: curveY(c, hx) };
      }
      // the four lines light together at the end, and every one of this year's arches throws its sparks
      const finale = p > 1 - OUTRO + 0.02;
      if (finale !== root.classList.contains("is-finale")) {
        root.classList.toggle("is-finale", finale);
        if (finale && visible)
          for (const c of curves) dust.burst(box.x + box.w * c.x[c.x.length - 1], box.y + box.h * c.y[c.y.length - 1], 28);
      }
      board.classList.toggle("is-drawing", head !== null);
      if (head) {
        board.style.setProperty("--head-x", head.x.toFixed(4));
        board.style.setProperty("--head-y", head.y.toFixed(4));
        dust.head = { x: box.x + box.w * head.x, y: box.y + box.h * head.y };
      } else dust.head = null;
    };
    const schedule = () => {
      if (live && !frame) frame = window.requestAnimationFrame(update);
    };

    // the figures lean a few pixels toward the pointer, easing after it
    const ease = () => {
      drift = 0;
      at.x += (aim.x - at.x) * 0.09;
      at.y += (aim.y - at.y) * 0.09;
      stage.style.setProperty("--mx", at.x.toFixed(4));
      stage.style.setProperty("--my", at.y.toFixed(4));
      if (Math.abs(aim.x - at.x) > 0.001 || Math.abs(aim.y - at.y) > 0.001) drift = window.requestAnimationFrame(ease);
    };
    const kick = () => {
      if (!drift) drift = window.requestAnimationFrame(ease);
    };

    // every result at the edition under the pointer; the values lead, the names follow
    const readout = (fx: number, fy: number) => {
      const over = fx > -0.08 && fx < 1.08 && fy > -0.06 && fy < 1.1;
      board.classList.toggle("is-hovering", over);
      if (!over) {
        hoverK = -1;
        return;
      }
      const n = years.length - 1;
      const k = Math.round(clamp(fx) * n);
      if (k !== hoverK) {
        hoverK = k;
        tipYear.textContent = `${years[k]} edition`;
        tipRows.replaceChildren(
          ...curves.map((c, i) => {
            const row = document.createElement("li");
            if (i === active) row.className = "is-on";
            const value = document.createElement("b");
            value.textContent = c.labels[k] ?? "";
            const name = document.createElement("span");
            name.textContent = c.name;
            row.append(value, name);
            return row;
          }),
        );
        board.style.setProperty("--hover-x", (k / n).toFixed(4));
        tip.classList.toggle("is-left", k / n > 0.6);
      }
      board.style.setProperty("--hover-y", clamp(fy, 0.1, 0.8).toFixed(4));
    };

    const onPointer = (e: PointerEvent) => {
      if (!live || e.pointerType !== "mouse" || !fine.matches) return;
      const s = stage.getBoundingClientRect();
      const x = e.clientX - s.left;
      const y = e.clientY - s.top;
      const inside = x >= 0 && y >= 0 && x <= s.width && y <= s.height;
      stage.classList.toggle("is-lamp", inside);
      dust.pointer = inside ? { x, y } : null;
      if (inside) {
        stage.style.setProperty("--lx", `${x.toFixed(1)}px`);
        stage.style.setProperty("--ly", `${y.toFixed(1)}px`);
      }
      aim.x = inside ? clamp((x / s.width) * 2 - 1, -1, 1) : 0;
      aim.y = inside ? clamp((y / s.height) * 2 - 1, -1, 1) : 0;
      kick();
      readout(inside ? (x - box.x) / box.w : -1, inside ? (y - box.y) / box.h : -1);
    };
    const onLeave = () => {
      aim.x = aim.y = 0;
      dust.pointer = null;
      stage.classList.remove("is-lamp");
      board.classList.remove("is-hovering");
      hoverK = -1;
      kick();
    };

    // the rail jumps to the moment a result's line has just finished
    const go = (i: number) => {
      if (!live) return;
      const travel = track.offsetHeight - stage.offsetHeight;
      const p = INTRO + (i + DRAW + 0.04) * len;
      window.scrollTo({ top: window.scrollY + track.getBoundingClientRect().top + p * travel, behavior: "smooth" });
    };
    const clicks = stops.map((s, i) => {
      const fn = () => go(i);
      s.addEventListener("click", fn);
      return () => s.removeEventListener("click", fn);
    });

    const runDust = () => {
      if (live && visible && !document.hidden) dust.start();
      else dust.stop();
    };

    const watch = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        const was = settled;
        settled = entry.intersectionRatio >= SETTLED;
        // the figure rolls when the stage has come into view, not while it is still below the fold
        if (live && settled && !was && active >= 0) {
          if (loading()) rollWaits = true;
          else roll(blocks[active]);
        }
        runDust();
      },
      { threshold: [0, SETTLED] },
    );
    watch.observe(stage);

    // the intro plays as it comes into view; without the stage, so does each block and its small chart
    const show = (el: HTMLElement) => {
      el.classList.add("is-in");
      if (el.classList.contains("w-asc__block") && !live) roll(el);
    };
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          if (loading()) waiting.push(el);
          else show(el);
          reveal.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    if (intro) reveal.observe(intro);
    blocks.forEach((b) => reveal.observe(b));
    minis.forEach((m) => reveal.observe(m));
    const lifted = site
      ? new MutationObserver(() => {
          if (loading()) return;
          waiting.splice(0).forEach(show);
          if (rollWaits && live && active >= 0) roll(blocks[active]);
          rollWaits = false;
        })
      : null;
    if (site) lifted?.observe(site, { attributes: true, attributeFilter: ["data-intro"] });

    const sync = () => {
      const want = !reduce.matches && window.innerWidth >= 1000 && window.innerHeight >= 600;
      if (want !== live) {
        live = want;
        root.classList.toggle("is-live", live);
        if (live) active = -1;
        else {
          window.cancelAnimationFrame(frame);
          frame = 0;
          blocks.forEach((b) => {
            b.inert = false;
            b.classList.add("is-rolled");
          });
          lines.forEach((l) => {
            l.style.removeProperty("--hx");
            l.classList.remove("is-full", "is-on");
          });
          root.classList.remove("is-finale");
          stage.classList.remove("is-lamp");
          dust.head = dust.pointer = null;
        }
      }
      if (live) {
        measure();
        update();
      }
      runDust();
    };

    sync();
    document.fonts?.ready.then(() => live && measure());
    reduce.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", runDust);
    return () => {
      live = false;
      dust.stop();
      watch.disconnect();
      reveal.disconnect();
      lifted?.disconnect();
      clicks.forEach((off) => off());
      timers.forEach((t) => window.clearTimeout(t));
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(drift);
      reduce.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", runDust);
      root.classList.remove("is-armed", "is-live", "is-finale");
      blocks.forEach((b) => (b.inert = false));
    };
  }, []);

  return null;
}
