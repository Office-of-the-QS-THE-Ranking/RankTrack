import { skyFacets, SKY_STARS, TOWN_LIGHTS, type Tint } from "./sceneGeometry";

/**
 * The light of the sign-in scene (SceneMotion runs it), on three kinds of canvas:
 *   - the sky, under everything: facets that assemble after the bands land, a slow sheen crossing them,
 *     single facets that glint and the pointer lighting those under it like a lamp. They are dark like cut
 *     onyx, lit faintly by the moon and the campus below, under a few gold stars that twinkle, fewer near
 *     the moon;
 *   - the halftone fields either side of the gold hairline. They sit inside the rotated band group, so their
 *     dots lie along the bands. A slow wave of light runs down them, a few dots flash, and the pointer lights
 *     the dots under it like a torch;
 *   - the building's own lights, on a canvas laid over its render (so it shares the render's mask and
 *     parallax): the lamps flicker and flare, the clock face glows, and a glint now and then runs up the cross.
 * The still layers are drawn once per resize and each frame stamps pre-drawn
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

/** The halftone's inks: bright gold dots, a paler wave running down them, and the pointer's torch. */
const INK = {
  near: "#f6c64a",
  far: "#d99a18",
  floor: 0.32,
  wave: ["rgba(255, 240, 200, 0)", "rgba(255, 244, 214, 0.9)"],
  torch: ["rgba(255, 248, 226, 0.95)", "rgba(255, 236, 190, 0)"],
} as const;

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

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly toward: "start" | "end",
    private readonly dense: number,
    private readonly glow: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize() {
    this.w = this.canvas.offsetWidth;
    this.h = this.canvas.offsetHeight;
    if (!this.w || !this.h) return;
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
        g.globalAlpha = Math.min(1, INK.floor + (1 - INK.floor) * q);
        g.fillStyle = q > 0.72 ? INK.near : INK.far;
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
    const { glow } = this;

    // a wave of light runs down the field, recolouring the dots it passes over
    ctx.globalCompositeOperation = "source-atop";
    const span = Math.min(h * 0.16, 260);
    const head = ((t / 7.5) % 1) * (h + span * 2) - span;
    const wave = ctx.createLinearGradient(0, head - span, 0, head + span);
    wave.addColorStop(0, INK.wave[0]);
    wave.addColorStop(0.5, INK.wave[1]);
    wave.addColorStop(1, INK.wave[0]);
    ctx.fillStyle = wave;
    ctx.fillRect(0, head - span, w, span * 2);
    if (this.torch) {
      const { x, y } = this.torch;
      const torch = ctx.createRadialGradient(x, y, 0, x, y, 150);
      torch.addColorStop(0, INK.torch[0]);
      torch.addColorStop(1, INK.torch[1]);
      ctx.fillStyle = torch;
      ctx.fillRect(x - 150, y - 150, 300, 300);
    }

    // a few dots flash, one after another; under the pointer the dots kindle
    ctx.globalCompositeOperation = "lighter";
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

/** The lamps, clock and cross of the building's render, drawn in its own box (TOWN_LIGHTS). */
class TownLights {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;

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

type Lit = { x: number; y: number; size: number; a: number; tint: Tint; tw: number; ph: number; amp: number; born: number };
type Lamp = { x: number; y: number; z: number; reach: number };
type Pane = { path: Path2D; x: number; y: number; fill: string; edge: number; open: number };
type Glint = { pane: Pane; born: number; life: number };

/** The sheen's tilt: it runs with the bands (sin and cos of 30.5°), measured from the right, as they lean. */
const SHEEN = { dx: 0.8616, dy: -0.5075 };
/** When the facets assemble (seconds after the canvases light up) and how long the sheen takes to cross. */
const ASSEMBLE = 1.5;
const SHEEN_EVERY = 10.5;
const SHEEN_TAKES = 3.8;

/**
 * The sky: the facets (skyFacets) lit once per resize by the moon and the campus glow and drawn to a still
 * layer, with the faintest stars on another; and over them each frame the entrance, the sheen, the glints, the
 * pointer's lamp and the twinkling stars.
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
  private w = 0;
  private h = 0;
  /** The pointer in this canvas's pixels, or null. */
  pointer: Point | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly moon: HTMLElement | null,
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
    // the moon's middle on this canvas, from layout boxes (its rise and tilt don't move them)
    const orb = this.moon;
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

  /** A facet lit over its still self: warm light on its face and gold along its edges. */
  private lift(p: Pane, face: number, edge: number) {
    const { ctx } = this;
    if (face > 0.004) {
      ctx.globalAlpha = Math.min(1, face);
      ctx.fillStyle = "rgb(255, 214, 146)";
      ctx.fill(p.path);
    }
    if (edge > 0.01) {
      ctx.globalAlpha = Math.min(1, edge);
      ctx.strokeStyle = "rgb(255, 222, 158)";
      ctx.stroke(p.path);
    }
  }

  draw(t: number, live: boolean) {
    const { ctx, w, h } = this;
    if (!this.stone || !w) return;
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
        ctx.strokeStyle = `rgba(226, 186, 110, ${(p.edge * (1 + 3 * (1 - k))).toFixed(3)})`;
        ctx.lineWidth = 0.8;
        ctx.stroke(p.path);
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(this.stone, 0, 0, w, h);
    }

    // light is added to the dark stone
    ctx.globalCompositeOperation = "lighter";
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

    // the stars over the stone; the faintest wait until the sky has assembled
    ctx.globalAlpha = live ? smooth(1.4, 3.2, t) : 1;
    if (this.dust) ctx.drawImage(this.dust, 0, 0, w, h);
    for (const s of this.live) {
      const born = live ? smooth(s.born, s.born + 1, t) : 1;
      if (!born) continue;
      const tw = live ? 1 - s.amp + s.amp * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph)) : 1 - s.amp / 2;
      ctx.globalAlpha = Math.min(1, s.a * tw * born);
      ctx.drawImage(this.dots[s.tint], s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

}

/** mulberry32, for the stars' twinkle: the same sky every time. */
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
  /** Called every frame before drawing, with the scene clock and the frame's length in seconds. */
  onFrame: ((t: number, dt: number) => void) | null = null;

  constructor({
    fields,
    town,
    sky,
    moon,
  }: {
    fields: { canvas: HTMLCanvasElement; toward: "start" | "end"; dense: number }[];
    town: HTMLCanvasElement | null;
    sky: HTMLCanvasElement | null;
    moon: HTMLElement | null;
  }) {
    const warm = sprite(64, [
      [0, "rgba(255, 244, 214, 1)"],
      [0.22, "rgba(246, 210, 140, 0.75)"],
      [0.55, "rgba(214, 166, 86, 0.18)"],
      [1, "rgba(214, 166, 86, 0)"],
    ]);
    const halo = sprite(96, [
      [0, "rgba(255, 236, 196, 0.95)"],
      [0.18, "rgba(255, 200, 120, 0.5)"],
      [0.5, "rgba(255, 170, 70, 0.12)"],
      [1, "rgba(255, 170, 70, 0)"],
    ]);
    this.fields = fields.map((f) => new Halftone(f.canvas, f.toward, f.dense, warm));
    this.town = town ? new TownLights(town, halo, star()) : null;
    this.sky = sky ? new SkyLayer(sky, moon) : null;
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
    for (const f of this.fields) f.draw(t, true);
    this.town?.draw(t, true);
    this.sky?.draw(t, true);
    this.frame = requestAnimationFrame(this.tick);
  };
}
