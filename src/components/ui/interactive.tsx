"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./primitives";

export function InfoTooltip({ children, label = "Data reporting date", escapeClipping = false, icon, tone }: { children: ReactNode; label?: string; escapeClipping?: boolean; icon?: ReactNode; tone?: "success" }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!open || !escapeClipping || !content) return;
    const position = () => {
      const trigger = ref.current?.getBoundingClientRect();
      if (!trigger) return;
      const box = content.getBoundingClientRect();
      content.style.left = `${Math.max(16, Math.min(window.innerWidth - box.width - 16, trigger.left + trigger.width / 2 - box.width / 2))}px`;
      content.style.top = `${Math.max(16, trigger.bottom + box.height + 8 > window.innerHeight ? trigger.top - box.height - 4 : trigger.bottom + 4)}px`;
    };
    content.showPopover();
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      content.hidePopover();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, escapeClipping]);

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
        {icon ?? <Icon name="info" size={18} />}
      </button>
      {open && <span ref={contentRef} id={id} role="tooltip" popover={escapeClipping ? "manual" : undefined} className={`info-tooltip__content${escapeClipping ? " info-tooltip__content--floating" : ""}${tone === "success" ? " info-tooltip__content--success" : ""}`}>{children}</span>}
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
export type ContentTab<T extends string> = {
  key: T;
  label: ReactNode;
  icon?: IconName;
  count?: number;
  countTone?: "alert";
};

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idBase,
  counts,
  sliding = true,
  search,
  actions,
}: {
  tabs: readonly (T | ContentTab<T>)[];
  value: T;
  onChange: (t: T) => void;
  label: string;
  idBase?: string;
  /** A figure beside a tab's name. */
  counts?: Partial<Record<T, number>>;
  sliding?: boolean;
  /** Primary content search, rendered after page-specific actions. */
  search?: ReactNode;
  actions?: ReactNode;
}) {
  const indicatorId = useId();
  const tabId = idBase ?? indicatorId;
  const items = tabs.map((tab): ContentTab<T> => typeof tab === "string" ? { key: tab, label: tab } : tab);
  const reduceMotion = useReducedMotion();
  const { refs, onKeyDown } = useRoving(items.length, (i) => onChange(items[i].key));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const tabKeys = items.map((item) => item.key).join("\u0000");

  useEffect(() => {
    const list = scrollRef.current;
    if (!list) return;
    const measure = () => setOverflow({ left: list.scrollLeft > 1, right: list.scrollWidth - list.clientWidth - list.scrollLeft > 1 });
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const child of list.children) observer.observe(child);
    list.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => { observer.disconnect(); list.removeEventListener("scroll", measure); };
  }, [tabKeys, counts]);

  useEffect(() => {
    const list = scrollRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected) return;
    const inset = 42;
    const left = selected.offsetLeft - inset;
    const right = selected.offsetLeft + selected.offsetWidth + inset - list.clientWidth;
    if (left < list.scrollLeft) list.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? "instant" : "smooth" });
    else if (right > list.scrollLeft) list.scrollTo({ left: right, behavior: reduceMotion ? "instant" : "smooth" });
  }, [value, tabKeys, reduceMotion]);

  const scrollTabs = (direction: number) => {
    const list = scrollRef.current;
    if (list) list.scrollBy({ left: direction * Math.max(120, list.clientWidth * 0.7), behavior: reduceMotion ? "instant" : "smooth" });
  };
  const strip = (
    <div className="tabs-shell">
      <div ref={scrollRef} id={`${tabId}-list`} role="tablist" aria-label={label} className={cx("tabs", sliding && "tabs--sliding")}>
        {items.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${tabId}-tab-${i}`}
            aria-controls={idBase ? `${idBase}-panel` : undefined}
            aria-selected={value === t.key}
            tabIndex={value === t.key ? 0 : -1}
            className="tabs__tab"
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {sliding && value === t.key && (
              <motion.span
                aria-hidden="true"
                className="tabs__highlight"
                layoutId={indicatorId}
                initial={false}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 450, damping: 38 }}
              />
            )}
            {t.icon && <Icon name={t.icon} size={14} className="tabs__icon" />}
            {t.label}
            {(t.count ?? counts?.[t.key]) !== undefined && (
              <span className={cx("count", t.countTone === "alert" && "is-alert")}>{t.count ?? counts?.[t.key]}</span>
            )}
          </button>
        ))}
      </div>
      {overflow.left && <button type="button" className="tabs__scroll tabs__scroll--left" aria-label={`Scroll ${label.toLowerCase()} left`} aria-controls={`${tabId}-list`} onClick={() => scrollTabs(-1)}><Icon name="arrow-left" size={16} /></button>}
      {overflow.right && <button type="button" className="tabs__scroll tabs__scroll--right" aria-label={`Scroll ${label.toLowerCase()} right`} aria-controls={`${tabId}-list`} onClick={() => scrollTabs(1)}><Icon name="arrow" size={16} /></button>}
    </div>
  );
  if (!search && !actions) return strip;
  return (
    <div className="content-tabs">
      {strip}
      <div className="content-tabs__controls">
        {actions && <div className="content-tabs__actions">{actions}</div>}
        {search && <div className="content-tabs__search">{search}</div>}
      </div>
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
