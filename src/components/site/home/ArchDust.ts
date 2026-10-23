import { LIGHTS, type Light } from "./archGeometry";

/**
 * The light in the hero's dark room (ArchMotion), on one canvas: the glow that spills from the opening
 * once it is lit and then breathes, a lantern that trails the pointer, lights that climb every line of
 * the drawn arch, and gold dust drifting up through the air, brighter where it crosses the opening's
 * light and stirred aside by the pointer. A pre-drawn soft dot, additive blending, and it only runs while
 * the hero is on screen and the tab is visible.
 */

type Mote = { x: number; y: number; r: number; vx: number; vy: number; rise: number; alpha: number; tw: number; ph: number; sway: number };

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** How the lights climb, in the drawing's units (the opening is 100 wide). */
const CLIMB = {
  speed: 30, // units a second: unhurried, about a pilaster's height in five seconds
  every: 9.5, // seconds between one light and the next on the same line
  tail: 30, // units of fading light behind each head
  tone: [0.5, 0.82, 1], // fine detail, structure, the opening
};
/** A fixed scatter in [0, 1) for each line, so neighbouring lights never move in step. */
const scatter = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
/** When each line's light sets out: as the climb reaches the height it starts from, a little later further out. */
const SETS_OUT = LIGHTS.map((l, i) => l.y0 / CLIMB.speed + Math.abs(l.x0) / (CLIMB.speed * 6) + scatter(i, 1) * 0.7);
/** Each line's own pace, within an eighth of the common one. */
const PACE = LIGHTS.map((_, i) => CLIMB.speed * (0.88 + scatter(i, 2) * 0.24));

/** The drawing's own mask (site-home.css, .w-arch__monument), so a light fades where its line does. */
function maskAt(x: number, y: number) {
  const r = Math.hypot(x / 197, (y - 54) / 192);
  if (r <= 0.38) return 1;
  if (r <= 0.7) return 1 - (0.6 * (r - 0.38)) / 0.32;
  return r < 1 ? 0.4 * (1 - (r - 0.7) / 0.3) : 0;
}

/** The point `d` units along a light's route, and the index of the segment it lies in. */
function along(l: Light, d: number): [number, number, number] {
  const { pts, cum } = l;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const span = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / span));
  return [pts[i * 2 - 2] + (pts[i * 2] - pts[i * 2 - 2]) * t, pts[i * 2 - 1] + (pts[i * 2 + 1] - pts[i * 2 - 1]) * t, i];
}

