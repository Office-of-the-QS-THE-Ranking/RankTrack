"use client";

/*
 * The Administration console's building blocks: its context (data, command runner, notify, which
 * shows a Hub-wide toast, and confirmations) and the small components every section shares.
 */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Tabs as ContentTabs, type ContentTab } from "@/components/ui/interactive";
import type { Command, CommandResult } from "@/lib/governance/commands";
import type { ConsoleData } from "@/lib/governance/console-types";
import { STATUS_TONE } from "@/lib/governance/catalog";
import { initials } from "@/lib/governance/rbac";
import { Face } from "@/components/ui/Face";
import { Icon, type IconName } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import type { SectionKey } from "./sections";

/* ---------- Context ---------- */

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirm: string;
  tone?: "danger" | "default";
  /** Ask for a reason or note before confirming. */
  input?: { label: string; placeholder?: string; required?: boolean; multiline?: boolean };
}

export interface ConsoleApi {
  headerActions?: HTMLDivElement | null;
  data: ConsoleData;
  run: (cmd: Command) => Promise<CommandResult>;
  busy: boolean;
  notify: (message: string, tone?: "ok" | "error") => void;
  confirm: (opts: ConfirmOptions) => Promise<string | null>;
  go: (section: SectionKey, focus?: string) => void;
  /** Fetch the console data again (after an action that went through another server function). */
  reload: () => Promise<void>;
  focus?: string;
}

export const ConsoleCtx = createContext<ConsoleApi | null>(null);

export function useConsole() {
  const c = useContext(ConsoleCtx);
  if (!c) throw new Error("useConsole outside Administration");
  return c;
}

/** Run a command and report the outcome. Returns the result for callers that continue. */
export function useAct() {
  const { run, notify } = useConsole();
  return async (cmd: Command, quiet = false) => {
    const r = await run(cmd);
    if (!quiet || !r.ok) notify(r.message, r.ok ? "ok" : "error");
    return r;
  };
}

/* ---------- Formatting ---------- */

const TZ = "Asia/Manila";

export function fmtDate(iso?: string, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    timeZone: TZ,
  });
}

