#!/usr/bin/env python3
"""
Low-poly 3D renders for the sign-in scene (src/components/signin/SignInScene.tsx): the Main Building and
the Benavides monument, modelled here from primitives and rendered flat-shaded by night in the scene's
gold light. Nothing is traced from a photograph.

    python3 -I scripts/signin-scene/render.py            # from the repo root; writes both renders
    python3 -I scripts/signin-scene/render.py --preview  # quarter-size, for quick looks

Writes public/images/main-building-3d.webp and benavides-3d.webp, and prints where the lamps, clock and cross
fall in the building's render: SceneLight shines them from TOWN_LIGHTS in sceneGeometry.ts, so paste the
printed block there whenever the camera or the lamps move.

The renderer is a small z-buffer rasteriser: every facet keeps one normal (flat shading) while the lamps fall
off per pixel, emissive glass blooms, and the silhouette catches the glow behind it (light wrap).
"""
import sys
import numpy as np
from scipy.spatial import ConvexHull, Delaunay
from scipy.ndimage import gaussian_filter
from PIL import Image

PREVIEW = "--preview" in sys.argv
ROOT = "."


def nrm(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- materials
# albedo (linear), specular strength, shininess, facet jitter (per facet brightness scatter)
MATS = {
    "stone": ((0.14, 0.1, 0.064), 0.05, 6, 0.06),
    "trim": ((0.24, 0.17, 0.10), 0.08, 8, 0.05),
    "reveal": ((0.10, 0.07, 0.045), 0.0, 4, 0.02),
    "glass": ((0.012, 0.010, 0.008), 0.5, 30, 0.0),
    "iron": ((0.035, 0.027, 0.02), 0.3, 16, 0.05),
    "bronze": ((0.27, 0.165, 0.07), 0.6, 20, 0.05),
    "patina": ((0.085, 0.055, 0.028), 0.45, 16, 0.07),
    "gold": ((0.9, 0.7, 0.36), 1.1, 34, 0.12),
    "granite": ((0.06, 0.046, 0.034), 0.16, 10, 0.1),
    "ground": ((0.13, 0.092, 0.058), 0.22, 9, 0.16),
    "leaf": ((0.05, 0.055, 0.022), 0.05, 6, 0.22),
    "lamp": ((0.9, 0.7, 0.4), 0.0, 4, 0.0),
    "inside": ((0.30, 0.19, 0.09), 0.0, 4, 0.04),
}
MAT_ID = {k: i for i, k in enumerate(MATS)}

WARM = np.array([1.0, 0.66, 0.30])
PALE = np.array([1.0, 0.84, 0.58])


# ---------------------------------------------------------------- mesh
class Mesh:
    """Triangles with a material, an emission, a shading group (facets in one group shade as one plane), and
    either an outward normal (culled when facing away) or none (two-sided)."""

    def __init__(self):
        self.V, self.O, self.M, self.E, self.G, self.T, self.J = [], [], [], [], [], [], []
        self.ng = 0

    def group(self):
        self.ng += 1
        return self.ng - 1

    def add(self, tris, mat, emit=None, gid=None, per_tri=False, out=None, tag=0, tilt=0.0):
        tris = np.asarray(tris, float).reshape(-1, 3, 3)
        if not len(tris):
            return
        n = len(tris)
        self.V.append(tris)
        o = np.full((n, 3), np.nan) if out is None else np.broadcast_to(np.asarray(out, float), (n, 3)).copy()
        self.O.append(o)
        self.M.append(np.full(n, MAT_ID[mat]))
        e = np.zeros((n, 3)) if emit is None else np.broadcast_to(np.asarray(emit, float), (n, 3)).copy()
        self.E.append(e)
        if per_tri:
            g = np.arange(self.ng, self.ng + n)
            self.ng += n
        elif gid is None:
            g = np.full(n, self.group())
        else:
            g = np.broadcast_to(np.asarray(gid), (n,)).copy()
        self.G.append(g)
        self.T.append(np.full(n, tag))
        self.J.append(np.full(n, tilt))

    def hull(self, pts, mat, emit=None, facet=False, tag=0):
        pts = np.asarray(pts, float)
        h = ConvexHull(pts)
        tris = pts[h.simplices]
        out = h.equations[:, :3]
        if facet:
            self.add(tris, mat, emit, per_tri=True, out=out, tag=tag)
        else:
            # one group per plane, so a box face shades as one face
            key = np.round(h.equations, 3)
            _, inv = np.unique(key, axis=0, return_inverse=True)
            base = self.ng
            self.ng += int(inv.max()) + 1
            self.add(tris, mat, emit, gid=base + inv.ravel(), out=out, tag=tag)

    def extend(self, other, fn):
        """Append another mesh through a point transform `fn` (rotation + scale + translation)."""
        base = self.ng
        for V, O, M, E, G, T, J in zip(other.V, other.O, other.M, other.E, other.G, other.T, other.J):
            v = fn(V.reshape(-1, 3)).reshape(V.shape)
            o = O.copy()
            ok = ~np.isnan(o[:, 0])
            if ok.any():
                # transform normals by the rotation part only (uniform scale)
                o[ok] = nrm(fn(o[ok]) - fn(np.zeros((1, 3))))
            self.V.append(v)
            self.O.append(o)
            self.M.append(M)
            self.E.append(E)
            self.G.append(G + base)
            self.T.append(T)
            self.J.append(J)
        self.ng += other.ng

    def arrays(self):
        V = np.concatenate(self.V)
        O = np.concatenate(self.O)
        N = np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0])
        ln = np.linalg.norm(N, axis=1)
        keep = ln > 1e-12
        N = N / np.where(ln > 0, ln, 1)[:, None]
        two = np.isnan(O[:, 0])
        flip = ~two & ((N * np.nan_to_num(O)).sum(1) < 0)
        N[flip] *= -1
        J = np.concatenate(self.J)
        rng = np.random.default_rng(29)
        NS = nrm(N + rng.normal(0, 1, N.shape) * J[:, None])
        return dict(
            V=V[keep], N=N[keep], NS=NS[keep], two=two[keep], M=np.concatenate(self.M)[keep],
            E=np.concatenate(self.E)[keep], G=np.concatenate(self.G)[keep], T=np.concatenate(self.T)[keep], ng=self.ng,
        )


def quad(a, b, c, d):
    return [[a, b, c], [a, c, d]]


def box_points(u0, u1, v0, v1, d0, d1, bevel=0.0):
    if bevel <= 0:
        return np.array([[u, v, d] for u in (u0, u1) for v in (v0, v1) for d in (d0, d1)], float)
    c = np.array([(u0 + u1) / 2, (v0 + v1) / 2, (d0 + d1) / 2])
    h = np.array([abs(u1 - u0) / 2, abs(v1 - v0) / 2, abs(d1 - d0) / 2])
    b = min(bevel, *(h * 0.45))
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                s = np.array([sx, sy, sz])
                pts += [c + s * (h - [0, b, b]), c + s * (h - [b, 0, b]), c + s * (h - [b, b, 0])]
    return np.array(pts)


FRONT = (np.zeros(3), np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]))


def frame(O=(0, 0, 0), U=(1, 0, 0), V=(0, 1, 0), N=(0, 0, 1)):
    return tuple(np.asarray(a, float) for a in (O, U, V, N))


def lbox(m, F, u0, u1, v0, v1, d0, d1, mat, bevel=0.0, emit=None, facet=False, tag=0):
    """A box in a wall's own frame: u along it, v up it, d out of it."""
    O, U, V, N = F
    p = box_points(u0, u1, v0, v1, d0, d1, bevel)
    m.hull(O + p[:, :1] * U + p[:, 1:2] * V + p[:, 2:3] * N, mat, emit, facet, tag)


def box(m, x0, x1, y0, y1, z0, z1, mat, bevel=0.0, emit=None, facet=False, tag=0):
    m.hull(box_points(x0, x1, y0, y1, z0, z1, bevel), mat, emit, facet, tag)


def prism(m, cx, cz, y0, y1, r0, r1=None, sides=8, rot=0.0, mat="stone", facet=False, emit=None, tag=0):
    r1 = r0 if r1 is None else r1
    a = rot + np.arange(sides) * 2 * np.pi / sides
    pts = [[cx + r0 * np.cos(t), y0, cz + r0 * np.sin(t)] for t in a]
    pts += [[cx, y1, cz]] if r1 <= 0 else [[cx + r1 * np.cos(t), y1, cz + r1 * np.sin(t)] for t in a]
    m.hull(pts, mat, emit, facet, tag)