export class GoldDust {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dot: HTMLCanvasElement;
  private motes: Mote[] = [];
  private width = 0;
  private height = 0;
  private frame = 0;
  private last = 0;
  private running = false;
  private kindled = -1;
  private readonly lamp = { x: 0, y: 0, a: 0 };
  /** The opening in canvas pixels: its centre line, width, crown and ground. */
  light = { x: 0, w: 0, top: 0, bottom: 0 };
  /** Pointer position in canvas pixels, or null when it is away. */
  pointer: { x: number; y: number } | null = null;
  /** How far the visitor has walked through the opening (0 to 1): the glow gives way to the building. */
  pass = 0;
  /** Where the drawing stands on the canvas: the middle of its ground line, and pixels per unit. */
  bay = { x: 0, y: 0, k: 0 };
  /** How much of the drawing is showing (it fades as the visitor walks through), for its lights. */
  bayShown = 1;
  private climbFrom = -1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    // one soft warm dot, drawn once and stamped for every mote
    this.dot = document.createElement("canvas");
    this.dot.width = this.dot.height = 64;
    const g = this.dot.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255, 244, 214, 1)");
    grad.addColorStop(0.22, "rgba(246, 210, 140, 0.75)");
    grad.addColorStop(0.55, "rgba(214, 166, 86, 0.18)");
    grad.addColorStop(1, "rgba(214, 166, 86, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }

  resize(width: number, height: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(170, Math.max(36, (width * height) / 7600)));
    while (this.motes.length < count) this.motes.push(this.spawn(true));
    this.motes.length = count;
    if (!this.running) this.draw(performance.now() / 1000);
  }

  /** Light the opening `delay` seconds from now: the glow flares, then settles into a slow breath. */
  ignite(delay: number) {
    if (this.kindled < 0) this.kindled = performance.now() / 1000 + delay;
  }

  /** Start sending lights up the drawing's lines `delay` seconds from now, once it has been drawn. */
  climb(delay: number) {
    if (this.climbFrom < 0) this.climbFrom = performance.now() / 1000 + delay;
  }

  private spawn(anywhere: boolean): Mote {
    const near = Math.random() < 0.35 && this.light.w > 0; // a share of the dust rises out of the light itself
    const rise = 7 + Math.random() * 22;
    return {
      x: near ? this.light.x + (Math.random() - 0.5) * this.light.w * 1.4 : Math.random() * this.width,
      y: anywhere ? Math.random() * this.height : this.height + 6 + Math.random() * 40,
      r: 0.5 + Math.random() ** 2.2 * 2.1,
      vx: 0,
      vy: -rise,
      rise,
      alpha: 0.18 + Math.random() * 0.55,
      tw: 0.6 + Math.random() * 1.8,
      ph: Math.random() * Math.PI * 2,
      sway: 4 + Math.random() * 12,
    };
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

  private tick = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt, now / 1000);
    this.draw(now / 1000);
    this.frame = requestAnimationFrame(this.tick);
  };

  private step(dt: number, t: number) {
    const p = this.pointer;
    const reach = 150;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      if (p) {
        const dx = m.x - p.x;
        const dy = m.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < reach && d > 0.5) {
          // pushed aside and turned a little, like dust stirred by a passing hand
          const f = (1 - d / reach) ** 2 * 520;
          m.vx += ((dx / d) * f - (dy / d) * f * 0.45) * dt;
          m.vy += ((dy / d) * f + (dx / d) * f * 0.45) * dt;
        }
      }
      m.vx *= 1 - Math.min(1, 2.4 * dt);
      m.vy += (-m.rise - m.vy) * Math.min(1, 1.4 * dt);
      m.x += (m.vx + Math.sin(t * 0.7 + m.ph) * m.sway) * dt;
      m.y += m.vy * dt;
      if (m.y < -12 || m.x < -24 || m.x > this.width + 24) this.motes[i] = this.spawn(false);
    }
    // the lantern follows the pointer a little behind, and fades when it leaves
    if (p) {
      this.lamp.x += (p.x - this.lamp.x) * Math.min(1, 7 * dt);
      this.lamp.y += (p.y - this.lamp.y) * Math.min(1, 7 * dt);
    }
    this.lamp.a += ((p ? 1 : 0) - this.lamp.a) * Math.min(1, 2.5 * dt);
  }

  private draw(t: number) {
    const { ctx, light } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = "lighter";

    // the glow of the lit opening
    if (this.kindled >= 0 && light.w > 0 && t > this.kindled) {
      const k = Math.min(1, (t - this.kindled) / 2.6);
      const flare = easeOut(k) * (1 + 0.7 * Math.sin(Math.PI * Math.min(1, k * 1.4)));
      const a = flare * (0.86 + 0.14 * Math.sin((t - this.kindled) * 0.95)) * Math.max(0, 1 - this.pass * 1.4);
      if (a > 0.01) {
        const span = light.bottom - light.top;
        const r = Math.max(light.w * 1.25, span * 0.9);
        ctx.save();
        ctx.translate(light.x, light.top + span * 0.58);
        ctx.scale(1, 1.25);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(255, 196, 120, ${0.2 * a})`);
        g.addColorStop(0.45, `rgba(255, 168, 88, ${0.07 * a})`);
        g.addColorStop(1, "rgba(255, 168, 88, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
      }
    }

    // lights climbing the lines of the arch
    if (this.climbFrom >= 0 && t > this.climbFrom && this.bayShown > 0.02 && this.bay.k > 0) this.drawClimb(t - this.climbFrom);

    // the lantern
    if (this.lamp.a > 0.01) {
      const r = 320;
      const g = ctx.createRadialGradient(this.lamp.x, this.lamp.y, 0, this.lamp.x, this.lamp.y, r);
      g.addColorStop(0, `rgba(255, 214, 150, ${0.11 * this.lamp.a})`);
      g.addColorStop(0.4, `rgba(255, 196, 120, ${0.04 * this.lamp.a})`);
      g.addColorStop(1, "rgba(255, 196, 120, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(this.lamp.x - r, this.lamp.y - r, r * 2, r * 2);
    }

    // the dust
    for (const m of this.motes) {
      // the light falls from the opening: strongest over it, fading out to its sides
      const across = light.w > 0 ? Math.max(0, 1 - Math.abs(m.x - light.x) / (light.w * 0.95)) : 0;
      const lit = across * across * (m.y > light.top ? 1 : 0.45);
      const twinkle = 0.55 + 0.45 * Math.sin(t * m.tw + m.ph);
      ctx.globalAlpha = Math.min(1, m.alpha * twinkle * (1 + lit * 1.8));
      const size = m.r * 6 * (1 + lit * 0.6);
      ctx.drawImage(this.dot, m.x - size / 2, m.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * Every line of the drawing carries a light up it at a slow, even pace: a warm head with a fading tail,
   * a soft halo under a fine core. Each sets out when the climb reaches the height its line starts from,
   * so the light rises through the whole bay, from the ground to the cornice, and then again.
   */
  private drawClimb(elapsed: number) {
    const { ctx, bay } = this;
    const { every, tail, tone } = CLIMB;
    const px = (x: number) => bay.x + x * bay.k;
    const py = (y: number) => bay.y - y * bay.k;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < LIGHTS.length; i++) {
      const l = LIGHTS[i];
      const local = elapsed - SETS_OUT[i];
      if (local < 0) continue;
      const head = (local % every) * PACE[i];
      if (head > l.len + tail) continue;
      const end = Math.min(head, l.len);
      const start = Math.max(0, head - tail);
      if (end - start < 0.2) continue;
      const [hx, hy, hi] = along(l, end);
      // fades with the drawing's mask, and goes out once its head has reached the end of the line
      const out = head > l.len ? 1 - (head - l.len) / tail : 1;
      const a = tone[l.tone] * maskAt(hx, hy) * this.bayShown * out;
      if (a < 0.02) continue;
      const [sx, sy, si] = along(l, start);
      ctx.beginPath();
      ctx.moveTo(px(sx), py(sy));
      for (let j = si; j < hi; j++) ctx.lineTo(px(l.pts[j * 2]), py(l.pts[j * 2 + 1]));
      ctx.lineTo(px(hx), py(hy));
      const g = ctx.createLinearGradient(px(sx), py(sy), px(hx), py(hy));
      g.addColorStop(0, "rgba(255, 214, 140, 0)");
      g.addColorStop(0.7, `rgba(255, 220, 156, ${0.35 * a})`);
      g.addColorStop(1, `rgba(255, 240, 206, ${0.85 * a})`);
      ctx.strokeStyle = g;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      if (head <= l.len) {
        const size = l.tone === 2 ? 13 : 10;
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(this.dot, px(hx) - size / 2, py(hy) - size / 2, size, size);
        ctx.globalAlpha = 1;
      }
    }
  }
}
