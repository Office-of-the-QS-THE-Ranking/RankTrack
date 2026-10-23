/*
 * The central bay of the Arch of the Centuries as an elevation in fine gold line: the opening and its
 * archivolt, the keystone under the royal crest, a fluted pilaster pair with a shell niche and pediment on
 * each side, the side scrolls, and the dentilled entablature. Simplified from the arch on the España campus.
 *
 * Units: the opening is 100 wide, its springline 100 up and its crown 150 up, so the drawing can be scaled
 * from the photograph's opening (--arch-w) and the two always meet. y runs up from the ground and is
 * flipped when written to SVG.
 *
 * Every shape is built once and gives two things: INK, the strokes ArchDrawing draws (each with the height
 * it starts from, so the bay can be drawn in from the ground up), and LIGHTS, the same lines as point
 * runs that always climb (ArchDust sends a light up each one): a line from its lower end, an arch from
 * both springings to its crown, a closed shape from the middle of its foot up both sides, a level line
 * outward from the axis, a volute curling in.
 */

export type Tone = 0 | 1 | 2; // fine detail, structure, the opening itself
export type Ink = { d: string; tone: Tone; low: number; x: number };
export type Light = { pts: Float32Array; cum: Float32Array; len: number; tone: Tone; x0: number; y0: number };

type P = [number, number];

const n = (v: number) => +v.toFixed(2);
const pt = (x: number, y: number) => `${n(x)} ${n(-y)}`;

/** One shape: its SVG path, and the points of its line, closely enough spaced to carry a light along. */
class Shape {
  d = "";
  pts: P[] = [];
  closed = false;
  curl = false;
  private at: P = [0, 0];
  move(x: number, y: number) {
    this.d += `M${pt(x, y)}`;
    this.pts.push([x, y]);
    this.at = [x, y];
    return this;
  }
  line(x: number, y: number) {
    this.d += `L${pt(x, y)}`;
    this.pts.push([x, y]);
    this.at = [x, y];
    return this;
  }
  cubic(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.d += `C${pt(x1, y1)} ${pt(x2, y2)} ${pt(x, y)}`;
    const [x0, y0] = this.at;
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      const u = 1 - t;
      this.pts.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
      ]);
    }
    this.at = [x, y];
    return this;
  }
  /** An arc about (cx, cy) from angle a0 to a1, in degrees counter-clockwise, starting where the pen is. */
  arc(cx: number, cy: number, r: number, a0: number, a1: number) {
    const rad = (a: number) => (a * Math.PI) / 180;
    const x = cx + r * Math.cos(rad(a1));
    const y = cy + r * Math.sin(rad(a1));
    this.d += `A${n(r)} ${n(r)} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 < a0 ? 1 : 0} ${pt(x, y)}`;
    const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 4));
    for (let i = 1; i <= steps; i++) {
      const a = rad(a0 + ((a1 - a0) * i) / steps);
      this.pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    this.at = [x, y];
    return this;
  }
  close() {
    this.d += "Z";
    this.closed = true;
    return this;
  }
}

