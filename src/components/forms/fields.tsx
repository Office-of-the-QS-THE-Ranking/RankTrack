"use client";

/*
 * The form modules' inputs: one component per field type, and FieldInput, which picks it. A field shows its
 * label, a short help line, "Optional" when it is, and a hint behind an info mark; every rule a module checks
 * (lib/forms/modules.ts) reaches the Hub's own field messages: native constraints on plain inputs, and for
 * groups (chips, SDGs, people, rows, budgets) a hidden proxy right after the group that carries the module's
 * message, so the group gets the red edge, the shake and the warning sign. The bigger modules (people, tables,
 * counts, budgets) are in blocks.tsx.
 */
import { useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { dayLabel, formHelpText, manilaDay } from "@/lib/forms/format";
import { LIMITS, OTHER, choiceOptions, emailProblem, moduleOf, phoneProblem, sentenceCount, type FormContext } from "@/lib/forms/modules";
import type {
  ChoiceSpec,
  ChoiceValue,
  ConsentSpec,
  DateRange,
  FieldSpec,
  LinkSpec,
  NameParts,
  ParagraphSpec,
  SdgsSpec,
  Signature,
  SignatureSpec,
  TextSpec,
  UnitSection,
  UnitSpec,
  Value,
  YesNoSpec,
} from "@/lib/forms/types";
import { useExamplePlaceholder } from "./useExamplePlaceholder";
import { UNIT_CATEGORY_LABELS } from "@/lib/unit-categories";
import { BudgetInput, BudgetSummaryInput, CountsInput, PeopleInput, TableInput } from "./blocks";
import { GroupCheck, LinkBox, MoneyInput, NameInput, NamePartsInput, PhoneInput, RangeInput, nameParts, useValidity } from "./controls";

export interface InputProps<S extends FieldSpec = FieldSpec> {
  spec: S;
  value: Value | undefined;
  onChange: (v: Value | undefined) => void;
  ctx: FormContext;
  /** A base for the field's element ids, unique on the page. */
  id: string;
  /** A row of a table field was removed, for fields that read its rows. */
  onRowRemoved?: (index: number) => void;
  /** The people in this question right now, in a team copy: a flag each, and the question ringed in the first one's colour. */
  peers?: { id: string; name: string; color: string }[];
}

/* ---------- Shared pieces ---------- */

/** The module's message for a group, without the parts its own inputs already check. */
const groupProblem = (spec: FieldSpec, value: Value | undefined, ctx: FormContext) => moduleOf(spec).problem(spec, value, ctx);

/** A field's label, help line, Optional tag and hint, around its control. */
export function FieldFrame({ spec, labelFor, labelId, peers, children }: { spec: FieldSpec; labelFor?: string; labelId: string; peers?: InputProps["peers"]; children: ReactNode }) {
  const Label = labelFor ? "label" : "span";
  const budgetHelp = spec.help === "They receive the budget and file the expense report.";
  const phasesHelp = spec.type === "table" && spec.label === "Phases" && spec.help === "At least 2.";
  const hint = spec.hint ?? (phasesHelp ? "Minimum of two (2) Phases" : budgetHelp ? spec.help : undefined);
  const help = budgetHelp || phasesHelp || spec.type === "people" && spec.help === `Up to ${spec.max}.` ? undefined : formHelpText(spec.help);
  // Words, declarations and a summary that only adds up the budget aren't questions that can be skipped.
  const optional = !spec.required && spec.type !== "note" && spec.type !== "consent" && !(spec.type === "budgetsummary" && !spec.payee);
  return (
    <div
      className="fm-field"
      data-type={spec.type}
      data-half={spec.half || undefined}
      data-field={spec.id}
      data-peers={peers?.length ? "" : undefined}
      style={peers?.length ? ({ "--peer": peers[0].color } as CSSProperties) : undefined}
    >
      {peers && peers.length > 0 && (
        <span className="fm-peers" aria-live="polite">
          {peers.map((p) => (
            <span key={p.id} className="fm-peer" style={{ "--peer": p.color } as CSSProperties}>
              {p.name}
            </span>
          ))}
          <span className="sr-only">{peers.length === 1 ? "is" : "are"} in this question</span>
        </span>
      )}
      {spec.type !== "note" && (
        <div className="fm-field__head">
          <Label className="fm-field__label" id={labelId} {...(labelFor && { htmlFor: labelFor })}>
            {spec.label}
          </Label>
          {optional && <span className="fm-optional">Optional</span>}
          {hint && (
            <InfoTooltip label={`About ${spec.label}`} escapeClipping>
              {hint}
            </InfoTooltip>
          )}
        </div>
      )}
      {help && spec.type !== "note" && <p className="fm-field__help">{help}</p>}
      {children}
    </div>
  );
}

/** Any field: its frame and the input for its type. */
export function FieldInput(props: InputProps) {
  const { spec, id } = props;
  const labelId = `${id}-label`;
  const single = ["text", "paragraph", "link", "money"].includes(spec.type);
  return (
    <FieldFrame spec={spec} labelFor={single ? `${id}-input` : undefined} labelId={labelId} peers={props.peers}>
      <Control {...props} labelId={labelId} />
    </FieldFrame>
  );
}

function Control(props: InputProps & { labelId: string }) {
  const { spec } = props;
  switch (spec.type) {
    case "text":
      return <TextInput {...props} spec={spec} />;
    case "paragraph":
      return <ParagraphInput {...props} spec={spec} />;
    case "choice":
      return <ChoiceInput {...props} spec={spec} />;
    case "yesno":
      return <YesNoInput {...props} spec={spec} />;
    case "unit":
      return <UnitInput {...props} spec={spec} />;
    case "sdgs":
      return <SdgsInput {...props} spec={spec} />;
    case "date":
      return (
        <DateField
          displayFormat="long"
          className="input"
          value={typeof props.value === "string" ? props.value : ""}
          onChange={(d) => props.onChange(d || undefined)}
          min={spec.min}
          max={spec.max}
          required={spec.required}
          aria-label={spec.label}
          aria-describedby={props.labelId}
        />
      );
    case "daterange":
      return <RangeInput value={props.value as DateRange | undefined} onChange={props.onChange} required={!!spec.required} label={spec.label} allowSeparate />;
    case "number":
      return (
        <span className="fm-number">
          <NumberField
            allowEmpty
            className="input"
            value={typeof props.value === "number" ? props.value : NaN}
            onChange={(n) => props.onChange(Number.isFinite(n) ? n : undefined)}
            min={spec.min ?? 0}
            max={spec.max}
            aria-label={spec.label}
          />
          {spec.unit && <span className="fm-number__unit">{spec.unit}</span>}
        </span>
      );
    case "money":
      return <MoneyInput spec={spec} id={`${props.id}-input`} value={props.value} onChange={props.onChange} required={!!spec.required} />;
    case "link":
      return <LinkInput {...props} spec={spec} />;
    case "people":
      return <PeopleInput {...props} spec={spec} />;
    case "table":
      return <TableInput {...props} spec={spec} />;
    case "counts":
      return <CountsInput {...props} spec={spec} />;
    case "budget":
      return <BudgetInput {...props} spec={spec} />;
    case "budgetsummary":
      return <BudgetSummaryInput {...props} spec={spec} />;
    case "consent":
      return <ConsentInput {...props} spec={spec} />;
    case "signature":
      return <SignatureInput {...props} spec={spec} />;
    case "note":
      return (
        <p className="fm-note">
          <Icon name="info" size={16} />
          <span>{spec.text}</span>
        </p>
      );
  }
}

/* ---------- One line, several lines ---------- */

function TextInput(props: InputProps<TextSpec>) {
  const { spec, value, onChange, id } = props;
  const text = typeof value === "string" ? value : "";
  const placeholder = useExamplePlaceholder(spec.caps ? spec.id : "", text, spec.placeholder);
  if (spec.format === "phone") return <PhoneInput id={`${id}-input`} value={text} placeholder={spec.placeholder} maxLength={spec.max ?? LIMITS.phone} required={spec.required} onChange={(v) => onChange(v || undefined)} />;
  if (spec.caps) return <NameInput caps id={`${id}-input`} autoComplete="off" value={text} placeholder={placeholder} maxLength={spec.max ?? LIMITS.text} required={spec.required} onChange={(v) => onChange(v || undefined)} />;
  return <PlainTextInput {...props} />;
}

function PlainTextInput({ spec, value, onChange, id }: InputProps<TextSpec>) {
  const text = typeof value === "string" ? value : "";
  const placeholder = useExamplePlaceholder(spec.id, text, spec.placeholder);
  const problem = !text ? "" : spec.format === "email" ? emailProblem(text, spec.domain) : spec.format === "phone" ? phoneProblem(text) : "";
  const ref = useValidity<HTMLInputElement>(problem);
  return (
    <input
      ref={ref}
      id={`${id}-input`}
      className="input"
      type={spec.format === "email" ? "email" : spec.format === "phone" ? "tel" : "text"}
      inputMode={spec.format === "email" ? "email" : spec.format === "phone" ? "tel" : undefined}
      autoComplete={spec.format === "email" ? "email" : spec.format === "phone" ? "tel" : "off"}
      title=""
      value={text}
      placeholder={placeholder ?? (spec.format === "email" && spec.domain ? `name@${spec.domain}` : undefined)}
      maxLength={spec.max ?? LIMITS.text}
      required={spec.required}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}

function ParagraphInput({ spec, value, onChange, id }: InputProps<ParagraphSpec>) {
  const text = typeof value === "string" ? value : "";
  const placeholder = useExamplePlaceholder(spec.id, text, spec.placeholder);
  const count = spec.sentences ? sentenceCount(text) : 0;
  const over = !!spec.sentences && count > spec.sentences;
  const ref = useValidity<HTMLTextAreaElement>(over ? `Keep it to ${spec.sentences} sentences or fewer. This has ${count}.` : "");
  return (
    <div className="fm-para">
      <textarea
        ref={ref}
        id={`${id}-input`}
        className="textarea"
        rows={4}
        title=""
        value={text}
        placeholder={placeholder}
        maxLength={spec.max ?? LIMITS.paragraph}
        required={spec.required}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {spec.sentences ? (
        <span className={`fm-para__count${over ? " is-over" : ""}`} aria-live="polite">
          {count} of {spec.sentences} sentences
        </span>
      ) : null}
    </div>
  );
}

/* ---------- Choices ---------- */

const asChoice = (v: Value | undefined): ChoiceValue => (v && typeof v === "object" && !Array.isArray(v) && "picked" in v ? (v as ChoiceValue) : { picked: [] });

function SpecifyInput({ spec, value, onChange }: { spec: ChoiceSpec; value: string; onChange: (value: string) => void }) {
  const placeholder = useExamplePlaceholder(spec.id, value, "Specify");

  return (
    <label className="fm-other-field">
      <span className="fm-other-field__label">Specify</span>
      <input
        className="input fm-other"
        aria-label={`${spec.other}: specify`}
        placeholder={placeholder}
        title=""
        value={value}
        maxLength={LIMITS.other}
        required
        data-missing={`Write your answer for “${spec.other}”.`}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ChoiceInput({ spec, value, onChange, ctx, id, labelId }: InputProps<ChoiceSpec> & { labelId: string }) {
  const group = useRef<HTMLDivElement>(null);
  const { picked, other = "" } = asChoice(value);
  const options = choiceOptions(spec);
  const full = !!spec.multiple && !!spec.max && picked.length >= spec.max;
  // The words for Others are checked on their own field, so the group is checked as if they were there.
  const problem = groupProblem(spec, picked.length ? { picked, other: "-" } : undefined, ctx);
  const set = (next: string[], words = other) => onChange(next.length ? { picked: options.map((o) => o.value).filter((x) => next.includes(x)), ...(next.includes(OTHER) && words && { other: words }) } : undefined);
  const toggle = (v: string) => (spec.multiple ? set(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]) : set([v]));
  const chips = spec.display === "chips";
  return (
    <>
      <div className="fm-proxied">
        <div
          ref={group}
          className={`fm-options fm-options--${chips ? "chips" : "cards"}`}
          role={spec.multiple ? "group" : "radiogroup"}
          aria-labelledby={labelId}
          tabIndex={-1}
          data-multiline
        >
          {options.map((o) => {
            const on = picked.includes(o.value);
            const off = full && !on;
            return (
              <label key={o.value} className={chips ? "fm-chip" : "choice fm-option"} data-on={on || undefined} aria-disabled={off || undefined}>
                <input
                  type={spec.multiple ? "checkbox" : "radio"}
                  className={chips ? "sr-only" : undefined}
                  name={`${id}-choice`}
                  value={o.value}
                  checked={on}
                  disabled={off}
                  onChange={() => toggle(o.value)}
                />
                {chips && <Icon name={on ? "check" : "plus"} size={14} className="fm-chip__mark" />}
                <span className="choice__text">
                  {o.label}
                  {o.hint && <small>{o.hint}</small>}
                </span>
              </label>
            );
          })}
        </div>
        <GroupCheck message={problem} group={group} />
      </div>
      {spec.multiple && spec.max ? (
        <span className={`fm-tally${full ? " is-full" : ""}`} aria-live="polite">
          {picked.length} of {spec.max} chosen
        </span>
      ) : null}
      {picked.includes(OTHER) && (
        <SpecifyInput spec={spec} value={other} onChange={(words) => set(picked, words)} />
      )}
    </>
  );
}

function YesNoInput({ spec, value, onChange, id, labelId }: InputProps<YesNoSpec> & { labelId: string }) {
  return (
    <div className="fm-options fm-options--yesno" role="radiogroup" aria-labelledby={labelId}>
      {(["yes", "no"] as const).map((v) => (
        <label key={v} className="choice fm-option" data-on={value === v || undefined}>
          <input type="radio" name={`${id}-yesno`} value={v} checked={value === v} required={spec.required} onChange={() => onChange(v)} />
          <span className="choice__text">{v === "yes" ? (spec.yes ?? "Yes") : (spec.no ?? "No")}</span>
        </label>
      ))}
    </div>
  );
}

function UnitInput({ spec, value, onChange, ctx, labelId }: InputProps<UnitSpec> & { labelId: string }) {
  const sections = (Object.keys(UNIT_CATEGORY_LABELS) as UnitSection[]).filter((s) => !spec.sections?.length || spec.sections.includes(s));
  return (
    <Select className="select" value={typeof value === "string" ? value : ""} onChange={(v) => onChange(v || undefined)} required={spec.required} placeholder="Choose a unit" searchable aria-describedby={labelId} aria-label={spec.label}>
      {sections.map((s) => (
        <optgroup key={s} label={UNIT_CATEGORY_LABELS[s]}>
          {ctx.units
            .filter((u) => u.section === s)
            .map((u) => (
              <option key={u.id} value={u.id} data-depth={u.depth ?? 0}>
                {u.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

function SdgsInput({ spec, value, onChange, ctx }: InputProps<SdgsSpec>) {
  const { sdgNames, sdgIcons } = useViews();
  const group = useRef<HTMLDivElement>(null);
  const picked = Array.isArray(value) ? (value as number[]) : [];
  const full = !!spec.max && picked.length >= spec.max;
  const [bump, setBump] = useState(0);
  const goals = Object.keys(sdgNames).map(Number).sort((a, b) => a - b);
  const toggle = (n: number) => {
    if (picked.includes(n)) return onChange(picked.length > 1 ? picked.filter((x) => x !== n) : undefined);
    if (full) return setBump((b) => b + 1);
    onChange([...picked, n].sort((a, b) => a - b));
  };
  return (
    <>
      <div className="fm-proxied">
        <div ref={group} className="fm-sdgs" tabIndex={-1} data-multiline>
          <ul className="pc-sdgs pc-sdgs--compact">
            {goals.map((n) => (
              <li key={n}>
                <button type="button" className="pc-sdg" aria-pressed={picked.includes(n)} aria-label={`SDG ${n}: ${sdgNames[n]}`} title={`SDG ${n}: ${sdgNames[n]}`} onClick={() => toggle(n)}>
                  <img src={sdgIcons[n]} alt="" width={466} height={466} loading="lazy" draggable={false} />
                  <span className="pc-sdg__check" aria-hidden="true">
                    <Icon name="check" size={13} strokeWidth={2.8} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <GroupCheck message={groupProblem(spec, value, ctx)} group={group} />
      </div>
      <span key={bump} className={`fm-tally${full ? " is-full" : ""}${bump ? " is-bumped" : ""}`} aria-live="polite">
        {picked.length ? picked.map((n) => `SDG ${n}`).join(" · ") : "None chosen"}
        {spec.max ? ` · ${picked.length} of ${spec.max}` : ""}
      </span>
    </>
  );
}

/* ---------- Days and amounts ---------- */

function LinkInput({ spec, value, onChange, id }: InputProps<LinkSpec>) {
  return <LinkBox id={`${id}-input`} value={typeof value === "string" ? value : ""} onChange={(v) => onChange(v || undefined)} required={spec.required} placeholder={spec.placeholder} />;
}

/* ---------- Agreeing and signing ---------- */

function ConsentInput({ spec, value, onChange, id }: InputProps<ConsentSpec>) {
  const agreed = Array.isArray(value) ? (value as string[]) : [];
  return (
    <ul className="fm-consents">
      {spec.statements.map((s) => (
        <li key={s.id}>
          <label className="choice fm-consent" data-on={agreed.includes(s.id) || undefined}>
            <input
              type="checkbox"
              name={`${id}-${s.id}`}
              checked={agreed.includes(s.id)}
              required={spec.required}
              onChange={(e) => {
                const next = e.target.checked ? [...agreed, s.id] : agreed.filter((x) => x !== s.id);
                onChange(next.length ? spec.statements.map((x) => x.id).filter((x) => next.includes(x)) : undefined);
              }}
            />
            <span className="choice__text">{s.text}</span>
          </label>
          {s.hint && (
            <InfoTooltip label="More about this" escapeClipping>
              {s.hint}
            </InfoTooltip>
          )}
        </li>
      ))}
    </ul>
  );
}

function SignatureInput({ spec, value, onChange, id }: InputProps<SignatureSpec>) {
  const signed = Array.isArray(value) ? (value as Signature[]) : [];
  const today = manilaDay();
  const set = (i: number, parts: NameParts, name: string) => {
    const next: Signature[] = spec.signers.map((_, j) => (j === i ? { ...parts, name, on: today } : { ...nameParts(signed[j]), name: signed[j]?.name ?? "", on: today }));
    onChange(next.some((s) => s.name.trim()) ? next : undefined);
  };
  return (
    <div className="fm-signs">
      {spec.signers.map((role, i) => {
        const name = signed[i]?.name ?? "";
        const parts = nameParts(signed[i]);
        return (
          <div key={role} className="fm-sign" data-signed={name.trim() ? "" : undefined}>
            <label className="fm-sign__role" htmlFor={`${id}-sign-${i}`}>
              {role}
            </label>
            <NamePartsInput
              id={`${id}-sign-${i}`}
              label={role}
              whose={spec.signers.length > 1 ? `the ${role.toLowerCase()}’s` : "your"}
              value={parts}
              required={spec.required}
              onChange={(next, full) => set(i, next, full)}
            />
            <span className="fm-sign__ink" aria-hidden="true">
              {name.trim() || " "}
            </span>
            <span className="fm-sign__line">
              <Icon name="pen" size={13} />
              {name.trim() ? `Signed electronically · ${dayLabel(today)}` : "Your typed name is your signature"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A unique, stable id base for a field on the page. */
export const useFieldId = (field: string) => `fm-${useId().replace(/[^a-zA-Z0-9-]/g, "")}-${field}`;