def dome(m, cx, cy, cz, r, h, sides=8, rings=3, mat="gold", rot=0.0, tag=0):
    pts = []
    for k in range(rings + 1):
        phi = (np.pi / 2) * k / (rings + 0.6)
        rr, yy = r * np.cos(phi), cy + h * np.sin(phi)
        off = (k % 2) * np.pi / sides
        for s in range(sides):
            t = rot + off + 2 * np.pi * s / sides
            pts.append([cx + rr * np.cos(t), yy, cz + rr * np.sin(t)])
    pts.append([cx, cy + h, cz])
    m.hull(pts, mat, facet=True, tag=tag)


def icosphere(sub=1):
    t = (1 + 5**0.5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
         (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6),
         (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7),
         (9, 8, 1)]
    v = [np.array(p, float) / np.linalg.norm(p) for p in v]
    for _ in range(sub):
        cache, nf = {}, []

        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                p = v[a] + v[b]
                v.append(p / np.linalg.norm(p))
                cache[k] = len(v) - 1
            return cache[k]

        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        f = nf
    return np.array(v), np.array(f)


def blob(m, c, r, rng, mat="leaf", sub=1, jitter=0.22, squash=(1, 1, 1), emit=None, tag=0):
    v, _ = icosphere(sub)
    v = v * (1 + rng.uniform(-jitter, jitter, (len(v), 1))) * np.asarray(squash) * r + np.asarray(c)
    m.hull(v, mat, emit, facet=True, tag=tag)


def wall(m, F, u0, u1, v0, v1, holes, mat="stone", depth=0.42):
    """A flat wall in frame F, cut by rectangular openings (each a dict u0 u1 v0 v1 and pane, emit, depth,
    arch). Each opening gets its four reveals and a pane at the back; the glass splits along its diagonal
    into two facets so it reads cut, not printed."""
    O, U, V, N = F
    P = lambda u, v, d=0.0: O + u * U + v * V - d * N
    us = sorted({u0, u1, *[h["u0"] for h in holes], *[h["u1"] for h in holes]})
    vs = sorted({v0, v1, *[h["v0"] for h in holes], *[h["v1"] for h in holes]})
    cells = []
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            cu, cv = (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2
            if not (u0 < cu < u1 and v0 < cv < v1):
                continue
            if any(h["u0"] < cu < h["u1"] and h["v0"] < cv < h["v1"] for h in holes):
                continue
            a, b, c, d = P(us[i], vs[j]), P(us[i + 1], vs[j]), P(us[i + 1], vs[j + 1]), P(us[i], vs[j + 1])
            cells += quad(a, b, c, d) if (i + j) % 2 else [[a, b, d], [b, c, d]]
    m.add(cells, mat, out=N, per_tri=True, tilt=0.045)
    for h in holes:
        a0, a1, b0, b1 = h["u0"], h["u1"], h["v0"], h["v1"]
        dd = h.get("depth", depth)
        rv = h.get("reveal", "reveal")
        m.add(quad(P(a0, b0), P(a0, b1), P(a0, b1, dd), P(a0, b0, dd)), rv, out=U, emit=h.get("rev_emit"))
        m.add(quad(P(a1, b0), P(a1, b1), P(a1, b1, dd), P(a1, b0, dd)), rv, out=-U, emit=h.get("rev_emit"))
        m.add(quad(P(a0, b0), P(a1, b0), P(a1, b0, dd), P(a0, b0, dd)), "trim", out=V)
        m.add(quad(P(a0, b1), P(a1, b1), P(a1, b1, dd), P(a0, b1, dd)), rv, out=-V, emit=h.get("rev_emit"))
        e = np.asarray(h.get("emit", (0, 0, 0)), float)
        pa, pb, pc, pd = P(a0, b0, dd), P(a1, b0, dd), P(a1, b1, dd), P(a0, b1, dd)
        pane = h.get("pane", "glass")
        m.add([[pa, pb, pc]], pane, emit=e, out=N)
        m.add([[pa, pc, pd]], pane, emit=e * h.get("split", 0.8), out=N)
        if h.get("arch"):
            # spandrels close the opening's top corners down to a polygonal arch
            R = (a1 - a0) / 2
            uc, vs_ = (a0 + a1) / 2, b1 - R
            ang = np.linspace(np.pi, 0, 9)
            arc = [P(uc + R * np.cos(t), vs_ + R * np.sin(t), -0.002) for t in ang]
            cl, cr = P(a0, b1, -0.002), P(a1, b1, -0.002)
            tris = [[cl, arc[k], arc[k + 1]] for k in range(4)] + [[cr, arc[k], arc[k + 1]] for k in range(4, 8)]
            m.add(tris, mat, out=N)


def block(m, x0, x1, y0, y1, z0, z1, front=(), right=(), left=(), mat="stone", depth=0.42):
    """A solid with its front, sides and top built as walls, so openings in them read as openings."""
    wall(m, frame((0, 0, z1)), x0, x1, y0, y1, list(front), mat, depth)
    wall(m, frame((x1, 0, z1), U=(0, 0, -1), N=(1, 0, 0)), 0, z1 - z0, y0, y1, list(right), mat, depth)
    wall(m, frame((x0, 0, z0), U=(0, 0, 1), N=(-1, 0, 0)), 0, z1 - z0, y0, y1, list(left), mat, depth)
    m.add(quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]), mat, out=[0, 1, 0])


# ---------------------------------------------------------------- figure (friar statues)
def ring(y, rx, rz, M, cz=0.0, fold=0.0, k=7, fphase=0.0, sq=2.0, a0=0.0, a1=2 * np.pi, closed=True):
    th = a0 + (np.arange(M) / (M if closed else M - 1)) * (a1 - a0)
    c, s = np.cos(th), np.sin(th)
    ex = np.sign(c) * np.abs(c) ** (2 / sq)
    ez = np.sign(s) * np.abs(s) ** (2 / sq)
    f = 1 + fold * np.sin(k * th + fphase) + 0.5 * fold * np.sin(2.3 * k * th + 1.7 * fphase)
    return np.stack([rx * ex * f, np.full(M, y), cz + rz * ez * f], 1)


def loft(m, rings, mat, closed=True, cap0=False, cap1=False, tag=0):
    tris = []
    n = len(rings[0])
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for j in range(n if closed else n - 1):
            k = (j + 1) % n
            tris += [[A[j], A[k], B[k]], [A[j], B[k], B[j]]]
    for cap, R in ((cap0, rings[0]), (cap1, rings[-1])):
        if cap:
            c = R.mean(0)
            tris += [[c, R[j], R[(j + 1) % n]] for j in range(n)]
    m.add(tris, mat, per_tri=True, tag=tag, tilt=0.015)


def tube(m, path, radii, droop=None, drop=None, sides=7, mat="bronze", cap0=True, cap1=True, tag=0):
    path = np.asarray(path, float)
    n = len(path)
    rings = []
    for i in range(n):
        T = nrm(path[min(i + 1, n - 1)] - path[max(i - 1, 0)])
        D = np.array([0.0, -1.0, 0.0]) - T * T[1] * -1.0
        D = D - T * np.dot(D, T)
        if np.linalg.norm(D) < 1e-6:
            D = np.array([0.0, 0.0, 1.0]) - T * T[2]
        D = nrm(D)
        B = np.cross(T, D)
        e = droop[i] if droop is not None else 1.0
        o = drop[i] if drop is not None else 0.0
        th = np.arange(sides) * 2 * np.pi / sides + 0.3
        rings.append(path[i] + D * o + np.outer(np.cos(th) * radii[i] * e, D) + np.outer(np.sin(th) * radii[i], B))
    loft(m, rings, mat, cap0=cap0, cap1=cap1, tag=tag)


def obox(m, c, axes, half, mat, bevel=0.0, tag=0):
    p = box_points(-half[0], half[0], -half[1], half[1], -half[2], half[2], bevel)
    A = np.asarray(axes, float)
    m.hull(np.asarray(c) + p @ A, mat, tag=tag)


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])


def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])


def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])


