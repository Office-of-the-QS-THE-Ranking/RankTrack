/*
 * Runs the orb: one animation frame that reads the pointer, steps the physics (physics.ts), and writes the orb, the
 * chat box and both canvases. It lives outside React because it touches styles sixty times a second; React only tells
 * it when the chat opens or what the chat is doing.
 */
import { createEdgeRenderer, type EdgeRenderer } from "./edge-gl";
import { createOrbRenderer, type OrbRenderer } from "./orb-gl";
import { advance, arrowMove, chooseWall, clampToBounds, createBody, MAX_THROW, ontoWall, opposite, place, pull, RIGHT, rotationMatrix, seatPull, snapsIn, strainMatrix, throwVelocity, type Body, type Bounds, type Hit, type Spring, type Vec, type Wall } from "./physics";

export type Status = "idle" | "thinking" | "streaming";
type Mood = "open" | "blink" | "wink" | "squeeze" | "happy" | "wide";

export type Parts = {
  orb: HTMLButtonElement;
  body: HTMLElement;
  shadow: HTMLElement;
  canvas: HTMLCanvasElement;
  face: HTMLElement;
  /** The full-screen chat, which opens out of the orb. */
  panel: HTMLElement;
  edge: HTMLCanvasElement;
  onToggle: () => void;
};

const POSITION_KEY = "hub-assistant-position";
/** The orb's clearance from the screen's edges, and how far above the bottom corner it first appears. */
const MARGIN = 10;
const HOME_BOTTOM = 14;
/** A press that moves less than this is a click. */
const DRAG_SLOP = 5;
/** One press of an arrow key along its wall: about sixty pixels, once the wall's friction has taken it. */
const NUDGE = 950;
/** How fast the colours flow round the sphere, in turns of the spectrum per second, at rest and while thinking. */
const FLOW = 0.045;
const FLOW_THINKING = 0.16;

/** The band crosses the sphere once every this many seconds; quicker while it thinks, so the work shows. */
const BAND_EVERY = 20;
const BAND_EVERY_THINKING = 1.55;
/** How long one crossing takes, in seconds. */
const CROSS_REST = 2.7;
const CROSS_OPEN = 2;
const CROSS_HELD = 1.4;
const CROSS_THINKING = 0.96;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const spring = (x = 0): Spring => ({ x, v: 0 });

/** The spectrum of the dashboard's glowing rim, in case the rule that holds it can't be read. */
const FALLBACK = ["#ffb800", "#ff7a00", "#ff2d55", "#e83cf0", "#8b5cf6", "#3d5afe", "#00b2ff", "#3d5afe", "#8b5cf6", "#e83cf0", "#ff2d55", "#ff7a00", "#ffb800"];

/** The orb's plates at rest in the light theme: near black, so it stands out on a white page. */
const BASE_LIGHT = [0.007, 0.009, 0.014] as const;

