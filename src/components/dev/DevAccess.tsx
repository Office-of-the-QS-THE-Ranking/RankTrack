"use client";

/*
 * Development only: a floating button (bottom right) opening the developer settings, where the access used
 * at the next Google sign-in is chosen and saved, and input checks can be skipped in this browser.
 * The button can be dragged (or moved with the arrow keys) anywhere on screen; this browser keeps the spot,
 * and the panel opens toward the side with room. The root layout mounts it only under `next dev`.
 */
import { useEffect, useRef, useState, useTransition, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { loadDevAccess, saveDevAccess } from "@/app/actions/dev-access";
import { signOut } from "@/app/actions/session";
import { toast } from "@/components/ui/toast";
import { Icon } from "@/components/ui/Icon";
import type { DevProfile } from "@/lib/governance/server/dev-access";
import { Select } from "@/components/ui/pickers";
import { setSkipChecks, useSkipChecks } from "@/lib/dev-checks";

type Data = NonNullable<Awaited<ReturnType<typeof loadDevAccess>>>;
type Pos = { x: number; y: number };

const FAB = 40;
const GAP = 16;
const PANEL = 320;
const POS_KEY = "hub:dev-access-pos";
/** Movement under this many pixels is a click, not a drag. */
const SLOP = 4;

const clamp = (p: Pos): Pos => ({
  x: Math.round(Math.min(Math.max(GAP, p.x), window.innerWidth - FAB - GAP)),
  y: Math.round(Math.min(Math.max(GAP, p.y), window.innerHeight - FAB - GAP)),
});

/* Where the panel goes beside a moved button: below it in the top half, above it otherwise, kept on screen. */
function panelStyle(pos: Pos | null): CSSProperties | undefined {
  if (!pos) return undefined;
  const below = pos.y + FAB / 2 < window.innerHeight / 2;
  const width = Math.min(PANEL, window.innerWidth - GAP * 2);
  const want = pos.x + FAB / 2 < window.innerWidth / 2 ? pos.x : pos.x + FAB - width;
  const left = Math.min(Math.max(GAP, want), window.innerWidth - GAP - width) - pos.x;
  const room = (below ? window.innerHeight - pos.y - FAB : pos.y) - 10 - GAP;
  return { left, right: "auto", ...(below ? { top: FAB + 10, bottom: "auto" } : {}), maxHeight: Math.min(560, room) };
}

export function DevAccess() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [p, setP] = useState<DevProfile | null>(null);
  const [busy, start] = useTransition();
  const skip = useSkipChecks();
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  // The saved spot is read after mount, so the server and first render agree on the default corner.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
      if (typeof saved?.x === "number" && typeof saved?.y === "number") setPos(clamp(saved));
    } catch {}
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const place = (p: Pos) => {
    const next = clamp(p);
    setPos(next);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {}
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < SLOP) return;
      d.moved = true;
      setDragging(true);
    }
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }));
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    setDragging(false);
    dragged.current = true; // the click that follows a drag doesn't toggle the panel
    place({ x: e.clientX - d.dx, y: e.clientY - d.dy });
  };
  const onPointerCancel = () => {
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!move) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    place({ x: r.left + move[0], y: r.top + move[1] });
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next)
      start(async () => {
        const d = await loadDevAccess();
        if (!d) return;
        setData(d);
        setP(d.profile);
      });
  };

  const set = (patch: Partial<DevProfile>) => setP((x) => (x ? { ...x, ...patch } : x));
  const flip = (id: string) => p && set({ roleIds: p.roleIds.includes(id) ? p.roleIds.filter((r) => r !== id) : [...p.roleIds, id] });
  const emailOk = !p || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email.trim());

  const save = (andSignIn: boolean) =>
    p &&
    start(async () => {
      const r = await saveDevAccess(p);
      toast(r.message, r.ok ? "ok" : "error");
      if (r.ok && andSignIn) await signOut();
    });

  return (
    <div
      className="dev-access"
      data-dragging={dragging || undefined}
      style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
    >
      {open && (
        <section className="dev-access__panel" aria-label="Developer settings" style={panelStyle(pos)}>
          <header>
            <strong>Developer settings</strong>
            <span className="dev-access__pill">Dev only</span>
          </header>
          <label className="dev-access__row dev-access__switch" title="Buttons, Continue and Submit work without valid inputs. Kept in this browser; the server still checks.">
            <input
              type="checkbox"
              checked={skip}
              onChange={(e) => {
                setSkipChecks(e.target.checked);
                toast(e.target.checked ? "Input checks are off in this browser." : "Input checks are back on.", "info");
              }}
            />
            Skip input checks
          </label>
          {!p || !data ? (
            <p className="dev-access__muted">Loading…</p>
          ) : (
            <>
              <label className="dev-access__row dev-access__switch">
                <input type="checkbox" checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                Apply at sign-in
              </label>
              <label className="dev-access__row dev-access__switch" title="As the only University Administrator, your changes skip approval workflows. Turn off to test the workflows; this applies as soon as you save.">
                <input type="checkbox" checked={p.superAdmin} onChange={(e) => set({ superAdmin: e.target.checked })} />
                Super admin
              </label>
              <label className="dev-access__field">
                <span>Google account</span>
                <input type="email" value={p.email} onChange={(e) => set({ email: e.target.value })} aria-invalid={!emailOk} />
                {!emailOk && <em>Enter a valid address.</em>}
              </label>
              <fieldset className="dev-access__field">
                <legend>Roles</legend>
                <div className="dev-access__roles">
                  {data.roles.map((r) => (
                    <label key={r.id} className="dev-access__row">
                      <input type="checkbox" checked={p.roleIds.includes(r.id)} onChange={() => flip(r.id)} />
                      {r.name}
                    </label>
                  ))}
                </div>
                {!p.roleIds.length && <em>Choose at least one role.</em>}
              </fieldset>
              <label className="dev-access__field">
                <span>Home unit</span>
                <Select className="dev-access__select" value={p.unitId} onChange={(v) => set({ unitId: v })}>
                  {data.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="dev-access__field">
                <span>Scope</span>
                <Select className="dev-access__select" value={p.scope} onChange={(v) => set({ scope: v as DevProfile["scope"] })}>
                  <option value="university">University-wide</option>
                  <option value="unit">Home unit only</option>
                </Select>
              </label>
              <div className="dev-access__actions">
                <button type="button" disabled={busy || !emailOk || !p.roleIds.length} onClick={() => save(false)}>
                  Save
                </button>
                <button type="button" className="is-primary" disabled={busy || !emailOk || !p.roleIds.length} onClick={() => save(true)}>
                  Save and sign in again
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <button
        type="button"
        className="dev-access__fab"
        onClick={() => {
          if (dragged.current) dragged.current = false;
          else toggle();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        aria-expanded={open}
        aria-label="Developer settings"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        title="Developer settings. Drag, or use the arrow keys, to move."
      >
        <Icon name={open ? "close" : "settings"} size={18} />
      </button>
    </div>
  );
}