def friar(pose="benavides", seed=0, mat="bronze", detail=1.0, cape="patina"):
    """A Dominican in habit and cappa, one unit tall to the crown, facing +z. Poses: benavides (right arm
    raised, a book held to the chest), book, staff (a processional cross), bless."""
    rng = np.random.default_rng(seed)
    m = Mesh()
    cape_mat = cape
    M = int(18 * detail) if detail >= 1 else 12
    jit = lambda R, a=0.0045: R + rng.normal(0, a * 0.7, R.shape) * [1, 0.4, 1]

    # the habit: a flared hem, folds that fade toward the chest, square shoulders
    levels = [
        (0.0, 0.205, 0.170, 0.085), (0.035, 0.200, 0.166, 0.08), (0.13, 0.187, 0.152, 0.065),
        (0.26, 0.173, 0.138, 0.05), (0.39, 0.161, 0.127, 0.04), (0.51, 0.151, 0.118, 0.03),
        (0.61, 0.148, 0.115, 0.022), (0.69, 0.158, 0.118, 0.016), (0.755, 0.172, 0.110, 0.008),
        (0.79, 0.168, 0.096, 0.0), (0.815, 0.120, 0.078, 0.0), (0.838, 0.052, 0.052, 0.0),
    ]
    if detail >= 1:
        fine = []
        for a, b in zip(levels[:-1], levels[1:]):
            fine += [a, tuple((np.array(a) + np.array(b)) / 2)]
        levels = fine + [levels[-1]]
    rings = []
    for i, (y, rx, rz, f) in enumerate(levels):
        sq = 2.0 if y < 0.74 else 3.0
        rings.append(jit(ring(y, rx, rz, M, fold=f, k=7, fphase=0.5 + 0.25 * np.sin(y * 8), sq=sq), 0.004 if y < 0.8 else 0.002))
    loft(m, rings, mat, cap0=True)
    # the scapular down the front, standing just proud of the habit
    sc = []
    for y, rx, rz, f in [l for l in levels if 0.03 < l[0] < 0.8]:
        r = ring(y, rx * 1.035, rz * 1.06, 5, fold=f * 0.5, k=7, fphase=0.5, sq=2.0 if y < 0.74 else 3.0,
                 a0=np.pi / 2 - 0.36, a1=np.pi / 2 + 0.36, closed=False)
        sc.append(jit(r, 0.002))
    loft(m, sc, mat, closed=False)
    # the cappa: open at the front, hanging from the shoulders to just above the hem
    cl = [(0.795, 0.180, 0.110, 0.0, 1.0), (0.70, 0.188, 0.135, 0.02, 1.0), (0.52, 0.196, 0.150, 0.04, 1.0),
          (0.30, 0.212, 0.168, 0.055, 1.0), (0.10, 0.226, 0.186, 0.07, 1.0), (0.03, 0.230, 0.19, 0.075, 1.0)]
    cape = []
    for y, rx, rz, f, _ in cl:
        r = ring(y, rx, rz, int(M * 0.9), fold=f, k=9, fphase=1.1, sq=2.0 if y < 0.74 else 2.8,
                 a0=np.pi / 2 + 1.05, a1=np.pi / 2 + 2 * np.pi - 1.05, closed=False)
        cape.append(jit(r, 0.004))
    loft(m, cape, cape_mat, closed=False)
    # the folded hood about the neck
    hood = [jit(ring(0.80, 0.125, 0.10, 12, cz=-0.012, sq=2.4), 0.003), jit(ring(0.835, 0.10, 0.085, 12, cz=-0.02), 0.003),
            jit(ring(0.852, 0.07, 0.066, 12, cz=-0.01), 0.002)]
    loft(m, hood, cape_mat)
    # neck and head
    tube(m, [[0, 0.83, 0.004], [0, 0.875, 0.01]], [0.036, 0.034], sides=7, mat=mat)
    v, _ = icosphere(1)
    v = v * (1 + rng.uniform(-0.05, 0.05, (len(v), 1)))
    v = v * [0.060, 0.076, 0.066] + [0, 0.912, 0.012]
    front = v[:, 2] > 0.06
    v[front & (np.abs(v[:, 0]) < 0.02) & (np.abs(v[:, 1] - 0.905) < 0.02), 2] += 0.012  # the nose
    if pose == "benavides":
        # as the bronze stands: the head turned a little to his left and bowed toward the people below
        head = np.array([0, 0.912, 0.012])
        v = (v - head) @ rot_y(0.3) @ rot_x(0.12) + head
    m.hull(v, mat, facet=True)

    def hand(c, up, side, mat_=mat, finger=False):
        """A hand about `c`: fingers along `up`, `side` toward the thumb, the palm facing out of side x up."""
        up = nrm(up)
        side = nrm(side - up * np.dot(side, up))
        fwd = np.cross(side, up)
        if not finger:
            obox(m, c, [side, up, fwd], [0.021, 0.026, 0.016], mat_, bevel=0.007)
            return
        # pointing upward: the three last fingers curled into the palm, the index finger raised from the thumb
        # side of the fist, and the thumb folded across the curled fingers in front. (A lone finger from the
        # middle of a fist reads as a rude gesture.)
        obox(m, c, [side, up, fwd], [0.019, 0.022, 0.017], mat_, bevel=0.007)
        obox(m, c + fwd * 0.012 + up * 0.006 - side * 0.003, [side, up, fwd], [0.015, 0.011, 0.008], mat_, bevel=0.005)
        base = c + up * 0.014 + side * 0.0105 + fwd * 0.003
        tip = base + nrm(up + side * 0.07) * 0.052
        tube(m, [base, base + (tip - base) * 0.5, tip], [0.0084, 0.0075, 0.0062], sides=6, mat=mat_)
        tube(m, [c + side * 0.018 - up * 0.008 + fwd * 0.006, c + side * 0.004 + up * 0.0 + fwd * 0.021],
             [0.0074, 0.006], sides=6, mat=mat_)

    def sleeve(path, radii, droop, drop, skin=None, cap=False):
        tube(m, path, radii, droop, drop, sides=8, mat=mat, cap0=False, cap1=cap)
        if skin is not None:
            tube(m, skin, [0.022, 0.02], sides=6, mat=mat)

    book_at = None
    if pose == "benavides":
        # the right arm raised high, the sleeve falling back from the forearm
        sleeve([[-0.15, 0.78, -0.004], [-0.215, 0.85, 0.008], [-0.262, 0.935, 0.025], [-0.296, 1.02, 0.042]],
               [0.048, 0.05, 0.053, 0.06], [1.0, 1.12, 1.35, 1.6], [0.0, 0.006, 0.016, 0.03],
               skin=[[-0.288, 0.99, 0.04], [-0.326, 1.118, 0.051]])
        hand(np.array([-0.330, 1.128, 0.052]), [-0.25, 1, 0.05], [1, 0.2, 0], finger=True)
        book_at = "chest"
    elif pose == "bless":
        sleeve([[-0.15, 0.78, 0.0], [-0.2, 0.72, 0.06], [-0.22, 0.73, 0.15], [-0.215, 0.77, 0.22]],
               [0.056, 0.06, 0.068, 0.08], [1.1, 1.4, 2.0, 2.3], [0.0, 0.01, 0.04, 0.06],
               skin=[[-0.215, 0.76, 0.2], [-0.21, 0.82, 0.25]])
        hand(np.array([-0.208, 0.855, 0.258]), [0.05, 1, 0.3], [1, 0, 0], finger=True)
        book_at = "chest"
    elif pose == "staff":
        sleeve([[-0.15, 0.78, 0.0], [-0.19, 0.66, 0.04], [-0.18, 0.60, 0.12], [-0.15, 0.62, 0.17]],
               [0.056, 0.06, 0.068, 0.08], [1.1, 1.5, 2.2, 2.4], [0.0, 0.01, 0.05, 0.07])
        c = np.array([-0.14, 0.64, 0.19])
        hand(c, [0, 1, 0], [1, 0, 0.2])
        tube(m, [[-0.14, 0.02, 0.19], [-0.14, 1.32, 0.19]], [0.011, 0.011], sides=5, mat=mat)
        tube(m, [[-0.14, 1.28, 0.19], [-0.14, 1.45, 0.19]], [0.016, 0.016], sides=5, mat=mat)
        tube(m, [[-0.215, 1.39, 0.19], [-0.065, 1.39, 0.19]], [0.014, 0.014], sides=5, mat=mat)
        book_at = "low"
    else:
        sleeve([[-0.15, 0.78, 0.0], [-0.19, 0.64, 0.02], [-0.2, 0.52, 0.05]], [0.056, 0.06, 0.07],
               [1.1, 1.6, 2.3], [0.0, 0.02, 0.05])
        hand(np.array([-0.195, 0.46, 0.07]), [0, -1, 0.15], [1, 0, 0])
        book_at = "chest"
    # the left arm: elbow down, the book held against the chest
    if book_at == "chest":
        sleeve([[0.15, 0.78, 0.0], [0.18, 0.68, 0.035], [0.17, 0.625, 0.085], [0.128, 0.636, 0.128]],
               [0.046, 0.048, 0.05, 0.054], [1.0, 1.1, 1.3, 1.45], [0.0, 0.006, 0.016, 0.026])
        A = rot_z(0.3) @ rot_x(-0.3)
        obox(m, [0.07, 0.69, 0.142], A, [0.058, 0.078, 0.013], mat, bevel=0.005)
        # the hand lies flat across the book's lower corner
        obox(m, np.array([0.07, 0.69, 0.142]) + np.array([0.034, -0.05, 0.016]) @ A, A, [0.03, 0.02, 0.009], mat, bevel=0.006)
    else:
        sleeve([[0.15, 0.78, 0.0], [0.19, 0.64, 0.02], [0.2, 0.52, 0.06]], [0.056, 0.06, 0.07],
               [1.1, 1.6, 2.3], [0.0, 0.02, 0.05])
        obox(m, [0.2, 0.47, 0.11], rot_z(-0.1), [0.018, 0.09, 0.065], mat, bevel=0.005)
    # the feet below the hem
    for x in (-0.06, 0.06):
        obox(m, [x, 0.016, 0.16], rot_y(0.12 * np.sign(x)), [0.04, 0.016, 0.055], mat, bevel=0.01)
    return m


