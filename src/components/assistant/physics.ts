/*
 * The orb's body, free of the browser so it can be tested (tests/assistant-physics.test.ts).
 *
 * The orb always lives on one side of the screen. Let go, it is drawn to a wall like a magnet: it gathers speed, meets
 * the wall, and stops dead there, squashed. Nothing sends it back off a wall, so it cannot bounce.
 *
 * A fixed 240 Hz step means a throw travels the same way on a 60 Hz laptop and a 120 Hz phone. Positions are in
 * CSS pixels with y pointing down, like the page; the spin is in view space (x right, y up, z toward the viewer),
 * like the sphere it turns.
 */

export type Vec = { x: number; y: number };
/** The limits of the orb's centre. */
export type Bounds = { left: number; top: number; right: number; bottom: number };
/** A side of the screen, as its inward normal. */
export type Wall = { nx: number; ny: number };
/** A wall it struck: the wall's inward normal and how hard, in px/s. */
export type Hit = Wall & { speed: number };

export const LEFT: Wall = { nx: 1, ny: 0 };
export const RIGHT: Wall = { nx: -1, ny: 0 };
export const TOP: Wall = { nx: 0, ny: 1 };
export const BOTTOM: Wall = { nx: 0, ny: -1 };

export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Stretch, as the two independent parts of a traceless strain: it can lean any way without its axis flipping. */
  e1: number;
  e2: number;
  ve1: number;
  ve2: number;
  /** How far it has lifted off the page: 0 at rest, 1 held, below 0 pressed in. */
  lift: number;
  vLift: number;
  /** Angular velocity, rad/s. */
  wx: number;
  wy: number;
  wz: number;
  /** Orientation of the hex shell, a unit quaternion [x, y, z, w]. */
  q: [number, number, number, number];
  /** Seconds it has been still. */
  rest: number;
  /** Time left over from the last frame, carried into the next. */
  spare: number;
};

export type Input = {
  radius: number;
  bounds: Bounds;
  /** Where the pointer holds it, or null when it flies free. */
  grab: Vec | null;
  /** A place it is drawn to instead of its wall: its socket in the top bar, or above a phone's open chat. */
  home: Vec | null;
  /** Home is the socket: it goes there with a quick click rather than a slow glide. */
  snap?: boolean;
  /** The side it belongs to. */
  wall: Wall;
  /** The lift it should settle at. */
  lift: number;
};

const STEP = 1 / 240;
/** A long frame (a background tab, a stutter) is not simulated in full. */
const MAX_FRAME = 0.05;

/** The fastest throw, px/s. */
export const MAX_THROW = 3400;

/* Held: stiff enough to feel direct, soft enough to feel the weight arrive. */
const GRAB_K = 1250;
const GRAB_C = 2 * 0.76 * Math.sqrt(GRAB_K);
/* Drawn home: slow and without overshoot. */
const HOME_K = 90;
const HOME_C = 2 * 0.86 * Math.sqrt(HOME_K);
/* Into the socket: quick, with the slightest settle, like a part clicking home. */
const SNAP_K = 820;
const SNAP_C = 2 * 0.7 * Math.sqrt(SNAP_K);

/* The socket's reach, in the orb's radii from its centre. Held inside CAPTURE, the orb is drawn toward it, and inside
   LOCK it sits in it. Let go inside RELEASE, it goes in, unless it was flung away from it. */
const CAPTURE = 2.4;
const LOCK = 0.75;
const RELEASE = 3;
const FLUNG_AWAY = 650;
/* The magnet: a pull that gathers it up to a top speed, so crossing a screen takes about half a second. */
const MAGNET = 11000;
const MAGNET_DRAG = 4;
/** How fast its sideways speed fades on the way, and once it is against the wall. */
const FLIGHT_SLIP = 2.6;
const WALL_SLIP = 15;
const SLEEP_SPEED = 7;
/** The share of its sideways speed a hard contact takes at once. */
const WALL_GRIP = 0.55;
/** Slower than this at release, it was dropped rather than thrown. */
const THROWN = 420;
/** How much a throw must favour up or down over sideways to count as one: a diagonal goes to a side of the screen. */
const LEVEL = 0.8;
/** How far a drop is still carried, in seconds of its speed, when working out the nearest wall. */
const DRIFT = 0.18;
/* Jelly: the shape squashes against the wall and recovers with one soft overshoot. */
const JELLY_K = 340;
const JELLY_C = 2 * 0.46 * Math.sqrt(JELLY_K);
const STRETCH = 0.12;
const STRETCH_AT = 2600;
const KICK = 4.8;
const KICK_AT = 2300;
const PRESS = 0.2;
const MAX_STRAIN = 0.34;
/* Lift */
const LIFT_K = 520;
const LIFT_C = 2 * 0.5 * Math.sqrt(LIFT_K);
/* Spin: it rolls as it travels, geared down so a fast throw never strobes. */
const ROLL = 0.3;
const SPIN_RATE = 6;
const MAX_SPIN = 13;
const IDLE_SPIN = 0.16;
const Z_SPIN_DECAY = 0.9;

