"use client";

/*
 * The small controls the form modules share: a field's own message for what the browser can't check, the hidden
 * check after a group, a name in capitals, a person's name in parts, a range of days, a peso amount and a link that shows what it opens. fields.tsx and
 * blocks.tsx build the modules from them.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { DateField, DateRangeField, Select } from "@/components/ui/pickers";
import { recheckField } from "@/components/ui/validation";
import { LinkGlyph } from "@/components/workspace/LinkGlyph";
import { LINK_KIND_LABEL, cleanLink, linkKind } from "@/lib/governance/workspace";
import { hasEmoji, lettersOnly, noEmoji } from "@/lib/forms/letters";
import { LIMITS, NAME_PARTS, fullName, hasParts, nameProblem, phoneProblem, toCaps } from "@/lib/forms/modules";
import { dateEntries, formatPhone } from "@/lib/forms/format";
import type { DateRange, MoneySpec, NameParts, Value } from "@/lib/forms/types";

/** A message for a field the browser can't check by itself: "" when it's fine. */
export function useValidity<T extends HTMLInputElement | HTMLTextAreaElement>(message: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    ref.current?.setCustomValidity(message);
  }, [message]);
  return ref;
}

const TYPED = new Set(["text", "search", "email", "tel", "url", "password", ""]);
const typedInto = (t: EventTarget | null): t is HTMLInputElement | HTMLTextAreaElement => t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && TYPED.has(t.type));

/**
 * No emoji in any text box while a forms screen is open. Typed or picked emoji never go in; pasted, dropped or
 * composed text has its emoji taken out as it lands, the caret kept in place. The server strips them again.
 */
export function useNoEmoji() {
  useEffect(() => {
    const before = (e: InputEvent) => {
      if (!typedInto(e.target) || !e.data || !hasEmoji(e.data)) return;
      // An emoji on its own never goes in; text that carries words too is let in and cleaned on input below.
      if (!noEmoji(e.data).trim()) e.preventDefault();
    };
    const input = (e: Event) => {
      const el = e.target;
      if (!typedInto(el) || !hasEmoji(el.value) || (e as InputEvent).isComposing) return;
      const at = el.selectionStart;
      const caret = at === null ? null : noEmoji(el.value.slice(0, at)).length;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      // The native setter, so React sees the change as the field's own.
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, noEmoji(el.value));
      if (caret !== null) el.setSelectionRange(caret, caret);
    };
    const composed = (e: CompositionEvent) => {
      const el = e.target;
      if (typedInto(el) && hasEmoji(el.value)) el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    document.addEventListener("beforeinput", before, true);
    document.addEventListener("input", input, true);
    document.addEventListener("compositionend", composed, true);
    return () => {
      document.removeEventListener("beforeinput", before, true);
      document.removeEventListener("input", input, true);
      document.removeEventListener("compositionend", composed, true);
    };
  }, []);
}

/**
 * The hidden field after a group that carries the group's problem to the Hub's field messages. The group itself
 * (the element just before it) takes the red edge and the warning sign.
 */
export function GroupCheck({ message, group }: { message: string; group: React.RefObject<HTMLElement | null> }) {
  const ref = useValidity<HTMLInputElement>(message);
  useEffect(() => {
    recheckField(group.current);
  }, [message, group]);
  return <input ref={ref} className="pick-proxy" tabIndex={-1} aria-hidden="true" value={message ? "" : "1"} onChange={() => {}} />;
}

/**
 * A name field. With `caps`, it takes letters and spaces only, in capitals as they're typed: digits, symbols and
 * emoji never go in. A name saved before that rule is flagged until it's fixed.
 */
export function NameInput({ caps, value, onChange, ...rest }: { caps?: boolean; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const ref = useValidity<HTMLInputElement>(caps && value ? nameProblem(value) : "");
  const edit = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!caps) return onChange(e.target.value);
    const el = e.target;
    const kept = lettersOnly(el.value);
    // Characters taken out move the caret back by as many as went before it.
    const shift = (at: number | null) => (at === null ? null : at - (el.value.slice(0, at).length - lettersOnly(el.value.slice(0, at)).length));
    const [start, end] = [shift(el.selectionStart), shift(el.selectionEnd)];
    onChange(toCaps(kept));
    // Capitalizing replaces the value; keep the caret where it was when typing mid-word.
    requestAnimationFrame(() => {
      if (document.activeElement === el && start !== null && end !== null) el.setSelectionRange(start, end);
    });
  };
  return <input ref={ref} className="input" title="" autoCapitalize={caps ? "characters" : undefined} value={value} {...rest} onChange={edit} />;
}