export function fmtAgo(iso: string | undefined, nowIso: string) {
  if (!iso) return "Never";
  const m = Math.round((Date.parse(nowIso) - Date.parse(iso)) / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} ${d === 1 ? "day" : "days"} ago`;
  return fmtDate(iso);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-PH")} ${n === 1 ? one : many}`;

/* ---------- Atoms ---------- */

export function Pill({ tone = "neutral", children, title }: { tone?: "ok" | "review" | "revise" | "missing" | "danger" | "neutral" | "gold"; children: ReactNode; title?: string }) {
  return (
    <span className={`adm-pill adm-pill--${tone}`} title={title}>
      {children}
    </span>
  );
}

/** Short labels for long status values. */
const STATUS_LABEL: Record<string, string> = { "Pending Invitation": "Invited", "Not applicable": "Closed" };

export function StatusPill({ value }: { value: string }) {
  return (
    <span className={`adm-pill adm-pill--${STATUS_TONE[value] ?? "neutral"} adm-pill--status`}>
      {STATUS_LABEL[value] ?? value}
    </span>
  );
}

/** An explanation kept out of the way: a small info mark that shows the text on hover or focus. */
export function Hint({ text, label = "More information" }: { text: string; label?: string }) {
  return (
    <span className="adm-hint" tabIndex={0} role="note" aria-label={`${label}: ${text}`} data-tip={text}>
      <Icon name="info" size={14} />
    </span>
  );
}

/** Less-used content, folded away until asked for. */
export function Disclosure({ title, meta, children, open }: { title: ReactNode; meta?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="adm-disclosure" open={open}>
      <summary>
        <span className="adm-disclosure__title">{title}</span>
        {meta && <span className="adm-disclosure__meta">{meta}</span>}
        <Icon name="chevron-down" size={16} className="adm-disclosure__chev" />
      </summary>
      <div className="adm-disclosure__body">{children}</div>
    </details>
  );
}

export function Avatar({ name, src, size = 30, placeholder = false }: { name: string; src?: string; size?: number; placeholder?: boolean }) {
  return (
    <span className={`adm-avatar${placeholder ? " adm-avatar--placeholder" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      <Face src={src}>{placeholder ? <Icon name="user" size={Math.round(size * 0.6)} /> : initials(name)}</Face>
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled, describe }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; describe?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={describe} className="adm-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="adm-switch__knob" />
    </button>
  );
}

export { SearchField } from "@/components/ui/search-field";

export function Tabs<T extends string>({ tabs, value, onChange, label, idBase, search, actions }: { tabs: readonly (T | ContentTab<T>)[]; value: T; onChange: (t: T) => void; label: string; idBase?: string; search?: ReactNode; actions?: ReactNode }) {
  return <ContentTabs tabs={tabs} value={value} onChange={onChange} label={label} idBase={idBase} search={search} actions={actions} />;
}

export function Stat({ label, value, sub, tone, icon, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "revise" | "danger" | "review"; icon?: IconName; onClick?: () => void }) {
  const body = (
    <>
      <span className="adm-stat__label">
        {icon && <Icon name={icon} size={15} />}
        {label}
      </span>
      <span className="adm-stat__value num">{value}</span>
      {sub && <span className={`adm-stat__sub${tone ? ` is-${tone}` : ""}`}>{sub}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className="adm-stat adm-stat--link" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="adm-stat">{body}</div>
  );
}

export function Block({ title, sub, actions, children, flush, id }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; id?: string }) {
  return (
    <section className={`adm-block${flush ? " adm-block--flush" : ""}`} id={id}>
      {(title || actions) && (
        <header className="adm-block__head">
          <div>
            {title && <h3 className="adm-block__title">{title}</h3>}
            {sub && <p className="adm-block__sub">{sub}</p>}
          </div>
          {actions && <div className="adm-block__actions">{actions}</div>}
        </header>
      )}
      <div className="adm-block__body">{children}</div>
    </section>
  );
}

export function EmptyNote({ icon = "check-circle", title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="adm-empty">
      <Icon name={icon} size={22} />
      <p className="adm-empty__title">{title}</p>
      {children && <p className="adm-empty__text">{children}</p>}
    </div>
  );
}

export function Field({ label, hint, children, wide }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`adm-field${wide ? " adm-field--wide" : ""}`}>
      <span className="adm-field__label">{label}</span>
      {children}
      {hint && <span className="adm-field__hint">{hint}</span>}
    </label>
  );
}

export function KV({ rows, copyable = false }: { rows: [ReactNode, ReactNode, string?][]; copyable?: boolean }) {
  return (
    <dl className="adm-kv">
      {rows.map(([k, v, copyText], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{copyable ? (
            <button
              type="button"
              className="adm-kv__copy"
              aria-label={typeof k === "string" ? `Copy ${k.toLowerCase()}` : "Copy value"}
              onClick={async (e) => {
                const text = copyText ?? e.currentTarget.innerText.trim();
                try {
                  await navigator.clipboard.writeText(text);
                  toast("Copied to clipboard", "ok");
                } catch {
                  toast("Couldn’t copy. Select the text and copy it instead.", "error");
                }
              }}
            >
              <span className="adm-kv__value">{v}</span>
              <span className="adm-kv__copy-icon" aria-hidden="true">
                <Icon name="copy" size={15} />
              </span>
            </button>
          ) : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReadOnly({ children }: { children: ReactNode }) {
  return (
    <p className="adm-readonly">
      <Icon name="eye" size={14} /> {children}
    </p>
  );
}

/* ---------- Overlay layer ---------- */

/** Panels sit on the window, outside the workspace's animated (transformed) content column. */
export function Layer({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className="adm adm-layer">{children}</div>, document.body);
}

/* ---------- Inspector: a panel that slides over the right of the window ---------- */

export function Sheet({ open, title, sub, headerContent, onClose, children, footer, wide, modal }: { open: boolean; title: ReactNode; sub?: ReactNode; headerContent?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; modal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(".adm-sheet__close")?.focus());
    const onKey = (e: KeyboardEvent) => {
      // an open dropdown, calendar or suggestion list takes Escape first; the next one closes the panel
      const picker = e.target instanceof Element && e.target.closest('[aria-haspopup][aria-expanded="true"], [popover]');
      if (e.key === "Escape" && !picker && !document.querySelector(".adm-confirm[open]")) {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Layer>
      <div className="adm-sheet__scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={`adm-sheet${wide ? " adm-sheet--wide" : ""}${modal ? " adm-sheet--modal" : ""}`} role={modal ? "dialog" : "region"} aria-modal={modal || undefined} aria-labelledby={titleId}>
        <header className="adm-sheet__head">
          <div className="adm-sheet__titles">
            <h3 id={titleId} className="adm-sheet__title">
              {title}
            </h3>
            {sub && <p className="adm-sheet__sub">{sub}</p>}
            {headerContent}
          </div>
          <button type="button" className="adm-iconbtn adm-sheet__close" onClick={onClose} aria-label={modal ? "Close" : "Close panel"}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="adm-sheet__body">{children}</div>
        {footer && <footer className="adm-sheet__foot">{footer}</footer>}
      </div>
    </Layer>
  );
}

/* ---------- Row menu ---------- */

export function RowMenu({ label, items }: { label: string; items: ({ label: string; icon: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean } | false | null | undefined)[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    ref.current?.addEventListener("keydown", key);
    const node = ref.current;
    return () => {
      document.removeEventListener("mousedown", away);
      node?.removeEventListener("keydown", key);
    };
  }, [open]);
  const list = items.filter(Boolean) as { label: string; icon: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean }[];
  if (!list.length) return null;
  return (
    <div className="adm-menu" ref={ref}>
      <button type="button" className="adm-iconbtn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <Icon name="more" size={18} strokeWidth={2.4} />
      </button>
      {open && (
        <div className="adm-menu__list" role="menu">
          {list.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`adm-menu__item${it.danger ? " is-danger" : ""}`}
              disabled={it.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onSelect();
              }}
            >
              <Icon name={it.icon} size={15} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- A thin bar chart for activity ---------- */

export function Bars({ data, label }: { data: { key: string; value: number; alt?: number; title: string }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="adm-bars" aria-label={label}>
      <div className="adm-bars__plot" role="img" aria-label={`${label}: ${data.map((d) => `${d.title} ${d.value}`).join(", ")}`}>
        {data.map((d) => (
          <span key={d.key} className="adm-bars__col" title={`${d.title}: ${d.value}${d.alt ? `, ${d.alt} refused` : ""}`}>
            <span className="adm-bars__bar" style={{ height: `${(d.value / max) * 100}%` }}>
              {!!d.alt && <span className="adm-bars__alt" style={{ height: `${(d.alt / Math.max(1, d.value)) * 100}%` }} />}
            </span>
          </span>
        ))}
      </div>
      <figcaption className="adm-bars__axis" aria-hidden="true">
        <span>{data[0]?.title}</span>
        <span>{data.at(-1)?.title}</span>
      </figcaption>
    </figure>
  );
}

/** Download text as a file. */
export function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
