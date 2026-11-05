import { describe, expect, it } from "vitest";
import { hexSphere, shellVertices, STRIDE } from "@/components/assistant/hexsphere";
import { advance, arrowMove, BOTTOM, chooseWall, createBody, LEFT, MAX_THROW, ontoWall, opposite, place, placePanel, RIGHT, seatPull, snapsIn, strainMatrix, throwVelocity, TOP, type Bounds, type Hit, type Input, type Side, type Wall } from "@/components/assistant/physics";

const bounds: Bounds = { left: 46, top: 46, right: 1394, bottom: 854 };
const free = (wall: Wall): Input => ({ radius: 36, bounds, grab: null, home: null, wall, lift: 0 });

function fly(body: ReturnType<typeof createBody>, seconds: number, input: Input, fps = 60) {
  const hits: Hit[] = [];
  for (let i = 0; i < seconds * fps; i++) advance(body, 1 / fps, input, hits);
  return hits;
}

/** Throw it as the engine does: pick the wall from the release, then let it fly. */
function thrown(x: number, y: number, vx: number, vy: number) {
  const b = createBody(x, y);
  b.vx = vx;
  b.vy = vy;
  return { b, wall: chooseWall(b, { x: vx, y: vy }, bounds) };
}

describe("letting the orb go", () => {
  it("sticks to the side it is thrown at", () => {
    expect(chooseWall({ x: 700, y: 450 }, { x: 2000, y: 100 }, bounds)).toEqual(RIGHT);
    expect(chooseWall({ x: 700, y: 450 }, { x: -2000, y: 100 }, bounds)).toEqual(LEFT);
    expect(chooseWall({ x: 700, y: 450 }, { x: 100, y: -2000 }, bounds)).toEqual(TOP);
    expect(chooseWall({ x: 700, y: 450 }, { x: 100, y: 2000 }, bounds)).toEqual(BOTTOM);
  });

  it("goes the way it was mostly thrown, even from right beside another wall", () => {
    // Nearly level, starting just above the bottom wall and drifting down: still the left side, not the bottom.
    expect(chooseWall({ x: 1394, y: 840 }, { x: -2600, y: 130 }, bounds)).toEqual(LEFT);
    // Nearly straight down, starting on the right wall and drifting right: still the bottom, not the right.
    expect(chooseWall({ x: 1394, y: 100 }, { x: 130, y: 2600 }, bounds)).toEqual(BOTTOM);
  });

  it("sends a diagonal throw to a side", () => {
    expect(chooseWall({ x: 720, y: 450 }, { x: 1500, y: -1500 }, bounds)).toEqual(RIGHT);
    expect(chooseWall({ x: 720, y: 450 }, { x: -1500, y: 1500 }, bounds)).toEqual(LEFT);
    expect(chooseWall({ x: 720, y: 450 }, { x: 900, y: -1800 }, bounds)).toEqual(TOP);
  });

  it("can be thrown right across the screen, away from the nearest wall", () => {
    expect(chooseWall({ x: 1394, y: 450 }, { x: -900, y: 0 }, bounds)).toEqual(LEFT);
  });

  it("goes to the nearest wall when dropped", () => {
    expect(chooseWall({ x: 100, y: 450 }, { x: 0, y: 0 }, bounds)).toEqual(LEFT);
    expect(chooseWall({ x: 1300, y: 450 }, { x: 0, y: 0 }, bounds)).toEqual(RIGHT);
    expect(chooseWall({ x: 700, y: 60 }, { x: 0, y: 0 }, bounds)).toEqual(TOP);
    expect(chooseWall({ x: 700, y: 840 }, { x: 0, y: 0 }, bounds)).toEqual(BOTTOM);
  });

  it("never bounces: once it meets the wall it never leaves it", () => {
    for (const [vx, vy] of [[MAX_THROW, 0], [3000, 900], [-MAX_THROW, -200], [200, MAX_THROW], [-1200, -3000], [500, 0]]) {
      const { b, wall } = thrown(700, 450, vx, vy);
      const input = free(wall);
      const wallAt = ontoWall(b, wall, bounds);
      let met = false;
      for (let f = 0; f < 180; f++) {
        advance(b, 1 / 60, input);
        const off = wall.nx ? Math.abs(b.x - wallAt.x) : Math.abs(b.y - wallAt.y);
        if (off === 0) met = true;
        if (met) expect(off).toBe(0);
      }
      expect(met).toBe(true);
    }
  });

  it("only ever moves toward its wall on the way there", () => {
    for (const [vx, vy, x] of [[-2800, 300, 1300], [2800, -300, 100], [0, 0, 600], [-800, 0, 1200]]) {
      const { b, wall } = thrown(x, 450, vx, vy);
      let last = wall.nx > 0 ? b.x : wall.nx < 0 ? -b.x : wall.ny > 0 ? b.y : -b.y;
      for (let f = 0; f < 120; f++) {
        advance(b, 1 / 60, free(wall));
        const now = wall.nx > 0 ? b.x : wall.nx < 0 ? -b.x : wall.ny > 0 ? b.y : -b.y;
        expect(now).toBeLessThanOrEqual(last + 1e-9);
        last = now;
      }
    }
  });

  it("is on its wall and still soon after any throw or drop", () => {
    for (let i = 0; i < 80; i++) {
      const a = i * 0.79;
      const speed = (i % 5) * 800;
      const { b, wall } = thrown(100 + (i * 37) % 1200, 100 + (i * 53) % 700, Math.cos(a) * speed, Math.sin(a) * speed);
      fly(b, 1.5, free(wall));
      expect(b.vx).toBe(0);
      expect(b.vy).toBe(0);
      expect(b.rest).toBeGreaterThan(0);
      const on = ontoWall(b, wall, bounds);
      expect(b.x).toBe(on.x);
      expect(b.y).toBe(on.y);
    }
  });

  it("snaps: across the screen in about half a second, and quicker from close by", () => {
    const far = createBody(1394, 450);
    const near = createBody(120, 450);
    const timeToWall = (b: ReturnType<typeof createBody>) => {
      let t = 0;
      while (b.x > bounds.left && t < 3) {
        advance(b, 1 / 60, free(LEFT));
        t += 1 / 60;
      }
      return t;
    };
    expect(timeToWall(far)).toBeLessThan(0.75);
    expect(timeToWall(near)).toBeLessThan(0.2);
  });

  it("never leaves the screen, whatever the throw", () => {
    for (let i = 0; i < 200; i++) {
      const a = i * 0.71;
      const { b, wall } = thrown(100 + (i * 37) % 1200, 100 + (i * 53) % 700, Math.cos(a) * MAX_THROW, Math.sin(a) * MAX_THROW);
      for (let f = 0; f < 120; f++) {
        advance(b, 1 / 60, free(wall));
        expect(b.x).toBeGreaterThanOrEqual(bounds.left);
        expect(b.x).toBeLessThanOrEqual(bounds.right);
        expect(b.y).toBeGreaterThanOrEqual(bounds.top);
        expect(b.y).toBeLessThanOrEqual(bounds.bottom);
      }
    }
  });

  it("squashes against the wall when it meets it", () => {
    const { b, wall } = thrown(700, 450, 2600, 0);
    const hits: Hit[] = [];
    while (!hits.length) advance(b, 1 / 60, free(wall), hits);
    expect(hits[0].speed).toBeGreaterThan(1500);
    fly(b, 0.06, free(wall));
    const [a, , , d] = strainMatrix(b.e1, b.e2);
    expect(a).toBeLessThan(1);
    expect(d).toBeGreaterThan(1);
  });

  it("lands in the same place on a 30 Hz and a 144 Hz screen", () => {
    const slow = createBody(300, 300);
    const fast = createBody(300, 300);
    slow.vx = fast.vx = 1800;
    slow.vy = fast.vy = -300;
    fly(slow, 2, free(RIGHT), 30);
    fly(fast, 2, free(RIGHT), 144);
    expect(slow.x).toBe(bounds.right);
    expect(fast.x).toBe(bounds.right);
    expect(Math.abs(slow.y - fast.y)).toBeLessThan(6);
  });

  it("does not jump after a long frame", () => {
    const b = createBody(700, 400);
    advance(b, 30, free(RIGHT));
    expect(b.x).toBeLessThan(760);
  });

  it("follows the pointer and settles on it while held", () => {
    const b = createBody(200, 200);
    fly(b, 0.5, { ...free(RIGHT), grab: { x: 500, y: 420 }, lift: 1 });
    expect(b.x).toBeCloseTo(500, 0);
    expect(b.y).toBeCloseTo(420, 0);
    expect(b.lift).toBeCloseTo(1, 1);
  });

  it("stops against a wall while held, and squashes against it", () => {
    const b = createBody(200, 400);
    const hits = fly(b, 1, { ...free(RIGHT), grab: { x: -300, y: 400 } });
    expect(b.x).toBe(bounds.left);
    expect(b.vx).toBeCloseTo(0, 0);
    expect(hits.length).toBeGreaterThan(0);
    // Narrower across the wall than along it.
    const [a, , , d] = strainMatrix(b.e1, b.e2);
    expect(a).toBeLessThan(1);
    expect(d).toBeGreaterThan(1);
  });

  it("goes straight to its wall with reduced motion", () => {
    const b = createBody(200, 200);
    b.vx = 900;
    b.e1 = 0.2;
    place(b, free(LEFT));
    expect(b.x).toBe(bounds.left);
    expect(b.y).toBe(200);
    expect(b.vx).toBe(0);
    expect(b.e1).toBe(0);
  });
});

