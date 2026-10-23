/**
 * Geometry for the sign-in scene (SignInScene): the cut facets of the gold and silver bands, the faceted
 * sky behind them with its stars by night and its clouds by day, and the lights of the building's render
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
 * The stars of the night (SceneLight draws them): few and faint, sparser still under the words on the left
 * and toward the horizon, where the air is thick.
 */
function field(seed: number, count: number): SkyStar[] {
  const r = seeded(seed);
  const stars: SkyStar[] = [];
  for (let tries = 0; stars.length < count && tries < count * 40; tries++) {
    const x = r();
    const y = r();
    const under = 0.18 + 0.82 * smoothstep(0.14, 0.62, x);
    const air = 1 - 0.75 * smoothstep(0.45, 0.95, y);
    if (r() > under * air) continue;
    const b = r() ** 4.5;
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

export const SKY_STARS = field(1611, 150);

export interface Puff {
  /** Its middle, in the cloud's own box: across from 0 to 1, up from the flat base at 0 (negative is up). */
  x: number;
  y: number;
  /** Its radius, as a share of the cloud's width; its sides, and how far round its first corner stands. */
  r: number;
  sides: number;
  turn: number;
}

export interface Cloud {
  /** Where it starts: its middle across the screen and its base down it, as shares of the screen. */
  x: number;
  y: number;
  /** Its width as a share of the screen's width; how near it is, 0 to 1 (the near ones are larger, faster, whiter). */
  w: number;
  near: number;
  puffs: Puff[];
}

/**
 * The day's clouds (SceneLight cuts them into facets): a few low-poly cumulus, each a row of puffs on a flat
 * base, the middle ones larger and a crown or two over them. They keep below the sun and drift on the wind.
 */
function cumulus(seed: number, count: number): Cloud[] {
  const r = seeded(seed);
  const clouds: Cloud[] = [];
  for (let c = 0; c < count; c++) {
    const n = 4 + Math.floor(r() * 3);
    const puffs: Puff[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const rad = (0.11 + 0.15 * Math.sin(Math.PI * t)) * (0.85 + 0.3 * r());
      puffs.push({ x: 0.1 + 0.8 * t + (r() - 0.5) * 0.05, y: -rad * (0.42 + 0.2 * r()), r: rad, sides: 9 + Math.floor(r() * 3), turn: r() * 6.3 });
    }
    for (let k = 0, crowns = 1 + Math.floor(r() * 2); k < crowns; k++) {
      const rad = 0.12 + 0.06 * r();
      puffs.push({ x: 0.36 + 0.3 * r(), y: -0.2 - 0.1 * r(), r: rad, sides: 10, turn: r() * 6.3 });
    }
    const near = r();
    clouds.push({ x: (c + 0.2 + 0.6 * r()) / count, y: 0.34 + 0.16 * r(), w: 0.11 + 0.1 * near, near, puffs });
  }
  return clouds;
}

export const SKY_CLOUDS = cumulus(1611, 6);

/**
 * The lights of main-building-3d.webp (and of its day render, which shares the camera), as shares of its
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
  /** Where the dome mirrors the day's sun (the day render's highlight). */
  dome: [0.507, 0.444],
} as const;
