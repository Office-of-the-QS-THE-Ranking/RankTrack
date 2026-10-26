"use client";

/*
 * The Hub's own form pickers. Select, DateField and NumberField stand in for <select>,
 * <input type="date"> and <input type="number">, which every browser draws its own way (AGENTS.md).
 * Lists and calendars open as manual popovers: they sit in the top layer, so they show above modal
 * drawers and are never clipped by a scrolling panel, yet stay in place in the DOM, so they take the
 * colours of the surface they open from (console, sign-in glass, public site). Select reads ordinary
 * <option> and <optgroup> children, so swapping one in for a <select> keeps the markup.
 */
import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { Icon } from "./Icon";
import { cx } from "./primitives";
import { recheckField } from "./validation";
import { pickerSearchScore } from "@/lib/picker-search";

const GAP = 6;
const PAD = 8;

/* Keep the popover next to its trigger: below, or above when there is more room there. */
function place(anchor: HTMLElement, pop: HTMLElement, matchWidth: boolean) {
  const r = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  if (matchWidth) pop.style.minWidth = `${r.width}px`;
  pop.style.removeProperty("--pick-room");
  const below = vh - r.bottom - GAP - PAD;
  const above = r.top - GAP - PAD;
  const up = pop.scrollHeight > below && above > below;
  pop.style.setProperty("--pick-room", `${Math.max(140, up ? above : below)}px`);
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const left = r.left + w > vw - PAD ? r.right - w : r.left;
  pop.style.left = `${Math.max(PAD, Math.min(left, vw - w - PAD))}px`;
  pop.style.top = `${up ? r.top - GAP - h : r.bottom + GAP}px`;
  pop.dataset.side = up ? "top" : "bottom";
}

/** A trigger and its manual popover, kept beside it and closed by a press outside. Shared with the post editor's toolbar. */
export function usePopover<T extends HTMLElement = HTMLButtonElement>(open: boolean, onClose: () => void, matchWidth: boolean) {
  const anchor = useRef<T>(null);
  const pop = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useLayoutEffect(() => {
    const a = anchor.current;
    const p = pop.current;
    if (!open || !a || !p) return;
    if (typeof p.showPopover === "function" && !p.matches(":popover-open")) p.showPopover();
    const update = (e?: Event) => {
      if (e?.target instanceof Node && p.contains(e.target)) return;
      const r = a.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return close.current();
      place(a, p, matchWidth);
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!a.contains(t) && !p.contains(t)) close.current();
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    document.addEventListener("pointerdown", down, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("pointerdown", down, true);
    };
  }, [open, matchWidth]);

  return { anchor, pop };
}

/* Escape closes the picker, not the drawer it sits in. */
const stop = (e: KeyboardEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

/* A picker usually sits inside its <label>; a click in the open popover must not reach the label, which
   would pass it on to the trigger and close the popover. */
const keepLabel = (e: { preventDefault: () => void }) => e.preventDefault();

/*
 * Forms still see the value: a hidden field carries the name, and `required` is checked on it. A missing
 * value is reported by <FieldErrors /> (ui/validation.tsx), which marks and focuses the trigger.
 */
function Proxy({ name, value, required, disabled, missing }: { name?: string; value: string; required?: boolean; disabled?: boolean; missing: string }) {
  if (!name && !required) return null;
  return <input className="pick-proxy" tabIndex={-1} aria-hidden="true" name={name} value={value} required={required} disabled={disabled} data-missing={missing} onChange={() => {}} />;
}

/* ---------- Select ---------- */

type Opt = {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
  depth: number;
  group?: string;
};
type OptionProps = {
  value?: string | number;
  children?: ReactNode;
  disabled?: boolean;
  "data-depth"?: number;
  label?: string;
};

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function readOptions(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<OptionProps>;
    if (el.type === Fragment) readOptions(el.props.children, group, out);
    else if (el.type === "optgroup") readOptions(el.props.children, el.props.label, out);
    else if (el.type === "option") {
      const text = textOf(el.props.children).trim();
      out.push({
        value: el.props.value !== undefined ? String(el.props.value) : text,
        label: el.props.children,
        text,
        disabled: !!el.props.disabled,
        depth: el.props["data-depth"] ?? 0,
        group,
      });
    }
  });
  return out;
}

