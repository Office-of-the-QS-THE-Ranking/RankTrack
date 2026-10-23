"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import { cx } from "./primitives";

export function InfoTooltip({ children, label = "Data reporting date" }: { children: ReactNode; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <span className="info-tooltip" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="info-tooltip__trigger"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      >
        <Icon name="info" size={18} />
      </button>
      {open && <span id={id} role="tooltip" className="info-tooltip__content">{children}</span>}
    </span>
  );
}

/* Roving focus for a row of options: arrows move, Home/End jump. */
function useRoving(count: number, onMove: (i: number) => void) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % count;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + count) % count;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = count - 1;
    if (n < 0) return;
    e.preventDefault();
    onMove(n);
    refs.current[n]?.focus();
  };
  return { refs, onKeyDown };
}

/* ---------- Tabs (WAI-ARIA tabs pattern) ---------- */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idBase,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
  label: string;
  idBase: string;
}) {
  const { refs, onKeyDown } = useRoving(tabs.length, (i) => onChange(tabs[i]));
  return (
    <div role="tablist" aria-label={label} className="tabs">
      {tabs.map((t, i) => (
        <button
          key={t}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${idBase}-tab-${i}`}
          aria-controls={`${idBase}-panel`}
          aria-selected={value === t}
          tabIndex={value === t ? 0 : -1}
          className="tabs__tab"
          onClick={() => onChange(t)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ idBase, index, children, className }: { idBase: string; index: number; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${index}`} tabIndex={0} className={className}>
      {children}
    </div>
  );
}

/* ---------- Segmented control / filter pills (radio group) ---------- */
export type Option<T extends string> = { value: T; label: ReactNode; count?: number };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  variant = "seg",
  className,
}: {
  options: readonly (Option<T> | T)[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  variant?: "seg" | "pills";
  className?: string;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)) as Option<T>[];
  const { refs, onKeyDown } = useRoving(opts.length, (i) => onChange(opts[i].value));
  return (
    <div role="radiogroup" aria-label={label} className={cx(variant === "seg" ? "seg" : "pills", className)}>
      {opts.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className={variant === "seg" ? "seg__opt" : "pill"}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.label}
          {o.count !== undefined && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Drawer (native modal dialog: focus containment, Esc, focus return) ---------- */
export function Drawer({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onDialogClose = () => {
      document.documentElement.style.overflow = "";
      onClose();
    };
    d.addEventListener("close", onDialogClose);
    return () => d.removeEventListener("close", onDialogClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <header className="drawer__head">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="drawer__title" id={titleId}>
            {title}
          </h2>
        </div>
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => ref.current?.close()} aria-label="Close panel">
          <Icon name="close" />
        </button>
      </header>
      <div className="drawer__body">{open && children}</div>
      {footer && <footer className="drawer__foot">{footer}</footer>}
    </dialog>
  );
}
