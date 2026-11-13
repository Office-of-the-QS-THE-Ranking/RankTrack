"use client";

/*
 * Pieces the analytics pages share: running a server action with its toast, an indicator's state, its points as one
 * stacked bar (secured, claimed, open, lost), the bands a value moves through, and the field each kind of input takes.
 */
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { toast } from "@/components/ui/toast";
import { cx } from "@/components/ui/primitives";
import type { LinkView } from "@/lib/analytics/desk-types";
import { pts } from "@/lib/analytics/format";
import { shortUrl } from "@/lib/analytics/links";
import type { BandHit, EvidenceSpec, IndicatorState, InputSpec, Points, Value } from "@/lib/analytics/types";
import { usePending } from "@/components/ui/ButtonBusy";

export type ActionResult<T = unknown> = { ok: boolean; message: string; data?: T };

/** Run a server action, show its outcome as a toast, and say whether it worked. */
export function useRun() {
  const [pending, start] = useTransition();
  usePending(pending);
  const run = <T,>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> =>
    new Promise((resolve) =>
      start(async () => {
        try {
          const r = await fn();
          toast(r.message, r.ok ? "ok" : "error");
          resolve(r);
        } catch {
          const r = { ok: false, message: "That didn’t go through. Check your connection and try again." };
          toast(r.message, "error");
          resolve(r);
        }
      }),
    );
  return { run, pending };
}

const STATE_CLASS: Record<IndicatorState, string> = {
  Validated: "status--ok",
  "For review": "status--review",
  "Needs revision": "status--revise",
  "Not started": "status--missing",
  "Not applicable": "status--na",
};

export function StatePill({ state, label }: { state: IndicatorState; label?: string }) {
  return (
    <span className={cx("status", STATE_CLASS[state])}>
      <i className="status__shape" aria-hidden="true" />
      {label ?? state}
    </span>
  );
}

/** An indicator's points on one bar: secured solid, claimed but not yet validated lighter, open dotted, lost faint red. */
export function PointsBar({ points, compact = false }: { points: Points | null; compact?: boolean }) {
  if (!points || points.max <= 0) return <span className="an-dash">—</span>;
  const w = (n: number) => `${Math.max(0, (n / points.max) * 100)}%`;
  const claimedOnly = Math.max(0, points.claimed - points.secured);
  const title = `${pts(points.claimed)} of ${pts(points.max)} claimed · ${pts(points.secured)} secured${points.open ? ` · ${pts(points.open)} open` : ""}${points.lost ? ` · ${pts(points.lost)} lost` : ""}`;
  return (
    <span className={cx("an-pbar", compact && "an-pbar--compact")} role="img" aria-label={title} data-tip={title}>
      <span className="an-pbar__track">
        <span className="an-pbar__seg an-pbar__seg--secured" style={{ width: w(points.secured) }} />
        <span className="an-pbar__seg an-pbar__seg--claimed" style={{ width: w(claimedOnly) }} />
        <span className="an-pbar__seg an-pbar__seg--open" style={{ width: w(points.open) }} />
        <span className="an-pbar__seg an-pbar__seg--lost" style={{ width: w(points.lost) }} />
      </span>
      {!compact && (
        <span className="an-pbar__val">
          {pts(points.claimed)}
          <span className="an-pbar__of">/{pts(points.max)}</span>
        </span>
      )}
    </span>
  );
}

/** The legend for PointsBar. */
export function PointsKey() {
  return (
    <span className="an-pkey" aria-hidden="true">
      <span><i className="an-pkey__dot an-pkey__dot--secured" />Secured</span>
      <span><i className="an-pkey__dot an-pkey__dot--claimed" />Claimed</span>
      <span><i className="an-pkey__dot an-pkey__dot--open" />Open</span>
      <span><i className="an-pkey__dot an-pkey__dot--lost" />Lost</span>
    </span>
  );
}

