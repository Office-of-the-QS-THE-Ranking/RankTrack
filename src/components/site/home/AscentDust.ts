/**
 * The light of the ascent stage (Movers.tsx, driven by AscentMotion): gold dust rising slowly through the
 * dark, embers streaming from the head of a line while it draws, a shower of sparks when a line reaches
 * this year's edition, and the pointer as a lamp that brightens and parts the dust near it. Everything is
 * drawn from one soft sprite with additive blending, so it reads as light rather than as dots.
 */
type Mote = { x: number; y: number; vx: number; vy: number; r: number; a: number; ph: number };
type Spark = { x: number; y: number; vx: number; vy: number; r: number; t: number; life: number };

const LAMP = 190;

function sprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (!g) return c;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255, 247, 224, 1)");
  grad.addColorStop(0.16, "rgba(253, 216, 128, 0.85)");
  grad.addColorStop(0.42, "rgba(214, 164, 72, 0.22)");
  grad.addColorStop(1, "rgba(214, 164, 72, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class AscentDust {
  /** Where the line is being drawn, in stage pixels, or null when no line is moving. */
  head: { x: number; y: number } | null = null;
  pointer: { x: number; y: number } | null = null;

  private ctx: CanvasRenderingContext2D | null;
  private glow: HTMLCanvasElement;
  private motes: Mote[] = [];
  private sparks: Spark[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private owed = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    this.glow = sprite();
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    const count = Math.round(Math.min(150, (w * h) / 10500));
    this.motes = Array.from({ length: count }, () => this.mote(rand(0, h)));
    if (!this.raf) this.paint();
  }

  start() {
    if (this.raf || !this.ctx) return;
    this.last = performance.now();
    this.raf = window.requestAnimationFrame(this.tick);
  }

  stop() {
    window.cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Sparks thrown up from a point, when a line arrives at this year's edition. */
  burst(x: number, y: number, n = 46) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const v = rand(50, 230);
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(0.7, 2.1), t: 0, life: rand(0.8, 1.9) });
    }
  }

  private mote(y: number): Mote {
    return { x: rand(0, this.w), y, vx: rand(-4, 4), vy: rand(-17, -5), r: rand(0.5, 1.7), a: rand(0.18, 0.7), ph: rand(0, Math.PI * 2) };
  }

  private tick = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.step(dt);
    this.paint();
    this.raf = window.requestAnimationFrame(this.tick);
  };

  private step(dt: number) {
    const p = this.pointer;
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(this.time * 0.6 + m.ph) * 7) * dt;
      m.y += m.vy * dt;
      if (p) {
        const dx = m.x - p.x;
        const dy = m.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < LAMP && d > 0.1) {
          const push = (1 - d / LAMP) * 46 * dt;
          m.x += (dx / d) * push;
          m.y += (dy / d) * push;
        }
      }
      if (m.y < -12 || m.x < -12 || m.x > this.w + 12) Object.assign(m, this.mote(this.h + 8));
    }
    // embers stream from the head while the line moves
    if (this.head) {
      this.owed += dt * 58;
      while (this.owed >= 1) {
        this.owed -= 1;
        this.sparks.push({
          x: this.head.x + rand(-2, 2),
          y: this.head.y + rand(-2, 2),
          vx: rand(-34, 12),
          vy: rand(-58, -8),
          r: rand(0.6, 1.6),
          t: 0,
          life: rand(0.55, 1.3),
        });
      }
    } else this.owed = 0;
    const drag = Math.pow(0.12, dt);
    this.sparks = this.sparks.filter((s) => {
      s.t += dt;
      s.vx *= drag;
      s.vy = s.vy * drag - 26 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      return s.t < s.life;
    });
  }

  private paint() {
    const g = this.ctx;
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.globalCompositeOperation = "lighter";
    const p = this.pointer;
    for (const m of this.motes) {
      let a = m.a * (0.55 + 0.45 * Math.sin(this.time * 1.6 + m.ph));
      let r = m.r;
      if (p) {
        const d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d < LAMP) {
          const k = 1 - d / LAMP;
          a = Math.min(1, a * (1 + 2.4 * k));
          r *= 1 + 0.6 * k;
        }
      }
      const s = r * 8;
      g.globalAlpha = a;
      g.drawImage(this.glow, m.x - s / 2, m.y - s / 2, s, s);
    }
    for (const sp of this.sparks) {
      const k = 1 - sp.t / sp.life;
      const s = sp.r * 9 * (0.6 + 0.4 * k);
      g.globalAlpha = Math.max(0, k * k);
      g.drawImage(this.glow, sp.x - s / 2, sp.y - s / 2, s, s);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
}
