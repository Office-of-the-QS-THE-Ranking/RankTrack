"use client";

import { useEffect } from "react";

/*
 * Hover and press motion for every button on the site and in the portals, mounted once in the
 * root layout. Nothing needs to opt in: events are delegated from the window.
 * - Hover (mouse): a 1px spring lift, a soft shadow on solid buttons, the icon swells slightly and
 *   a light follows the pointer inside the button.
 * - Press (any pointer, and keyboard clicks): the button springs in by about the same number of
 *   pixels whatever its size, and a bloom opens from the point of contact.
 * Uses the Web Animations API, on the individual `translate` and `scale` properties, so it sits on
 * top of each button's own `transition` and `transform` instead of replacing them. The overlay
 * (<button-fx>, styled in src/styles/button-fx.css) exists only while a button is being used.
 * Off for reduced motion. Give an element data-fx="off" to leave it alone.
 */

const HOST = [
  "button",
  '[role="button"]',
  'input:is([type="button"], [type="submit"], [type="reset"])',
  ".btn",
  ".w-btn",
  "a[href]",
].join(",");
// Measured by Motion or by a popover anchor, or part of a list: they get the light, never movement.
const STILL = '[role="tab"], [role="option"], [role^="menuitem"], .pick-trigger';
// Lists, tables and toggles would jitter if each row rose under the pointer.
const FLAT = 'nav, table, .side, .pick, .pick-num, [role="listbox"], [role="menu"], [role="switch"], [role="radio"], [role="checkbox"]';

const MAX_W = 720; // past this it's a scrim or a surface, not a button
const MAX_H = 320;
const LIFT_W = 420;
const LIFT_H = 72;
const LINK_H = 64;
const PRESS_PX = 4;
const PRESS_MIN = 0.95;

/** A damped spring, sampled for CSS linear(). */
function spring(omega: number, zeta: number, ms: number) {
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  const steps = 28;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * (ms / 1000);
    const y = 1 - Math.exp(-zeta * omega * t) * (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t));
    return i === steps ? 1 : Number(y.toFixed(3));
  });
  return `linear(${points.join(",")})`;
}

const SETTLE = { ms: 340, spring: spring(24, 0.6, 340), fallback: "cubic-bezier(0.22, 1, 0.36, 1)" };
const RELEASE = { ms: 520, spring: spring(21, 0.48, 520), fallback: "cubic-bezier(0.34, 1.56, 0.64, 1)" };
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Prop = "translate" | "scale" | "opacity";
type Plan = { overlay: boolean; lift: boolean; press: boolean; shade: boolean };
type Fx = {
  plan: Plan;
  anims: Map<Prop, Animation>;
  iconAnim?: Animation;
  icon?: SVGElement | null;
  layer?: HTMLElement;
  shade?: HTMLElement;
  clip?: HTMLElement;
  glow?: HTMLElement;
  glowAnim?: Animation;
  shadeAnim?: Animation;
  rest: string;
  radius: number;
  blooms: number;
  hovered: boolean;
  pressed: boolean;
};

/** [r, g, b, a] on a 0-255 scale; null for colour forms this doesn't read. */
function rgba(value: string): [number, number, number, number] | null {
  const n = value.match(/-?[\d.]+/g)?.map(Number);
  if (!n || n.length < 3) return null;
  const a = n[3] ?? 1;
  if (value.startsWith("rgb")) return [n[0], n[1], n[2], a];
  if (value.startsWith("color(srgb")) return [n[0] * 255, n[1] * 255, n[2] * 255, a];
  return null;
}

function hasShape(c: CSSStyleDeclaration) {
  const bg = rgba(c.backgroundColor);
  if (!bg || bg[3] > 0.01 || c.backgroundImage !== "none") return true;
  if (parseFloat(c.borderTopLeftRadius) > 0) return true;
  return parseFloat(c.borderTopWidth) > 0 && (rgba(c.borderTopColor)?.[3] ?? 1) > 0.01;
}

/** The light takes the text colour, except on a saturated fill, where white reads cleaner than a dark smudge. */
function tintOf(c: CSSStyleDeclaration) {
  const bg = rgba(c.backgroundColor);
  if (bg && bg[3] > 0.5 && Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) > 70) return "#fff";
  return c.color;
}