describe("arrow keys on a wall", () => {
  it("slide along it, cross away from it, and do nothing into it", () => {
    expect(arrowMove(RIGHT, 0, -1)).toBe("slide");
    expect(arrowMove(RIGHT, 0, 1)).toBe("slide");
    expect(arrowMove(RIGHT, -1, 0)).toBe("cross");
    expect(arrowMove(RIGHT, 1, 0)).toBe("none");
    expect(arrowMove(TOP, 1, 0)).toBe("slide");
    expect(arrowMove(TOP, 0, 1)).toBe("cross");
    expect(arrowMove(TOP, 0, -1)).toBe("none");
  });

  it("know the far side", () => {
    expect(opposite(RIGHT)).toEqual(LEFT);
    expect(opposite(LEFT)).toEqual(RIGHT);
    expect(opposite(TOP)).toEqual(BOTTOM);
    expect(opposite(BOTTOM)).toEqual(TOP);
  });
});

describe("the speed of a release", () => {
  const moving = [
    { x: 0, y: 0, t: 1000 },
    { x: 50, y: 0, t: 1020 },
    { x: 100, y: 0, t: 1040 },
    { x: 150, y: 0, t: 1060 },
  ];

  it("throws at the speed the pointer was moving", () => {
    expect(throwVelocity(moving, 1065).x).toBeCloseTo(2500);
  });

  it("throws nothing if the pointer paused first", () => {
    expect(throwVelocity(moving, 1200)).toEqual({ x: 0, y: 0 });
  });

  it("ignores old movement", () => {
    const v = throwVelocity([{ x: 0, y: 0, t: 500 }, { x: 900, y: 0, t: 600 }, { x: 910, y: 0, t: 1000 }, { x: 920, y: 0, t: 1020 }], 1020);
    expect(v.x).toBeCloseTo(500);
  });

  it("limits the throw", () => {
    const v = throwVelocity([{ x: 0, y: 0, t: 0 }, { x: 4000, y: 3000, t: 50 }], 50);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(MAX_THROW);
  });
});

