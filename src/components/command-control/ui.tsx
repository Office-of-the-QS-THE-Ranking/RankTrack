"use client";

/*
 * The Command & Control console's building blocks: its context (data, command runner, notify, which
 * shows a Hub-wide toast, and confirmations) and the small components every section shares.
 */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cancelModalClose, closeModal } from "@/components/ui/modal-motion";
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
  if (!c) throw new Error("useConsole outside Command & Control");
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
    <span className={`cmd-pill cmd-pill--${tone}`} title={title}>
      {children}
    </span>
  );
}

/** Short labels for long status values. */
const STATUS_LABEL: Record<string, string> = { "Pending Invitation": "Invited", "Not applicable": "Closed" };

export function StatusPill({ value }: { value: string }) {
  return (
    <span className={`cmd-pill cmd-pill--${STATUS_TONE[value] ?? "neutral"} cmd-pill--status`}>
      {STATUS_LABEL[value] ?? value}
    </span>
  );
}

/** An explanation kept out of the way: a small info mark that shows the text on hover or focus. */
export function Hint({ text, label = "More information" }: { text: string; label?: string }) {
  return (
    <span className="cmd-hint" tabIndex={0} role="note" aria-label={`${label}: ${text}`} data-tip={text}>
      <Icon name="info" size={14} />
    </span>
  );
}

/** Less-used content, folded away until asked for. */
export function Disclosure({ title, meta, children, open }: { title: ReactNode; meta?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="cmd-disclosure" open={open}>
      <summary>
        <span className="cmd-disclosure__title">{title}</span>
        {meta && <span className="cmd-disclosure__meta">{meta}</span>}
        <Icon name="chevron-down" size={16} className="cmd-disclosure__chev" />
      </summary>
      <div className="cmd-disclosure__body">{children}</div>
    </details>
  );
}

