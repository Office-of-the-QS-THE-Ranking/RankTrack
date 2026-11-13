"use client";

/*
 * Option cards for a single choice (firewall mode, 2-step verification, a rule's action): native radios behind
 * raised cards, so arrow keys and screen readers work as usual. Each card carries a radio mark and a footer that
 * says "Active" on the chosen one and "Choose" on the others; the chosen card takes its option's tone. Styles:
 * security.css (.cc-*).
 */
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

export type ChoiceTone = "ok" | "warn" | "danger" | "neutral";

export interface Choice<T extends string> {
  value: T;
  label: string;
  sub: string;
  icon: IconName;
  tone?: ChoiceTone;
  disabled?: boolean;
}

export function ChoiceCards<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  disabled,
  chosen = "Active",
  locked,
}: {
  name: string;
  label: string;
  value: T;
  options: Choice<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
  /** The chosen card's footer. */
  chosen?: string;
  /** Shown on cards that can't be picked, in place of "Choose". */
  locked?: ReactNode;
}) {
  return (
    <div className="cc" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = value === o.value;
        const off = disabled || o.disabled;
        return (
          <label key={o.value} className="cc-card" data-on={on || undefined} data-off={(off && !on) || undefined} data-tone={o.tone ?? "neutral"}>
            <input type="radio" className="sr-only" name={name} value={o.value} checked={on} disabled={off} onChange={() => onChange(o.value)} />
            <span className="cc-card__top">
              <span className="cc-card__icon" aria-hidden="true">
                <Icon name={o.icon} size={17} />
              </span>
              <span className="cc-card__radio" aria-hidden="true">
                {on && <Icon name="check" size={11} strokeWidth={3} />}
              </span>
            </span>
            <b className="cc-card__label">{o.label}</b>
            <small className="cc-card__sub">{o.sub}</small>
            <span className="cc-card__foot" aria-hidden="true">
              {on ? (
                <>
                  <i className="cc-card__dot" /> {chosen}
                </>
              ) : off ? (
                <>
                  <Icon name="lock" size={11} /> {locked ?? "Unavailable"}
                </>
              ) : (
                <>
                  Choose <Icon name="arrow" size={12} />
                </>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