describe("the orb's shape", () => {
  it("keeps its area however it is squashed", () => {
    for (const [e1, e2] of [[0.3, 0], [0, -0.34], [0.2, 0.2], [-0.1, 0.05]]) {
      const [a, b, c, d] = strainMatrix(e1, e2);
      expect(a * d - b * c).toBeCloseTo(1, 10);
    }
  });

  it("is the identity at rest", () => {
    expect(strainMatrix(0, 0)).toEqual([1, 0, 0, 1]);
  });
});

describe("the hex shell", () => {
  it.each([3, 4, 5, 6])("has twelve pentagons and otherwise hexagons at frequency %i", (f) => {
    const { plates } = hexSphere(f);
    expect(plates).toHaveLength(10 * f * f + 2);
    expect(plates.filter((p) => p.corners.length === 5)).toHaveLength(12);
    expect(plates.filter((p) => p.corners.length === 6)).toHaveLength(plates.length - 12);
  });

  it("winds every plate counter-clockwise from outside, so back-face culling works", () => {
    for (const { center, corners } of hexSphere(4).plates) {
      for (let i = 0; i < corners.length; i++) {
        const p = corners[i];
        const q = corners[(i + 1) % corners.length];
        const nx = p[1] * q[2] - p[2] * q[1];
        const ny = p[2] * q[0] - p[0] * q[2];
        const nz = p[0] * q[1] - p[1] * q[0];
        expect(nx * center[0] + ny * center[1] + nz * center[2]).toBeGreaterThan(0);
      }
    }
  });

  it("winds the core outward too, so culling never removes it", () => {
    for (const [p, q, r] of hexSphere(4).triangles) {
      const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      expect(n[0] * p[0] + n[1] * p[1] + n[2] * p[2]).toBeGreaterThan(0);
    }
  });

  it("builds whole triangles", () => {
    const v = shellVertices(4, 0.12);
    expect(v.length % STRIDE).toBe(0);
    expect((v.length / STRIDE) % 3).toBe(0);
    expect(v.every(Number.isFinite)).toBe(true);
  });
});