export function Avatar({ name, src, size = 30, placeholder = false }: { name: string; src?: string; size?: number; placeholder?: boolean }) {
  return (
    <span className={`cmd-avatar${placeholder ? " cmd-avatar--placeholder" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      <Face src={src}>{placeholder ? <Icon name="user" size={Math.round(size * 0.6)} /> : initials(name)}</Face>
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled, describe }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; describe?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={describe} className="cmd-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="cmd-switch__knob" />
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
      <span className="cmd-stat__label">
        {icon && <Icon name={icon} size={15} />}
        {label}
      </span>
      <span className="cmd-stat__value num">{value}</span>
      {sub && <span className={`cmd-stat__sub${tone ? ` is-${tone}` : ""}`}>{sub}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className="cmd-stat cmd-stat--link" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="cmd-stat">{body}</div>
  );
}

export function Block({ title, sub, actions, children, flush, id }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; id?: string }) {
  return (
    <section className={`cmd-block${flush ? " cmd-block--flush" : ""}`} id={id}>
      {(title || actions) && (
        <header className="cmd-block__head">
          <div>
            {title && <h3 className="cmd-block__title">{title}</h3>}
            {sub && <p className="cmd-block__sub">{sub}</p>}
          </div>
          {actions && <div className="cmd-block__actions">{actions}</div>}
        </header>
      )}
      <div className="cmd-block__body">{children}</div>
    </section>
  );
}

export function EmptyNote({ icon = "check-circle", title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="cmd-empty">
      <Icon name={icon} size={22} />
      <p className="cmd-empty__title">{title}</p>
      {children && <p className="cmd-empty__text">{children}</p>}
    </div>
  );
}

export function Field({ label, hint, children, wide }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`cmd-field${wide ? " cmd-field--wide" : ""}`}>
      <span className="cmd-field__label">{label}</span>
      {children}
      {hint && <span className="cmd-field__hint">{hint}</span>}
    </label>
  );
}

export function KV({ rows, copyable = false }: { rows: [ReactNode, ReactNode, string?][]; copyable?: boolean }) {
  return (
    <dl className="cmd-kv">
      {rows.map(([k, v, copyText], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{copyable ? (
            <button
              type="button"
              className="cmd-kv__copy"
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
              <span className="cmd-kv__value">{v}</span>
              <span className="cmd-kv__copy-icon" aria-hidden="true">
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
    <p className="cmd-readonly">
      <Icon name="eye" size={14} /> {children}
    </p>
  );
}

/* ---------- Overlay layer ---------- */

/** Panels sit on the window, outside the workspace's animated (transformed) content column. */
export function Layer({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className="cmd cmd-layer">{children}</div>, document.body);
}

/* ---------- Inspector: a panel that slides over the right of the window ---------- */

export function Sheet({ open, title, sub, headerContent, onClose, children, footer, wide, modal }: { open: boolean; title: ReactNode; sub?: ReactNode; headerContent?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; modal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(open);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const lastContent = useRef({ title, sub, headerContent, children, footer });
  useEffect(() => {
    if (open) {
      cancelModalClose(ref.current);
      lastContent.current = { title, sub, headerContent, children, footer };
      setPresent(true);
    } else if (present) closeModal(ref.current, () => setPresent(false));
  }, [open, present]);
  useEffect(() => {
    if (open) lastContent.current = { title, sub, headerContent, children, footer };
  }, [open, title, sub, headerContent, children, footer]);
  const content = open ? { title, sub, headerContent, children, footer } : lastContent.current;
  const dismiss = () => closeModal(ref.current, () => { setPresent(false); onClose(); });
  const titleId = useId();
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!present) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(".cmd-sheet__close")?.focus());
    const onKey = (e: KeyboardEvent) => {
      // an open dropdown, calendar or suggestion list takes Escape first; the next one closes the panel
      const picker = e.target instanceof Element && e.target.closest('[aria-haspopup][aria-expanded="true"], [popover]');
      if (e.key === "Escape" && !picker && !document.querySelector(".cmd-confirm[open]")) {
        e.stopPropagation();
        e.preventDefault();
        closeModal(ref.current, () => { setPresent(false); closeRef.current(); });
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      returnTo.current?.focus?.();
    };
  }, [present]);
  if (!open && !present) return null;
  return (
    <Layer>
      <div className="cmd-sheet__scrim" onClick={dismiss} aria-hidden="true" />
      <div ref={ref} className={`cmd-sheet${wide ? " cmd-sheet--wide" : ""}${modal ? " cmd-sheet--modal" : ""}`} role={modal ? "dialog" : "region"} aria-modal={modal || undefined} aria-labelledby={titleId}>
        <header className="cmd-sheet__head">
          <div className="cmd-sheet__titles">
            <h3 id={titleId} className="cmd-sheet__title">
              {content.title}
            </h3>
            {content.sub && <p className="cmd-sheet__sub">{content.sub}</p>}
            {content.headerContent}
          </div>
          <button type="button" className="cmd-iconbtn cmd-sheet__close" onClick={dismiss} aria-label={modal ? "Close" : "Close panel"}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="cmd-sheet__body">{content.children}</div>
        {content.footer && <footer className="cmd-sheet__foot">{content.footer}</footer>}
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
    <div className="cmd-menu" ref={ref}>
      <button type="button" className="cmd-iconbtn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <Icon name="more" size={18} strokeWidth={2.4} />
      </button>
      {open && (
        <div className="cmd-menu__list" role="menu">
          {list.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`cmd-menu__item${it.danger ? " is-danger" : ""}`}
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
    <figure className="cmd-bars" aria-label={label}>
      <div className="cmd-bars__plot" role="img" aria-label={`${label}: ${data.map((d) => `${d.title} ${d.value}`).join(", ")}`}>
        {data.map((d) => (
          <span key={d.key} className="cmd-bars__col" title={`${d.title}: ${d.value}${d.alt ? `, ${d.alt} refused` : ""}`}>
            <span className="cmd-bars__bar" style={{ height: `${(d.value / max) * 100}%` }}>
              {!!d.alt && <span className="cmd-bars__alt" style={{ height: `${(d.alt / Math.max(1, d.value)) * 100}%` }} />}
            </span>
          </span>
        ))}
      </div>
      <figcaption className="cmd-bars__axis" aria-hidden="true">
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
