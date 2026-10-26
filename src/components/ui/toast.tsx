"use client";

/*
 * The one way the Hub tells people something happened: "Changes saved.", "You signed out.", "Could not
 * send." Toasts stack at the top right and close on their own after TOAST_MS (the timer holds while the
 * pointer or focus is on one). Call toast() from any client code; <Toaster /> sits once in the root
 * layout. The stack is a manual popover so it shows above modal dialogs and drawers too.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export type ToastTone = "ok" | "error" | "info";

/** How long a toast stays up. The house rule (AGENTS.md); don't change it per call. */
export const TOAST_MS = 8000;
const MAX = 4;
const LEAVE_MS = 200;

interface Item {
  id: number;
  message: string;
  tone: ToastTone;
}

let items: Item[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a toast. Repeating a message that is still up restarts its timer instead of stacking a copy. */
export function toast(message: string, tone: ToastTone = "ok") {
  if (!message) return;
  const rest = items.filter((t) => !(t.message === message && t.tone === tone));
  items = [{ id: ++seq, message, tone }, ...rest].slice(0, MAX);
  emit();
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => items;
const none: Item[] = [];

const ICON = { ok: "check-circle", error: "x-circle", info: "info" } as const;
const TITLE = { ok: "All set", error: "Something went wrong", info: "Just so you know" } as const;

export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => none);
  const ref = useRef<HTMLElement>(null);
  const [said, setSaid] = useState<{ polite: string; assertive: string; host: Element | null }>({ polite: "", assertive: "", host: null });
  const newest = list[0];

  // Re-open the popover on each new toast, so it lands above a dialog opened since the last one.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.showPopover !== "function") return;
    if (el.matches(":popover-open")) el.hidePopover();
    el.showPopover();
  }, [newest?.id]);

  // Clear, then fill, so a repeated message is read out again. An open modal dialog makes the rest of
  // the page inert, so the announcement is made from inside it.
  useEffect(() => {
    if (!newest) return;
    const open = document.querySelectorAll("dialog[open]");
    const host = open[open.length - 1] ?? null;
    setSaid({ polite: "", assertive: "", host });
    const t = setTimeout(() => setSaid({ host, polite: newest.tone === "error" ? "" : newest.message, assertive: newest.tone === "error" ? newest.message : "" }), 60);
    return () => clearTimeout(t);
  }, [newest]);

  const live = (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {said.polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive">
        {said.assertive}
      </div>
    </>
  );

  return (
    <>
      {said.host ? createPortal(live, said.host) : live}
      <section ref={ref} popover="manual" className="toasts" aria-label="Notifications">
        <ol>
          {list.map((t) => (
            <ToastItem key={t.id} item={t} />
          ))}
        </ol>
      </section>
    </>
  );
}

function ToastItem({ item }: { item: Item }) {
  const [held, setHeld] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const left = useRef(TOAST_MS);

  const close = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    if (held || leaving) return;
    const started = Date.now();
    const t = setTimeout(close, left.current);
    return () => {
      clearTimeout(t);
      left.current -= Date.now() - started;
    };
  }, [held, leaving, close]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => dismiss(item.id), LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving, item.id]);

  return (
    <li
      className={`toast toast--${item.tone}${leaving ? " is-leaving" : ""}${held ? " is-held" : ""}`}
      style={{ "--toast-ms": `${TOAST_MS}ms` } as CSSProperties}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <span className="toast__icon" aria-hidden="true">
        <Icon name={ICON[item.tone]} size={30} strokeWidth={1.8} />
      </span>
      <div className="toast__body">
        <p className="toast__title">{TITLE[item.tone]}</p>
        <p className="toast__text">{item.message}</p>
      </div>
      <button type="button" className="toast__close" onClick={close} aria-label="Dismiss">
        <Icon name="close" size={16} />
      </button>
      <span className="toast__timer" aria-hidden="true" />
    </li>
  );
}
