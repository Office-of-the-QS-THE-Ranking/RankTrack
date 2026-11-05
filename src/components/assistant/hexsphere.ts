/*
 * The orb's shell: a Goldberg sphere, the dual of a subdivided icosahedron. Every vertex of the subdivided
 * icosahedron becomes a plate, a hexagon but for exactly twelve pentagons, which is why a ball of hexagons is
 * possible at all.
 */

export type V3 = [number, number, number];

export type Plate = {
  /** The plate's middle, on the unit sphere. */
  center: V3;
  /** Its corners on the unit sphere, counter-clockwise from outside. */
  corners: V3[];
  /** A steady random number, so each plate catches the light a little differently. */
  seed: number;
};

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_VERTS: V3[] = (
  [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ] as V3[]
).map(unit);
const ICO_FACES: [number, number, number][] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

/** A deterministic random number in [0, 1): the same orb every time. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function hexSphere(frequency: number): { plates: Plate[]; triangles: [V3, V3, V3][] } {
  const points: V3[] = [];
  const index = new Map<string, number>();
  const pointAt = (p: V3) => {
    const u = unit(p);
    const key = `${Math.round(u[0] * 1e5)},${Math.round(u[1] * 1e5)},${Math.round(u[2] * 1e5)}`;
    let i = index.get(key);
    if (i === undefined) {
      i = points.length;
      points.push(u);
      index.set(key, i);
    }
    return i;
  };

  const faces: [number, number, number][] = [];
  for (const [ia, ib, ic] of ICO_FACES) {
    const a = ICO_VERTS[ia];
    const b = ICO_VERTS[ib];
    const c = ICO_VERTS[ic];
    const at = (i: number, j: number) => pointAt(add(add(scale(a, frequency - i - j), scale(b, i)), scale(c, j)));
    for (let i = 0; i < frequency; i++) {
      for (let j = 0; j < frequency - i; j++) {
        faces.push([at(i, j), at(i + 1, j), at(i, j + 1)]);
        if (i + j < frequency - 1) faces.push([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
    }
  }

  const around: V3[][] = points.map(() => []);
  for (const [p, q, r] of faces) {
    const middle = unit(add(add(points[p], points[q]), points[r]));
    around[p].push(middle);
    around[q].push(middle);
    around[r].push(middle);
  }

  const plates = points.map((center, i) => {
    const seedAxis: V3 = Math.abs(center[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = unit(cross(seedAxis, center));
    const v = cross(center, u);
    const angle = (p: V3) => {
      const d = sub(p, center);
      return Math.atan2(dot(d, v), dot(d, u));
    };
    return { center, corners: [...around[i]].sort((p, q) => angle(p) - angle(q)), seed: hash(i) };
  });

  return { plates, triangles: faces.map(([p, q, r]) => [points[p], points[q], points[r]]) };
}

/** Floats per vertex: position (3), plate middle (3), then rim, layer and seed. */
export const STRIDE = 9;
/** The layers: where a plate's top and bottom sit, and the core under them. */
export const LAYER_BOTTOM = 0;
export const LAYER_TOP = 1;
export const LAYER_CORE = 2;

/**
 * The vertices of the core and of every plate, ready to draw as triangles. Each plate is a shrunken polygon with
 * side walls, so a raised plate shows its thickness. `gap` is the share of a plate's width left as a dark seam.
 */
export function shellVertices(frequency: number, gap: number): Float32Array {
  const { plates, triangles } = hexSphere(frequency);
  const out: number[] = [];
  const push = (p: V3, c: V3, rim: number, layer: number, seed: number) => out.push(p[0], p[1], p[2], c[0], c[1], c[2], rim, layer, seed);

  for (const tri of triangles) for (const p of tri) push(p, p, 0, LAYER_CORE, 0);

  for (const { center, corners, seed } of plates) {
    const shrunk = corners.map((p) => unit(add(center, scale(sub(p, center), 1 - gap))));
    shrunk.forEach((p, i) => {
      const q = shrunk[(i + 1) % shrunk.length];
      push(center, center, 0, LAYER_TOP, seed);
      push(p, center, 1, LAYER_TOP, seed);
      push(q, center, 1, LAYER_TOP, seed);
      push(p, center, 1, LAYER_TOP, seed);
      push(p, center, 1, LAYER_BOTTOM, seed);
      push(q, center, 1, LAYER_BOTTOM, seed);
      push(q, center, 1, LAYER_TOP, seed);
      push(p, center, 1, LAYER_TOP, seed);
      push(q, center, 1, LAYER_BOTTOM, seed);
    });
  }
  return new Float32Array(out);
}