/** A phone field with automatic mobile-number separators and stable caret placement. */
export function PhoneInput({ value, onChange, ...rest }: { value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const displayed = formatPhone(value);
  const ref = useValidity<HTMLInputElement>(value ? phoneProblem(displayed) : "");
  return <input {...rest} ref={ref} className={rest.className ?? "input"} type="tel" inputMode="tel" autoComplete="tel" title="" value={displayed} placeholder={rest.placeholder ?? "0912-345-6789"} onChange={(event) => {
    const input = event.currentTarget;
    const raw = input.value;
    const position = input.selectionStart ?? raw.length;
    const formatted = formatPhone(raw);
    let digitsBefore = raw.slice(0, position).replace(/\D/g, "").length;
    const removed = raw.replace(/\D/g, "").length - formatted.replace(/\D/g, "").length;
    if (removed > 0) digitsBefore = Math.max(0, digitsBefore - removed);
    let caret = formatted === raw ? position : 0;
    if (formatted !== raw) {
      let seen = 0;
      while (caret < formatted.length && seen < digitsBefore) {
        if (/\d/.test(formatted[caret])) seen++;
        caret++;
      }
    }
    // Apply the formatted value and caret together, without a delayed callback that could undo Select All.
    input.value = formatted;
    input.setSelectionRange(caret, caret);
    onChange(formatted);
  }} />;
}

/** A name's parts; one typed whole (from before names had parts) starts as the last name. */
export const nameParts = (p: (NameParts & { name?: string }) | undefined): NameParts => (hasParts(p) ? p! : { lastName: p?.name ?? "" });

/**
 * A person's name in three fields, last, first and an optional middle name, in capitals as they're typed. `whose`
 * words the empty-field messages: "the speaker’s". `compact` drops the labels for placeholders, for a budget line.
 */
export function NamePartsInput({ value, onChange, required, label, whose, compact, id }: { value: NameParts; onChange: (v: NameParts, full: string) => void; required?: boolean; label: string; whose: string; compact?: boolean; id?: string }) {
  const edit = (key: keyof NameParts, v: string) => {
    const next = { ...value, [key]: v };
    onChange(next, fullName(next));
  };
  return (
    <div className="fm-names" data-compact={compact || undefined}>
      {NAME_PARTS.map(([key, partLabel, autoComplete], i) => {
        const input = (
          <NameInput
            caps
            id={id && i === 0 ? id : undefined}
            className={compact ? "input input--sm" : "input"}
            autoComplete={autoComplete}
            placeholder={compact ? (key === "middleName" ? `${partLabel} (optional)` : partLabel) : undefined}
            aria-label={`${label}: ${partLabel.toLowerCase()}`}
            value={value[key] ?? ""}
            maxLength={LIMITS.name}
            required={required && key !== "middleName"}
            data-missing={`Enter ${whose} ${partLabel.toLowerCase()}.`}
            onChange={(v) => edit(key, v)}
          />
        );
        return compact ? (
          <span key={key}>{input}</span>
        ) : (
          <label key={key} className="fm-names__part">
            <span>
              {partLabel}
              {key === "middleName" && <span className="fm-optional">Optional</span>}
            </span>
            {input}
          </label>
        );
      })}
    </div>
  );
}

export function RangeInput({ value, onChange, required, label, allowSeparate = false }: { value: DateRange | undefined; onChange: (v: DateRange | undefined) => void; required: boolean; label: string; allowSeparate?: boolean }) {
  const stored = dateEntries(value);
  const entries = stored.length ? stored : [{ mode: "range" as const, from: "", to: "" }];
  const setEntries = (next: NonNullable<DateRange["entries"]>) => onChange({ from: "", to: "", entries: next });
  const edit = (index: number, change: Partial<NonNullable<DateRange["entries"]>[number]>) => setEntries(entries.map((entry, i) => i === index ? { ...entry, ...change } : entry));
  return (
    <div className="fm-dates">
      {entries.map((entry, index) => (
        <div key={index} className="fm-dates__entry" data-mode={allowSeparate ? entry.mode : "range"} data-removable={allowSeparate && entries.length > 1 || undefined}>
          {allowSeparate && <Select className="select" value={entry.mode} aria-label={`${label}: date ${index + 1} type`} onChange={(mode) => edit(index, { mode: mode === "day" ? "day" : "range", to: mode === "day" ? "" : entry.to || entry.from })}>
            <option value="range">Date range</option>
            <option value="day">Date only</option>
          </Select>}
          {allowSeparate && entry.mode === "day" ? <DateField displayFormat="long" className="input" value={entry.from} required={required} placeholder="Choose a date" aria-label={`${label}: date ${index + 1}, day`} onChange={(from) => edit(index, { from })} /> : <DateRangeField displayFormat="long" className="input" value={{ from: entry.from, to: entry.to }} required={required} placeholder="First day – Last day" aria-label={`${label}: date ${index + 1}, range`} onChange={(dates) => edit(index, dates)} />}
          {allowSeparate && entries.length > 1 && <button type="button" className="fm-x" aria-label={`Remove date ${index + 1}`} onClick={() => setEntries(entries.filter((_, i) => i !== index))}><Icon name="close" size={14} /></button>}
        </div>
      ))}
      {allowSeparate && entries.length < LIMITS.days && <button type="button" className="fm-add" onClick={() => setEntries([...entries, { mode: "day", from: "", to: "" }])}><Icon name="plus" size={15} /> Add date</button>}
    </div>
  );
}

const PESO_INPUT = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

/** A peso amount, written with commas once the field is left. */
export function MoneyInput({ id, value, onChange, required, label, spec }: { id?: string; value: Value | undefined; onChange: (v: number | undefined) => void; required?: boolean; label?: string; spec?: MoneySpec }) {
  const n = typeof value === "number" ? value : undefined;
  const [text, setText] = useState(n === undefined ? "" : PESO_INPUT.format(n));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(n === undefined ? "" : PESO_INPUT.format(n));
  }, [n, editing]);
  const max = spec?.max ?? LIMITS.money;
  return (
    <span className="input-group fm-money">
      <span className="fm-money__sign" aria-hidden="true">
        Php
      </span>
      <input
        id={id}
        inputMode="decimal"
        style={{ width: `calc(${Math.max(7, text.length + 1)}ch + var(--field-clear-space, 0px))` }}
        title=""
        value={text}
        placeholder="0.00"
        aria-label={label}
        required={required}
        data-missing="Enter an amount."
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.,]/g, "");
          setText(raw);
          const v = Number(raw.replace(/,/g, ""));
          onChange(raw && Number.isFinite(v) ? Math.min(max, Math.round(v * 100) / 100) : undefined);
        }}
      />
    </span>
  );
}

/** A link in a box that shows what it opens: Google Forms, Docs, Drive, a PDF or a page. */
export function LinkBox({ id, value, onChange, required, label, placeholder }: { id?: string; value: string; onChange: (v: string) => void; required?: boolean; label?: string; placeholder?: string }) {
  const link = value ? cleanLink(value) : null;
  const kind = link ? linkKind(link) : null;
  const ref = useValidity<HTMLInputElement>(value && !link ? "Use an https link, like https://forms.gle/…." : "");
  return (
    <span className="input-group fm-link" data-kind={kind ?? "none"}>
      {kind ? <LinkGlyph kind={kind} size={20} /> : <Icon name="link" size={16} />}
      <span className="sr-only">{kind ? LINK_KIND_LABEL[kind] : ""}</span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="url"
        title=""
        spellCheck={false}
        autoComplete="off"
        value={value}
        placeholder={placeholder ?? "https://"}
        aria-label={label}
        maxLength={2000}
        required={required}
        data-missing="Paste a link."
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : "")}
      />
    </span>
  );
}