# ---------------------------------------------------------------- camera, raster, shading
class Cam:
    """A level camera with a shifted lens, so verticals stay vertical, as an architect draws them."""

    def __init__(self, C, look, W, H, fpx, cx, cy):
        self.C = np.asarray(C, float)
        f = np.asarray(look, float) - self.C
        f[1] = 0
        self.f = nrm(f)
        self.r = nrm(np.cross(self.f, [0, 1, 0]))
        self.u = np.array([0.0, 1, 0])
        self.W, self.H, self.fpx, self.cx, self.cy = W, H, fpx, cx, cy

    def project(self, P):
        d = np.asarray(P, float) - self.C
        z = d @ self.f
        return np.stack([self.cx + self.fpx * (d @ self.r) / z, self.cy - self.fpx * (d @ self.u) / z], -1), z


def rasterize(A, cam):
    V, N, two = A["V"], A["N"], A["two"]
    W, H = cam.W, cam.H
    S, Z = cam.project(V.reshape(-1, 3))
    S = S.reshape(-1, 3, 2)
    Z = Z.reshape(-1, 3)
    cen = V.mean(1)
    facing = ((cam.C - cen) * N).sum(1) > 0
    ok = (Z > 0.05).all(1) & (two | facing)
    idbuf = np.full((H, W), -1, np.int32)
    wbuf = np.zeros((H, W), np.float32)
    order = np.nonzero(ok)[0]
    for i in order:
        (x0, y0), (x1, y1), (x2, y2) = S[i]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9:
            continue
        mnx = max(int(np.floor(min(x0, x1, x2))), 0)
        mxx = min(int(np.ceil(max(x0, x1, x2))), W - 1)
        mny = max(int(np.floor(min(y0, y1, y2))), 0)
        mxy = min(int(np.ceil(max(y0, y1, y2))), H - 1)
        if mnx > mxx or mny > mxy:
            continue
        X = np.arange(mnx, mxx + 1, dtype=np.float32)[None, :] + 0.5
        Y = np.arange(mny, mxy + 1, dtype=np.float32)[:, None] + 0.5
        w0 = ((x1 - X) * (y2 - Y) - (x2 - X) * (y1 - Y)) / area
        w1 = ((x2 - X) * (y0 - Y) - (x0 - X) * (y2 - Y)) / area
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        iz = w0 / Z[i, 0] + w1 / Z[i, 1] + w2 / Z[i, 2]
        sub = wbuf[mny:mxy + 1, mnx:mxx + 1]
        hit = inside & (iz > sub)
        sub[hit] = iz[hit]
        idbuf[mny:mxy + 1, mnx:mxx + 1][hit] = i
    return idbuf, wbuf


def shade(A, cam, idbuf, wbuf, rig, seed=7, mirror=False):
    rng = np.random.default_rng(seed)
    H, W = idbuf.shape
    alb = np.array([MATS[k][0] for k in MATS])[A["M"]]
    ks = np.array([MATS[k][1] for k in MATS])[A["M"]]
    sh = np.array([MATS[k][2] for k in MATS])[A["M"]]
    jit = np.array([MATS[k][3] for k in MATS])[A["M"]]
    scatter = rng.normal(0, 1, A["ng"])[A["G"]]
    alb = alb * np.clip(1 + jit * scatter, 0.4, 1.8)[:, None]
    out = np.zeros((H, W, 3), np.float32)
    step = 256
    for y0 in range(0, H, step):
        ids = idbuf[y0:y0 + step]
        yy, xx = np.nonzero(ids >= 0)
        if not len(yy):
            continue
        t = ids[yy, xx]
        z = 1.0 / wbuf[y0:y0 + step][yy, xx]
        a = ((xx + 0.5 - cam.cx) / cam.fpx)[:, None]
        b = ((yy + y0 + 0.5 - cam.cy) / cam.fpx)[:, None]
        P = cam.C + z[:, None] * (cam.f + a * cam.r - b * cam.u)
        Vv = cam.C - P
        Vv /= np.linalg.norm(Vv, axis=1, keepdims=True)
        n = A["NS"][t].copy()
        back = (A["N"][t] * Vv).sum(1) < 0
        n[back] *= -1
        if mirror:
            # the reflection: light the point it mirrors, seen from the mirrored eye
            P = P * [1, -1, 1]
            n = n * [1, -1, 1]
            Vv = Vv * [1, -1, 1]
        c = rig(P, n, Vv, t, alb[t], ks[t], sh[t], A)
        out[y0 + yy, xx] = c + A["E"][t]
    return out


def lambert_blinn(P, n, Vv, ks, sh, Ld, col, att=1.0):
    ndl = np.clip((n * Ld).sum(1), 0, None)
    Hh = nrm(Ld + Vv)
    sp = np.clip((n * Hh).sum(1), 0, None) ** sh[:] * (ndl > 0)
    a = att if np.isscalar(att) else att[:, None]
    return ndl[:, None] * col * a, (ks * sp)[:, None] * col * a


def aces(x):
    return np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)


GRADE = np.array([[0.0, 0.012, 0.009, 0.006], [0.18, 0.13, 0.075, 0.025], [0.42, 0.42, 0.26, 0.07],
                  [0.7, 0.86, 0.6, 0.24], [1.0, 1.0, 0.95, 0.8]])


def grade(rgb, k):
    l = rgb @ [0.3, 0.55, 0.15]
    ramp = np.stack([np.interp(l, GRADE[:, 0], GRADE[:, c]) for c in (1, 2, 3)], -1)
    return rgb * (1 - k) + ramp * k


def finish(hdr, cov, ss, exposure, glow_at, glow_r, wrap_col, wrap_k, bloom_k=1.0, grade_k=0.55):
    """Downsample, bloom the bright parts, tone-map, wrap the glow round the silhouette; RGBA in 0..1."""
    H, W = cov.shape
    h, w = H // ss, W // ss
    pre = (hdr * cov[..., None]).reshape(h, ss, w, ss, 3).mean((1, 3))
    alpha = cov.reshape(h, ss, w, ss).mean((1, 3))
    col = pre / np.maximum(alpha, 1e-6)[..., None] * exposure
    bright = np.clip(pre * exposure - 0.85, 0, None)
    bloom = np.zeros_like(bright)
    for s, k in ((w / 900, 0.55), (w / 260, 0.35), (w / 90, 0.22)):
        for c in range(3):
            bloom[..., c] += gaussian_filter(bright[..., c], s) * k * bloom_k
    # light wrap: the glow behind bleeds a little over every edge near it
    yy, xx = np.mgrid[0:h, 0:w]
    g = np.exp(-(((xx / w - glow_at[0]) / glow_r[0]) ** 2 + ((yy / h - glow_at[1]) / glow_r[1]) ** 2))
    edge = np.clip(gaussian_filter(1 - alpha, w / 1400) * alpha * 2.2, 0, 1)
    col = col + (edge * g)[..., None] * np.asarray(wrap_col) * wrap_k
    tm = grade(aces(col) ** (1 / 2.2), grade_k)
    bl = grade(aces(bloom) ** (1 / 2.2), grade_k * 0.6)
    prem = tm * alpha[..., None] + bl
    a = np.clip(alpha + (1 - alpha) * bl.max(-1), 0, 1)
    rgb = np.clip(prem / np.maximum(a, 1e-6)[..., None], 0, 1)
    return np.dstack([rgb, a])