/** In the dark theme the orb is the same grey as the page's content tiles. */
function readBase(el: Element): readonly [number, number, number] {
  if (document.documentElement.dataset.theme !== "dark") return BASE_LIGHT;
  const hex = getComputedStyle(el).getPropertyValue("--surface").trim();
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return BASE_LIGHT;
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

function readSpectrum(el: Element) {
  const found = getComputedStyle(el).getPropertyValue("--glow-spectrum").match(/#[0-9a-f]{6}/gi);
  const list = found?.length === 13 ? found : FALLBACK;
  const out = new Float32Array(39);
  list.forEach((hex, i) => {
    out[i * 3] = parseInt(hex.slice(1, 3), 16) / 255;
    out[i * 3 + 1] = parseInt(hex.slice(3, 5), 16) / 255;
    out[i * 3 + 2] = parseInt(hex.slice(5, 7), 16) / 255;
  });
  return out;
}

export class OrbEngine {
  private body: Body = createBody(0, 0);
  private hits: Hit[] = [];
  private bounds: Bounds = { left: 0, top: 0, right: 0, bottom: 0 };
  private vw = 0;
  private vh = 0;
  private keyboard = 0;
  private radius = 32.5;

  private raf = 0;
  private last = 0;
  private lastDraw = 0;
  private time = 0;

  private press: { id: number; dx: number; dy: number; x: number; y: number; dragging: boolean } | null = null;
  private grab: Vec | null = null;
  private samples: { x: number; y: number; t: number }[] = [];
  private swallowClick = false;
  private hover = false;
  private pointer: Vec | null = null;
  private pointerAt = 0;

  private open = false;
  private status: Status = "idle";
  /** The side of the screen it lives on. */
  private wall: Wall = RIGHT;
  private home: Vec | null = null;
  /** The socket in the top bar (Shell's [data-orb-dock]), whether the orb belongs in it, and whether it is sitting in it. */
  private seatEl: HTMLElement | null = null;
  private seat: Vec | null = null;
  private docked = false;
  private snug = false;
  private returnTo: Vec | null = null;
  /** False from when it is moved until its new place has been kept. */
  private saved = true;

  private arrive = spring();
  private gazeX = spring();
  private gazeY = spring();
  private glance: Vec = { x: 0, y: 0 };
  private nextGlance = 0;
  private near = spring();
  private active = spring();
  private think = spring();
  /** How far the band is across the sphere, 0 to 1 (1: off it, waiting), and the seconds since it last set out. */
  private bandU = 1;
  private bandClock = BAND_EVERY - 3;
  private flow = 0;
  private ripples = new Float32Array([0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1]);
  private rippleGains = new Float32Array(4);
  private ripple = 0;
  private rotation = new Float32Array(9);
  private pointerDir: [number, number, number] = [0, 0, 1];

  private reveal = spring();

  private edgeReveal = spring();
  private energy = spring();
  private flare = 0;
  private edgeShown = false;

  private mood: Mood = "open";
  private moodUntil = 0;
  private nextBlink = 0;

  private orbGl: OrbRenderer | null = null;
  private edgeGl: EdgeRenderer | null = null;
  private motion: MediaQueryList;
  private resizeWatch: ResizeObserver;
  private themeWatch: MutationObserver;

  constructor(private parts: Parts) {
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.orbGl = createOrbRenderer(parts.canvas);
    if (!this.orbGl) parts.orb.classList.add("assist-orb--flat");
    this.edgeGl = createEdgeRenderer(parts.edge);
    if (!this.edgeGl) parts.edge.classList.add("assist-edge--flat");
    this.applyTheme();

    this.resizeWatch = new ResizeObserver(this.measure);
    this.resizeWatch.observe(document.documentElement);
    this.themeWatch = new MutationObserver(this.applyTheme);
    this.themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", this.measure);
    window.visualViewport?.addEventListener("resize", this.measure);
    window.addEventListener("pointermove", this.onWindowMove, { passive: true });

    const { orb } = parts;
    orb.addEventListener("mousedown", this.onMouseDown);
    orb.addEventListener("pointerdown", this.onDown);
    orb.addEventListener("pointermove", this.onMove);
    orb.addEventListener("pointerup", this.onUp);
    orb.addEventListener("pointercancel", this.onCancel);
    orb.addEventListener("lostpointercapture", this.onCancel);
    orb.addEventListener("pointerenter", this.onEnter);
    orb.addEventListener("pointerleave", this.onLeave);
    orb.addEventListener("click", this.onClick);
    orb.addEventListener("keydown", this.onKey);
    document.addEventListener("click", this.onSeatClick);

    this.measure();
    this.restore();
    this.nextBlink = performance.now() + 2400;
    orb.style.visibility = "visible";
    this.arrive.x = this.still ? 1 : 0;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeWatch.disconnect();
    this.themeWatch.disconnect();
    window.removeEventListener("resize", this.measure);
    window.visualViewport?.removeEventListener("resize", this.measure);
    window.removeEventListener("pointermove", this.onWindowMove);
    const { orb } = this.parts;
    orb.removeEventListener("mousedown", this.onMouseDown);
    orb.removeEventListener("pointerdown", this.onDown);
    orb.removeEventListener("pointermove", this.onMove);
    orb.removeEventListener("pointerup", this.onUp);
    orb.removeEventListener("pointercancel", this.onCancel);
    orb.removeEventListener("lostpointercapture", this.onCancel);
    orb.removeEventListener("pointerenter", this.onEnter);
    orb.removeEventListener("pointerleave", this.onLeave);
    orb.removeEventListener("click", this.onClick);
    orb.removeEventListener("keydown", this.onKey);
    document.removeEventListener("click", this.onSeatClick);
    if (this.seatEl) delete this.seatEl.dataset.filled;
    this.orbGl?.dispose();
    this.edgeGl?.dispose();
  }

  /** The chat opened or closed. */
  setOpen(open: boolean) {
    if (open === this.open) return;
    this.open = open;
    const now = performance.now();
    if (open) {
      this.parts.panel.style.visibility = "visible";
      this.flare = this.still ? 0 : 1;
      this.edgeReveal.v = 1.1;
      this.addRipple(0, 0, 1, 0.8);
      this.setMood("open", 0, now);
      // The orb waits in its socket while the chat is open, carrying the way out; it goes back afterwards.
      if (this.seat && !this.docked) {
        this.returnTo = { x: this.body.x, y: this.body.y };
        this.home = this.seat;
      }
    } else {
      // The eyes come back with a wink.
      this.setMood("wink", 620, now);
      this.home = this.returnTo;
      this.returnTo = null;
    }
  }

  setStatus(status: Status) {
    this.status = status;
  }

  /** An answer finished. */
  smile() {
    this.setMood("happy", 950, performance.now());
  }

  private get still() {
    return this.motion.matches;
  }

  private applyTheme = () => {
    const colors = readSpectrum(this.parts.edge);
    // The plain CSS ball, where there is no WebGL, paints with the same colours.
    this.parts.orb.style.setProperty("--glow-spectrum", getComputedStyle(this.parts.edge).getPropertyValue("--glow-spectrum"));
    this.orbGl?.setSpectrum(colors);
    this.orbGl?.setBase(readBase(this.parts.edge));
    this.edgeGl?.setSpectrum(colors);
  };

  private measure = () => {
    const before = this.bounds;
    this.vw = document.documentElement.clientWidth;
    this.vh = window.innerHeight;
    const view = window.visualViewport;
    this.keyboard = view ? Math.max(0, window.innerHeight - view.height - view.offsetTop) : 0;
    this.radius = this.parts.orb.offsetWidth / 2;
    const reach = this.radius + MARGIN;
    this.bounds = {
      left: reach,
      top: reach,
      right: Math.max(reach, this.vw - reach),
      bottom: Math.max(reach, this.vh - this.keyboard - reach),
    };
    // A resize keeps the orb at the same share of the screen.
    if (before.right > before.left && !this.grab) {
      const fx = (this.body.x - before.left) / (before.right - before.left);
      const fy = (this.body.y - before.top) / Math.max(1, before.bottom - before.top);
      this.body.x = this.bounds.left + clamp(fx, 0, 1) * (this.bounds.right - this.bounds.left);
      this.body.y = this.bounds.top + clamp(fy, 0, 1) * (this.bounds.bottom - this.bounds.top);
    }
    this.findSeat();
    // Sitting in its socket, it moves with it rather than keeping its share of the screen.
    if (this.snug && this.seat && !this.grab) {
      this.body.x = this.seat.x;
      this.body.y = this.seat.y;
    }
    if (this.open && this.returnTo && this.seat) this.home = this.seat;
    this.orbGl?.resize();
    this.edgeGl?.resize();
  };

  private findSeat() {
    const el = document.querySelector<HTMLElement>("[data-orb-dock]");
    const box = el?.getBoundingClientRect();
    this.seatEl = el;
    this.seat = box && box.width > 0 ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  }

  /** In its socket, it shows the socket is taken; out of it, the empty socket shows again. */
  private setSnug(snug: boolean) {
    this.snug = snug;
    if (!this.seatEl) return;
    if (snug) this.seatEl.dataset.filled = "";
    else delete this.seatEl.dataset.filled;
  }

  private restore() {
    const { left, right, top, bottom } = this.bounds;
    let fx = 1;
    let fy = 1;
    let saved = false;
    try {
      const raw = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") as { x?: unknown; y?: unknown; docked?: unknown } | null;
      // It starts in its socket, and goes back to it on the next visit if that is where it was left.
      if (this.seat && (!raw || raw.docked === true)) {
        this.docked = true;
        this.body.x = this.seat.x;
        this.body.y = this.seat.y;
        this.setSnug(true);
        return;
      }
      if (raw && typeof raw.x === "number" && typeof raw.y === "number") {
        fx = clamp(raw.x, 0, 1);
        fy = clamp(raw.y, 0, 1);
        saved = true;
      }
    } catch {}
    const at = saved ? { x: left + fx * (right - left), y: top + fy * (bottom - top) } : { x: right, y: bottom - HOME_BOTTOM };
    this.wall = chooseWall(at, { x: 0, y: 0 }, this.bounds);
    const on = ontoWall(at, this.wall, this.bounds);
    this.body.x = on.x;
    this.body.y = on.y;
  }

  private save() {
    const { left, right, top, bottom } = this.bounds;
    try {
      if (this.docked) return localStorage.setItem(POSITION_KEY, JSON.stringify({ docked: true }));
      localStorage.setItem(POSITION_KEY, JSON.stringify({ x: (this.body.x - left) / Math.max(1, right - left), y: (this.body.y - top) / Math.max(1, bottom - top) }));
    } catch {}
  }

  /* ---------- Pointer ---------- */

  /* Moving the orb mid-conversation doesn't take the cursor out of the message box. */
  private onMouseDown = (e: MouseEvent) => {
    if (this.open) e.preventDefault();
  };

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.swallowClick = false;
    this.parts.orb.setPointerCapture(e.pointerId);
    this.press = { id: e.pointerId, dx: this.body.x - e.clientX, dy: this.body.y - e.clientY, x: e.clientX, y: e.clientY, dragging: false };
    this.samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    const dx = (e.clientX - this.body.x) / this.radius;
    const dy = (e.clientY - this.body.y) / this.radius;
    this.addRipple(dx * 0.8, -dy * 0.8, 0.6, 0.5);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (this.samples.length > 12) this.samples.shift();
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= DRAG_SLOP) {
      p.dragging = true;
      this.setMood("wide", 0, performance.now());
    }
    if (!p.dragging) return;
    const to = { x: e.clientX + p.dx, y: e.clientY + p.dy };
    // Carried near its socket, it is drawn in, and seats itself while still held.
    this.grab = this.seat && !this.home ? seatPull(to, this.seat, this.radius) : to;
  };

  private onUp = (e: PointerEvent) => {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    if (!p.dragging) return;
    this.swallowClick = true;
    if (this.still) {
      // Nothing flies here, so it lands exactly where the pointer left it, even between two frames.
      const to = clampToBounds({ x: e.clientX + p.dx, y: e.clientY + p.dy }, this.bounds);
      this.body.x = to.x;
      this.body.y = to.y;
    }
    this.grab = null;
    if (!this.still) {
      const v = throwVelocity(this.samples, e.timeStamp);
      // A flick takes the speed of the hand. A hand that had stopped lets the body keep what it still has.
      if (v.x || v.y) {
        this.body.vx = v.x;
        this.body.vy = v.y;
      }
    }
    this.letGo();
  };

  /**
   * Dropped by its socket, it clicks in. Otherwise it goes to the side it was thrown at, or the nearest. While the chat
   * is open it goes back to the socket instead.
   */
  private letGo() {
    if (!this.home) {
      const b = this.body;
      this.docked = !!this.seat && snapsIn(b, { x: b.vx, y: b.vy }, this.seat, this.radius);
      if (!this.docked) this.wall = chooseWall(b, { x: b.vx, y: b.vy }, this.bounds);
    }
    this.saved = false;
    this.setMood("open", 0, performance.now());
  }

  private onCancel = (e: PointerEvent) => {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    this.grab = null;
    if (p.dragging) {
      this.swallowClick = true;
      this.letGo();
    }
  };

  private onEnter = (e: PointerEvent) => {
    if (e.pointerType === "mouse") this.hover = true;
  };

  private onLeave = () => {
    this.hover = false;
  };

  private onWindowMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    this.pointer = { x: e.clientX, y: e.clientY };
    this.pointerAt = performance.now();
  };

  /* A click, a tap, Enter or Space, unless the press turned into a drag. */
  private onClick = (e: MouseEvent) => {
    if (this.swallowClick) {
      this.swallowClick = false;
      e.preventDefault();
      return;
    }
    this.parts.onToggle();
  };

  /* The keyboard's way of moving it: along its side an arrow slides it; away from its side, it crosses to the far one. */
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Home") {
      e.preventDefault();
      this.goHome();
      return;
    }
    const push = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!push) return;
    e.preventDefault();
    // The socket is at the top of the right-hand side: from there an arrow takes it down that side or across.
    if (this.docked) this.wall = RIGHT;
    const move = arrowMove(this.wall, push[0], push[1]);
    if (move === "none") return;
    this.docked = false;
    this.saved = false;
    if (move === "cross") {
      this.wall = opposite(this.wall);
    } else if (this.still) {
      const to = clampToBounds({ x: this.body.x + push[0] * 60, y: this.body.y + push[1] * 60 }, this.bounds);
      this.body.x = to.x;
      this.body.y = to.y;
    } else {
      this.body.vx = clamp(this.body.vx + push[0] * NUDGE, -MAX_THROW, MAX_THROW);
      this.body.vy = clamp(this.body.vy + push[1] * NUDGE, -MAX_THROW, MAX_THROW);
    }
  };

  /** Back to its socket: Home on the keyboard, or a click on the empty socket. */
  private goHome() {
    if (!this.seat || this.docked) return;
    this.docked = true;
    this.saved = false;
  }

  private onSeatClick = (e: MouseEvent) => {
    if (e.target instanceof Element && e.target.closest("[data-orb-dock]")) this.goHome();
  };

  /* ---------- Character ---------- */

  private setMood(mood: Mood, ms: number, now: number) {
    this.mood = mood;
    this.moodUntil = ms ? now + ms : 0;
    this.parts.face.dataset.mood = mood;
  }

  private updateMood(now: number) {
    if (this.moodUntil && now >= this.moodUntil) this.setMood(this.grab ? "wide" : "open", 0, now);
    if (this.mood === "open" && !this.moodUntil && now >= this.nextBlink && !this.still) {
      this.setMood("blink", 95, now);
      // Now and then a double blink.
      this.nextBlink = now + (Math.random() < 0.2 ? 190 : 2200 + Math.random() * 4200);
    }
  }

  private addRipple(x: number, y: number, z: number, gain: number) {
    if (this.still) return;
    const len = Math.hypot(x, y, z) || 1;
    const i = this.ripple;
    this.ripples[i * 4] = x / len;
    this.ripples[i * 4 + 1] = y / len;
    this.ripples[i * 4 + 2] = z / len;
    this.ripples[i * 4 + 3] = 0;
    this.rippleGains[i] = gain;
    this.ripple = (i + 1) % 4;
  }

  private onImpact(hit: Hit, now: number) {
    if (hit.speed < 240) return;
    // On the sphere, toward the wall it struck and turned a little to the viewer, so the ripple is seen.
    this.addRipple(-hit.nx, hit.ny, 0.42, clamp(hit.speed / 1700, 0.28, 1));
    if (hit.speed >= 760) this.setMood("squeeze", 300, now);
    // The eyes carry on a moment after the body stops.
    const jolt = Math.min(hit.speed, 2600) * 0.09;
    this.gazeX.v -= hit.nx * jolt;
    this.gazeY.v -= hit.ny * jolt;
  }

  private updateGaze(dt: number, now: number) {
    const reach = this.radius * 0.17;
    const b = this.body;
    let tx = 0;
    let ty = 0;
    if (this.status === "thinking") {
      tx = Math.sin(this.time * 1.9) * reach * 0.55;
      ty = -reach * 0.72 + Math.cos(this.time * 2.7) * reach * 0.12;
    } else if (this.grab) {
      // Held and swung about, it looks back the way it came.
      tx = clamp(-b.vx * 0.0022, -reach, reach);
      ty = clamp(-b.vy * 0.0022, -reach, reach);
    } else if (this.pointer && now - this.pointerAt < 5000) {
      const dx = this.pointer.x - b.x;
      const dy = this.pointer.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(d / 240, 1) * reach;
      tx = (dx / d) * k;
      ty = (dy / d) * k;
    } else {
      if (now >= this.nextGlance) {
        const a = Math.random() * Math.PI * 2;
        const k = Math.random() < 0.45 ? 0 : reach * 0.6;
        this.glance = { x: Math.cos(a) * k, y: Math.sin(a) * k * 0.6 };
        this.nextGlance = now + 1500 + Math.random() * 3400;
      }
      tx = this.glance.x;
      ty = this.glance.y;
    }
    if (this.still) {
      this.gazeX.x = tx;
      this.gazeY.x = ty;
      return;
    }
    pull(this.gazeX, tx, 190, 0.52, dt);
    pull(this.gazeY, ty, 190, 0.52, dt);
  }

  /* ---------- Chat box ---------- */

  /** The full-screen chat opens out of the orb and folds back into it. */
  private writePanel(dt: number) {
    const { panel } = this.parts;
    if (this.still) this.reveal.x = this.open ? 1 : 0;
    else pull(this.reveal, this.open ? 1 : 0, this.open ? 230 : 460, this.open ? 0.8 : 1, dt);
    if (!this.open && this.reveal.x < 0.012) {
      if (panel.style.visibility !== "hidden") panel.style.visibility = "hidden";
      return;
    }
    const scale = 0.94 + 0.06 * this.reveal.x;
    panel.style.transformOrigin = `${this.body.x.toFixed(1)}px ${this.body.y.toFixed(1)}px`;
    panel.style.transform = `scale(${scale.toFixed(4)})`;
    panel.style.opacity = clamp(this.reveal.x * 1.6, 0, 1).toFixed(3);
  }

  /* ---------- The frame ---------- */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.time += dt;
    const b = this.body;
    const held = !!this.grab;
    // Seated, it stays the socket's size: no lifting toward the pointer.
    const lift = held ? 1 : this.press ? -0.55 : this.hover && !this.snug ? 0.32 : 0;
    // The socket sits nearer the screen's edge than the orb may roam, so the bounds stretch to reach it.
    const home = this.home ?? (this.docked && this.seat ? this.seat : null);
    const reach = home ?? (this.grab ? this.seat : null);
    const bounds = reach ? { left: Math.min(this.bounds.left, reach.x), top: Math.min(this.bounds.top, reach.y), right: Math.max(this.bounds.right, reach.x), bottom: Math.max(this.bounds.bottom, reach.y) } : this.bounds;
    const input = { radius: this.radius, bounds, grab: this.grab, home, snap: home === this.seat, wall: this.wall, lift };

    if (this.still) {
      place(b, input);
      this.arrive.x = 1;
    } else {
      this.hits.length = 0;
      advance(b, dt, input, this.hits);
      for (const hit of this.hits) this.onImpact(hit, now);
      // It arrives a moment after the page, so the page gets the first look.
      if (this.time > 0.3) pull(this.arrive, 1, 150, 0.56, dt);
    }

    // Home reached, and nothing keeps it there once the chat is closed.
    if (this.home && !this.open && b.rest > 0.15) this.home = null;
    if (!this.saved && !held && !this.home && b.rest > 0.25) {
      this.saved = true;
      this.save();
    }

    // Seated in the socket: a small click, felt as a ripple and a squeeze.
    const seat = this.seat;
    const gap = seat ? Math.hypot(b.x - seat.x, b.y - seat.y) : Infinity;
    if (!this.snug && this.docked && !held && !this.home && gap < 1.5) {
      this.setSnug(true);
      this.addRipple(0, 0, 1, 0.55);
      this.setMood("squeeze", 200, now);
    } else if (this.snug && (!this.docked || held || gap > 4)) {
      this.setSnug(false);
    }

    this.updateMood(now);
    this.updateGaze(dt, now);
    this.writeOrb();
    this.writePanel(dt);
    this.drawOrb(now, dt);
    this.drawEdge(dt);
  };

  private writeOrb() {
    const { orb, body: bodyEl, shadow, face } = this.parts;
    const b = this.body;
    const R = this.radius;
    orb.style.transform = `translate3d(${(b.x - R).toFixed(2)}px, ${(b.y - R).toFixed(2)}px, 0)`;

    const [ma, mb, mc, md] = strainMatrix(b.e1, b.e2);
    const s = Math.max(this.arrive.x, 0) * (1 + 0.075 * b.lift);
    // Hovering when it has been left alone: a slow breath, faded in so it never jumps.
    const calm = this.still || this.snug ? 0 : clamp((b.rest - 0.2) / 0.9, 0, 1);
    const bobX = Math.sin(this.time * 0.83 + 1) * 0.9 * calm;
    const bobY = Math.sin(this.time * 1.27) * 2.5 * calm;
    bodyEl.style.transform = `matrix(${(ma * s).toFixed(4)}, ${(mb * s).toFixed(4)}, ${(mc * s).toFixed(4)}, ${(md * s).toFixed(4)}, ${bobX.toFixed(2)}, ${bobY.toFixed(2)})`;

    const height = Math.max(b.lift, -0.2);
    shadow.style.transform = `translate3d(0, ${(R * (0.16 + 0.36 * height) + bobY * -0.4).toFixed(2)}px, 0) scale(${(s * (1 + 0.26 * height)).toFixed(3)})`;
    shadow.style.opacity = clamp(Math.max(this.arrive.x, 0) * (1 - 0.4 * height), 0, 1).toFixed(3);
    face.style.transform = `translate3d(${this.gazeX.x.toFixed(2)}px, ${this.gazeY.x.toFixed(2)}px, 0)`;
  }

  private bandHeight() {
    if (this.still) return -0.5;
    if (this.bandU >= 1) return -3;
    const u = this.bandU;
    const eased = u * u * (3 - 2 * u);
    return 1.46 - 2.92 * (u * 0.5 + eased * 0.5);
  }

  private drawOrb(now: number, dt: number) {
    const b = this.body;
    const moving = !!this.grab || b.rest < 0.6;
    const thinking = this.status === "thinking";
    const cross = thinking ? CROSS_THINKING : this.grab ? CROSS_HELD : this.open ? CROSS_OPEN : CROSS_REST;
    if (this.bandU < 1) this.bandU = Math.min(1, this.bandU + dt / cross);
    this.bandClock += dt;
    // A new crossing starts only once the last has left the sphere, so a change of pace never makes the band jump.
    if (this.bandClock >= (thinking ? BAND_EVERY_THINKING : BAND_EVERY) && this.bandU >= 1) {
      this.bandClock = 0;
      this.bandU = 0;
    }

    for (let i = 0; i < 4; i++) {
      const at = i * 4 + 3;
      if (this.ripples[at] >= 0) {
        this.ripples[at] += dt;
        if (this.ripples[at] > 1.7) this.ripples[at] = -1;
      }
    }

    let near = 0;
    if (this.pointer && now - this.pointerAt < 5000 && !this.grab) {
      const dx = (this.pointer.x - b.x) / this.radius;
      const dy = (this.pointer.y - b.y) / this.radius;
      const r = Math.hypot(dx, dy);
      near = clamp(1 - (r - 0.5) / 1.3, 0, 1);
      const z = Math.sqrt(Math.max(1 - r * r, 0.04));
      const len = Math.hypot(dx, dy, z);
      this.pointerDir = [dx / len, -dy / len, z / len];
    }
    pull(this.near, near, 120, 1, dt);
    pull(this.active, this.open ? 1 : 0, 32, 1, dt);
    pull(this.think, thinking ? 1 : this.status === "streaming" ? 0.42 : 0, 26, 1, dt);
    this.flow += dt * (FLOW + clamp(this.think.x, 0, 1) * FLOW_THINKING);

    // Left alone, the orb need not draw at the screen's full rate.
    if (!moving && !this.open && !this.hover && now - this.lastDraw < 32) return;
    this.lastDraw = now;
    rotationMatrix(b.q, this.rotation);
    const stillTime = this.still ? 12 : this.time;
    this.orbGl?.draw({
      time: stillTime,
      flow: this.still ? 0.3 : this.flow,
      rotation: this.rotation,
      band: this.bandHeight(),
      hits: this.ripples,
      hitGains: this.rippleGains,
      pointer: this.pointerDir,
      pointerNear: clamp(this.near.x, 0, 1),
      face: [this.gazeX.x / this.radius, -this.gazeY.x / this.radius],
      active: clamp(this.active.x, 0, 1),
      think: clamp(this.think.x, 0, 1),
    });
  }

  private drawEdge(dt: number) {
    const { edge } = this.parts;
    const target = this.open ? 1.32 : 0;
    if (this.still) {
      this.edgeReveal.x = target;
      this.energy.x = 0.3;
    } else {
      pull(this.edgeReveal, target, this.open ? 15 : 62, 1, dt);
      pull(this.energy, this.status === "thinking" ? 1 : this.status === "streaming" ? 0.72 : 0.26, 12, 1, dt);
    }
    this.flare *= Math.exp(-dt * 1.7);
    const reveal = this.edgeReveal.x;
    const shown = this.open || reveal > 0.006;
    if (shown !== this.edgeShown) {
      this.edgeShown = shown;
      if (shown) {
        edge.dataset.on = "";
        // Hidden, it measured nothing: it takes its size now that it has one.
        this.edgeGl?.resize();
      } else {
        delete edge.dataset.on;
        this.edgeGl?.clear();
      }
    }
    if (!shown || !this.edgeGl) return;
    const x = this.body.x - this.vw / 2;
    const y = this.body.y - this.vh / 2;
    this.edgeGl.draw({
      time: this.still ? 12 : this.time,
      level: clamp(reveal * 5, 0, 1),
      reveal,
      orbAngle: Math.atan2(-y / (this.vh / 2), x / (this.vw / 2)),
      energy: clamp(this.energy.x, 0, 1.4),
      flare: this.flare,
    });
  }
}