describe("the chat box beside the orb", () => {
  const W = 400;
  const H = 620;

  it("opens on the side with more room", () => {
    expect(placePanel({ x: 1300, y: 500 }, 36, 1440, 900, W, H, 14, 16, 0).side).toBe(-1);
    expect(placePanel({ x: 120, y: 500 }, 36, 1440, 900, W, H, 14, 16, 0).side).toBe(1);
  });

  it("stays on its side while it fits, then changes", () => {
    expect(placePanel({ x: 1000, y: 500 }, 36, 1440, 900, W, H, 14, 16, 1).side).toBe(-1 as Side);
    expect(placePanel({ x: 800, y: 500 }, 36, 1440, 900, W, H, 14, 16, 1).side).toBe(1);
    expect(placePanel({ x: 800, y: 500 }, 36, 1440, 900, W, H, 14, 16, -1).side).toBe(-1);
  });

  it("is always on screen", () => {
    for (let x = 46; x <= 1394; x += 90) {
      for (let y = 46; y <= 854; y += 90) {
        const p = placePanel({ x, y }, 36, 1440, 900, W, H, 14, 16, 0);
        expect(p.x).toBeGreaterThanOrEqual(16);
        expect(p.x + W).toBeLessThanOrEqual(1424);
        expect(p.y).toBeGreaterThanOrEqual(16);
        expect(p.y + H).toBeLessThanOrEqual(884);
      }
    }
  });

  it("never covers the orb when there is room beside it", () => {
    for (let x = 46; x <= 1394; x += 90) {
      const p = placePanel({ x, y: 400 }, 36, 1440, 900, W, H, 14, 16, 0);
      expect(p.x + W <= x - 36 || p.x >= x + 36).toBe(true);
    }
  });
});

describe("the socket in the top bar", () => {
  const seat = { x: 1391, y: 38 };
  const r = 32.5;

  it("leaves a held orb alone when it is far from the socket", () => {
    expect(seatPull({ x: 1200, y: 300 }, seat, r)).toEqual({ x: 1200, y: 300 });
  });

  it("draws a held orb in as it nears, then holds it in the socket", () => {
    const far = seatPull({ x: seat.x - 70, y: seat.y + 10 }, seat, r);
    const near = seatPull({ x: seat.x - 40, y: seat.y + 10 }, seat, r);
    // Pulled some of the way, and more of the way the nearer it is.
    expect(far.x).toBeGreaterThan(seat.x - 70);
    expect((near.x - (seat.x - 40)) / 40).toBeGreaterThan((far.x - (seat.x - 70)) / 70);
    expect(seatPull({ x: seat.x - 20, y: seat.y + 5 }, seat, r)).toEqual(seat);
  });

  it("takes a dropped orb in from nearby, but not one flung away or dropped far off", () => {
    expect(snapsIn({ x: seat.x - 80, y: seat.y + 30 }, { x: 0, y: 0 }, seat, r)).toBe(true);
    expect(snapsIn({ x: seat.x - 80, y: seat.y + 30 }, { x: 1200, y: 400 }, seat, r)).toBe(true);
    expect(snapsIn({ x: seat.x - 80, y: seat.y + 30 }, { x: -1500, y: 600 }, seat, r)).toBe(false);
    expect(snapsIn({ x: seat.x - 200, y: seat.y + 30 }, { x: 0, y: 0 }, seat, r)).toBe(false);
  });

  it("clicks into the socket quickly and stays there", () => {
    const b = createBody(seat.x - 80, seat.y + 40);
    const input: Input = { radius: r, bounds: { ...bounds, top: 38, right: 1391 }, grab: null, home: seat, snap: true, wall: RIGHT, lift: 0 };
    fly(b, 0.35, input);
    expect(Math.hypot(b.x - seat.x, b.y - seat.y)).toBeLessThan(2);
    fly(b, 1, input);
    expect(Math.hypot(b.x - seat.x, b.y - seat.y)).toBeLessThan(0.5);
  });
});
