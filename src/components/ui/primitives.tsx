import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  FAMILY,
  RANKINGS,
  SDG_COLORS,
  SDG_NAMES,
  daysUntil,
  formatDate,
  inkOn,
  readinessLevel,
  type Direction as Dir,
  type EvidenceStatus,
  type FamilyKey,
  type Indicator,
} from "@/lib/data";
import { Icon, type IconName } from "./Icon";

export type AnyStatus = EvidenceStatus | "Not started";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/* ---------- Layout ---------- */

export function PageHeader({
  title,
  lede,
  actions,
  children,
}: {
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="ph">
      <div className="ph__main">
        <h1 className="ph__title">{title}</h1>
        {lede && <p className="ph__lede">{lede}</p>}
        {children}
      </div>
      {actions && <div className="ph__actions">{actions}</div>}
    </header>
  );
}

export function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="crumbs">
        {items.map((c, i) => (
          <li key={c.label + i} className="row" style={{ gap: 6 }}>
            {i > 0 && <Icon name="chevron" size={14} />}
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionHead({ title, sub, actions, id }: { title: string; sub?: string; actions?: ReactNode; id?: string }) {
  return (
    <div className="section-head">
      <div>
        <h2 id={id}>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({
  title,
  sub,
  icon,
  actions,
  children,
  foot,
  className,
  tone,
  id,
  bodyClass,
  headingLevel = 2,
  label,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  children?: ReactNode;
  foot?: ReactNode;
  className?: string;
  tone?: "tint" | "dark" | "gold";
  id?: string;
  bodyClass?: string;
  headingLevel?: 2 | 3;
  label?: string;
}) {
  const H = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className={cx("card", tone && `card--${tone}`, className)} id={id} aria-label={!title ? label : undefined}>
      {(title || actions) && (
        <header className="card__head">
          <div className="card__titles">
            {title && (
              <H className="card__title">
                {icon && <Icon name={icon} size={18} />}
                {title}
              </H>
            )}
            {sub && <p className="card__sub">{sub}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      {children !== undefined && <div className={cx("card__body", bodyClass)}>{children}</div>}
      {foot && <footer className="card__foot">{foot}</footer>}
    </section>
  );
}

/* ---------- Figures ---------- */

export function Kpi({
  label,
  icon,
  value,
  unit,
  meta,
  tone,
  children,
  href,
}: {
  label: string;
  icon?: IconName;
  value: ReactNode;
  unit?: string;
  meta?: ReactNode;
  tone?: "dark" | "gold";
  children?: ReactNode;
  href?: string;
}) {
  const body = (
    <div className="kpi">
      <p className="kpi__label">
        {icon && (
          <span className="kpi__icon">
            <Icon name={icon} size={17} />
          </span>
        )}
        {label}
      </p>
      <p className="kpi__value">
        {value}
        {unit && <small>{unit}</small>}
      </p>
      {children}
      {meta && <p className="kpi__meta">{meta}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className={cx("card card--link", tone && `card--${tone}`)}>
      {body}
    </Link>
  ) : (
    <div className={cx("card", tone && `card--${tone}`)}>{body}</div>
  );
}

export function Ring({
  value,
  size = 56,
  stroke = 6,
  label,
  track,
  fill,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  track?: string;
  fill?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <span
      className="ring"
      style={{ width: size, height: size, ["--ring-track" as string]: track, ["--ring-fill" as string]: fill } as CSSProperties}
      role="img"
      aria-label={`${Math.round(v)}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ ["--circ" as string]: c } as CSSProperties}
        />
      </svg>
      {label !== undefined && <span className="ring__label">{label}</span>}
    </span>
  );
}

export function Meter({
  value,
  tone,
  label,
  size,
}: {
  value: number;
  tone?: "gold" | "ok" | "revise" | "missing";
  label: string;
  size?: "lg";
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span
      className={cx("meter", tone && `meter--${tone}`, size && `meter--${size}`)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span className="meter__fill" style={{ width: `${v}%` }} />
    </span>
  );
}

export function MeterRow({ value, label, tone, suffix = "%" }: { value: number; label: string; tone?: "gold" | "ok" | "revise" | "missing"; suffix?: string }) {
  return (
    <span className="meter-row">
      <Meter value={value} tone={tone} label={label} />
      <span className="meter-row__val">
        {Math.round(value)}
        {suffix}
      </span>
    </span>
  );
}

/** Readiness with the "progress, not pressure" wording. */
export function Readiness({ value, label }: { value: number; label: string }) {
  const lvl = readinessLevel(value);
  return (
    <div className="stack" style={{ ["--gap" as string]: "6px" } as CSSProperties}>
      <div className="row row--between">
        <span className="small text-2">
          <b style={{ fontWeight: 600, color: "var(--text)" }}>{value}%</b> ready
        </span>
        <Level value={value} />
      </div>
      <Meter value={value} tone={lvl.tone === "ok" ? "ok" : lvl.tone === "revise" ? "revise" : "missing"} label={label} />
    </div>
  );
}

export function Level({ value }: { value: number }) {
  const lvl = readinessLevel(value);
  const cls = lvl.tone === "ok" ? "status--ok" : lvl.tone === "revise" ? "status--revise" : "status--missing";
  return (
    <span className={cx("status", cls)}>
      <i className="status__shape" aria-hidden="true" />
      {lvl.label}
    </span>
  );
}

/* ---------- Status and direction ---------- */

const STATUS_CLASS: Record<AnyStatus, string> = {
  Validated: "status--ok",
  "For review": "status--review",
  "Needs revision": "status--revise",
  "Not yet submitted": "status--missing",
  "Not started": "status--missing",
  "Not applicable": "status--na",
};

/** Status always ships with a shape and a word, never colour alone. */
export function Status({ status, label }: { status: AnyStatus; label?: string }) {
  return (
    <span className={cx("status", STATUS_CLASS[status])}>
      <i className="status__shape" aria-hidden="true" />
      {label ?? status}
    </span>
  );
}

export function PlanStatus({ status }: { status: "On track" | "At risk" | "Not started" | "Complete" }) {
  const cls = status === "On track" || status === "Complete" ? "status--ok" : status === "At risk" ? "status--revise" : "status--missing";
  return (
    <span className={cx("status", cls)}>
      <i className="status__shape" aria-hidden="true" />
      {status}
    </span>
  );
}

const DIR: Record<Dir, { icon: IconName; word: string }> = {
  up: { icon: "arrow-up", word: "Improved" },
  down: { icon: "arrow-down", word: "Declined" },
  steady: { icon: "arrow", word: "Held" },
  new: { icon: "flag", word: "Baseline" },
};

export function Direction({ dir, short }: { dir: Dir; short?: boolean }) {
  const d = DIR[dir];
  return (
    <span className={cx("dir", `dir--${dir}`)}>
      <Icon name={d.icon} size={13} strokeWidth={2.2} />
      {short ? <span className="sr-only">{d.word}</span> : d.word}
    </span>
  );
}

const TREND_ICON: Record<Indicator["trend"], IconName> = {
  Improving: "trend-up",
  Stable: "minus",
  Declining: "trend-down",
  Critical: "alert",
};

export function Trend({ trend }: { trend: Indicator["trend"] }) {
  return (
    <span className={cx("trend", `trend--${trend.toLowerCase()}`)}>
      <Icon name={TREND_ICON[trend]} size={14} strokeWidth={2} />
      {trend}
    </span>
  );
}

/* ---------- Identity ---------- */

export function Swatch({ family, bar, title }: { family: FamilyKey; bar?: boolean; title?: string }) {
  return (
    <i
      className={cx("sw", bar && "sw--bar")}
      style={{ ["--c" as string]: FAMILY[family].band, background: FAMILY[family].band } as CSSProperties}
      aria-hidden={title ? undefined : true}
      title={title}
    />
  );
}

export function RankingChip({ slug, href }: { slug: string; href?: string | false }) {
  const r = RANKINGS.find((x) => x.slug === slug);
  if (!r) return null;
  const inner = (
    <>
      <Swatch family={r.family} />
      {r.short}
    </>
  );
  return href === false ? (
    <span className="chip chip--outline">{inner}</span>
  ) : (
    <Link href={href ?? `/admin/rankings/${r.slug}`} className="chip chip--outline">
      {inner}
    </Link>
  );
}

export function RankingName({ slug }: { slug: string }) {
  const r = RANKINGS.find((x) => x.slug === slug);
  if (!r) return null;
  return (
    <span className="row nowrap" style={{ gap: 8 }}>
      <Swatch family={r.family} />
      {r.short}
    </span>
  );
}

export function Sdg({ n, withName }: { n: number; withName?: boolean }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="sdg" style={{ background: SDG_COLORS[n], color: inkOn(SDG_COLORS[n]) }} title={`SDG ${n}: ${SDG_NAMES[n]}`}>
        {n}
        {!withName && <span className="sr-only">{`: ${SDG_NAMES[n]}`}</span>}
      </span>
      {withName && <span className="small">{SDG_NAMES[n]}</span>}
    </span>
  );
}

export function SdgList({ sdgs }: { sdgs: number[] }) {
  return (
    <span className="chips" aria-label={`SDGs ${sdgs.join(", ")}`}>
      {sdgs.map((n) => (
        <Sdg key={n} n={n} />
      ))}
    </span>
  );
}

/* ---------- Dates ---------- */

export function Due({ iso, withDays, year }: { iso: string; withDays?: boolean; year?: boolean }) {
  const d = daysUntil(iso);
  return (
    <span className="nowrap">
      <time dateTime={iso}>{formatDate(iso, year ? { day: "numeric", month: "short", year: "numeric" } : undefined)}</time>
      {withDays && (
        <span className="muted">
          {" · "}
          {d < 0 ? `${-d} days overdue` : d === 0 ? "today" : `in ${d} days`}
        </span>
      )}
    </span>
  );
}

/* ---------- Feedback ---------- */

export function Notice({
  tone = "gold",
  icon,
  children,
  role,
}: {
  tone?: "gold" | "ok" | "info" | "warn" | "plain";
  icon?: IconName;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  const fallback: IconName = tone === "ok" ? "check-circle" : tone === "warn" ? "alert" : "info";
  return (
    <div className={cx("notice", tone !== "gold" && `notice--${tone}`)} role={role}>
      <Icon name={icon ?? fallback} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon = "search", title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} />
      </span>
      <p className="empty__title">{title}</p>
      {children && <div className="measure">{children}</div>}
    </div>
  );
}

/* Dominican-inspired geometric pattern (cross fleury lattice), used subtly. */
export function Pattern({ className, fade = "left" }: { className?: string; fade?: "left" | "right" | "up" | "down" | "none" }) {
  return (
    <span className={cx("pattern", `pattern--${fade}`, className)} aria-hidden="true">
      <span className="pattern__tile" />
    </span>
  );
}