/** The bands a computed value moves through, the one it sits in marked, the next one up outlined. */
export function BandScale({ bands, hit }: { bands: { label: string; share: number }[]; hit: BandHit | null }) {
  const ordered = [...bands].sort((a, b) => a.share - b.share);
  return (
    <ol className="an-bands" aria-label="Bands">
      {ordered.map((b) => {
        const here = hit?.label === b.label;
        const next = hit?.next?.label === b.label;
        return (
          <li key={b.label} className={cx("an-bands__band", here && "is-here", next && "is-next")} style={{ "--share": b.share } as CSSProperties}>
            <span className="an-bands__fill" />
            <span className="an-bands__label">{b.label}</span>
            <span className="an-bands__share">{Math.round(b.share * 100)}%</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A ring for readiness (0–1 or 0–100). */
export function ReadyRing({ value, size = 44 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="an-ring" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v)}% ready`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="an-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={5} />
        <circle className="an-ring__fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={5} strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <span className="an-ring__label">{Math.round(v)}</span>
    </span>
  );
}

/** Small labelled figure. */
export function Figure({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "revise" | "missing" | "gold" }) {
  return (
    <div className={cx("an-fig", tone && `an-fig--${tone}`)}>
      <span className="an-fig__label">{label}</span>
      <span className="an-fig__value">{value}</span>
      {sub && <span className="an-fig__sub">{sub}</span>}
    </div>
  );
}

const pickedOf = (v: Value) => new Set(v.picks ?? []);

/**
 * The field an indicator takes, by its input type: a number with its unit, one option, several options (or No), Yes or
 * No, a date, or text; and a policy's dates when the body asks for them.
 */
export function ValueField({ id, input, value, onChange, unit, evidence, disabled }: { id: string; input: InputSpec; value: Value; onChange: (v: Value) => void; unit?: string | null; evidence: EvidenceSpec; disabled?: boolean }) {
  const set = (patch: Partial<Value>) => onChange({ ...value, ...patch });
  let field: ReactNode = null;
  switch (input.type) {
    case "number":
      field = (
        <NumberField
          id={id}
          value={value.num ?? NaN}
          onChange={(n) => set({ num: Number.isFinite(n) ? n : undefined })}
          min={input.min}
          max={input.max}
          step={input.integer ? 1 : 0.01}
          suffix={unit ?? input.unit}
          allowEmpty
          disabled={disabled}
          aria-label="Value"
        />
      );
      break;
    case "choice":
      field = (
        <Select id={id} className="select" value={value.choice ?? ""} onChange={(v) => set({ choice: v || undefined })} disabled={disabled} placeholder="Choose one" aria-label="Answer">
          <option value="">Choose one</option>
          {input.options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    case "picks": {
      const picked = pickedOf(value);
      field = (
        <div className="an-picks" role="group" aria-label="Answer">
          {input.options.map((o) => (
            <label key={o.key} className="an-pick">
              <input
                type="checkbox"
                checked={picked.has(o.key)}
                disabled={disabled}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(o.key);
                  else next.delete(o.key);
                  set({ picks: [...next], yes: next.size > 0 ? true : undefined });
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
          <label className="an-pick an-pick--no">
            <input type="checkbox" checked={value.yes === false} disabled={disabled} onChange={(e) => onChange(e.target.checked ? { yes: false } : {})} />
            <span>No, none of these</span>
          </label>
        </div>
      );
      break;
    }
    case "yesno":
      field = (
        <div className="an-yesno" role="radiogroup" aria-label="Answer">
          {[true, false].map((b) => (
            <button key={String(b)} type="button" role="radio" aria-checked={value.yes === b} className={cx("an-yesno__opt", value.yes === b && "is-on")} disabled={disabled} onClick={() => set({ yes: b })}>
              <Icon name={b ? "check" : "close"} size={15} />
              {b ? "Yes" : "No"}
            </button>
          ))}
        </div>
      );
      break;
    case "date":
      field = <DateField id={id} value={value.date ?? ""} onChange={(d) => set({ date: d || undefined })} disabled={disabled} aria-label="Date" />;
      break;
    case "text":
      field = <textarea id={id} className="textarea" rows={5} maxLength={input.max ?? 4000} value={value.text ?? ""} onChange={(e) => set({ text: e.target.value })} disabled={disabled} aria-label="Answer" />;
      break;
    default:
      field = <p className="an-muted">Computed from other indicators.</p>;
  }
  return (
    <div className="an-valuefield">
      {field}
      {evidence.policyDates && value.yes !== false && (
        <div className="an-dates">
          <label>
            <span>Policy made</span>
            <DateField value={value.created ?? ""} onChange={(d) => set({ created: d || undefined })} disabled={disabled} aria-label="When the policy was made" />
          </label>
          <label>
            <span>Last reviewed</span>
            <DateField value={value.reviewed ?? ""} onChange={(d) => set({ reviewed: d || undefined })} disabled={disabled} aria-label="When the policy was last reviewed" />
          </label>
        </div>
      )}
    </div>
  );
}

/** A link's address or evidence record, with what the Office made of it. */
export function LinkLine({ link, actions }: { link: LinkView; actions?: ReactNode }) {
  const name = link.label || link.evidenceTitle || (link.url ? shortUrl(link.url) : "Evidence record");
  return (
    <li className="an-link">
      <span className={cx("an-link__icon", link.folder && "is-warn")} aria-hidden="true">
        <Icon name={link.evidenceId ? "evidence" : link.folder ? "folder" : "link"} size={16} />
      </span>
      <span className="an-link__main">
        {link.url ? (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="an-link__name">
            {name}
          </a>
        ) : (
          <span className="an-link__name">{name}</span>
        )}
        <span className="an-link__meta">
          {link.unit ? link.unitName : "Office"}
          {link.year ? ` · ${link.year}` : ""}
          {link.public === true ? " · Public" : link.public === false ? " · Not public" : ""}
          {link.relevance ? ` · ${link.relevance}` : ""}
          {link.folder ? " · Folder" : ""}
        </span>
      </span>
      {actions}
    </li>
  );
}

/** An empty state with a soft illustration. */
export function EmptyState({ icon, title, children, action }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="an-empty">
      <span className="an-empty__art" aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <p className="an-empty__title">{title}</p>
      {children && <p className="an-empty__text">{children}</p>}
      {action}
    </div>
  );
}

/** The first rows of a long list, with more on request; a change of `filters` starts from the top again. */
export function useMore(filters: string, page = 60) {
  const [more, setMore] = useState({ filters, n: page });
  const limit = more.filters === filters ? more.n : page;
  return { limit, showMore: () => setMore({ filters, n: limit + page * 2 }) };
}

export function MoreRow({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (total <= shown) return null;
  return (
    <div className="an-more">
      <button type="button" className="btn btn--sm" onClick={onMore}>
        Show more
      </button>
      <span className="an-muted">
        {shown} of {total}
      </span>
    </div>
  );
}