def save(rgba, path, quality=90):
    im = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8))
    im.save(path, "WEBP", quality=quality, method=6, alpha_quality=100)
    print("wrote", path, im.size)


# ---------------------------------------------------------------- the Main Building
FLOORS = {"g": (1.75, 5.35), "s": (8.15, 11.75), "t": (14.35, 17.75)}
# the tag of the clock's hands, which the renders leave out (the plaza's facets are tag 1)
HANDS = 2
# the clock face's radius, inside its bronze ring
CLOCK_R = 1.72
WIN_W = 1.45


def window_light(rng, floor, force=None):
    p_lit = {"g": 0.42, "s": 0.5, "t": 0.62}[floor]
    lit = rng.random() < p_lit if force is None else force
    if not lit:
        return np.array([0.012, 0.008, 0.005])
    k = rng.uniform(0.45, 1.3)
    tone = WARM + (PALE - WARM) * rng.uniform(0, 0.7)
    return tone * k * 1.15


def dress(m, F, a0, a1, b0, b1, kind, depth=0.42):
    """Mullions, grilles, frames, sills and hoods for one window in frame F."""
    if kind == "g":
        for k in range(1, 6):
            u = a0 + (a1 - a0) * k / 6
            lbox(m, F, u - 0.03, u + 0.03, b0, b1, -depth + 0.1, -depth + 0.16, "iron")
        lbox(m, F, a0, a1, b0 + (b1 - b0) * 0.62, b0 + (b1 - b0) * 0.62 + 0.07, -depth + 0.1, -depth + 0.16, "iron")
        lbox(m, F, a0 - 0.24, a1 + 0.24, b1 + 0.02, b1 + 0.5, 0, 0.16, "trim", bevel=0.04)
        lbox(m, F, (a0 + a1) / 2 - 0.22, (a0 + a1) / 2 + 0.22, b1 - 0.1, b1 + 0.6, 0, 0.24, "trim", bevel=0.05)
        lbox(m, F, a0 - 0.16, a1 + 0.16, b0 - 0.24, b0, 0, 0.26, "trim", bevel=0.04)
        return
    um = (a0 + a1) / 2
    lbox(m, F, um - 0.045, um + 0.045, b0, b1, -depth + 0.02, -depth + 0.09, "trim")
    for f in ((0.7,) if kind == "t" else (0.34, 0.7)):
        v = b0 + (b1 - b0) * f
        lbox(m, F, a0, a1, v - 0.04, v + 0.04, -depth + 0.02, -depth + 0.09, "trim")
    lbox(m, F, a0 - 0.18, a0, b0, b1, 0, 0.1, "trim")
    lbox(m, F, a1, a1 + 0.18, b0, b1, 0, 0.1, "trim")
    lbox(m, F, a0 - 0.18, a1 + 0.18, b1, b1 + 0.18, 0, 0.1, "trim")
    lbox(m, F, a0 - 0.32, a1 + 0.32, b0 - 0.22, b0, 0, 0.3, "trim", bevel=0.05)
    if kind == "s":
        lbox(m, F, a0 - 0.2, a1 + 0.2, b1 + 0.18, b1 + 0.32, 0, 0.16, "trim")
        lbox(m, F, a0 - 0.42, a1 + 0.42, b1 + 0.32, b1 + 0.6, 0, 0.38, "trim", bevel=0.07)


def facade(m, rng, x0, x1, zf, bays, top=18.8, pil_at=(), lights=None, force=None):
    """A stretch of the three-storey front between x0 and x1 on the plane z = zf."""
    F = frame((0, 0, zf))
    holes = []
    for i, bx in enumerate(bays):
        for fl, (b0, b1) in FLOORS.items():
            e = window_light(rng, fl, None if force is None else force.get((i, fl)))
            holes.append(dict(u0=bx - WIN_W / 2, u1=bx + WIN_W / 2, v0=b0, v1=b1, emit=e, kind=fl))
            if lights is not None and fl == "g" and force is not None and force.get((i, fl)):
                lights.append((bx, (b0 + b1) / 2, zf - 0.42))
    wall(m, F, x0, x1, 0.9, top, holes)
    for h in holes:
        dress(m, F, h["u0"], h["u1"], h["v0"], h["v1"], h["kind"])
    for px in pil_at:
        lbox(m, F, px - 0.3, px + 0.3, 0.9, 18.2, 0, 0.24, "stone", bevel=0.05)
        lbox(m, F, px - 0.42, px + 0.42, 17.9, 18.3, 0, 0.34, "trim", bevel=0.05)
        lbox(m, F, px - 0.4, px + 0.4, 0.9, 1.4, 0, 0.32, "trim", bevel=0.05)
    # string courses, frieze, cornice, parapet, plinth
    lbox(m, F, x0, x1, 6.35, 6.85, 0, 0.32, "trim", bevel=0.08)
    lbox(m, F, x0, x1, 12.95, 13.35, 0, 0.28, "trim", bevel=0.07)
    lbox(m, F, x0, x1, 18.2, 18.79, 0, 0.14, "trim")
    lbox(m, F, x0 - 0.05, x1 + 0.05, 18.55, 18.8, 0, 0.46, "trim", bevel=0.04)
    lbox(m, F, x0 - 0.1, x1 + 0.1, 18.8, 19.5, -0.2, 0.9, "trim", bevel=0.12)
    lbox(m, F, x0, x1, 19.5, 19.78, -0.3, 0.32, "stone")
    lbox(m, F, x0, x1, 20.38, 20.6, -0.3, 0.32, "trim")
    posts = sorted({x0 + 0.3, x1 - 0.3, *pil_at})
    for pa, pb in zip(posts[:-1], posts[1:]):
        lbox(m, F, pa - 0.3, pa + 0.3, 19.78, 20.38, -0.3, 0.32, "stone")
        n = max(1, int((pb - pa - 0.6) / 0.42))
        for k in range(n):
            u = pa + 0.3 + (pb - pa - 0.6) * (k + 0.5) / n
            lbox(m, F, u - 0.085, u + 0.085, 19.78, 20.38, -0.12, 0.14, "stone", bevel=0.05)
    lbox(m, F, posts[-1] - 0.3, posts[-1] + 0.3, 19.78, 20.38, -0.3, 0.32, "stone")
    lbox(m, F, x0 - 0.1, x1 + 0.1, 20.6, 20.85, -0.4, 0.48, "trim", bevel=0.05)
    for px in pil_at:
        lbox(m, F, px - 0.36, px + 0.36, 20.85, 21.4, -0.25, 0.34, "trim", bevel=0.06)
    lbox(m, F, x0, x1, 0.0, 0.9, 0, 0.36, "granite", bevel=0.05)


