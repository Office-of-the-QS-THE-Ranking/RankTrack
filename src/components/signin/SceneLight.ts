import { skyFacets, SKY_CLOUDS, SKY_STARS, TOWN_LIGHTS, type Cloud, type Tint } from "./sceneGeometry";
import type { Sky } from "./sky";

/**
 * The light of the sign-in scene (SceneMotion runs it), on three kinds of canvas, by night or by day (sky.ts):
 *   - the sky, under everything: facets that assemble after the bands land, a slow sheen crossing them,
 *     single facets that glint and the pointer lighting those under it like a lamp. By night they are dark
 *     like cut onyx, lit faintly by the moon and the campus below, under a few gold stars that twinkle, fewer
 *     near the moon. By day they are pale like cut crystal, bluer overhead and lit by the sun, with low-poly
 *     clouds drifting below the sun and now and then a few birds crossing;
 *   - the halftone fields either side of the gold hairline. They sit inside the rotated band group, so their
 *     dots lie along the bands. A slow wave of light runs down them, a few dots flash, and the pointer lights
 *     the dots under it like a torch;
 *   - the building's own lights, on a canvas laid over its render (so it shares the render's mask and
 *     parallax): by night the lamps flicker and flare, the clock face glows, and a glint now and then runs up
 *     the cross; by day the lamps are out and the sun catches the gilt cross and the dome in turn.
 * The still layers are drawn once per resize (and when the sky turns) and each frame stamps pre-drawn
 * sprites. It runs only while the tab is visible, and under reduced motion draws one still frame.
 */

type Spark = { x: number; y: number; born: number; life: number; size: number };
type Point = { x: number; y: number };

/** The band group's tilt (signin.css, .sx__bands: rotate(30.5deg), mirrored left for right). */
const TILT = (30.5 * Math.PI) / 180;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function sprite(size: number, stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** A four-ray star for the lamps and the cross: a long level ray, a shorter upright one, a hot core. */
function star() {
  const s = 160;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const ray = (w: number, h: number, a: number) => {
    const grad = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    grad.addColorStop(0, "rgba(255, 214, 140, 0)");
    grad.addColorStop(0.5, `rgba(255, 240, 210, ${a})`);
    grad.addColorStop(1, "rgba(255, 214, 140, 0)");
    g.fillStyle = grad;
    g.fillRect(-w / 2, -h / 2, w, h);
  };
  g.translate(s / 2, s / 2);
  ray(s, 2.2, 0.9);
  g.rotate(Math.PI / 2);
  ray(s * 0.62, 1.8, 0.7);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const core = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.16);
  core.addColorStop(0, "rgba(255, 250, 235, 1)");
  core.addColorStop(0.35, "rgba(255, 216, 150, 0.55)");
  core.addColorStop(1, "rgba(255, 190, 100, 0)");
  g.fillStyle = core;
  g.fillRect(0, 0, s, s);
  return c;
}

