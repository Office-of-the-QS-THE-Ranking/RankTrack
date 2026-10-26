/**
 * Geometry for the sign-in scene (SignInScene): the cut facets of the gold and silver bands, the faceted
 * sky behind them with its stars, and the lights of the building's render
 * (SceneLight makes them shine). A seeded random keeps the markup the same on the server and in the browser.
 */

/** mulberry32: small, fast and seeded. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Every band's facets are drawn in one box, 100 wide and tall enough to cover the band at any screen size
 * (signin.css slices it to the band). Facets are only cut where the band can be seen: its middle stretch.
 */
export const FACET_BOX = { w: 100, h: 3200, from: 640, to: 2560 };

export interface Facets {
  /** One path per shade, lightest last: white facets laid over the band's own gradient. */
  light: string[];
  /** One path per shade, darkest last. */
  dark: string[];
  /** Facets that catch the light in turn; `delay` staggers them through one cycle. */
  glints: { d: string; delay: number }[];
}

/**
 * A triangular lattice laid along the band with one family of edges running with it, so on screen the other
 * two families stand nearly level and steep, as on the cut gold of the reference. Each facet is shaded by a
 * slow swell along the band, as if light fell across it, and by its own scatter.
 */
function cut(seed: number, side: number, levels: number, glintCount: number): Facets {
  const r = seeded(seed);
  const col = (side * Math.sqrt(3)) / 2;
  const light: string[][] = Array.from({ length: levels }, () => []);
  const dark: string[][] = Array.from({ length: levels }, () => []);
  const lit: string[] = [];
  const swell = r() * Math.PI * 2;
  for (let i = 0; col * i < FACET_BOX.w; i++) {
    const xa = i * col;
    const xb = (i + 1) * col;
    const oa = (i % 2) * 0.5;
    const ob = 0.5 - oa;
    for (let j = Math.floor(FACET_BOX.from / side) - 1; j * side < FACET_BOX.to; j++) {
      const ya = (j + oa) * side;
      const yb = (j + ob) * side;
      const tris = [
        // upright edge on the left line, point to the right; then the reverse
        { d: `M${n1(xa)} ${n1(ya)}L${n1(xa)} ${n1(ya + side)}L${n1(xb)} ${n1(ya + side / 2)}Z`, y: ya + side / 2 },
        { d: `M${n1(xb)} ${n1(yb)}L${n1(xb)} ${n1(yb + side)}L${n1(xa)} ${n1(yb + side / 2)}Z`, y: yb + side / 2 },
      ];
      for (const t of tris) {
        const v = 0.55 * Math.sin(t.y / 260 + swell) + 0.45 * (r() * 2 - 1);
        const k = Math.min(levels - 1, Math.floor(Math.abs(v) * levels * 1.15));
        (v >= 0 ? light : dark)[k].push(t.d);
        if (t.y > 1180 && t.y < 2020) lit.push(t.d);
      }
    }
  }
  const glints: Facets["glints"] = [];
  for (let g = 0; g < glintCount && lit.length; g++) {
    const at = Math.floor(r() * lit.length);
    glints.push({ d: lit.splice(at, 1)[0], delay: n1((g / glintCount) * 11 + r() * 0.8) });
  }
  return { light: light.map((p) => p.join("")), dark: dark.map((p) => p.join("")), glints };
}

/** The wide gold band: three facets across. The narrow silver band: about two. */
export const GOLD_FACETS = cut(1611, 40, 4, 9);
export const SILVER_FACETS = cut(1645, 58, 4, 6);

export interface Facet {
  /** Its three corners, in pixels. */
  p: [number, number][];
  /** Its tilt: a unit normal leaning off the screen, by which the moon and the campus light it. */
  n: [number, number, number];
  /** Its own scatter of shade, -1 to 1. */
  tone: number;
}

/**
 * The faceted night sky (SceneLight lights it): a triangular lattice over a w × h canvas, its cells about
 * `cell` pixels across and every corner nudged, each facet tilted a little its own way, like cut onyx.
 */
export function skyFacets(w: number, h: number, cell: number): Facet[] {
  const r = seeded(1611);
  const rowH = cell * 0.866;
  const rows = Math.ceil(h / rowH) + 2;
  const cols = Math.ceil(w / cell) + 2;
  const pts: [number, number][][] = [];
  for (let j = 0; j <= rows; j++) {
    const row: [number, number][] = [];
    for (let i = 0; i <= cols; i++) {
      row.push([(i - 1) * cell + (j % 2 ? cell / 2 : 0) + (r() - 0.5) * cell * 0.56, (j - 1) * rowH + (r() - 0.5) * rowH * 0.5]);
    }
    pts.push(row);
  }
  const facets: Facet[] = [];
  const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
    const tx = (r() - 0.5) * 1.4;
    const ty = (r() - 0.5) * 1.4;
    const len = Math.hypot(tx, ty, 1);
    facets.push({ p: [a, b, c], n: [tx / len, ty / len, 1 / len], tone: r() * 2 - 1 });
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      // the rows sit half a cell apart: each pair of rows makes a strip of facets pointing down and up in turn
      if (j % 2 === 0) {
        tri(pts[j][i], pts[j][i + 1], pts[j + 1][i]);
        tri(pts[j + 1][i], pts[j + 1][i + 1], pts[j][i + 1]);
      } else {
        tri(pts[j][i], pts[j][i + 1], pts[j + 1][i + 1]);
        tri(pts[j + 1][i], pts[j + 1][i + 1], pts[j][i]);
      }
    }
  }
  return facets;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export type Tint = "blue" | "white" | "warm" | "red";

export interface SkyStar {
  /** Where it stands, as shares of the screen's width and height. */
  x: number;
  y: number;
  /** Brightness, 0 to 1: most stars are faint. */
  b: number;
  tint: Tint;
}

/**
 * The stars of the night (SceneLight draws them): plenty, most of them faint, sparser behind the University's
 * name in the top left corner and toward the horizon, where the air is thick.
 */
function field(seed: number, count: number): SkyStar[] {
  const r = seeded(seed);
  const stars: SkyStar[] = [];
  for (let tries = 0; stars.length < count && tries < count * 40; tries++) {
    const x = r();
    const y = r();
    const under = 1 - 0.8 * (1 - smoothstep(0.1, 0.16, y)) * (1 - smoothstep(0.24, 0.32, x));
    const air = 1 - 0.75 * smoothstep(0.45, 0.95, y);
    if (r() > under * air) continue;
    const b = r() ** 4;
    const roll = r();
    stars.push({
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      b: Math.round(b * 1000) / 1000,
      tint: roll < 0.42 ? "blue" : roll < 0.84 ? "white" : roll < 0.96 ? "warm" : "red",
    });
  }
  return stars;
}

export const SKY_STARS = field(1611, 560);

/**
 * The lights of main-building-3d.webp, as shares of its
 * width and height. scripts/signin-scene/render.py prints them with each render; paste them here when the
 * camera or the lamps move.
 */
export const TOWN_LIGHTS = {
  lamps: [
    [0.154, 0.813],
    [0.385, 0.819],
    [0.641, 0.825],
    [0.791, 0.829],
    [0.914, 0.832],
  ],
  small: [
    [0.133, 0.844],
    [0.316, 0.846],
    [0.679, 0.851],
    [0.792, 0.852],
    [0.438, 0.846],
    [0.569, 0.848],
    [0.496, 0.816],
  ],
  clock: [0.5057, 0.5369],
  /** The clock face's radius across and down, as shares of the render's width and height (its live hands, .sx__clock). */
  clockR: [0.0162, 0.0255],
  cross: [0.491, 0.398],
} as const;