export interface SelectProps {
  /** Search available choices, including close spelling matches. */
  searchable?: boolean;
  /** <option> elements, optionally in <optgroup>s. `data-depth` on an option indents it. */
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Trigger class; defaults to the house "select" field. */
  className?: string;
  /** Shown when no option matches the value. */
  placeholder?: ReactNode;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  title?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function Select({ children, value, defaultValue, onChange, className = "select", placeholder, id, name, required, disabled, autoFocus, title, searchable = false, ...aria }: SelectProps) {
  const allOpts = readOptions(children);
  const [query, setQuery] = useState<string | null>(null);
  const opts = searchable && query?.trim()
    ? allOpts.map((option, order) => ({ option, order, score: pickerSearchScore(option.text, query) }))
      .filter(({ score }) => Number.isFinite(score)).sort((a, b) => a.score - b.score || a.order - b.order).map(({ option }) => option)
    : allOpts;
  const [own, setOwn] = useState(defaultValue ?? allOpts[0]?.value ?? "");
  const current = value ?? own;
  const selected = opts.findIndex((o) => o.value === current);
  const sel = allOpts.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef({ text: "", at: 0 });
  const base = useId();
  const listId = `${base}-list`;
  const optId = (i: number) => `${base}-o${i}`;
  const { anchor, pop } = usePopover<HTMLButtonElement | HTMLInputElement>(open, () => setOpen(false), true);

  useLayoutEffect(() => {
    if (searchable && anchor.current instanceof HTMLInputElement) {
      anchor.current.setCustomValidity(query?.trim() && !sel ? "Choose an option from the suggestions." : "");
    }
  }, [query, searchable, sel, anchor]);

  useLayoutEffect(() => {
    if (open && searchable && anchor.current && pop.current) place(anchor.current, pop.current, true);
  }, [open, searchable, query, anchor, pop]);

  useEffect(() => {
    if (open && active >= 0) document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const step = (from: number, dir: 1 | -1, times = 1) => {
    let at = from;
    for (let i = from + dir, n = 0; i >= 0 && i < opts.length && n < times; i += dir) {
      if (!opts[i].disabled) {
        at = i;
        n++;
      }
    }
    return at;
  };
  const first = () => step(-1, 1);
  const last = () => step(opts.length, -1);
  const show = (at: number) => {
    if (disabled) return;
    setActive(at);
    setOpen(true);
  };
  const commit = (i: number) => {
    const o = opts[i];
    if (!o || o.disabled) return;
    setQuery(null);
    setOpen(false);
    if (searchable) anchor.current?.focus({ preventScroll: true });
    recheckField(anchor.current);
    if (o.value === current) return;
    if (value === undefined) setOwn(o.value);
    onChange?.(o.value);
  };
  // Type to jump: letters typed in quick succession match the start of an option's text.
  const match = (key: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at < 600 ? t.text + key.toLowerCase() : key.toLowerCase();
    t.at = now;
    const from = open ? active : selected;
    const n = opts.length;
    const order = opts.map((_, i) => (((from + (t.text.length > 1 ? 0 : 1) + i) % n) + n) % n);
    return order.find((i) => !opts[i].disabled && opts[i].text.toLowerCase().startsWith(t.text)) ?? -1;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const k = e.key;
    const printable = k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
        e.preventDefault();
        show(selected >= 0 ? selected : first());
      } else if (k === "Home" || k === "End") {
        e.preventDefault();
        show(k === "Home" ? first() : last());
      } else if (printable) {
        if (searchable) {
          e.preventDefault();
          show(0);
          setQuery(k);
          return;
        }
        const i = match(k);
        if (i >= 0) show(i);
      }
      return;
    }
    if (k === "ArrowDown") setActive(step(active, 1));
    else if (k === "ArrowUp") setActive(e.altKey ? active : step(active, -1));
    else if (k === "PageDown") setActive(step(active, 1, 10));
    else if (k === "PageUp") setActive(step(active, -1, 10));
    else if (k === "Home") setActive(first());
    else if (k === "End") setActive(last());
    else if (k === "Enter" || (k === " " && Date.now() - typed.current.at > 600)) commit(active);
    else if (k === "Escape") {
      stop(e);
      setOpen(false);
      return;
    } else if (k === "Tab") {
      setOpen(false);
      return;
    } else if (printable) {
      const i = match(k);
      if (i >= 0) setActive(i);
    } else return;
    e.preventDefault();
    if (k === "ArrowUp" && e.altKey) commit(active);
  };

  const groups: { label?: string; items: number[] }[] = [];
  opts.forEach((o, i) => {
    const g = groups[groups.length - 1];
    if (g && g.label === o.group) g.items.push(i);
    else groups.push({ label: o.group, items: [i] });
  });
  const row = (i: number) => {
    const o = opts[i];
    return (
      <div
        key={i}
        id={optId(i)}
        role="option"
        aria-selected={i === selected}
        aria-disabled={o.disabled || undefined}
        className={cx("pick__opt", i === active && "is-active")}
        style={o.depth ? { paddingLeft: 10 + o.depth * 14 } : undefined}
        onMouseMove={() => !o.disabled && active !== i && setActive(i)}
        onClick={() => commit(i)}
      >
        <span className="pick__opt-label">{o.label}</span>
        {i === selected && <Icon name="check" size={16} className="pick__tick" />}
      </div>
    );
  };

  return (
    <>
      {searchable ? <input
        ref={(element) => { anchor.current = element; }}
        type="text"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 && active < opts.length ? optId(active) : undefined}
        aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"] || undefined}
        aria-describedby={aria["aria-describedby"]}
        className={cx(className, "pick-trigger", "pick-editable")}
        value={query ?? sel?.text ?? ""}
        placeholder={typeof placeholder === "string" ? placeholder : "Type to choose…"}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        required={required}
        title={title ?? ""}
        maxLength={120}
        onFocus={(event) => { show(selected >= 0 ? selected : first()); event.currentTarget.select(); }}
        onClick={() => { if (!open) show(selected >= 0 ? selected : first()); }}
        onChange={(event) => {
          const text = event.currentTarget.value;
          setQuery(text);
          setOpen(true);
          setActive(-1);
          const exact = allOpts.find((option) => !option.disabled && option.text.toLowerCase() === text.trim().toLowerCase());
          const next = exact?.value ?? "";
          if (value === undefined) setOwn(next);
          if (next !== current) onChange?.(next);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { stop(event); setOpen(false); }
          else if (event.key === "Enter" && open) { event.preventDefault(); commit(active >= 0 ? active : first()); }
          else if (event.key === "ArrowUp" && open && active < 0) { event.preventDefault(); setActive(last()); }
          else if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Tab"].includes(event.key)) onKeyDown(event);
        }}
        onBlur={(event) => { if (!pop.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
      /> : <button
        ref={(element) => { anchor.current = element; }}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
        aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"] || undefined}
        aria-describedby={aria["aria-describedby"]}
        className={cx(className, "pick-trigger")}
        data-placeholder={!sel || sel.value === "" ? "" : undefined}
        disabled={disabled}
        autoFocus={autoFocus}
        title={title}
        onClick={() => (open ? setOpen(false) : show(selected >= 0 ? selected : first()))}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => e.key === " " && e.preventDefault()}
        onBlur={(e) => !pop.current?.contains(e.relatedTarget as Node) && setOpen(false)}
      >
        <span className="pick-trigger__label">{sel ? sel.label : placeholder}</span>
        <Icon name="chevron-down" size={15} className="pick-select__chevron" />
      </button>}
      {searchable ? <input type="hidden" name={name} value={current} disabled={disabled} /> : <Proxy name={name} value={current} required={required} disabled={disabled} missing="Choose one." />}
      {open && (
        <div ref={pop} popover="manual" id={listId} role="listbox" aria-label={aria["aria-label"]} className="pick pick--list" onMouseDown={(e) => e.preventDefault()} onClick={keepLabel}>
          <div className="pick__scroll" role="presentation">
            {groups.map((g, gi) =>
              g.label === undefined ? (
                <Fragment key={gi}>{g.items.map(row)}</Fragment>
              ) : (
                <div key={gi} role="group" aria-labelledby={`${base}-g${gi}`} className="pick__group">
                  <div id={`${base}-g${gi}`} className="pick__group-label">
                    {g.label}
                  </div>
                  {g.items.map(row)}
                </div>
              ),
            )}
            {!opts.length && <div className="pick__empty">{query ? "No matching options. Try another spelling." : "Nothing to choose"}</div>}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- DateField ---------- */

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const toIso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const utc = (iso: string) => new Date(iso + "T00:00:00Z");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addDays = (iso: string, n: number) => {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const addMonths = (iso: string, n: number) => {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const ny = t.getUTCFullYear();
  const nm = t.getUTCMonth() + 1;
  return toIso(ny, nm, Math.min(d, daysIn(ny, nm)));
};
const localToday = () => {
  const t = new Date();
  return toIso(t.getFullYear(), t.getMonth() + 1, t.getDate());
};
const isIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" });
const SHOWN = fmt({ day: "numeric", month: "short", year: "numeric" });
const SPOKEN = fmt({
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const MONTH_YEAR = fmt({ month: "long", year: "numeric" });
const MONTHS = Array.from({ length: 12 }, (_, i) => fmt({ month: "short" }).format(Date.UTC(2026, i, 1)));
const MONTHS_LONG = Array.from({ length: 12 }, (_, i) => fmt({ month: "long" }).format(Date.UTC(2026, i, 1)));
const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "25 Oct 2026", the way a picked date reads in its field. */
export const formatPicked = (iso: string) => (isIso(iso) ? SHOWN.format(utc(iso)) : "");

type View = "days" | "months" | "years";

export interface DateFieldProps {
  /** ISO date (YYYY-MM-DD), or "" for none. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export function DateField({ value, onChange, min, max, className = "input", placeholder = "Choose a date", id, name, required, disabled, ...aria }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("days");
  const [focus, setFocus] = useState(value || localToday());
  const jump = useRef(false);
  const base = useId();
  const { anchor, pop } = usePopover(open, () => setOpen(false), false);

  const within = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  const clamp = (iso: string) => (min && iso < min ? min : max && iso > max ? max : iso);
  const today = localToday();
  const [fy, fm] = parts(focus);

  // Keyboard moves and view changes carry focus to the matching cell; pointer moves leave it alone.
  useEffect(() => {
    if (!open || !jump.current) return;
    jump.current = false;
    pop.current?.querySelector<HTMLElement>('[data-focus="true"]')?.focus({ preventScroll: true });
  });

  const show = () => {
    if (disabled) return;
    jump.current = true;
    setFocus(clamp(isIso(value) ? value : today));
    setView("days");
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) anchor.current?.focus();
  };
  const pick = (iso: string) => {
    recheckField(anchor.current);
    if (iso !== value) onChange(iso);
    close(true);
  };
  const moveTo = (iso: string) => {
    jump.current = true;
    setFocus(clamp(iso));
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    const dow = utc(focus).getUTCDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      Home: () => addDays(focus, -dow),
      End: () => addDays(focus, 6 - dow),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
    };
    if (!moves[k]) return;
    e.preventDefault();
    moveTo(moves[k]());
  };
  // Months and years sit in rows of three.
  const onTileKey = (e: KeyboardEvent<HTMLDivElement>, move: (n: number) => void) => {
    const n = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
    if (!n) return;
    e.preventDefault();
    jump.current = true;
    move(n);
  };

  const yearStart = Math.floor(fy / 12) * 12;
  const minY = min ? parts(min)[0] : -Infinity;
  const maxY = max ? parts(max)[0] : Infinity;
  const monthOpen = (y: number, m: number) => (!max || toIso(y, m, 1) <= max) && (!min || toIso(y, m, daysIn(y, m)) >= min);

  let title: ReactNode;
  let prev: (() => void) | null = null;
  let next: (() => void) | null = null;
  let body: ReactNode;
  if (view === "days") {
    title = MONTH_YEAR.format(Date.UTC(fy, fm - 1, 1));
    const first = toIso(fy, fm, 1);
    const start = addDays(first, -utc(first).getUTCDay());
    const before = addDays(first, -1);
    const after = toIso(fy, fm, daysIn(fy, fm));
    if (!min || before >= min) prev = () => setFocus(clamp(addMonths(focus, -1)));
    if (!max || addDays(after, 1) <= max) next = () => setFocus(clamp(addMonths(focus, 1)));
    body = (
      <div role="grid" aria-labelledby={`${base}-title`} className="pick-cal__grid" onKeyDown={onGridKey}>
        <div role="row" className="pick-cal__row pick-cal__week">
          {WEEK.map((w) => (
            <abbr key={w} role="columnheader" title={w} aria-label={w}>
              {w[0]}
            </abbr>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, r) => (
          <div role="row" key={r} className="pick-cal__row">
            {Array.from({ length: 7 }, (_, c) => {
              const iso = addDays(start, r * 7 + c);
              const day = parts(iso)[2];
              const outside = iso.slice(0, 7) !== first.slice(0, 7);
              return (
                <div role="gridcell" key={iso} aria-selected={iso === value}>
                  <button
                    type="button"
                    className={cx("pick-cal__day", outside && "is-outside")}
                    data-focus={iso === focus}
                    tabIndex={iso === focus ? 0 : -1}
                    disabled={!within(iso)}
                    aria-label={SPOKEN.format(utc(iso))}
                    aria-pressed={iso === value}
                    aria-current={iso === today ? "date" : undefined}
                    onClick={() => pick(iso)}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else if (view === "months") {
    title = String(fy);
    if (fy - 1 >= minY) prev = () => setFocus(clamp(addMonths(focus, -12)));
    if (fy + 1 <= maxY) next = () => setFocus(clamp(addMonths(focus, 12)));
    body = (
      <div className="pick-cal__tiles" role="group" aria-labelledby={`${base}-title`} onKeyDown={(e) => onTileKey(e, (n) => setFocus(clamp(addMonths(focus, n))))}>
        {MONTHS.map((m, i) => (
          <button
            key={m}
            type="button"
            className="pick-cal__tile"
            data-focus={i + 1 === fm}
            tabIndex={i + 1 === fm ? 0 : -1}
            disabled={!monthOpen(fy, i + 1)}
            aria-label={`${MONTHS_LONG[i]} ${fy}`}
            aria-pressed={isIso(value) && value.slice(0, 7) === toIso(fy, i + 1, 1).slice(0, 7)}
            onClick={() => {
              jump.current = true;
              setFocus(clamp(toIso(fy, i + 1, Math.min(parts(focus)[2], daysIn(fy, i + 1)))));
              setView("days");
            }}
          >
            {m}
          </button>
        ))}
      </div>
    );
  } else {
    title = `${yearStart} – ${yearStart + 11}`;
    if (yearStart - 1 >= minY) prev = () => setFocus(clamp(addMonths(focus, -144)));
    if (yearStart + 12 <= maxY) next = () => setFocus(clamp(addMonths(focus, 144)));
    body = (
      <div className="pick-cal__tiles" role="group" aria-labelledby={`${base}-title`} onKeyDown={(e) => onTileKey(e, (n) => setFocus(clamp(addMonths(focus, n * 12))))}>
        {Array.from({ length: 12 }, (_, i) => {
          const y = yearStart + i;
          return (
            <button
              key={y}
              type="button"
              className="pick-cal__tile"
              data-focus={y === fy}
              tabIndex={y === fy ? 0 : -1}
              disabled={y < minY || y > maxY}
              aria-pressed={isIso(value) && parts(value)[0] === y}
              onClick={() => {
                jump.current = true;
                setFocus(clamp(addMonths(focus, (y - fy) * 12)));
                setView("months");
              }}
            >
              {y}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        className={cx(className, "pick-trigger pick-date")}
        data-placeholder={isIso(value) ? undefined : ""}
        disabled={disabled}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (!open && e.key === "ArrowDown") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="pick-trigger__label">{isIso(value) ? formatPicked(value) : placeholder}</span>
        <Icon name="calendar" size={16} className="pick-date__icon" />
      </button>
      <Proxy name={name} value={value} required={required} disabled={disabled} missing="Choose a date." />
      {open && (
        <div
          ref={pop}
          popover="manual"
          role="dialog"
          aria-label={aria["aria-label"] ? `Choose ${aria["aria-label"].toLowerCase()}` : "Choose a date"}
          className="pick pick--cal"
          onClick={keepLabel}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            stop(e);
            if (view !== "days") {
              jump.current = true;
              setView(view === "years" ? "months" : "days");
            } else close(true);
          }}
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (to && !pop.current?.contains(to) && !anchor.current?.contains(to)) setOpen(false);
          }}
        >
          <div className="pick__scroll">
            <div className="pick-cal__head">
              <button type="button" className="pick-cal__nav" aria-label="Previous" disabled={!prev} onClick={() => prev?.()}>
                <Icon name="chevron-left" size={16} />
              </button>
              <button type="button" id={`${base}-title`} className="pick-cal__title" aria-live="polite" disabled={view === "years"} onClick={() => setView(view === "days" ? "months" : "years")}>
                {title}
                {view !== "years" && <Icon name="chevron-down" size={14} />}
              </button>
              <button type="button" className="pick-cal__nav" aria-label="Next" disabled={!next} onClick={() => next?.()}>
                <Icon name="chevron" size={16} />
              </button>
            </div>
            {body}
            {(within(today) || (!required && isIso(value))) && (
              <div className="pick-cal__foot">
                {within(today) && (
                  <button type="button" className="pick-cal__link" onClick={() => pick(today)}>
                    Today
                  </button>
                )}
                {!required && isIso(value) && (
                  <button
                    type="button"
                    className="pick-cal__link"
                    onClick={() => {
                      onChange("");
                      close(true);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- NumberField ---------- */

export interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

/** A number box with the Hub's own steppers in place of the browser's spin buttons. */
export function NumberField({ value, onChange, min, max, step = 1, className = "input", id, disabled, ...aria }: NumberFieldProps) {
  const nudge = (dir: 1 | -1) => onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, (Number.isFinite(value) ? value : 0) + dir * step)));
  return (
    <span className={cx(className, "pick-num")} data-disabled={disabled || undefined}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className="pick-num__field"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={aria["aria-label"]}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button type="button" className="pick-num__step pick-num__step--down" tabIndex={-1} aria-label="Decrease" disabled={disabled || (min !== undefined && value <= min)} onClick={() => nudge(-1)}>
        <Icon name="minus" size={14} />
      </button>
      <button type="button" className="pick-num__step" tabIndex={-1} aria-label="Increase" disabled={disabled || (max !== undefined && value >= max)} onClick={() => nudge(1)}>
        <Icon name="plus" size={14} />
      </button>
    </span>
  );
}