function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number, most = 2) {
  const dpr = Math.min(most, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

/**
 * The halftone's inks by time of day: bright gold on the night; by day a deeper gold that reads on the pale
 * sky, a wave of brighter gold, and flashes laid on rather than added (light added to a pale ground is lost).
 */
const INKS: Record<Sky, { near: string; far: string; floor: number; wave: [string, string]; torch: [string, string]; flash: GlobalCompositeOperation }> = {
  night: {
    near: "#f6c64a",
    far: "#d99a18",
    floor: 0.32,
    wave: ["rgba(255, 240, 200, 0)", "rgba(255, 244, 214, 0.9)"],
    torch: ["rgba(255, 248, 226, 0.95)", "rgba(255, 236, 190, 0)"],
    flash: "lighter",
  },
  day: {
    near: "#d69a10",
    far: "#b47f0a",
    floor: 0.44,
    wave: ["rgba(255, 214, 96, 0)", "rgba(255, 226, 128, 0.95)"],
    torch: ["rgba(255, 232, 150, 0.95)", "rgba(255, 214, 96, 0)"],
    flash: "source-over",
  },
};

/**
 * One halftone field. `toward` is the side the hairline is on: the dots grow toward it, gather in loose
 * clusters along the band and thin out at its ends.
 */
class Halftone {
  private readonly ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private strong: number[] = [];
  private sparks: Spark[] = [];
  private w = 0;
  private h = 0;
  /** The pointer in this field's own (unrotated) pixels, or null. */
  torch: Point | null = null;
  sky: Sky = "night";

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly toward: "start" | "end",
    private readonly dense: number,
    private readonly glow: Record<Sky, HTMLCanvasElement>,
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize() {
    this.w = this.canvas.offsetWidth;
    this.h = this.canvas.offsetHeight;
    if (!this.w || !this.h) return;
    const ink = INKS[this.sky];
    // the fields are tall and turned, so they are resampled anyway: one and a half device pixels is plenty
    const dpr = fit(this.canvas, this.ctx, this.w, this.h, 1.5);
    const base = document.createElement("canvas");
    base.width = this.canvas.width;
    base.height = this.canvas.height;
    const g = base.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gap = 6.6;
    const rowH = gap * 0.866;
    const p1 = Math.random() * 6.3;
    const p2 = Math.random() * 6.3;
    this.strong = [];
    for (let row = 0, y = gap / 2; y < this.h; row++, y += rowH) {
      const along = y / this.h;
      const ends = smooth(0, 0.16, along) * (1 - smooth(0.8, 1, along));
      for (let x = row % 2 ? gap : gap / 2; x < this.w; x += gap) {
        const u = x / this.w;
        const q = this.toward === "end" ? u : 1 - u; // 1 beside the hairline
        const cluster = 0.58 + 0.42 * Math.sin(y / 150 + p1) * Math.sin(y / 53 + x / 37 + p2);
        const r = 1.75 * q ** this.dense * ends * Math.max(0, cluster) * (0.82 + Math.random() * 0.36);
        if (r < 0.3) continue;
        g.globalAlpha = Math.min(1, ink.floor + (1 - ink.floor) * q);
        g.fillStyle = q > 0.72 ? ink.near : ink.far;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        if (r > 0.9) this.strong.push(x, y);
      }
    }
    this.base = base;
    this.sparks = [];
  }

  draw(t: number, live: boolean) {
    const { ctx, w, h } = this;
    if (!this.base || !w) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.restore();
    if (!live) return;
    const ink = INKS[this.sky];
    const glow = this.glow[this.sky];

    // a wave of light runs down the field, recolouring the dots it passes over
    ctx.globalCompositeOperation = "source-atop";
    const span = Math.min(h * 0.16, 260);
    const head = ((t / 7.5) % 1) * (h + span * 2) - span;
    const wave = ctx.createLinearGradient(0, head - span, 0, head + span);
    wave.addColorStop(0, ink.wave[0]);
    wave.addColorStop(0.5, ink.wave[1]);
    wave.addColorStop(1, ink.wave[0]);
    ctx.fillStyle = wave;
    ctx.fillRect(0, head - span, w, span * 2);
    if (this.torch) {
      const { x, y } = this.torch;
      const torch = ctx.createRadialGradient(x, y, 0, x, y, 150);
      torch.addColorStop(0, ink.torch[0]);
      torch.addColorStop(1, ink.torch[1]);
      ctx.fillStyle = torch;
      ctx.fillRect(x - 150, y - 150, 300, 300);
    }

    // a few dots flash, one after another; under the pointer the dots kindle
    ctx.globalCompositeOperation = ink.flash;
    if (this.torch) {
      const { x: tx, y: ty } = this.torch;
      const reach = 130;
      for (let i = 0; i < this.strong.length; i += 2) {
        const dx = this.strong[i] - tx;
        const dy = this.strong[i + 1] - ty;
        if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
        const k = 1 - Math.hypot(dx, dy) / reach;
        if (k <= 0) continue;
        ctx.globalAlpha = k * k * 0.65;
        const size = 4 + k * 8;
        ctx.drawImage(glow, this.strong[i] - size / 2, this.strong[i + 1] - size / 2, size, size);
      }
    }
    while (this.sparks.length < 9 && this.strong.length) {
      const i = Math.floor(Math.random() * (this.strong.length / 2)) * 2;
      this.sparks.push({ x: this.strong[i], y: this.strong[i + 1], born: t + Math.random() * 2.5, life: 0.9 + Math.random() * 1.2, size: 9 + Math.random() * 9 });
    }
    this.sparks = this.sparks.filter((s) => t < s.born + s.life);
    for (const s of this.sparks) {
      const k = (t - s.born) / s.life;
      if (k < 0) continue;
      const a = Math.sin(Math.PI * k) ** 2;
      ctx.globalAlpha = a;
      const size = s.size * (0.6 + 0.4 * a);
      ctx.drawImage(glow, s.x - size / 2, s.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /** Map a point on screen into this field's own pixels, undoing the band group's tilt and its mirroring. */
  locate(p: Point | null) {
    if (!p || !this.w) {
      this.torch = null;
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    const dx = r.left + r.width / 2 - p.x;
    const dy = p.y - (r.top + r.height / 2);
    const x = dx * Math.cos(TILT) - dy * Math.sin(TILT) + this.w / 2;
    const y = dx * Math.sin(TILT) + dy * Math.cos(TILT) + this.h / 2;
    this.torch = x > -160 && x < this.w + 160 && y > -160 && y < this.h + 160 ? { x, y } : null;
  }
}

/** The lamps, clock, cross and dome of the building's render, drawn in its own box (TOWN_LIGHTS). */
class TownLights {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  sky: Sky = "night";

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly halo: HTMLCanvasElement,
    private readonly star: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize() {
    this.w = this.canvas.offsetWidth;
    this.h = this.canvas.offsetHeight;
    if (this.w) fit(this.canvas, this.ctx, this.w, this.h);
  }

  draw(t: number, live: boolean) {
    const { ctx, w, h } = this;
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    const stamp = (img: HTMLCanvasElement, x: number, y: number, size: number, a: number, spin = 0) => {
      if (a < 0.01 || size < 1) return;
      ctx.globalAlpha = Math.min(1, a);
      if (spin) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(spin);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    };
    const [xx, xy] = TOWN_LIGHTS.cross;
    // the cross catches the light every few seconds: a quick flare that turns a little as it fades
    const k = live ? (t % 6.5) / 6.5 : 0.5;
    const flare = live && k < 0.16 ? Math.sin((Math.PI * k) / 0.16) : 0;
    if (this.sky === "day") {
      // the lamps are out; the sun catches the gilt cross and then, between its flares, the dome
      const [dx, dy] = TOWN_LIGHTS.dome;
      const j = live ? ((t + 3.4) % 9) / 9 : 0.5;
      const shine = live && j < 0.12 ? Math.sin((Math.PI * j) / 0.12) : 0;
      stamp(this.halo, xx * w, xy * h, h * 0.035, 0.12 + 0.4 * flare);
      stamp(this.star, xx * w, xy * h, h * (0.04 + 0.15 * flare), 0.15 + 0.85 * flare, flare * 0.35);
      stamp(this.halo, dx * w, dy * h, h * (0.03 + 0.03 * shine), 0.2 + 0.5 * shine);
      stamp(this.star, dx * w, dy * h, h * (0.03 + 0.13 * shine), 0.1 + 0.9 * shine, 0.3 + shine * 0.3);
    } else {
      // gas-lamp flicker: a few incommensurate sines, so no two lamps keep time
      const flicker = (i: number) => (live ? 0.8 + 0.12 * Math.sin(t * 7.3 + i * 1.9) + 0.08 * Math.sin(t * 13.1 + i * 4.7) : 0.9);
      TOWN_LIGHTS.lamps.forEach(([lx, ly], i) => {
        const f = flicker(i);
        const breathe = live ? 0.82 + 0.18 * Math.sin(t * 0.9 + i * 1.3) : 1;
        stamp(this.halo, lx * w, ly * h, h * 0.085 * f, 0.55 * f);
        stamp(this.star, lx * w, ly * h, h * 0.16 * breathe, 0.75 * f);
      });
      TOWN_LIGHTS.small.forEach(([lx, ly], i) => {
        const f = flicker(i + 7);
        stamp(this.halo, lx * w, ly * h, h * 0.045 * f, 0.45 * f);
      });
      const [cx, cy] = TOWN_LIGHTS.clock;
      stamp(this.halo, cx * w, cy * h, h * 0.075, live ? 0.42 + 0.16 * Math.sin(t * 0.7) : 0.5);
      stamp(this.halo, xx * w, xy * h, h * 0.05, 0.35 + 0.4 * flare);
      stamp(this.star, xx * w, xy * h, h * (0.06 + 0.16 * flare), 0.25 + 0.75 * flare, flare * 0.35);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

/** The stars' colours by tint: ivory and gold, to sit with the portal's gold. */
const TINTS: Record<Tint, string> = { blue: "244, 240, 230", white: "255, 250, 238", warm: "255, 228, 176", red: "255, 206, 140" };

/** A star: a white-hot core in a faint halo of its own colour. */
function starDot(tint: Tint) {
  const c = TINTS[tint];
  return sprite(32, [
    [0, "rgba(255, 255, 255, 1)"],
    [0.12, `rgba(${c}, 0.9)`],
    [0.3, `rgba(${c}, 0.22)`],
    [1, `rgba(${c}, 0)`],
  ]);
}

/** The day sky's colour down the screen: blue overhead, paler and warmer toward the horizon. */
const DAY_SKY: [number, number, number, number][] = [
  [0, 90, 145, 204],
  [0.3, 128, 176, 222],
  [0.58, 184, 211, 232],
  [0.8, 224, 230, 228],
  [1, 242, 236, 222],
];

function daySky(y: number): [number, number, number] {
  let i = 1;
  while (i < DAY_SKY.length - 1 && DAY_SKY[i][0] < y) i++;
  const [a, ar, ag, ab] = DAY_SKY[i - 1];
  const [b, br, bg, bb] = DAY_SKY[i];
  const k = Math.min(1, Math.max(0, (y - a) / (b - a)));
  return [ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k];
}

/** The sun's side, as a direction on screen: up and to the right. Clouds are lit from it. */
const SUNWARD = { x: 0.6, y: -0.8 };

/**
 * A cloud cut into facets: each puff a polygon fanned from a point a little toward the sun, in a few broad
 * planes, white where they face the sun, a pale cool blue where they turn away and toward the flat base, with
 * fine light along the cuts.
 */
function cloudSprite(c: Cloud, cw: number, dpr: number, seed: number) {
  const r = seededRandom(seed);
  const ch = cw * 0.6;
  // room either side for the end puffs, which reach past the cloud's own box
  const side = Math.ceil(cw * 0.16) + 2;
  const pad = Math.ceil(cw * 0.04) + 2;
  const out = document.createElement("canvas");
  out.width = Math.ceil((cw + side * 2) * dpr);
  out.height = Math.ceil((ch + pad) * dpr);
  const g = out.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const base = ch + pad * 0.4;
  g.save();
  g.beginPath();
  g.rect(0, 0, cw + side * 2, base);
  g.clip();
  g.lineJoin = "round";
  g.lineWidth = 0.7;
  // the crowns first, behind the row
  const puffs = [...c.puffs].sort((a, b) => a.y - b.y);
  for (const p of puffs) {
    const cx = side + p.x * cw;
    const cy = base + p.y * cw;
    const rad = p.r * cw;
    const pts: Point[] = [];
    for (let k = 0; k < p.sides; k++) {
      const a = p.turn + (k / p.sides) * Math.PI * 2;
      const rr = rad * (0.9 + 0.18 * r());
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    const hub = { x: cx + rad * 0.2, y: cy - rad * 0.24 };
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % pts.length];
      const mx = (a.x + b.x) / 2 - cx;
      const my = (a.y + b.y) / 2 - cy;
      const len = Math.hypot(mx, my) || 1;
      const facing = (mx * SUNWARD.x + my * SUNWARD.y) / len;
      const low = Math.min(1, Math.max(0, (cy + my - (base - ch)) / ch));
      // two broad tones, sunlit and turned away, eased into each other over a narrow band
      const sunlit = smooth(-0.35, 0.05, facing);
      const lit = Math.min(1, Math.max(0, 0.44 + 0.56 * sunlit - 0.26 * low * low + (r() - 0.5) * 0.04));
      const rr = 206 + (255 - 206) * lit;
      const gg = 219 + (255 - 219) * lit;
      const bb = 238 + (253 - 238) * lit;
      g.beginPath();
      g.moveTo(hub.x, hub.y);
      g.lineTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.closePath();
      g.fillStyle = `rgb(${Math.round(rr)}, ${Math.round(gg)}, ${Math.round(bb)})`;
      g.fill();
      g.strokeStyle = `rgba(255, 255, 255, ${(0.08 + 0.16 * lit).toFixed(2)})`;
      g.stroke();
    }
  }
  g.restore();
  // the underside in the shade of the cloud itself
  g.globalCompositeOperation = "source-atop";
  const under = g.createLinearGradient(0, base - ch * 0.55, 0, base);
  under.addColorStop(0, "rgba(176, 196, 226, 0)");
  under.addColorStop(1, "rgba(176, 196, 226, 0.42)");
  g.fillStyle = under;
  g.fillRect(0, 0, cw + side * 2, base);
  return { img: out, w: cw + side * 2, h: ch + pad, base };
}

type Lit = { x: number; y: number; size: number; a: number; tint: Tint; tw: number; ph: number; amp: number; born: number };
type Lamp = { x: number; y: number; z: number; reach: number };
type Pane = { path: Path2D; x: number; y: number; fill: string; edge: number; open: number };
type Glint = { pane: Pane; born: number; life: number };
type Drift = { img: HTMLCanvasElement; w: number; h: number; x: number; y: number; speed: number; a: number };
type Bird = { dx: number; dy: number; size: number; flap: number; ph: number };
type Flock = { born: number; life: number; y: number; rise: number; birds: Bird[] };

/** The sheen's tilt: it runs with the bands (sin and cos of 30.5°), measured from the right, as they lean. */
const SHEEN = { dx: 0.8616, dy: -0.5075 };
/** When the facets assemble (seconds after the canvases light up) and how long the sheen takes to cross. */
const ASSEMBLE = 1.5;
const SHEEN_EVERY = 10.5;
const SHEEN_TAKES = 3.8;
/** By day: how often a flock crosses (seconds between, at the least and at the most). */
const FLOCK_EVERY: [number, number] = [26, 44];

/**
 * The sky: the facets (skyFacets) lit once per resize and drawn to a still layer, by night by the moon and the
 * campus glow with the faintest stars on another layer, by day by the sun; and over them each frame the
 * entrance, the sheen, the glints, the pointer's lamp, and the twinkling stars or the drifting clouds and the
 * birds.
 */
class SkyLayer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dots: Record<Tint, HTMLCanvasElement>;
  private stone: HTMLCanvasElement | null = null;
  private dust: HTMLCanvasElement | null = null;
  private panes: Pane[] = [];
  private live: Lit[] = [];
  private glints: Glint[] = [];
  private nextGlint = 0;
  private clouds: Drift[] = [];
  private flocks: Flock[] = [];
  private nextFlock = 7;
  /** The sky's own clock, which runs at `rush` times real time, and the scene time it last read. */
  private drift = 0;
  private lastT = -1;
  private w = 0;
  private h = 0;
  /** The pointer in this canvas's pixels, or null. */
  pointer: Point | null = null;
  sky: Sky = "night";
  /** How fast time runs for the sky: 1 is real time; a time-lapse raises it for a moment (SceneLight.rush). */
  rush = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly lights: Record<Sky, HTMLElement | null>,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.dots = { blue: starDot("blue"), white: starDot("white"), warm: starDot("warm"), red: starDot("red") };
  }

  resize() {
    const w = this.canvas.offsetWidth;
    const h = this.canvas.offsetHeight;
    this.w = w;
    this.h = h;
    if (!w || !h) return;
    const dpr = fit(this.canvas, this.ctx, w, h);
    // the moon's or the sun's middle on this canvas, from layout boxes (its rise and tilt don't move them)
    const orb = this.lights[this.sky];
    const mr = orb ? orb.offsetWidth / 2 : 0;
    const mx = orb ? orb.offsetLeft + mr - this.canvas.offsetLeft : w * 0.86;
    const my = orb ? orb.offsetTop + mr - this.canvas.offsetTop : h * 0.17;
    const layer = () => {
      const c = document.createElement("canvas");
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      const g = c.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { c, g };
    };

    const stone = layer();
    const facets = skyFacets(w, h, Math.min(176, Math.max(104, w / 10.5)));
    if (this.sky === "day") {
      // by day: each facet takes the sky's colour where it stands, washed toward white in a wide bloom round
      // the sun, and a shade lighter or darker by how far it is tilted toward it, like cut crystal
      this.panes = facets.map((f) => {
        const [a, b, c] = f.p;
        const x = (a[0] + b[0] + c[0]) / 3;
        const y = (a[1] + b[1] + c[1]) / 3;
        let [rr, gg, bb] = daySky(y / h);
        const dx = mx - x;
        const dy = my - y;
        const bloom = Math.exp(-((Math.hypot(dx, dy) / (w * 0.21)) ** 2));
        rr += (255 - rr) * 0.86 * bloom;
        gg += (250 - gg) * 0.82 * bloom;
        bb += (236 - bb) * 0.72 * bloom;
        const facing = (f.n[0] * dx + f.n[1] * dy + f.n[2] * 320) / Math.hypot(dx, dy, 320);
        const lift = 0.12 * (facing - 0.85) + 0.02 * f.tone;
        const path = new Path2D();
        path.moveTo(a[0], a[1]);
        path.lineTo(b[0], b[1]);
        path.lineTo(c[0], c[1]);
        path.closePath();
        const tone = (v: number, k: number) => Math.round(Math.min(255, Math.max(0, v * (1 + lift * k))));
        const fill = `rgb(${tone(rr, 1)}, ${tone(gg, 1)}, ${tone(bb, 0.8)})`;
        const pane = { path, x, y, fill, edge: 0.09 + 0.26 * bloom + 0.03 * f.tone + 0.1 * Math.max(0, lift * 10), open: smooth(0.3, 0.5, x / w) };
        stone.g.fillStyle = fill;
        stone.g.fill(path);
        return pane;
      });
      stone.g.lineWidth = 0.8;
      stone.g.lineJoin = "round";
      for (const p of this.panes) {
        stone.g.strokeStyle = `rgba(255, 252, 240, ${Math.min(0.7, p.edge).toFixed(3)})`;
        stone.g.stroke(p.path);
      }
      this.stone = stone.c;
      // the clouds, cut once at this size; they drift each frame
      this.clouds = SKY_CLOUDS.map((c, i) => {
        const s = cloudSprite(c, c.w * Math.max(w, h * 1.2), dpr, 1611 + i * 7);
        return { img: s.img, w: s.w, h: s.h, x: c.x * w - s.w / 2, y: c.y * h - s.base, speed: w / (260 - 130 * c.near), a: 0.8 + 0.2 * c.near };
      });
      this.live = [];
      this.dust = null;
      this.glints = [];
      return;
    }

    // the two lights: the moon, high and far; the campus, a warm glow from below the horizon at the left
    const lamps: (Lamp & { rgb: [number, number, number] })[] = [
      { x: mx, y: my, z: 260, reach: w * 0.36, rgb: [24, 21, 15] },
      { x: w * 0.26, y: h * 1.06, z: 160, reach: w * 0.32, rgb: [34, 22, 9] },
    ];
    this.panes = facets.map((f) => {
      const [a, b, c] = f.p;
      const x = (a[0] + b[0] + c[0]) / 3;
      const y = (a[1] + b[1] + c[1]) / 3;
      let rr = 9 + 2.2 * f.tone;
      let gg = 7.5 + 1.8 * f.tone;
      let bb = 6 + 1.4 * f.tone;
      let light = 0;
      for (const l of lamps) {
        const dx = l.x - x;
        const dy = l.y - y;
        const d = Math.hypot(dx, dy, l.z);
        const facing = Math.max(0, (f.n[0] * dx + f.n[1] * dy + f.n[2] * l.z) / d);
        const k = facing / (1 + (Math.hypot(dx, dy) / l.reach) ** 2);
        rr += l.rgb[0] * k;
        gg += l.rgb[1] * k;
        bb += l.rgb[2] * k;
        light += k;
      }
      const path = new Path2D();
      path.moveTo(a[0], a[1]);
      path.lineTo(b[0], b[1]);
      path.lineTo(c[0], c[1]);
      path.closePath();
      const fill = `rgb(${Math.round(rr)}, ${Math.round(gg)}, ${Math.round(bb)})`;
      const pane = { path, x, y, fill, edge: 0.022 + 0.075 * Math.min(1, light) + 0.008 * f.tone, open: smooth(0.3, 0.5, x / w) };
      stone.g.fillStyle = fill;
      stone.g.fill(path);
      return pane;
    });
    // the edges after every face, so no face covers a neighbour's edge
    stone.g.lineWidth = 0.8;
    stone.g.lineJoin = "round";
    for (const p of this.panes) {
      stone.g.strokeStyle = `rgba(226, 186, 110, ${p.edge.toFixed(3)})`;
      stone.g.stroke(p.path);
    }
    this.stone = stone.c;
    this.clouds = [];
    this.flocks = [];

    const dust = layer();
    dust.g.globalCompositeOperation = "lighter";
    const r = seededRandom(7);
    this.live = [];
    for (const s of SKY_STARS) {
      const x = s.x * w;
      const y = s.y * h;
      const wash = mr ? smooth(mr * 2.4, mr * 9, Math.hypot(x - mx, y - my)) : 1;
      if (wash < 0.04) continue;
      const size = 1.8 + 5 * s.b;
      const a = (0.18 + 0.72 * Math.sqrt(s.b)) * wash;
      if (s.b < 0.08) {
        dust.g.globalAlpha = a;
        dust.g.drawImage(this.dots[s.tint], x - size / 2, y - size / 2, size, size);
      } else {
        this.live.push({ x, y, size, a, tint: s.tint, tw: 0.4 + r() * 1.4, ph: r() * 6.3, amp: 0.2 + r() * 0.3, born: 1.6 + r() * 2.2 });
      }
    }
    this.dust = dust.c;
    this.glints = [];
  }

  /** A facet lit over its still self: by night warm light on its face and gold along its edges; by day white. */
  private lift(p: Pane, face: number, edge: number) {
    const { ctx } = this;
    const day = this.sky === "day";
    if (face > 0.004) {
      ctx.globalAlpha = Math.min(1, face * (day ? 3 : 1));
      ctx.fillStyle = day ? "rgb(255, 255, 255)" : "rgb(255, 214, 146)";
      ctx.fill(p.path);
    }
    if (edge > 0.01) {
      ctx.globalAlpha = Math.min(1, edge);
      ctx.strokeStyle = day ? "rgb(255, 250, 232)" : "rgb(255, 222, 158)";
      ctx.stroke(p.path);
    }
  }

  draw(t: number, live: boolean) {
    const { ctx, w, h } = this;
    if (!this.stone || !w) return;
    const day = this.sky === "day";
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    if (live) this.drift += dt * this.rush;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    // the facets: assembling in a sweep from the upper left as the canvases light up, then still
    const into = live ? t - 1.1 : 99;
    if (into < ASSEMBLE + 0.5) {
      for (const p of this.panes) {
        const at = ((p.x / w) * 0.62 + (p.y / h) * 0.38) * ASSEMBLE;
        const k = smooth(at, at + 0.5, into);
        if (!k) continue;
        ctx.globalAlpha = k;
        ctx.fillStyle = p.fill;
        ctx.fill(p.path);
        ctx.strokeStyle = day ? `rgba(255, 252, 240, ${Math.min(0.9, p.edge * (1 + 1.5 * (1 - k))).toFixed(3)})` : `rgba(226, 186, 110, ${(p.edge * (1 + 3 * (1 - k))).toFixed(3)})`;
        ctx.lineWidth = 0.8;
        ctx.stroke(p.path);
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(this.stone, 0, 0, w, h);
    }

    // by night light is added to the dark stone; by day it is laid over the pale crystal
    ctx.globalCompositeOperation = day ? "source-over" : "lighter";
    ctx.lineWidth = 0.9;
    ctx.lineJoin = "round";
    if (live) {
      // a slow sheen crossing the facets with the bands' tilt, as light runs over cut stone
      const s = (t - 4) % SHEEN_EVERY;
      if (t > 4 && s < SHEEN_TAKES) {
        const k = s / SHEEN_TAKES;
        const eased = k * k * (3 - 2 * k);
        const from = -h * 0.55;
        const to = w * 0.9;
        const at = from + (to - from) * eased;
        const wide = Math.max(70, w * 0.06);
        for (const p of this.panes) {
          const d = ((w - p.x) * SHEEN.dx + p.y * SHEEN.dy - at) / wide;
          if (d > 2.2 || d < -2.2) continue;
          const g = Math.exp(-d * d) * (0.3 + 0.7 * p.open);
          this.lift(p, 0.035 * g, 0.42 * g);
        }
      }
      // now and then a single facet in the open sky catches the light
      if (t > 3 && t >= this.nextGlint) {
        const open = this.panes.filter((p) => p.open > 0.6 && p.y < h * 0.72 && p.y > 0);
        if (open.length) this.glints.push({ pane: open[Math.floor(Math.random() * open.length)], born: t, life: 1.6 + Math.random() * 0.8 });
        this.nextGlint = t + 0.7 + Math.random() * 0.9;
      }
      this.glints = this.glints.filter((g) => t < g.born + g.life);
      for (const g of this.glints) {
        const k = Math.sin((Math.PI * (t - g.born)) / g.life) ** 2;
        this.lift(g.pane, 0.05 * k, 0.5 * k);
      }
      // the pointer, a small lamp over the stone
      const p = this.pointer;
      if (p) {
        const reach = 230;
        for (const pane of this.panes) {
          const dx = pane.x - p.x;
          const dy = pane.y - p.y;
          if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
          const k = Math.max(0, 1 - Math.hypot(dx, dy) / reach) ** 2;
          if (k) this.lift(pane, 0.05 * k, 0.4 * k);
        }
      }
    }

    if (day) {
      ctx.globalCompositeOperation = "source-over";
      this.drawClouds(t, live);
      if (live) this.drawBirds(t);
    } else {
      // the stars over the stone. In a time-lapse each draws a trail behind it, round a pole high above the sky,
      // that shortens back into the star as time slows to its own pace; the faintest wait until it has
      const trail = Math.min(0.45, (this.rush - 1) * 0.0065);
      ctx.globalAlpha = (live ? smooth(1.4, 3.2, t) : 1) * (1 - 0.85 * smooth(0, 0.06, trail));
      if (this.dust) ctx.drawImage(this.dust, 0, 0, w, h);
      const px = w * 0.2;
      const py = -h * 1.2;
      ctx.lineCap = "round";
      for (const s of this.live) {
        const born = live ? smooth(s.born, s.born + 1, t) : 1;
        if (!born) continue;
        const tw = live ? 1 - s.amp + s.amp * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph)) : 1 - s.amp / 2;
        const a = Math.min(1, s.a * tw * born);
        if (trail > 0.002) {
          const r = Math.hypot(s.x - px, s.y - py);
          const at = Math.atan2(s.y - py, s.x - px);
          ctx.lineWidth = Math.max(0.7, s.size * 0.3);
          ctx.strokeStyle = `rgb(${TINTS[s.tint]})`;
          // in three lengths, fainter toward the tail
          for (let k = 0; k < 3; k++) {
            ctx.globalAlpha = a * (0.55 - 0.16 * k);
            ctx.beginPath();
            ctx.arc(px, py, r, at + (trail * k) / 3, at + (trail * (k + 1)) / 3);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = a;
        ctx.drawImage(this.dots[s.tint], s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /** The clouds drift to the right on the wind, the near ones faster, and come round again from the left; in a
   *  time-lapse they race. */
  private drawClouds(t: number, live: boolean) {
    const { ctx, w } = this;
    const shown = live ? smooth(1.6, 3.6, t) : 1;
    if (!shown) return;
    for (const c of this.clouds) {
      const span = w + c.w * 2;
      const x = ((((c.x + c.w + c.speed * this.drift) % span) + span) % span) - c.w;
      ctx.globalAlpha = c.a * shown;
      ctx.drawImage(c.img, x, c.y, c.w, c.h);
    }
  }

  /** Now and then a few birds cross the open sky from the right, in a loose V, beating and gliding. */
  private drawBirds(t: number) {
    const { ctx, w, h } = this;
    if (t >= this.nextFlock) {
      const n = 3 + Math.floor(Math.random() * 3);
      const birds: Bird[] = [];
      for (let i = 0; i < n; i++) {
        const rank = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        birds.push({ dx: Math.abs(rank) * 17 + Math.random() * 6, dy: rank * 10 + (Math.random() - 0.5) * 5, size: 6.5 + Math.random() * 3, flap: 7 + Math.random() * 2, ph: Math.random() * 6.3 });
      }
      this.flocks.push({ born: t, life: 18 + Math.random() * 6, y: h * (0.2 + Math.random() * 0.16), rise: (Math.random() - 0.5) * h * 0.08, birds });
      this.nextFlock = t + FLOCK_EVERY[0] + Math.random() * (FLOCK_EVERY[1] - FLOCK_EVERY[0]);
    }
    this.flocks = this.flocks.filter((f) => t < f.born + f.life);
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgb(74, 66, 58)";
    for (const f of this.flocks) {
      const k = (t - f.born) / f.life;
      const head = w * (1.04 - 0.66 * k);
      const y0 = f.y + f.rise * k + Math.sin(k * 6.3) * 4;
      ctx.globalAlpha = 0.6 * smooth(0, 0.08, k) * (1 - smooth(0.9, 1, k));
      for (const b of f.birds) {
        // a few beats, then a glide with the wings held a little up
        const beat = Math.sin(t * b.flap + b.ph);
        const gliding = Math.sin(t * 0.9 + b.ph) > 0.35;
        const up = b.size * (gliding ? 0.22 : 0.12 + 0.5 * beat);
        const x = head + b.dx;
        const y = y0 + b.dy;
        ctx.beginPath();
        ctx.moveTo(x - b.size, y - up);
        ctx.quadraticCurveTo(x - b.size * 0.45, y - up * 0.4 - b.size * 0.18, x, y);
        ctx.quadraticCurveTo(x + b.size * 0.45, y - up * 0.4 - b.size * 0.18, x + b.size, y - up);
        ctx.stroke();
      }
    }
  }
}

/** mulberry32, for the stars' twinkle and the clouds' cuts: the same sky every time. */
function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let v = s;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

export class SceneLight {
  private readonly fields: Halftone[];
  private readonly town: TownLights | null;
  private readonly sky: SkyLayer | null;
  private frame = 0;
  private last = 0;
  private running = false;
  private t0 = performance.now();
  /** Pointer position on screen, or null when it is away. */
  pointer: Point | null = null;
  /** How fast time runs for the sky (1 is real time): SceneMotion raises it during a time-lapse. */
  rush = 1;
  /** Called every frame before drawing, with the scene clock and the frame's length in seconds. */
  onFrame: ((t: number, dt: number) => void) | null = null;

  constructor({
    fields,
    town,
    sky,
    moon,
    sun,
    time,
  }: {
    fields: { canvas: HTMLCanvasElement; toward: "start" | "end"; dense: number }[];
    town: HTMLCanvasElement | null;
    sky: HTMLCanvasElement | null;
    moon: HTMLElement | null;
    sun: HTMLElement | null;
    time: Sky;
  }) {
    const warm = sprite(64, [
      [0, "rgba(255, 244, 214, 1)"],
      [0.22, "rgba(246, 210, 140, 0.75)"],
      [0.55, "rgba(214, 166, 86, 0.18)"],
      [1, "rgba(214, 166, 86, 0)"],
    ]);
    // by day the flashes are laid on the pale sky, so they carry their own gold
    const gilt = sprite(64, [
      [0, "rgba(255, 252, 232, 1)"],
      [0.2, "rgba(255, 222, 120, 0.9)"],
      [0.5, "rgba(232, 168, 32, 0.28)"],
      [1, "rgba(232, 168, 32, 0)"],
    ]);
    const halo = sprite(96, [
      [0, "rgba(255, 236, 196, 0.95)"],
      [0.18, "rgba(255, 200, 120, 0.5)"],
      [0.5, "rgba(255, 170, 70, 0.12)"],
      [1, "rgba(255, 170, 70, 0)"],
    ]);
    this.fields = fields.map((f) => new Halftone(f.canvas, f.toward, f.dense, { night: warm, day: gilt }));
    this.town = town ? new TownLights(town, halo, star()) : null;
    this.sky = sky ? new SkyLayer(sky, { night: moon, day: sun }) : null;
    this.setTime(time);
  }

  /** The time of day to draw for. Resize afterwards: that redraws the still layers in the new light. */
  setTime(time: Sky) {
    for (const f of this.fields) f.sky = time;
    if (this.town) this.town.sky = time;
    if (this.sky) this.sky.sky = time;
  }

  resize() {
    for (const f of this.fields) f.resize();
    this.town?.resize();
    this.sky?.resize();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** One still frame: the sky, the halftone and the building's lights, without movement. */
  still() {
    this.stop();
    for (const f of this.fields) f.draw(0, false);
    this.town?.draw(0, false);
    this.sky?.draw(0, false);
  }

  private tick = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    // measure where the fields and the sky stand before this frame moves anything, so reading them forces no restyle
    for (const f of this.fields) f.locate(this.pointer);
    if (this.sky) {
      const r = this.pointer ? this.sky.canvas.getBoundingClientRect() : null;
      this.sky.pointer = r && this.pointer ? { x: this.pointer.x - r.left, y: this.pointer.y - r.top } : null;
    }
    this.onFrame?.(t, dt);
    if (this.sky) this.sky.rush = this.rush;
    for (const f of this.fields) f.draw(t, true);
    this.town?.draw(t, true);
    this.sky?.draw(t, true);
    this.frame = requestAnimationFrame(this.tick);
  };
}