def main_building():
    rng = np.random.default_rng(1611)
    m = Mesh()
    pts = {"lamps": [], "small": []}
    small = []

    # wings: ten bays either side between the pavilions and the portico
    for side in (-1, 1):
        x0, x1 = (-42.0, -10.5) if side < 0 else (10.5, 42.0)
        bw = (x1 - x0) / 10
        bays = [x0 + bw * (i + 0.5) for i in range(10)]
        pil = [x0 + bw * i for i in range(1, 10)]
        force = {(2, "g"): True, (7, "g"): True} if side < 0 else {(3, "g"): True, (8, "g"): True}
        facade(m, rng, x0, x1, 0.0, bays, pil_at=pil, lights=small, force=force)
        # the end pavilions stand forward and carry the statues
        p0, p1 = (-50.0, -42.0) if side < 0 else (42.0, 50.0)
        facade(m, rng, p0, p1, 1.4, [p0 + 2.0, p1 - 2.0], pil_at=[(p0 + p1) / 2])
        inner = p1 if side < 0 else p0
        m.add(quad([inner, 0, 0], [inner, 0, 1.4], [inner, 20.85, 1.4], [inner, 20.85, 0]), "stone", out=[-side, 0, 0])
        for qx in (p0, p1):
            box(m, qx - 0.45, qx + 0.45, 0.9, 18.2, 1.3, 1.75, "stone", bevel=0.06)
        box(m, p0 - 0.15, p1 + 0.15, 20.85, 21.5, 0.6, 1.95, "trim", bevel=0.06)
        # the statue group on its stepped pedestal
        cx = (p0 + p1) / 2
        box(m, cx - 3.0, cx + 3.0, 21.5, 22.05, -0.5, 1.6, "granite", bevel=0.06)
        box(m, cx - 0.95, cx + 0.95, 22.05, 22.6, -0.2, 1.35, "granite", bevel=0.05)
        poses = ["book", "staff", "bless"] if side < 0 else ["bless", "staff", "book"]
        for k, (dx, pose) in enumerate(zip((-1.75, 0.0, 1.75), poses)):
            f = friar(pose, seed=40 + k + (side > 0) * 10, detail=0.75)
            base = 22.6 if dx == 0 else 22.05
            s = 3.9 if dx == 0 else 3.5
            R = rot_y(-0.22 * np.sign(dx) * side + (0.15 if side > 0 else -0.15))
            m.extend(f, lambda p, R=R, s=s, cx=cx, dx=dx, base=base: (p @ R) * s + [cx + dx, base, 0.55])
        # the rooftop pavilions either side of the tower
        a0, a1 = (-31.0, -13.0) if side < 0 else (13.0, 31.0)
        box(m, a0, a1, 19.5, 22.8, -12.0, -1.2, "stone")
        box(m, a0 - 0.7, a1 + 0.7, 22.8, 23.3, -12.7, -0.5, "trim", bevel=0.08)
        for k in range(9):
            u = a0 + (a1 - a0) * (k + 0.5) / 9
            box(m, u - 0.35, u + 0.35, 21.3, 22.3, -1.25, -1.18, "glass", emit=WARM * rng.uniform(0.0, 0.35))

    # the portico: the central block, projecting, with the entrance, the balcony and paired columns
    zc = 2.6
    F = frame((0, 0, zc))
    holes = [dict(u0=-3.0, u1=3.0, v0=0.9, v1=7.0, depth=6.0, pane="inside", emit=PALE * 0.95, reveal="inside",
                  rev_emit=WARM * 0.32)]
    for x in (-6.9, 6.9):
        holes.append(dict(u0=x - WIN_W / 2, u1=x + WIN_W / 2, v0=1.75, v1=5.35, emit=PALE * 1.3, kind="g"))
        small.append((x, 3.55, zc - 0.42))
    for x in (-5.2, 0.0, 5.2):
        holes.append(dict(u0=x - 0.85, u1=x + 0.85, v0=7.75, v1=12.0, emit=window_light(rng, "s", True), kind="s"))
        holes.append(dict(u0=x - WIN_W / 2, u1=x + WIN_W / 2, v0=14.35, v1=17.75, emit=window_light(rng, "t", True), kind="t"))
    wall(m, F, -10.5, 10.5, 0.9, 18.8, holes)
    for h in holes[1:]:
        dress(m, F, h["u0"], h["u1"], h["v0"], h["v1"], h["kind"])
    for side in (-1, 1):
        m.add(quad([10.5 * side, 0, 0], [10.5 * side, 0, zc], [10.5 * side, 21.6, zc], [10.5 * side, 21.6, 0]), "stone", out=[side, 0, 0])
    # the entrance: its surround, a keystone, the hall's chandelier and the steps
    lbox(m, F, -3.6, -3.0, 0.9, 7.0, 0, 0.3, "trim", bevel=0.05)
    lbox(m, F, 3.0, 3.6, 0.9, 7.0, 0, 0.3, "trim", bevel=0.05)
    lbox(m, F, -3.6, 3.6, 7.0, 7.3, 0, 0.3, "trim", bevel=0.05)
    m.hull(np.array([[0, 6.4, -1.6], [0.5, 5.9, -1.6], [-0.5, 5.9, -1.6], [0, 5.9, -1.1], [0, 5.9, -2.1], [0, 5.3, -1.6]]),
           "lamp", emit=PALE * 4.0)
    small.append((0.0, 5.9, -1.6))
    for k in range(4):
        box(m, -6.0 - k * 0.4, 6.0 + k * 0.4, 0, 0.9 - k * 0.22, zc, zc + 0.6 + k * 0.55, "granite", bevel=0.03)
    # the balcony over the entrance, its balustrade and the planting along it
    box(m, -8.9, 8.9, 7.3, 7.75, zc, zc + 1.9, "trim", bevel=0.1)
    box(m, -8.9, 8.9, 7.75, 8.7, zc + 1.62, zc + 1.9, "stone")
    box(m, -9.0, 9.0, 8.7, 8.9, zc + 1.5, zc + 2.0, "trim", bevel=0.04)
    for k in range(22):
        x = -8.4 + 16.8 * k / 21 + rng.uniform(-0.2, 0.2)
        blob(m, [x, 9.1 + rng.uniform(-0.1, 0.35), zc + 1.3 + rng.uniform(-0.2, 0.3)], rng.uniform(0.5, 0.85), rng,
             squash=(1.2, 0.8, 1.0))
    for k in range(14):
        x = -8.2 + 16.4 * k / 13 + rng.uniform(-0.25, 0.25)
        blob(m, [x, 6.9 + rng.uniform(-0.5, 0.2), zc + 1.95], rng.uniform(0.3, 0.5), rng, squash=(0.9, 1.3, 0.6))
    for k in range(34):
        x = rng.uniform(-8.6, 8.6)
        c = [x, rng.uniform(6.6, 9.8), zc + 2.05 + rng.uniform(0, 0.35)]
        blob(m, c, 0.07, rng, mat="lamp", sub=0, jitter=0.1, emit=PALE * rng.uniform(1.5, 3.0))
    # paired columns up the portico
    for sx in (-1, 1):
        box(m, sx * 8.95 - 1.45, sx * 8.95 + 1.45, 0.9, 7.75, zc, zc + 1.05, "stone", bevel=0.06)
    for x in (-9.75, -8.15, -2.6, 2.6, 8.15, 9.75):
        box(m, x - 0.55, x + 0.55, 7.75, 8.25, zc, zc + 1.05, "trim", bevel=0.06)
        prism(m, x, zc + 0.5, 8.25, 17.8, 0.42, 0.38, sides=8, rot=np.pi / 8, mat="stone")
        box(m, x - 0.6, x + 0.6, 17.8, 18.3, zc - 0.05, zc + 1.1, "trim", bevel=0.07)
    lbox(m, F, -10.6, 10.6, 18.2, 18.79, 0, 1.15, "trim")
    lbox(m, F, -10.8, 10.8, 18.8, 19.6, -0.2, 1.5, "trim", bevel=0.12)
    lbox(m, F, -10.5, 10.5, 19.6, 21.2, -0.3, 0.9, "stone")
    lbox(m, F, -10.7, 10.7, 21.2, 21.5, -0.4, 1.05, "trim", bevel=0.05)
    lbox(m, F, -4.2, 4.2, 21.5, 22.4, -0.2, 0.75, "trim", bevel=0.06)
    for x in (-10.0, 10.0):
        f = friar("book" if x < 0 else "bless", seed=77 + int(x), detail=0.75)
        R = rot_y(0.2 * np.sign(x))
        m.extend(f, lambda p, R=R, x=x: (p @ R) * 3.0 + [x, 21.5, zc + 0.3])

    # the tower: the clock stage, the arcaded lantern stage, the drum, the dome and the cross
    tz0, tz1 = -8.8, 1.9
    tcz = (tz0 + tz1) / 2
    mid = (tz1 - tz0) / 2
    block(m, -5.6, 5.6, 21.5, 27.4, tz0, tz1,
          right=[dict(u0=mid - 0.8, u1=mid + 0.8, v0=22.6, v1=26.2, emit=WARM * 0.5, arch=True, depth=0.5)])
    for sx in (-1, 1):
        for zz in (tz1, tz0):
            box(m, sx * 5.6 - 0.65, sx * 5.6 + 0.65, 21.5, 27.4, zz - 0.65, zz + 0.65, "stone", bevel=0.08)
    Ff = frame((0, 0, tz1 + 0.01))
    lbox(m, Ff, -2.45, 2.45, 22.0, 27.0, 0, 0.18, "trim", bevel=0.05)
    for x in (-3.6, 3.6):
        lbox(m, Ff, x - 0.3, x + 0.3, 21.5, 27.4, 0, 0.16, "stone", bevel=0.04)
    lbox(m, Ff, -5.0, 5.0, 26.65, 26.95, 0, 0.22, "trim", bevel=0.04)
    clock = np.array([0.0, 24.5, tz1 + 0.2])
    ang = np.linspace(0, 2 * np.pi, 25)
    disc = [[clock, clock + [CLOCK_R * np.cos(a), CLOCK_R * np.sin(a), 0.02], clock + [CLOCK_R * np.cos(b), CLOCK_R * np.sin(b), 0.02]]
            for a, b in zip(ang[:-1], ang[1:])]
    m.add(disc, "lamp", emit=PALE * 1.25, out=[0, 0, 1], per_tri=True)
    for a, b in zip(ang[:-1], ang[1:]):
        p = [[1.72 * np.cos(a), 1.72 * np.sin(a)], [2.0 * np.cos(a), 2.0 * np.sin(a)], [2.0 * np.cos(b), 2.0 * np.sin(b)],
             [1.72 * np.cos(b), 1.72 * np.sin(b)]]
        m.add(quad(*[clock + [q[0], q[1], 0.08] for q in p]), "bronze", out=[0, 0, 1])
    for k in range(12):
        a = k * np.pi / 6
        c = clock + [1.45 * np.cos(a), 1.45 * np.sin(a), 0.06]
        obox(m, c, rot_z(a), [0.17, 0.05, 0.02], "iron")
    # ten past ten: each hand runs from a short tail behind the pivot out along its angle. The hands and their hub
    # are modelled, so every facet built after them keeps its shading, but tagged HANDS and left out of the
    # renders: the scene draws live hands over the face (SignInScene, .sx__clock)
    for a, reach, tail, half_w, z in ((np.pi * 5 / 6, 0.95, 0.2, 0.07, 0.1), (np.pi / 3, 1.38, 0.25, 0.05, 0.14)):
        mid = (reach - tail) / 2
        obox(m, clock + [mid * np.cos(a), mid * np.sin(a), z], rot_z(a), [(reach + tail) / 2, half_w, 0.02], "iron", tag=HANDS)
    hub = np.arange(10) * np.pi / 5
    m.hull([clock + [0.13 * np.cos(t), 0.13 * np.sin(t), z] for t in hub for z in (0.08, 0.18)], "iron", tag=HANDS)
    box(m, -6.3, 6.3, 27.4, 27.95, tz0 - 0.7, tz1 + 0.7, "trim", bevel=0.1)
    for sx in (-1, 1):
        for zz in (tz1 + 0.1, tz0 - 0.1):
            box(m, sx * 5.6 - 0.4, sx * 5.6 + 0.4, 27.95, 28.6, zz - 0.4, zz + 0.4, "trim", bevel=0.05)
            prism(m, sx * 5.6, zz, 28.6, 30.2, 0.24, 0.0, sides=4, rot=np.pi / 4, mat="stone")
            blob(m, [sx * 5.6, 30.25, zz], 0.16, rng, mat="bronze", sub=0, jitter=0.05)
    # the lantern stage, arcaded on every side
    sz0, sz1 = tcz - 4.0, tcz + 4.0
    block(m, -4.1, 4.1, 27.95, 30.7, sz0, sz1,
          front=[dict(u0=-1.1, u1=1.1, v0=28.3, v1=30.4, emit=PALE * 0.95, arch=True, depth=0.9)],
          right=[dict(u0=2.9, u1=5.1, v0=28.3, v1=30.4, emit=WARM * 0.8, arch=True, depth=0.9)])
    for sx in (-1, 1):
        for zz in (sz1, sz0):
            box(m, sx * 4.1 - 0.35, sx * 4.1 + 0.35, 27.95, 30.7, zz - 0.35, zz + 0.35, "trim", bevel=0.05)
    box(m, -4.55, 4.55, 30.7, 31.1, sz0 - 0.45, sz1 + 0.45, "trim", bevel=0.08)
    prism(m, 0, tcz, 31.1, 32.1, 2.95, 2.85, sides=8, rot=np.pi / 8, mat="stone")
    prism(m, 0, tcz, 32.1, 32.3, 3.05, 3.05, sides=8, rot=np.pi / 8, mat="trim")
    dome(m, 0, 32.3, tcz, 2.75, 2.35, sides=8, rings=3, mat="gold", rot=np.pi / 8)
    prism(m, 0, tcz, 34.4, 35.1, 0.55, 0.5, sides=8, rot=np.pi / 8, mat="trim")
    prism(m, 0, tcz, 35.1, 35.5, 0.62, 0.0, sides=8, rot=np.pi / 8, mat="gold")
    box(m, -0.09, 0.09, 35.4, 37.4, tcz - 0.09, tcz + 0.09, "gold", emit=PALE * 0.35)
    box(m, -0.55, 0.55, 36.62, 36.8, tcz - 0.09, tcz + 0.09, "gold", emit=PALE * 0.35)
    cross = (0.0, 36.71, tcz)

    # lamps along the front
    lamps = []
    for x in (-47.5, -30.5, -12.5, 12.5, 30.5, 47.5):
        z = 7.0
        box(m, x - 0.32, x + 0.32, 0, 0.75, z - 0.32, z + 0.32, "iron", bevel=0.05)
        prism(m, x, z, 0.75, 4.45, 0.13, 0.1, sides=6, mat="iron")
        box(m, x - 0.2, x + 0.2, 4.45, 4.6, z - 0.2, z + 0.2, "iron")
        prism(m, x, z, 4.6, 5.25, 0.3, 0.42, sides=6, mat="lamp", emit=PALE * 3.2, facet=True)
        prism(m, x, z, 5.25, 5.62, 0.5, 0.0, sides=6, mat="iron")
        lamps.append((x, 4.95, z))

    # the plaza: big cut facets, wider apart toward the camera
    gp = []
    for zz in np.concatenate([np.arange(-2, 30, 2.6), np.arange(30, 59, 3.6)]):
        step = 2.6 if zz < 30 else 3.6
        for xx in np.arange(-140, 140, step * 1.1):
            gp.append([xx + rng.uniform(-0.45, 0.45) * step, zz + rng.uniform(-0.4, 0.4) * step])
    gp = np.array(gp)
    tri = Delaunay(gp).simplices
    gy = rng.normal(0, 0.035, len(gp))
    G3 = np.stack([gp[:, 0], gy, gp[:, 1]], 1)
    m.add(G3[tri], "ground", per_tri=True, out=[0, 1, 0], tag=1, tilt=0.03)
    return m, dict(lamps=lamps, small=small, clock=tuple(clock), cross=cross)


