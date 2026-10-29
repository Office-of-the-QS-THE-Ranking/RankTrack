"use client";

import { closeModal, openModal } from "@/components/ui/modal-motion";

/*
 * Automatic sign-out under the session policy. While someone works, a heartbeat keeps the server-side
 * session alive; after the idle period a warning appears, and if nobody answers it the session ends.
 * The server enforces the same timeout on every request, and also ends sessions an administrator revokes.
 * An idleMinutes of 0 (the person chose to stay signed in) only keeps the heartbeat.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { heartbeat, signOut } from "@/app/actions/session";
import { Icon } from "@/components/ui/Icon";

const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

export function IdleGuard({ idleMinutes, warnMinutes }: { idleMinutes: number; warnMinutes: number }) {
  const router = useRouter();
  const last = useRef(Date.now());
  const pinged = useRef(Date.now());
  const [left, setLeft] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const end = useCallback(() => {
    void signOut();
  }, []);

  useEffect(() => {
    const mark = () => {
      last.current = Date.now();
    };
    EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const tick = setInterval(async () => {
      const now = Date.now();
      const idle = now - last.current;
      const limit = idleMinutes * 60_000;
      const warnAt = limit - warnMinutes * 60_000;
      if (idleMinutes > 0 && idle >= limit) {
        clearInterval(tick);
        end();
        return;
      }
      setLeft(idleMinutes > 0 && idle >= warnAt ? Math.ceil((limit - idle) / 1000) : null);
      // Tell the server about activity at most once a minute; it also learns of revocations this way.
      if (now - pinged.current > 60_000) {
        pinged.current = now;
        const active = idle < 60_000;
        const r = await heartbeat(active).catch(() => null);
        if (r && !r.ok) {
          clearInterval(tick);
          router.replace(`/signin?ended=${r.problem ?? "ended"}`);
        }
      }
    }, 1000);
    return () => {
      clearInterval(tick);
      EVENTS.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [idleMinutes, warnMinutes, end, router]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (left !== null && !d.open) openModal(d);
    if (left === null && d.open) closeModal(d);
  }, [left]);

  const stay = async () => {
    last.current = Date.now();
    pinged.current = Date.now();
    setLeft(null);
    const r = await heartbeat(true).catch(() => null);
    if (r && !r.ok) router.replace(`/signin?ended=${r.problem ?? "ended"}`);
  };

  const mm = left !== null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "";
  return (
    <dialog ref={dialog} className="idle" aria-labelledby="idle-title" aria-describedby="idle-text" onCancel={(e) => { e.preventDefault(); void stay(); }}>
      <span className="idle__icon" aria-hidden="true">
        <Icon name="clock" size={22} />
      </span>
      <h2 id="idle-title" className="idle__title">Still there?</h2>
      <p id="idle-text" className="idle__text">
        For security, you will be signed out after {idleMinutes} minutes without activity. Signing out in <b className="num">{mm}</b>.
      </p>
      <div className="idle__actions">
        <button type="button" className="btn" onClick={end}>
          Sign out now
        </button>
        <button type="button" className="btn btn--dark" onClick={() => void stay()} autoFocus>
          Stay signed in
        </button>
      </div>
    </dialog>
  );
}