export function createBody(x: number, y: number): Body {
  return { x, y, vx: 0, vy: 0, e1: 0, e2: 0, ve1: 0, ve2: 0, lift: 0, vLift: 0, wx: 0, wy: IDLE_SPIN, wz: 0, q: [0, 0, 0, 1], rest: 0, spare: 0 };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const clampToBounds = (p: Vec, b: Bounds): Vec => ({ x: clamp(p.x, b.left, b.right), y: clamp(p.y, b.top, b.bottom) });

/** The point on a wall nearest to p. */
export function ontoWall(p: Vec, wall: Wall, b: Bounds): Vec {
  return {
    x: wall.nx > 0 ? b.left : wall.nx < 0 ? b.right : clamp(p.x, b.left, b.right),
    y: wall.ny > 0 ? b.top : wall.ny < 0 ? b.bottom : clamp(p.y, b.top, b.bottom),
  };
}

const onWall = (p: Vec, { nx, ny }: Wall, b: Bounds) => (nx > 0 ? p.x <= b.left : nx < 0 ? p.x >= b.right : ny > 0 ? p.y <= b.top : p.y >= b.bottom);

/**
 * The wall it goes to when let go. A throw goes the way it mostly went, however far that wall is: a line of flight
 * would be the wrong test, since a throw that is nearly level still clips a wall the orb happens to be beside. A drop
 * goes to the nearest.
 */
export function chooseWall(p: Vec, v: Vec, b: Bounds): Wall {
  if (Math.hypot(v.x, v.y) >= THROWN) {
    if (Math.abs(v.x) >= Math.abs(v.y) * LEVEL) return v.x > 0 ? RIGHT : LEFT;
    return v.y > 0 ? BOTTOM : TOP;
  }
  const x = p.x + v.x * DRIFT;
  const y = p.y + v.y * DRIFT;
  const walls: [number, Wall][] = [
    [x - b.left, LEFT],
    [b.right - x, RIGHT],
    [y - b.top, TOP],
    [b.bottom - y, BOTTOM],
  ];
  return walls.reduce((best, w) => (w[0] < best[0] ? w : best))[1];
}

/** The wall on the far side of this one. */
export const opposite = ({ nx, ny }: Wall): Wall => ({ nx: -nx || 0, ny: -ny || 0 });

/** What an arrow key means on a wall: along it, slide; away from it, cross to the far side; into it, nothing. */
export function arrowMove(wall: Wall, dx: number, dy: number): "slide" | "cross" | "none" {
  const away = dx * wall.nx + dy * wall.ny;
  return away > 0 ? "cross" : away < 0 ? "none" : "slide";
}

/** Meet a wall: all speed into it is gone, a squash takes its place, and glancing speed becomes spin. */
function strike(b: Body, nx: number, ny: number, radius: number, hits: Hit[]) {
  const into = -(b.vx * nx + b.vy * ny);
  if (into <= 0) return;
  const slideX = b.vx + into * nx;
  const slideY = b.vy + into * ny;
  // In view space, the speed along the wall that a rolling contact would turn into spin about z.
  const along = slideX * ny + -slideY * nx;
  const hard = Math.min(1, into / 600);
  b.wz += (along / radius - b.wz) * 0.45 * hard;
  const keep = 1 - WALL_GRIP * hard;
  b.vx = slideX * keep;
  b.vy = slideY * keep;
  const kick = KICK * Math.min(1, into / KICK_AT);
  b.ve1 -= kick * (nx * nx - ny * ny);
  b.ve2 -= kick * (2 * nx * ny);
  hits.push({ nx, ny, speed: into });
}

function collide(b: Body, { left, top, right, bottom }: Bounds, radius: number, hits: Hit[]) {
  if (b.x < left) {
    b.x = left;
    strike(b, 1, 0, radius, hits);
  } else if (b.x > right) {
    b.x = right;
    strike(b, -1, 0, radius, hits);
  }
  if (b.y < top) {
    b.y = top;
    strike(b, 0, 1, radius, hits);
  } else if (b.y > bottom) {
    b.y = bottom;
    strike(b, 0, -1, radius, hits);
  }
}

/** Where a held orb goes near its socket: drawn in more strongly the nearer it gets, then held in it. */
export function seatPull(target: Vec, seat: Vec, radius: number): Vec {
  const d = Math.hypot(target.x - seat.x, target.y - seat.y);
  const reach = CAPTURE * radius;
  const lock = LOCK * radius;
  if (d >= reach) return target;
  if (d <= lock) return { x: seat.x, y: seat.y };
  const u = (reach - d) / (reach - lock);
  const t = u * u * (3 - 2 * u);
  return { x: target.x + (seat.x - target.x) * t, y: target.y + (seat.y - target.y) * t };
}

/** Whether a let-go orb goes into its socket: near enough, and not flung away from it. */
export function snapsIn(p: Vec, v: Vec, seat: Vec, radius: number): boolean {
  const dx = p.x - seat.x;
  const dy = p.y - seat.y;
  const d = Math.hypot(dx, dy);
  if (d > RELEASE * radius) return false;
  if (d < 1) return true;
  return (v.x * dx + v.y * dy) / d < FLUNG_AWAY;
}

function step(b: Body, { radius, bounds, grab, home, snap, wall, lift }: Input, hits: Hit[]) {
  const h = STEP;
  let ax: number;
  let ay: number;
  if (grab) {
    ax = GRAB_K * (grab.x - b.x) - GRAB_C * b.vx;
    ay = GRAB_K * (grab.y - b.y) - GRAB_C * b.vy;
  } else if (home) {
    const k = snap ? SNAP_K : HOME_K;
    const c = snap ? SNAP_C : HOME_C;
    ax = k * (home.x - b.x) - c * b.vx;
    ay = k * (home.y - b.y) - c * b.vy;
  } else {
    const toward = -(b.vx * wall.nx + b.vy * wall.ny);
    const stuck = onWall(b, wall, bounds);
    const magnet = stuck ? 0 : MAGNET - MAGNET_DRAG * toward;
    ax = -wall.nx * magnet;
    ay = -wall.ny * magnet;
    // Sideways speed fades on the way and dies against the wall.
    const slip = Math.exp(-(stuck ? WALL_SLIP : FLIGHT_SLIP) * h);
    b.vx = (b.vx + toward * wall.nx) * slip - toward * wall.nx;
    b.vy = (b.vy + toward * wall.ny) * slip - toward * wall.ny;
  }
  b.vx += ax * h;
  b.vy += ay * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
  collide(b, bounds, radius, hits);

  const speed = Math.hypot(b.vx, b.vy);
  const arrived = !grab && (home ? Math.hypot(home.x - b.x, home.y - b.y) < 1 : onWall(b, wall, bounds));
  if (arrived && speed < SLEEP_SPEED) {
    b.vx = 0;
    b.vy = 0;
    b.rest += h;
  } else if (speed >= SLEEP_SPEED || grab) {
    b.rest = 0;
  }

  // The strain it leans toward: a stretch along its travel, less a squash where it is pushed into a wall.
  let t1 = 0;
  let t2 = 0;
  if (speed > 1) {
    const s = (STRETCH * Math.min(1, speed / STRETCH_AT)) / (speed * speed);
    t1 = s * (b.vx * b.vx - b.vy * b.vy);
    t2 = s * (2 * b.vx * b.vy);
  }
  if (grab) {
    const overX = Math.max(bounds.left - grab.x, 0) - Math.max(grab.x - bounds.right, 0);
    const overY = Math.max(bounds.top - grab.y, 0) - Math.max(grab.y - bounds.bottom, 0);
    const over = Math.hypot(overX, overY);
    if (over > 0) {
      const a = (PRESS * Math.min(1, over / 240)) / (over * over);
      t1 -= a * (overX * overX - overY * overY);
      t2 -= a * (2 * overX * overY);
    }
  }
  b.ve1 += (JELLY_K * (t1 - b.e1) - JELLY_C * b.ve1) * h;
  b.ve2 += (JELLY_K * (t2 - b.e2) - JELLY_C * b.ve2) * h;
  b.e1 += b.ve1 * h;
  b.e2 += b.ve2 * h;
  const strain = Math.hypot(b.e1, b.e2);
  if (strain > MAX_STRAIN) {
    b.e1 *= MAX_STRAIN / strain;
    b.e2 *= MAX_STRAIN / strain;
  }

  b.vLift += (LIFT_K * (lift - b.lift) - LIFT_C * b.vLift) * h;
  b.lift += b.vLift * h;

  // Rolling across the page: the front of the ball moves the way the ball does.
  const rollX = clamp((b.vy / radius) * ROLL, -MAX_SPIN, MAX_SPIN);
  const rollY = clamp((b.vx / radius) * ROLL, -MAX_SPIN, MAX_SPIN);
  const r = SPIN_RATE * h;
  b.wx += (rollX - b.wx) * r;
  b.wy += (rollY + IDLE_SPIN - b.wy) * r;
  b.wz -= b.wz * Z_SPIN_DECAY * h;
  const [qx, qy, qz, qw] = b.q;
  const half = 0.5 * h;
  const nx = qx + half * (b.wx * qw + b.wy * qz - b.wz * qy);
  const ny = qy + half * (b.wy * qw + b.wz * qx - b.wx * qz);
  const nz = qz + half * (b.wz * qw + b.wx * qy - b.wy * qx);
  const nw = qw + half * (-b.wx * qx - b.wy * qy - b.wz * qz);
  const len = Math.hypot(nx, ny, nz, nw);
  b.q = [nx / len, ny / len, nz / len, nw / len];
}

/** Run the body forward by a frame's worth of fixed steps, collecting the walls it strikes. */
export function advance(b: Body, dt: number, input: Input, hits: Hit[] = []) {
  b.spare += Math.min(Math.max(dt, 0), MAX_FRAME);
  while (b.spare >= STEP) {
    step(b, input, hits);
    b.spare -= STEP;
  }
  return hits;
}

/** For reduced motion: it goes where it is put, with no flight, wobble or spin. */
export function place(b: Body, { bounds, grab, home, wall }: Input) {
  const to = grab || home ? clampToBounds(grab ?? home ?? b, bounds) : ontoWall(b, wall, bounds);
  b.x = to.x;
  b.y = to.y;
  b.vx = b.vy = 0;
  b.e1 = b.e2 = b.ve1 = b.ve2 = 0;
  b.lift = b.vLift = 0;
  b.wx = b.wy = b.wz = 0;
  b.rest += 1 / 60;
}

/** The speed of the pointer as it let go, from its last moments. A pointer that paused first throws nothing. */
export function throwVelocity(samples: readonly { x: number; y: number; t: number }[], now: number): Vec {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > 70) return { x: 0, y: 0 };
  let first = last;
  for (let i = samples.length - 2; i >= 0 && last.t - samples[i].t <= 90; i--) first = samples[i];
  const ms = last.t - first.t;
  if (ms < 8) return { x: 0, y: 0 };
  const x = ((last.x - first.x) / ms) * 1000;
  const y = ((last.y - first.y) / ms) * 1000;
  const speed = Math.hypot(x, y);
  const scale = speed > MAX_THROW ? MAX_THROW / speed : 1;
  return { x: x * scale, y: y * scale };
}