def building_rig(lamps, interior):
    # the glow behind stands at the left, on the moon's side of the scene's sky
    L_sun = nrm([-0.8, 0.32, -0.5])
    sun_c = np.array([1.0, 0.74, 0.42]) * 2.8
    L_fill = nrm([0.35, 0.3, 0.9])
    fill_c = np.array([0.026, 0.02, 0.015])
    lamp_c = np.array([1.0, 0.66, 0.3])

    def rig(P, n, Vv, t, alb, ks, sh, A):
        tag = A["T"][t]
        up = n[:, 1:2]
        amb = np.array([0.016, 0.011, 0.007]) * (0.5 + 0.5 * up) + np.array([0.006, 0.004, 0.0025]) * (0.5 - 0.5 * up)
        dif = amb + np.clip((n * L_fill).sum(1), 0, None)[:, None] * fill_c
        spc = np.zeros_like(dif)
        # the glow behind reaches only what stands above the roofline
        lit = smooth(19.3, 21.8, P[:, 1])
        d, s = lambert_blinn(P, n, Vv, ks, sh, np.broadcast_to(L_sun, P.shape), sun_c, lit)
        dif += d
        spc += s
        for lx, ly, lz in lamps:
            Ld = np.array([lx, ly, lz]) - P
            dl = np.linalg.norm(Ld, axis=1)
            att = 5.4 / (1 + (dl / 2.4) ** 2)
            d, s = lambert_blinn(P, n, Vv, ks, sh, Ld / dl[:, None], lamp_c, att)
            dif += d
            spc += s
        for lx, ly, lz, k in interior:
            Ld = np.array([lx, ly, lz]) - P
            dl = np.linalg.norm(Ld, axis=1)
            att = k / (1 + (dl / 2.5) ** 2)
            d, _ = lambert_blinn(P, n, Vv, ks, sh, Ld / dl[:, None], lamp_c, att)
            dif += d
        # the plaza: warm under the lit windows, fading toward the camera
        g = (tag == 1)[:, None]
        spill = np.exp(-np.clip(P[:, 2], 0, None) / 7.5)[:, None] * np.array([0.06, 0.036, 0.016])
        dif = dif + g * spill
        return alb * dif + spc

    return rig