function strengthOf(tint: string) {
  const t = tint === "#fff" ? [255, 255, 255] : rgba(tint);
  const lum = t ? (0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2]) / 255 : 0;
  return lum > 0.6 ? "20%" : "7%";
}

/*
 * This layer runs as soon as the root layout hydrates, but a streamed page segment can still be
 * server HTML waiting for React. Stamping data-fx-host or appending <button-fx> there makes React
 * report a hydration mismatch, so a button is left alone until React has claimed it (React tags
 * every node it owns with __reactFiber$ / __reactProps$ keys).
 */
function hydrated(el: HTMLElement) {
  for (const key in el) if (key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")) return true;
  return false;
}

function part(parent: HTMLElement, name: string) {
  const el = document.createElement("i");
  el.dataset.part = name;
  parent.append(el);
  return el;
}

export function ButtonFx() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hasLinear = typeof CSS !== "undefined" && CSS.supports("transition-timing-function", "linear(0, 1)");
    const curve = (m: typeof SETTLE) => (hasLinear ? m.spring : m.fallback);
    const states = new WeakMap<HTMLElement, Fx>();

    let hovered: HTMLElement | null = null;
    let pressed: HTMLElement | null = null;
    let frame = 0;
    let px = 0;
    let py = 0;

    /* ---------- Which elements, and what each gets ---------- */
    const candidate = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const el = target.closest<HTMLElement>(HOST);
      return el instanceof HTMLElement ? el : null;
    };

    const accept = (el: HTMLElement | null) => {
      if (!el || !hydrated(el) || el.closest('[data-fx="off"]') || el.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]')) return null;
      const c = getComputedStyle(el);
      if (c.display === "contents") return null;
      const r = el.getBoundingClientRect();
      if (r.width > MAX_W || r.height > MAX_H) return null;
      // A link only counts when it's drawn as a button; running text and whole cards don't.
      if (el.matches("a[href]:not(.btn, .w-btn)") && (c.display === "inline" || r.height > LINK_H || r.width > LIFT_W || !hasShape(c))) return null;
      return el;
    };

    const stateOf = (el: HTMLElement) => {
      let fx = states.get(el);
      if (!fx) {
        fx = {
          plan: { overlay: false, lift: false, press: false, shade: false },
          anims: new Map(),
          rest: "none",
          radius: 0,
          blooms: 0,
          hovered: false,
          pressed: false,
        };
        states.set(el, fx);
      }
      return fx;
    };

    // Buttons placed by `translate` or `scale` (a lightbox arrow, the hero's magnetic button) keep it.
    const plan = (el: HTMLElement, fx: Fx) => {
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const shaped = hasShape(c);
      const bg = rgba(c.backgroundColor);
      const still = el.matches(STILL);
      const staticWithPlacedChild = c.position === "static" && [...el.children].some((k) => getComputedStyle(k).position === "absolute");
      fx.plan = {
        overlay: shaped && el.tagName !== "INPUT" && r.width >= 18 && r.height >= 18 && !staticWithPlacedChild,
        lift:
          shaped &&
          !still &&
          !el.closest(FLAT) &&
          r.width <= LIFT_W &&
          r.height <= LIFT_H &&
          (fx.anims.has("translate") ? fx.plan.lift : c.translate === "none"),
        press: !still && (fx.anims.has("scale") ? fx.plan.press : c.scale === "none"),
        shade: Boolean(bg && bg[3] > 0.5) || c.backgroundImage !== "none",
      };
      return fx.plan;
    };

    /* ---------- Animating without jumps ---------- */
    // Starts from wherever the value is now, so a quick in-and-out never snaps.
    const tween = (el: HTMLElement, fx: Fx, prop: Prop, to: string, ms: number, easing: string, atRest = false) => {
      const from = getComputedStyle(el).getPropertyValue(prop);
      fx.anims.get(prop)?.cancel();
      // Gone from the page while in use (a modal's close button): there's nothing left to settle.
      if (!el.isConnected) {
        fx.anims.delete(prop);
        return;
      }
      const a = el.animate({ [prop]: [from, to] } as PropertyIndexedKeyframes, { duration: ms, easing, fill: "forwards" });
      fx.anims.set(prop, a);
      if (atRest) {
        a.onfinish = () => {
          a.cancel();
          if (fx.anims.get(prop) === a) fx.anims.delete(prop);
        };
      }
    };

    const fade = (el: HTMLElement | undefined, on: boolean, ms: number, done?: () => void) => {
      if (!el?.isConnected) {
        done?.();
        return undefined;
      }
      const from = getComputedStyle(el).opacity;
      const a = el.animate({ opacity: [from, on ? "1" : "0"] }, { duration: ms, easing: "ease-out", fill: "forwards" });
      if (done) a.onfinish = done;
      return a;
    };

    /* ---------- Overlay ---------- */
    const mount = (el: HTMLElement, fx: Fx) => {
      if (fx.layer?.isConnected && fx.layer.parentElement === el) return true;
      if (!fx.plan.overlay) return false;
      const c = getComputedStyle(el);
      el.dataset.fxHost = c.position === "static" ? "static" : "";
      const layer = document.createElement("button-fx");
      layer.setAttribute("aria-hidden", "true");
      const tint = tintOf(c);
      layer.style.setProperty("--fx-tint", tint);
      layer.style.setProperty("--fx-glow", strengthOf(tint));
      layer.style.setProperty("--fx-edge", c.borderTopWidth);
      if (c.backgroundColor) layer.style.setProperty("--fx-bg", c.backgroundColor);
      fx.shade = part(layer, "shade");
      fx.clip = part(layer, "clip");
      fx.glow = part(fx.clip, "glow");
      fx.layer = layer;
      const r = el.getBoundingClientRect();
      fx.radius = Math.max(44, Math.min(150, Math.max(r.width, r.height) * 0.72));
      fx.glow.style.width = fx.glow.style.height = `${fx.radius * 2}px`;
      el.append(layer);
      return true;
    };

    const unmount = (el: HTMLElement, fx: Fx) => {
      if (fx.hovered || fx.pressed || fx.blooms > 0) return;
      fx.layer?.remove();
      fx.layer = fx.shade = fx.clip = fx.glow = undefined;
      fx.glowAnim = fx.shadeAnim = undefined;
      delete el.dataset.fxHost;
    };

    const aim = (el: HTMLElement, fx: Fx) => {
      if (!fx.glow) return;
      const r = el.getBoundingClientRect();
      fx.glow.style.translate = `${Math.round(px - r.left - fx.radius)}px ${Math.round(py - r.top - fx.radius)}px`;
    };

    /* ---------- Hover ---------- */
    const enter = (el: HTMLElement) => {
      const fx = stateOf(el);
      const p = plan(el, fx);
      fx.hovered = true;
      fx.rest = getComputedStyle(el).transform;
      if (p.lift) tween(el, fx, "translate", "0 -1px", SETTLE.ms, curve(SETTLE));
      if (p.lift) {
        fx.icon = el.querySelector<SVGElement>(":scope > svg");
        if (fx.icon) {
          const from = getComputedStyle(fx.icon).scale;
          fx.iconAnim?.cancel();
          fx.iconAnim = fx.icon.animate({ scale: [from, "1.08"] }, { duration: SETTLE.ms, easing: curve(SETTLE), fill: "forwards" });
        }
      }
      if (!mount(el, fx)) return;
      aim(el, fx);
      fx.glowAnim?.cancel();
      fx.glowAnim = fade(fx.glow, true, 220);
      if (p.lift && p.shade) {
        fx.shadeAnim?.cancel();
        fx.shadeAnim = fade(fx.shade, true, 260);
      }
    };

    const leave = (el: HTMLElement) => {
      const fx = stateOf(el);
      fx.hovered = false;
      if (fx.anims.has("translate")) tween(el, fx, "translate", "0 0", SETTLE.ms, curve(SETTLE), true);
      if (fx.icon?.isConnected && fx.iconAnim) {
        const icon = fx.icon;
        const from = getComputedStyle(icon).scale;
        fx.iconAnim.cancel();
        const a = icon.animate({ scale: [from, "1"] }, { duration: SETTLE.ms, easing: curve(SETTLE), fill: "forwards" });
        fx.iconAnim = a;
        a.onfinish = () => {
          a.cancel();
          if (fx.iconAnim === a) fx.iconAnim = undefined;
        };
      }
      if (!fx.layer) return;
      fx.shadeAnim?.cancel();
      fx.shadeAnim = fade(fx.shade, false, 200);
      fx.glowAnim?.cancel();
      fx.glowAnim = fade(fx.glow, false, 240, () => unmount(el, fx));
    };

    /* ---------- Press ---------- */
    const bloom = (el: HTMLElement, fx: Fx, x: number, y: number) => {
      if (!mount(el, fx) || !fx.clip) return;
      const r = el.getBoundingClientRect();
      const lx = x - r.left;
      const ly = y - r.top;
      const size = 2 * Math.hypot(Math.max(lx, r.width - lx), Math.max(ly, r.height - ly));
      const b = part(fx.clip, "bloom");
      b.style.width = b.style.height = `${size}px`;
      b.style.left = `${lx - size / 2}px`;
      b.style.top = `${ly - size / 2}px`;
      fx.blooms += 1;
      const a = b.animate(
        { scale: ["0.08", "1"], opacity: ["1", "0"] },
        { duration: 620, easing: EASE_OUT, fill: "forwards" },
      );
      const done = () => {
        b.remove();
        fx.blooms -= 1;
        unmount(el, fx);
      };
      a.onfinish = done;
      a.oncancel = done;
    };

    const press = (el: HTMLElement, x: number, y: number) => {
      const fx = stateOf(el);
      if (!fx.hovered) plan(el, fx);
      fx.pressed = true;
      bloom(el, fx, x, y);
      if (!fx.plan.press) return;
      // Pages' own :active transforms stand down, so a button is only ever squeezed once. The value
      // comes from before the press where there is one: :active may already apply by now.
      el.style.setProperty("--fx-hold", fx.hovered ? fx.rest : getComputedStyle(el).transform);
      el.dataset.fxPress = "";
      const w = el.getBoundingClientRect().width;
      tween(el, fx, "scale", String(Math.max(PRESS_MIN, 1 - PRESS_PX / Math.max(w, 1))), 110, EASE_OUT);
    };

    const release = (el: HTMLElement) => {
      const fx = stateOf(el);
      fx.pressed = false;
      delete el.dataset.fxPress;
      el.style.removeProperty("--fx-hold");
      if (fx.anims.has("scale")) tween(el, fx, "scale", "1", RELEASE.ms, curve(RELEASE), true);
      unmount(el, fx);
    };

    /* ---------- Events ---------- */
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || reduce.matches) return;
      const found = candidate(e.target);
      if (found === hovered) return;
      if (hovered) leave(hovered);
      hovered = accept(found);
      if (!hovered) return;
      px = e.clientX;
      py = e.clientY;
      enter(hovered);
    };

    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.relatedTarget || !hovered) return;
      leave(hovered);
      hovered = null;
    };

    const onMove = (e: PointerEvent) => {
      if (!hovered || e.pointerType !== "mouse") return;
      px = e.clientX;
      py = e.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (hovered) aim(hovered, stateOf(hovered));
      });
    };

    const onDown = (e: PointerEvent) => {
      if (reduce.matches || (e.pointerType === "mouse" && e.button !== 0)) return;
      const el = accept(candidate(e.target));
      if (!el) return;
      pressed = el;
      press(el, e.clientX, e.clientY);
    };

    const onUp = () => {
      if (!pressed) return;
      release(pressed);
      pressed = null;
    };

    // Enter and Space arrive as a click with no pointer behind it.
    const onClick = (e: MouseEvent) => {
      if (e.detail !== 0 || !e.isTrusted || reduce.matches) return;
      const el = accept(candidate(e.target));
      if (!el) return;
      const r = el.getBoundingClientRect();
      press(el, r.left + r.width / 2, r.top + r.height / 2);
      window.setTimeout(() => release(el), 120);
    };

    // A page's own hover transform (a close button's turn) settles after hover begins.
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "transform" || e.target !== hovered || !hovered || pressed === hovered) return;
      stateOf(hovered).rest = getComputedStyle(hovered).transform;
    };

    const onBlur = () => {
      onUp();
      if (hovered) leave(hovered);
      hovered = null;
    };

    window.addEventListener("pointerover", onOver, true);
    window.addEventListener("pointerout", onOut, true);
    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("dragstart", onUp, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("transitionend", onTransitionEnd, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerover", onOver, true);
      window.removeEventListener("pointerout", onOut, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("dragstart", onUp, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("transitionend", onTransitionEnd, true);
      window.removeEventListener("blur", onBlur);
      cancelAnimationFrame(frame);
      onBlur();
    };
  }, []);

  return null;
}