const level = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const lengthOf = (pts: P[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

/** Follow a run of points for `length` and stop there, cutting the last segment. */
function walk(seq: P[], length: number): P[] {
  const out: P[] = [seq[0]];
  let run = 0;
  for (let i = 1; i < seq.length; i++) {
    const [ax, ay] = seq[i - 1];
    const [bx, by] = seq[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (run + seg >= length) {
      const t = seg ? (length - run) / seg : 0;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      return out;
    }
    run += seg;
    out.push(seq[i]);
  }
  return out;
}

/** Split a shape's line into runs that climb: the routes the lights take. */
function climbs(s: Shape): P[][] {
  const pts = s.pts;
  if (s.curl) return [pts];

  if (s.closed) {
    // from the middle of the shape's foot, up both sides to the point opposite on its outline
    const loop = pts.length > 1 && level(pts[0][0], pts.at(-1)![0]) && level(pts[0][1], pts.at(-1)![1]) ? pts.slice(0, -1) : pts;
    let lo = 0;
    for (let i = 1; i < loop.length; i++) if (loop[i][1] < loop[lo][1] - 1e-6) lo = i;
    let ring = [...loop.slice(lo), ...loop.slice(0, lo)];
    const [first, second, last] = [ring[0], ring[1], ring.at(-1)!];
    if (level(second[1], first[1])) ring = [[(first[0] + second[0]) / 2, first[1]], ...ring.slice(1), first];
    else if (level(last[1], first[1])) ring = [[(first[0] + last[0]) / 2, first[1]], ...ring];
    ring.push(ring[0]);
    const half = lengthOf(ring) / 2;
    return [walk(ring, half), walk(ring.slice().reverse(), half)];
  }

  const ys = pts.map((p) => p[1]);
  const top = Math.max(...ys);
  if (top - Math.min(...ys) < 0.5) {
    // a level line runs outward from the axis, split where it crosses it
    const [l, r] = pts[0][0] < pts.at(-1)![0] ? [pts[0], pts.at(-1)!] : [pts.at(-1)!, pts[0]];
    if (l[0] < 0 && r[0] > 0) return [[[0, l[1]], l], [[0, r[1]], r]];
    return [Math.abs(l[0]) < Math.abs(r[0]) ? [l, r] : [r, l]];
  }
  // otherwise from each low end up to the highest point (the middle of it, if the top is level)
  const m = ys.indexOf(top);
  let e = m;
  while (e + 1 < pts.length && level(pts[e + 1][1], top)) e++;
  const peak: P = [(pts[m][0] + pts[e][0]) / 2, top];
  const up = [...pts.slice(0, m + 1), ...(e > m ? [peak] : [])];
  const down = [...pts.slice(e).reverse(), ...(e > m ? [peak] : [])];
  return [up, down].filter((r) => r.length > 1);
}

function build() {
  const ink: Ink[] = [];
  const runs: { pts: P[]; tone: Tone }[] = [];
  const add = (s: Shape, tone: Tone) => {
    const xs = s.pts.map((p) => p[0]);
    ink.push({ d: s.d, tone, low: Math.min(...s.pts.map((p) => p[1])), x: Math.abs((Math.min(...xs) + Math.max(...xs)) / 2) });
    for (const r of climbs(s)) if (r.length > 1) runs.push({ pts: r, tone });
  };
  const line = (x1: number, y1: number, x2: number, y2: number, tone: Tone) => add(new Shape().move(x1, y1).line(x2, y2), tone);
  const rect = (x: number, y: number, w: number, h: number, tone: Tone) =>
    add(new Shape().move(x, y).line(x + w, y).line(x + w, y + h).line(x, y + h).close(), tone);
  const poly = (pts: P[], tone: Tone, close = false) => {
    const s = new Shape().move(...pts[0]);
    for (const p of pts.slice(1)) s.line(...p);
    if (close) s.close();
    add(s, tone);
  };
  const over = (cx: number, cy: number, r: number, tone: Tone) => add(new Shape().move(cx - r, cy).arc(cx, cy, r, 180, 0), tone);
  // a volute: an inward spiral of `turns` turns, starting at angle a0 (degrees, counter-clockwise)
  const spiral = (cx: number, cy: number, r: number, turns: number, a0: number, dir: 1 | -1, tone: Tone) => {
    const steps = Math.round(turns * 28);
    const s = new Shape();
    s.curl = true;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = ((a0 + dir * t * turns * 360) * Math.PI) / 180;
      const rr = r * (1 - 0.82 * t);
      if (i) s.line(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
      else s.move(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
    add(s, tone);
  };

  // ground and plinth
  line(-172, 0, 172, 0, 1);
  for (const s of [-1, 1]) {
    line(s * 50, 12, s * 170, 12, 1);
    line(s * 50, 7, s * 170, 7, 0);
  }

  // the opening: jambs, reveal and impost blocks
  for (const s of [-1, 1]) {
    line(s * 50, 0, s * 50, 100, 2);
    line(s * 64, 12, s * 64, 96, 1);
    rect(s > 0 ? 48 : -68, 96, 20, 8, 1);
    line(s * 48, 100, s * 68, 100, 0);
  }

  // archivolt, voussoir joints and the keystone
  over(0, 100, 50, 2);
  over(0, 100, 57, 0);
  over(0, 100, 64, 1);
  for (let k = 1; k <= 12; k++) {
    if (k === 6 || k === 7) continue;
    const a = ((180 - (k * 180) / 13) * Math.PI) / 180;
    line(50 * Math.cos(a), 100 + 50 * Math.sin(a), 64 * Math.cos(a), 100 + 64 * Math.sin(a), 0);
  }
  poly([[-6.1, 149.6], [-10.5, 177], [10.5, 177], [6.1, 149.6]], 1);
  poly([[-3.9, 154], [-6.6, 173.5], [6.6, 173.5], [3.9, 154]], 0, true);

  // the royal crest over the keystone: quartered shield, crown and mantling
  add(new Shape().move(-16, 210).line(16, 210).line(16, 195).cubic(16, 187, 8, 182, 0, 178.5).cubic(-8, 182, -16, 187, -16, 195).close(), 1);
  add(new Shape().move(-12.5, 207).line(12.5, 207).line(12.5, 195.5).cubic(12.5, 189.5, 6.5, 185.5, 0, 182.5).cubic(-6.5, 185.5, -12.5, 189.5, -12.5, 195.5).close(), 0);
  line(0, 184, 0, 207, 0);
  line(-12.5, 197, 12.5, 197, 0);
  poly([[-12, 210], [-12, 216], [-7, 213.5], [-3.5, 218.5], [0, 214.5], [3.5, 218.5], [7, 213.5], [12, 216], [12, 210]], 1);
  line(0, 219, 0, 225, 0);
  line(-2.5, 222.5, 2.5, 222.5, 0);
  for (const s of [-1, 1] as const) {
    add(new Shape().move(s * 21, 186).cubic(s * 28, 192, s * 26, 204, s * 16, 205), 0);
    spiral(s * 22, 190, 4, 1.2, s > 0 ? 200 : -20, s > 0 ? -1 : 1, 0);
  }

  // spandrels: an acanthus scroll each side, between the archivolt and the pilasters
  for (const s of [-1, 1] as const) {
    add(new Shape().move(s * 40, 154).cubic(s * 46, 166, s * 60, 170, s * 66, 160), 0);
    spiral(s * 54, 172, 7, 1.35, s > 0 ? 250 : -70, s > 0 ? 1 : -1, 0);
    add(new Shape().move(s * 30, 168).cubic(s * 36, 176, s * 44, 181, s * 52, 182), 0);
  }

  // fluted pilasters: base, shaft, flutes, and a capital with volutes
  const pilaster = (cx: number) => {
    rect(cx - 13, 12, 26, 8, 1);
    line(cx - 12, 23, cx + 12, 23, 0);
    rect(cx - 11, 24, 22, 148, 1);
    for (const f of [-5.5, 0, 5.5]) line(cx + f, 30, cx + f, 166, 0);
    line(cx - 11, 175, cx + 11, 175, 0);
    rect(cx - 14, 179, 28, 7, 1);
    spiral(cx - 12, 177, 3.6, 1.5, 90, 1, 0);
    spiral(cx + 12, 177, 3.6, 1.5, 90, -1, 0);
  };
  for (const cx of [-147, -81, 81, 147]) pilaster(cx);

  // shell niches with a pediment over each
  for (const s of [-1, 1] as const) {
    const c = s * 114;
    rect(c - 12, 17, 24, 12, 0);
    rect(c - 14, 33, 28, 5, 0);
    add(new Shape().move(c - 13, 38).line(c - 13, 116).arc(c, 116, 13, 180, 0).line(c + 13, 38), 1);
    add(new Shape().move(c - 10, 38).line(c - 10, 116).arc(c, 116, 10, 180, 0).line(c + 10, 38), 0);
    for (const a of [25, 52, 78, 102, 128, 155]) {
      const r = (a * Math.PI) / 180;
      line(c + 2.5 * Math.cos(r), 116 + 2.5 * Math.sin(r), c + 9.5 * Math.cos(r), 116 + 9.5 * Math.sin(r), 0);
    }
    line(c - 17, 138, c + 17, 138, 1);
    poly([[c - 17, 138], [c, 154], [c + 17, 138]], 1);
    poly([[c - 11.5, 140.5], [c, 151.5], [c + 11.5, 140.5]], 0, true);
  }

  // the carved scrolls that close each side
  for (const s of [-1, 1] as const) {
    add(new Shape().move(s * 158, 22).cubic(s * 171, 34, s * 173, 66, s * 166, 86).cubic(s * 160, 104, s * 160, 142, s * 167, 160), 0);
    spiral(s * 165, 166, 5, 1.4, s > 0 ? 270 : -90, s > 0 ? 1 : -1, 0);
    spiral(s * 162, 26, 3.4, 1.2, 90, s > 0 ? -1 : 1, 0);
  }

  // entablature: architrave and frieze broken by the crest, a dentilled cornice above
  for (const s of [-1, 1]) {
    for (const [y, tone] of [[186, 1], [190, 0], [194, 1], [208, 0]] as [number, Tone][]) line(s * 30, y, s * 170, y, tone);
    for (const [y, tone] of [[211, 1], [215, 0]] as [number, Tone][]) line(s * 14, y, s * 172, y, tone);
    // the dentils draw in as one stroke, but each carries its own light
    const teeth = new Shape();
    for (let x = 16; x <= 168; x += 4) {
      teeth.move(s * x, 211).line(s * x, 215);
      runs.push({ pts: [[s * x, 211], [s * x, 215]], tone: 0 });
    }
    ink.push({ d: teeth.d, tone: 0, low: 211, x: 92 });
  }
  line(-174, 219, 174, 219, 1);
  line(-174, 223, 174, 223, 1);
  line(-170, 229, 170, 229, 0);

  const lights: Light[] = runs.map(({ pts, tone }) => {
    const flat = new Float32Array(pts.length * 2);
    const cum = new Float32Array(pts.length);
    pts.forEach(([x, y], i) => {
      flat[i * 2] = x;
      flat[i * 2 + 1] = y;
      if (i) cum[i] = cum[i - 1] + Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    });
    return { pts: flat, cum, len: cum[pts.length - 1], tone, x0: pts[0][0], y0: pts[0][1] };
  });
  return { ink, lights };
}

const built = build();

/** The strokes of the drawing. */
export const INK: Ink[] = built.ink;
/** The climbing routes, one light each. */
export const LIGHTS: Light[] = built.lights;