def without(A, gone):
    """The model without the facets marked in `gone`, every other facet as it was."""
    keep = ~gone
    return {k: (v[keep] if isinstance(v, np.ndarray) and len(v) == len(keep) else v) for k, v in A.items()}


def mirrored(A):
    """The scene without its plaza, mirrored in it."""
    keep = A["T"] != 1
    out = {k: (v[keep] if isinstance(v, np.ndarray) and len(v) == len(keep) else v) for k, v in A.items()}
    out["V"] = out["V"] * [1, -1, 1]
    out["N"] = out["N"] * [1, -1, 1]
    out["NS"] = out["NS"] * [1, -1, 1]
    return out


# the camera stands to the left of the tower, so the front turns to the right, toward the form on the page
BUILDING_CAM = dict(C=(-17.0, 1.6, 60.0), look=(0.0, 1.6, 0.0), fpx=1430, base=0.9)


def render_building(ss):
    m, pts = main_building()
    A = m.arrays()
    hands = A["T"] == HANDS
    A = without(A, hands)
    W, H = 2400 * ss // (2 if PREVIEW else 1), 1600 * ss // (2 if PREVIEW else 1)
    k = W / 2400
    C, look = BUILDING_CAM["C"], BUILDING_CAM["look"]
    cam = Cam(C, look, W, H, BUILDING_CAM["fpx"] * k, W / 2, 0)
    sy = cam.project(np.array([[0, 0, 2.6]]))[0][0][1]
    cam.cy = BUILDING_CAM["base"] * H - sy
    print("building:", len(A["V"]), "triangles at", W, "x", H)
    rig = building_rig(pts["lamps"], [(0.0, 5.0, -2.5, 3.0)])
    idbuf, wbuf = rasterize(A, cam)
    hdr = shade(A, cam, idbuf, wbuf, rig)
    # the plaza: the building mirrored in it, wet, broken up facet by facet
    R = mirrored(A)
    rid, rw = rasterize(R, cam)
    ref = shade(R, cam, rid, rw, rig, mirror=True)
    ref = np.stack([gaussian_filter(ref[..., c], (5 * k, 1.4 * k)) for c in range(3)], -1)
    ground = idbuf >= 0
    ground[ground] = A["T"][idbuf[ground]] == 1
    gy, gx = np.nonzero(ground)
    gt = idbuf[gy, gx]
    rng = np.random.default_rng(3)
    # drawn for the whole model, hands and all, so each facet keeps the same break in the reflection
    off = rng.normal(0, 1, (len(hands), 2))[~hands] * [4 * k, 14 * k]
    dim = rng.uniform(0.45, 1.0, len(hands))[~hands]
    sx = np.clip(gx + off[gt, 0], 0, W - 1).astype(int)
    sy_ = np.clip(gy + off[gt, 1], 0, H - 1).astype(int)
    z = 1.0 / wbuf[gy, gx]
    cos_t = np.clip(1.6 / np.maximum(z, 1e-3), 0, 1)
    fres = 0.04 + 0.96 * (1 - cos_t) ** 5
    hdr[gy, gx] += ref[sy_, sx] * (0.5 * fres * dim[gt])[:, None]
    cov = (idbuf >= 0).astype(np.float32)
    rgba = finish(hdr, cov, ss, exposure=1.0, glow_at=(0.34, 0.5), glow_r=(0.34, 0.26),
                  wrap_col=(1.0, 0.74, 0.38), wrap_k=1.8)
    # where SceneLight should shine
    w1, h1 = W // ss, H // ss
    cam1 = Cam(C, look, w1, h1, cam.fpx / ss, cam.cx / ss, cam.cy / ss)
    frac = lambda p: [round(float(v), 3) for v in cam1.project(np.array([p]))[0][0] / [w1, h1]]
    print("TOWN_LIGHTS")
    print("  lamps:", [frac(p) for p in pts["lamps"]])
    print("  small:", [frac(p) for p in pts["small"]])
    # the clock to a finer grain: the live hands turn about its middle
    at = lambda p: cam1.project(np.array([p]))[0][0] / [w1, h1]
    c0 = at(pts["clock"])
    rx = abs(at(np.asarray(pts["clock"]) + [CLOCK_R, 0, 0])[0] - c0[0])
    ry = abs(at(np.asarray(pts["clock"]) + [0, CLOCK_R, 0])[1] - c0[1])
    print("  clock:", [round(float(v), 4) for v in c0], " cross:", frac(pts["cross"]))
    print("  clockR:", [round(float(rx), 4), round(float(ry), 4)])
    return rgba


# ---------------------------------------------------------------- the Benavides monument
def monument():
    m = Mesh()
    f = friar("benavides", seed=1611, detail=1.5)
    s = 2.9
    # mirrored left for right, so he turns and raises his hand toward the form on the page
    m.extend(f, lambda p: (p @ rot_y(-0.12)) * [-s, s, s] + [0, 0.16, 0])
    # bronze plinth, the granite die and its base
    box(m, -0.7, 0.7, 0.0, 0.16, -0.6, 0.6, "bronze", bevel=0.03)
    box(m, -0.84, 0.84, -0.58, 0.0, -0.74, 0.74, "granite", bevel=0.04)
    box(m, -0.94, 0.94, -0.14, 0.0, -0.84, 0.84, "granite", bevel=0.03)
    box(m, -1.04, 1.04, -0.8, -0.58, -0.94, 0.94, "granite", bevel=0.04)
    box(m, -0.86, 0.86, -0.2, -0.14, -0.76, 0.76, "bronze", bevel=0.015)
    return m


def monument_rig():
    # lit from the left, as the building is, with the uplight before him at the right
    L_sun = nrm([-0.72, 0.34, -0.6])
    sun_c = np.array([1.0, 0.74, 0.42]) * 3.4
    L_fill = nrm([0.6, 0.2, 0.75])
    fill_c = np.array([0.012, 0.01, 0.008])
    up_p = np.array([0.5, -0.7, 2.7])
    up_c = np.array([1.0, 0.68, 0.32])

    def rig(P, n, Vv, t, alb, ks, sh, A):
        up = n[:, 1:2]
        amb = np.array([0.012, 0.008, 0.005]) * (0.5 + 0.5 * up) + 0.003 * (0.5 - 0.5 * up)
        dif = amb + np.clip((n * L_fill).sum(1), 0, None)[:, None] * fill_c
        d, spc = lambert_blinn(P, n, Vv, ks, sh, np.broadcast_to(L_sun, P.shape), sun_c)
        dif += d
        Ld = up_p - P
        dl = np.linalg.norm(Ld, axis=1)
        att = 1.5 / (1 + (dl / 2.4) ** 2) * (0.25 + 0.75 * smooth(0.0, 1.2, P[:, 1]))
        d, s = lambert_blinn(P, n, Vv, ks, sh, Ld / dl[:, None], up_c, att)
        return alb * (dif + d) + spc + s

    return rig


def render_monument(ss):
    m = monument()
    A = m.arrays()
    W, H = 1230 * ss // (2 if PREVIEW else 1), 1748 * ss // (2 if PREVIEW else 1)
    C = (-1.5, 0.1, 8.6)
    cam = Cam(C, (0, 0.1, 0), W, H, 1.0, 0, 0)
    # fit: the raised hand near the top right, the plaza step at the bottom
    S, _ = cam.project(A["V"].reshape(-1, 3))
    mn, mx = S.min(0), S.max(0)
    k = min((W * 0.985) / (mx[0] - mn[0]), (H * 0.985) / (mx[1] - mn[1]))
    cam.fpx = k
    cam.cx = W * 0.5 - k * (mn[0] + mx[0]) / 2
    cam.cy = H * 0.995 - k * mx[1]
    print("monument:", len(A["V"]), "triangles at", W, "x", H)
    idbuf, wbuf = rasterize(A, cam)
    cov = (idbuf >= 0).astype(np.float32)
    hdr = shade(A, cam, idbuf, wbuf, monument_rig())
    return finish(hdr, cov, ss, exposure=0.85, glow_at=(-0.25, 0.22), glow_r=(0.8, 0.5),
                  wrap_col=(1.0, 0.74, 0.38), wrap_k=1.4, bloom_k=0.6)


if __name__ == "__main__":
    ss = 1 if PREVIEW else 2
    suffix = "-preview" if PREVIEW else ""
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else f"{ROOT}/public/images"
    save(render_building(ss), f"{out}/main-building-3d{suffix}.webp")
    save(render_monument(ss), f"{out}/benavides-3d{suffix}.webp")