/**
 * The strain as a CSS matrix's a, b, c and d: the exponential of the strain tensor, so the orb's area never changes
 * however hard it is squashed.
 */
export function strainMatrix(e1: number, e2: number): [number, number, number, number] {
  const r = Math.hypot(e1, e2);
  if (r < 1e-4) return [1, 0, 0, 1];
  const c = Math.cosh(r);
  const k = Math.sinh(r) / r;
  return [c + k * e1, k * e2, k * e2, c - k * e1];
}

/** The hex shell's orientation as a column-major rotation matrix for the shader. */
export function rotationMatrix([x, y, z, w]: Body["q"], out: Float32Array) {
  out[0] = 1 - 2 * (y * y + z * z);
  out[1] = 2 * (x * y + z * w);
  out[2] = 2 * (x * z - y * w);
  out[3] = 2 * (x * y - z * w);
  out[4] = 1 - 2 * (x * x + z * z);
  out[5] = 2 * (y * z + x * w);
  out[6] = 2 * (x * z + y * w);
  out[7] = 2 * (y * z - x * w);
  out[8] = 1 - 2 * (x * x + y * y);
  return out;
}

/** A value on a damped spring: `damping` 1 settles without overshoot, lower rings. */
export type Spring = { x: number; v: number };

export function pull(s: Spring, to: number, k: number, damping: number, dt: number) {
  const c = 2 * damping * Math.sqrt(k);
  const n = Math.max(1, Math.ceil(dt * 120));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (k * (to - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
}

export type Side = -1 | 1;

/**
 * Where the chat box goes beside the orb, given its top-left corner. It stays on the side it is on until it no
 * longer fits there, so a small drag never sends it across the orb, and its middle follows the orb's until an edge
 * of the screen stops it.
 */
export function placePanel(orb: Vec, radius: number, vw: number, vh: number, w: number, h: number, gap: number, pad: number, side: Side | 0): { x: number; y: number; side: Side } {
  const roomLeft = orb.x - radius - gap - pad;
  const roomRight = vw - pad - (orb.x + radius + gap);
  const fits = side === -1 ? roomLeft >= w : side === 1 ? roomRight >= w : false;
  const chosen: Side = fits ? (side as Side) : roomLeft >= roomRight ? -1 : 1;
  const x = chosen === -1 ? orb.x - radius - gap - w : orb.x + radius + gap;
  return {
    x: clamp(x, pad, Math.max(pad, vw - pad - w)),
    y: clamp(orb.y - h / 2, pad, Math.max(pad, vh - pad - h)),
    side: chosen,
  };
}
