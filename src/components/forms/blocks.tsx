"use client";

/*
 * The bigger form modules' inputs. People: a card per person (name, phone, email; a fixed role each when the
 * form names roles). Tables: a card per row (Phase 1, Phase 2…; fixed rows like Project / Implementers /
 * Community; plain lists), each column a small field, columns that depend on another hidden until they apply.
 * Counts: a number per group and their total, with a bar of the mix. Budget: lines of quantity × rate × days
 * paid from a source, per phase when the budget follows a table, fixed rates locked, totals by source as you go
 * and a summary across phases.
 */
import { useEffect, useRef, useState } from "react";
import { findPeople } from "@/app/actions/form-people";
import { Face } from "@/components/ui/Face";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip, Segmented } from "@/components/ui/interactive";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { budgetItemLabel, budgetSourceLabel, budgetTotals, fixedLines, lineAmount, partName, partsOf, rateIsLocked } from "@/lib/forms/budget";
import { formHelpText, num, peso } from "@/lib/forms/format";
import { LOOKUP_MIN, directoryPicked, lookupKey, type PersonMatch } from "@/lib/forms/people-lookup";
import { LIMITS, columnOptions, columnShows, countsTotal, emailProblem, moduleOf, peopleDetails, peopleEmailOptional, phoneProblem, rowName, tableColumns } from "@/lib/forms/modules";
import type { BudgetLine, BudgetSpec, BudgetSummarySpec, BudgetValue, Cell, CountsSpec, DateRange, PeopleSpec, Person, Row, TableColumn, TableSpec } from "@/lib/forms/types";
import { SourceSummaryTable } from "./answers";
import { GroupCheck, LinkBox, MoneyInput, NameInput, NamePartsInput, PhoneInput, RangeInput, nameParts, useValidity } from "./controls";
import { useExamplePlaceholder } from "./useExamplePlaceholder";
import type { InputProps } from "./fields";

/** Keep source controls aligned when a rate grows with its formatted amount. */
function measureBudgetRate(line: HTMLLIElement | null) {
  const rate = line?.querySelector<HTMLElement>(".fm-rate, .fm-line__rate");
  if (!line || !rate) return;
  const measure = () => line.style.setProperty("--fm-rate-width", `${rate.getBoundingClientRect().width}px`);
  const observer = new ResizeObserver(measure);
  observer.observe(rate);
  measure();
  return () => observer.disconnect();
}

/* ---------- People ---------- */

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function Checked({ kind, value, domain, onChange, ...rest }: { kind: "email" | "phone"; value: string; domain?: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const ref = useValidity<HTMLInputElement>(!value ? "" : kind === "email" ? emailProblem(value, domain) : phoneProblem(value));
  if (kind === "phone") return <PhoneInput value={value} onChange={onChange} {...rest} />;
  return <input ref={ref} className="input" type="email" inputMode="email" title="" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

/**
 * People in the University directory whose names start with the last and first names typed, while the card has
 * no email yet; choosing one fills in their email and photo. Only for responders who may look people up.
 */
function PersonMatches({ code, field, person, who, onPick }: { code: string; field: string; person: Person; who: string; onPick: (m: PersonMatch) => void }) {
  const last = lookupKey(person.lastName ?? "");
  const first = lookupKey(person.firstName ?? "");
  const ready = !person.email && last.length >= LOOKUP_MIN && first.length >= LOOKUP_MIN;
  const query = `${last}|${first}`;
  const [found, setFound] = useState<{ query: string; people: PersonMatch[] }>();
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const t = setTimeout(() => {
      findPeople({ code, field, lastName: last, firstName: first })
        .then((r) => live && setFound({ query, people: r.ok ? r.people : [] }))
        .catch(() => undefined);
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [ready, code, field, last, first, query]);
  const people = ready && found?.query === query ? found.people : [];
  if (!people.length) return null;
  return (
    <div className="fm-match" role="group" aria-label={`${who}: matches in the UST directory`}>
      {people.map((m) => (
        <button key={m.email} type="button" className="fm-match__item" onClick={() => onPick(m)}>
          <span className="fm-match__face" aria-hidden="true">
            <Face src={m.photo}>{initials(m.name)}</Face>
          </span>
          <span className="fm-match__who">
            <b>{m.name}</b>
            <span>{m.email}</span>
          </span>
          <span className="fm-match__use">Use</span>
        </button>
      ))}
    </div>
  );
}

export function PeopleInput({ spec, value, onChange, id, ctx }: InputProps<PeopleSpec>) {
  const people = Array.isArray(value) ? (value as Person[]) : [];
  const roles = spec.roles ?? [];
  const slots: Person[] = roles.length ? roles.map((role, i) => ({ ...(people[i] ?? { name: "" }), role })) : people.length ? people : [{ name: "" }];
  const least = roles.length || Math.max(spec.min ?? 0, 1);
  const noun = spec.noun ?? "person";
  const set = (list: Person[]) => onChange(list.some((p) => p.name || p.phone || p.email) || list.length > 1 ? list : undefined);
  const edit = (i: number, change: Partial<Person>) => set(slots.map((p, j) => (j === i ? { ...p, ...change } : p)));
  return (
    <>
      <ul className="fm-people">
        {slots.map((p, i) => {
          const who = p.role ?? (spec.max > 1 ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${i + 1}` : noun.charAt(0).toUpperCase() + noun.slice(1));
          // A card that's there must be filled in; an optional list may stay as one empty card.
          const needed = !!spec.required || slots.length > 1 || !!(p.name || p.phone || p.email);
          return (
            <li key={i} className="fm-person">
              <span className="fm-person__face" aria-hidden="true">
                <Face src={p.photo}>{initials(p.name) || <Icon name="user" size={16} />}</Face>
              </span>
              <div className="fm-person__body">
                <span className="fm-person__who">{who}</span>
                <div className="fm-person__fields" data-ask={peopleDetails(spec).join(" ")}>
                  <NamePartsInput
                    label={who}
                    whose={`the ${(p.role ?? noun).toLowerCase()}’s`}
                    value={nameParts(p)}
                    required={needed}
                    onChange={(parts, name) => edit(i, { ...parts, name })}
                  />
                  {peopleDetails(spec).includes("phone") && (
                    <Checked kind="phone" value={p.phone ?? ""} placeholder="0912-345-6789" aria-label={`${who}: phone`} autoComplete="tel" maxLength={LIMITS.phone} required={needed} data-missing="Enter a phone number." onChange={(phone) => edit(i, { phone })} />
                  )}
                  {peopleDetails(spec).includes("email") && (
                    <span className="fm-person__email">
                      <Checked kind="email" domain={spec.domain} value={p.email ?? ""} placeholder={peopleEmailOptional(spec) ? "Email (optional)" : spec.domain ? `name@${spec.domain}` : "Email"} aria-label={`${who}: email${peopleEmailOptional(spec) ? " (optional)" : ""}`} autoComplete="email" maxLength={LIMITS.email} required={needed && !peopleEmailOptional(spec)} data-missing="Enter an email address." onChange={(email) => edit(i, { email: email.trim(), photo: undefined, directoryEmail: undefined })} />
                      {directoryPicked(p) && <span className="fm-person__verified"><InfoTooltip label="Verified using Google" tone="success" escapeClipping icon={<><Icon name="shield" size={22} /><Icon name="check" size={12} strokeWidth={2.5} /></>}>Verified using Google</InfoTooltip></span>}
                      {p.email && <button type="button" className="fm-person__email-clear" aria-label={`Clear ${who.toLowerCase()} email`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => {
                        const input = event.currentTarget.parentElement?.querySelector("input");
                        edit(i, { email: "", photo: undefined, directoryEmail: undefined });
                        input?.focus();
                      }}><Icon name="close" size={14} /></button>}
                    </span>
                  )}
                </div>
                {ctx.directory && peopleDetails(spec).includes("email") && (
                  <PersonMatches code={ctx.directory} field={spec.id} person={p} who={who} onPick={(m) => edit(i, { email: m.email, photo: m.photo, directoryEmail: m.email })} />
                )}
              </div>
              {!roles.length && slots.length > least && (
                <button type="button" className="fm-x" aria-label={`Remove ${who.toLowerCase()}`} onClick={() => set(slots.filter((_, j) => j !== i))}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!roles.length && slots.length < spec.max && (
        <button type="button" className="fm-add" onClick={() => set([...slots, { name: "" }])} aria-describedby={`${id}-label`}>
          <Icon name="plus" size={15} /> Add {noun}
          <span className="fm-add__count">
            {slots.length} of {spec.max}
          </span>
        </button>
      )}
    </>
  );
}

/* ---------- Tables ---------- */

function CellInput({ tableId, col, value, onChange, label, i, ctx }: { tableId: string; col: TableColumn; value: Cell | undefined; onChange: (v: Cell | undefined) => void; label: string; i: number; ctx: InputProps["ctx"] }) {
  const text = typeof value === "string" ? value : "";
  const placeholder = useExamplePlaceholder(tableId === "results" ? `${tableId}.${col.id}.${i}` : `${tableId}.${col.id}`, text, col.examples?.[i] ?? col.placeholder, tableId === "collaborators" ? i : 0);
  switch (col.type) {
    case "text":
      return <NameInput caps={col.caps} value={text} placeholder={placeholder} aria-label={label} maxLength={col.max ?? LIMITS.cell} required={col.required} onChange={(v) => onChange(v || undefined)} />;
    case "name":
      return <NamePartsInput label={label} whose={`the ${col.label.toLowerCase()}’s`} value={value && typeof value === "object" && !("from" in value) ? value : {}} required={col.required} onChange={(parts, full) => onChange(full ? parts : undefined)} />;
    case "paragraph":
      return <textarea className="textarea fm-cell__para" title="" rows={2} value={text} placeholder={placeholder} aria-label={label} maxLength={col.max ?? LIMITS.cellLong} required={col.required} onChange={(e) => onChange(e.target.value || undefined)} />;
    case "choice": {
      const options = columnOptions(col, ctx);
      return (
        <Select className="select" value={text} onChange={(v) => onChange(v || undefined)} required={col.required} placeholder={options.length ? "Choose" : "Nothing to choose yet"} aria-label={label}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    }
    case "date":
      return <DateField displayFormat="long" className="input" value={text} onChange={(d) => onChange(d || undefined)} required={col.required} aria-label={label} />;
    case "daterange":
      return <RangeInput value={value as DateRange | undefined} onChange={(v) => onChange(v)} required={!!col.required} label={label} allowSeparate />;
    case "number":
      return <NumberField allowEmpty className="input" value={typeof value === "number" ? value : NaN} onChange={(n) => onChange(Number.isFinite(n) ? n : undefined)} min={0} aria-label={label} />;
    case "money":
      return <MoneyInput value={value as number | undefined} onChange={onChange} required={col.required} label={label} />;
    case "link":
      return <LinkBox value={text} onChange={(v) => onChange(v || undefined)} required={col.required} label={label} placeholder={placeholder} />;
  }
}

export function TableInput({ spec, value, onChange, ctx, onRowRemoved }: InputProps<TableSpec>) {
  const columns = tableColumns(spec);
  const group = useRef<HTMLUListElement>(null);
  const stored = Array.isArray(value) ? (value as Row[]) : [];
  const fixed = spec.rows?.length ?? 0;
  const least = fixed || spec.min || (spec.required ? 1 : 0);
  const most = fixed || spec.max || LIMITS.rows;
  const rows: Row[] = fixed ? spec.rows!.map((_, i) => stored[i] ?? {}) : stored.length >= least ? stored : [...stored, ...Array.from({ length: least - stored.length }, () => ({}))];
  const single = columns.length === 1;
  const set = (next: Row[]) => onChange(next.some((r) => Object.keys(r).length) || next.length > least ? next : undefined);
  const edit = (i: number, col: TableColumn, v: Cell | undefined) =>
    set(
      rows.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r };
        if (v === undefined) delete next[col.id];
        else next[col.id] = v;
        // A column that no longer applies keeps nothing.
        for (const c of columns) if (!columnShows(c, next)) delete next[c.id];
        return next;
      }),
    );
  const remove = (i: number) => {
    set(rows.filter((_, j) => j !== i));
    onRowRemoved?.(i);
  };
  const filled = rows.filter((r) => Object.keys(r).length).length;
  const noun = spec.numbered?.toLowerCase() ?? "row";
  // Required cells speak for themselves; a table with none needs the count checked on the whole.
  const countProblem = !columns.some((c) => c.required) && filled < least ? (least === 1 ? `Fill in at least one ${noun}.` : `Fill in at least ${least} ${noun}s.`) : "";
  return (
    <>
      <div className="fm-proxied">
        <ul ref={group} className={`fm-rows${single ? " fm-rows--single" : ""}${fixed ? " fm-rows--fixed" : ""}`} tabIndex={-1} data-multiline>
          {rows.map((row, i) => {
            const name = rowName(spec, i);
            const named = !!fixed || !!spec.numbered;
            const removable = !fixed && rows.length > least;
            return (
              <li key={i} className="fm-row">
                {named && (
                  <span className="fm-row__name">
                    {spec.numbered && <span className="fm-row__num">{i + 1}</span>}
                    {fixed ? name : spec.numbered}
                  </span>
                )}
                <div className="fm-row__cells">
                  {columns
                    .filter((col) => columnShows(col, row))
                    .map((col) => (
                      <div key={col.id} className="fm-cell" data-column={col.id} data-type={col.type} data-wide={col.wide || single || undefined}>
                        {!single && (
                          <span className="fm-cell__label">
                            {col.label}
                            {!col.required && <em> · optional</em>}
                          </span>
                        )}
                        <CellInput tableId={spec.id} col={col} value={row[col.id]} onChange={(v) => edit(i, col, v)} label={named ? `${name}: ${col.label}` : col.label} i={i} ctx={ctx} />
                      </div>
                    ))}
                </div>
                {removable && (
                  <button type="button" className="fm-x fm-row__x" aria-label={`Remove ${named ? name.toLowerCase() : `this ${noun}`}`} onClick={() => remove(i)}>
                    <Icon name="close" size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <GroupCheck message={countProblem} group={group} />
      </div>
      {!fixed && rows.length < most && (
        <button type="button" className="fm-add" onClick={() => set([...rows, {}])}>
          <Icon name="plus" size={15} /> {spec.add ?? "Add row"}
          {spec.max ? (
            <span className="fm-add__count">
              {rows.length} of {spec.max}
            </span>
          ) : null}
        </button>
      )}
    </>
  );
}

/* ---------- Counts ---------- */

/** Distinct group colors, shared by the legend dots and mix bar. */
const MIX = ["#f2b705", "#3977cf", "#288c83", "#8b65bd", "#d57652", "#c65b85", "#7b8797"];

export function CountsInput({ spec, value, onChange, ctx }: InputProps<CountsSpec>) {
  const group = useRef<HTMLDivElement>(null);
  const counts = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, number>;
  const total = countsTotal(counts);
  const set = (id: string, n: number) => {
    const next = { ...counts, [id]: Math.max(0, Math.round(n) || 0) };
    if (!next[id]) delete next[id];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="fm-proxied">
      <div ref={group} className="fm-counts" tabIndex={-1} data-multiline>
        <ul className="fm-counts__list">
          {spec.rows.map((r, i) => (
            <li key={r.id} className="fm-count">
              <span className="fm-count__dot" style={{ background: MIX[i % MIX.length] }} aria-hidden="true" />
              <span className="fm-count__label">{r.label}</span>
              <NumberField allowEmpty className="input input--sm" value={counts[r.id] ?? 0} min={0} max={LIMITS.count} onChange={(n) => set(r.id, n)} aria-label={r.label} />
            </li>
          ))}
        </ul>
        <div className="fm-counts__total">
          <span>{spec.total}</span>
          <strong>{num(total)}</strong>
          <span className="fm-mix" aria-hidden="true">
            {spec.rows.map((r, i) => (counts[r.id] ? <i key={r.id} style={{ flexGrow: counts[r.id], background: MIX[i % MIX.length] }} /> : null))}
          </span>
        </div>
      </div>
      <GroupCheck message={moduleOf(spec).problem(spec, value, ctx)} group={group} />
    </div>
  );
}

/* ---------- Budget ---------- */

let lineSeq = 0;
const newKey = () => `n${Date.now().toString(36)}${(++lineSeq).toString(36)}`;

export function BudgetInput({ spec, value, onChange, ctx }: InputProps<BudgetSpec>) {
  const group = useRef<HTMLDivElement>(null);
  const lines = (value as BudgetValue | undefined)?.lines ?? (spec.fixed ? fixedLines(spec) : []);
  const parts = spec.per ? partsOf(spec, ctx.answers) : 1;
  const table = spec.per ? (ctx.fields.get(spec.per) as TableSpec | undefined) : undefined;
  const rows = spec.per ? ((ctx.answers[spec.per] as Row[] | undefined) ?? []) : [];
  const [view, setView] = useState<string>("0");
  useEffect(() => {
    if (view !== "all" && Number(view) >= Math.max(1, parts)) setView(String(Math.max(0, parts - 1)));
  }, [parts, view]);
  const part = view === "all" ? null : Number(view);
  const totals = budgetTotals(spec, { lines }, Math.max(1, parts));
  const set = (next: BudgetLine[]) => onChange(spec.fixed ? (next.some((l) => lineAmount(l) > 0) ? { lines: next } : undefined) : next.length ? { lines: next } : undefined);
  const edit = (key: string, change: Partial<BudgetLine>) => set(lines.map((l) => {
    if (l.key !== key) return l;
    const next = { ...l, ...change };
    const preset = spec.categories.find((c) => c.id === next.category)?.presets?.find((p) => p.item === next.item);
    if (change.source !== undefined && rateIsLocked(spec, preset, next.source)) next.rate = preset?.rate ?? 0;
    return next;
  }));
  const here = spec.per ? lines.filter((l) => l.part === part) : lines;
  const sourceLabel = (id: string) => {
    const source = spec.sources.find((s) => s.id === id);
    return source ? budgetSourceLabel(source) : id;
  };
  const add = (category: string, item: string, rate = 0, source?: string) =>
    set([...lines, { key: newKey(), category, item, qty: 1, rate, days: 1, source: source ?? spec.sources[0]?.id ?? "", ...(spec.per && { part: part ?? 0 }) }]);
  const problem = moduleOf(spec).problem(spec, value, ctx);
  const shown = part === null ? totals : (totals.byPart[part] ?? { total: 0, bySource: {} });

  return (
    <div className="fm-proxied">
      <div ref={group} className={`fm-budget${spec.theoretical ? " fm-budget--theory" : ""}`} tabIndex={-1} data-multiline>
        {spec.per && (
          <div className="fm-budget__parts">
            {parts ? (
              <Segmented
                label="Phase"
                variant="pills"
                value={view}
                onChange={setView}
                options={[
                  ...Array.from({ length: parts }, (_, i) => ({ value: String(i), label: partName(spec, table, rows, i) })),
                  { value: "all", label: "All phases" },
                ]}
              />
            ) : (
              <p className="fm-budget__empty">
                <Icon name="calendar" size={16} /> Add the phases first, under Where and when.
              </p>
            )}
          </div>
        )}

        {part !== null && (!spec.per || parts > 0) && (
          <div className="fm-cats">
            {spec.categories.map((c) => {
              const mine = here.filter((l) => l.category === c.id);
              const used = new Set(mine.map((l) => l.item));
              const offered = (c.presets ?? []).filter((p) => !used.has(p.item));
              const perDay = c.perDay !== false;
              const hint = formHelpText(c.hint);
              return (
                <section key={c.id} className="fm-cat" aria-label={c.label}>
                  <header className="fm-cat__head">
                    <h4 className="fm-cat__title">{c.label}</h4>
                    {hint && <span className="fm-cat__hint">{hint}</span>}
                    <span className="fm-cat__sum">{peso(mine.reduce((a, l) => a + lineAmount(l), 0))}</span>
                  </header>
                  {mine.length > 0 && (
                    <ul className="fm-lines">
                      {mine.map((l) => {
                        const preset = c.presets?.find((p) => p.item === l.item);
                        const locked = rateIsLocked(spec, preset, l.source);
                        return (
                          <li key={l.key} ref={measureBudgetRate} className="fm-line" data-fixed={spec.fixed || undefined}>
                            <div className="fm-line__item">
                              {preset || spec.fixed ? (
                                <span className="fm-line__name">
                                  {budgetItemLabel(l.item)}
                                  {formHelpText(preset?.hint) && <small>{formHelpText(preset?.hint)}</small>}
                                </span>
                              ) : (
                                <input className="input input--sm" title="" value={l.item} placeholder="Item" aria-label={`${c.label}: item`} maxLength={LIMITS.name} required data-missing="Name the item." onChange={(e) => edit(l.key, { item: e.target.value })} />
                              )}
                              {preset?.recipient && (
                                <NamePartsInput
                                  compact
                                  label={`${l.item}: recipient`}
                                  whose={`the ${l.item.toLowerCase()} recipient’s`}
                                  value={l.recipientName ?? nameParts({ name: l.recipient })}
                                  required={lineAmount(l) > 0}
                                  onChange={(parts, full) => edit(l.key, full ? { recipientName: parts, recipient: full } : { recipientName: undefined, recipient: undefined })}
                                />
                              )}
                            </div>
                            <div className="fm-line__calc">
                              <NumberField allowEmpty className="input input--sm fm-line__qty" value={l.qty} min={0} max={LIMITS.qty} onChange={(n) => edit(l.key, { qty: Math.max(0, Math.round(n) || 0) })} aria-label={`${l.item || c.label}: quantity`} />
                              <span className="fm-times" aria-hidden="true">
                                ×
                              </span>
                              {locked ? (
                                <span className="fm-rate" title="Fixed rate">
                                  <Icon name="lock" size={12} />
                                  {peso(l.rate, true)}
                                </span>
                              ) : (
                                <span className="fm-line__rate">
                                  <MoneyInput value={l.rate} onChange={(v) => edit(l.key, { rate: v ?? 0 })} label={`${l.item || c.label}: rate`} />
                                </span>
                              )}
                              {perDay && (
                                <>
                                  <span className="fm-times" aria-hidden="true">
                                    ×
                                  </span>
                                  <NumberField allowEmpty className="input input--sm fm-line__days" value={l.days} suffix={l.days === 1 ? "day" : "days"} min={1} max={LIMITS.days} onChange={(n) => edit(l.key, { days: Math.max(1, Math.round(n) || 1) })} aria-label={`${l.item || c.label}: days`} />
                                </>
                              )}
                            </div>
                            {spec.fixed || preset?.source ? (
                              <span className="fm-src" data-source={l.source}>
                                {sourceLabel(l.source)}
                              </span>
                            ) : (
                              <Select className="select select--sm fm-line__src" value={l.source} onChange={(v) => edit(l.key, { source: v })} aria-label={`${l.item || c.label}: paid from`}>
                                {spec.sources.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {budgetSourceLabel(s)}
                                  </option>
                                ))}
                              </Select>
                            )}
                            <span className="fm-line__amount">{peso(lineAmount(l))}</span>
                            {c.id === "transport" && (
                              <Select className="select select--sm fm-line__payment" value={l.transportPayment ?? ""} onChange={(v) => edit(l.key, { transportPayment: v === "cash" || v === "ovrf" ? v : undefined })} placeholder="Transportation paid through" aria-label={`${l.item || c.label}: payment method`}>
                                <option value="cash">Through Cash</option>
                                <option value="ovrf">Purchasing Office (OVRF)</option>
                              </Select>
                            )}
                            {!spec.fixed && (
                              <button type="button" className="fm-x" aria-label={`Remove ${l.item || "this line"}`} onClick={() => set(lines.filter((x) => x.key !== l.key))}>
                                <Icon name="close" size={14} />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {!spec.fixed && (offered.length > 0 || c.custom) && (
                    <div className="fm-cat__add">
                      {offered.map((p) => (
                        <button key={p.item} type="button" className="fm-addchip" onClick={() => add(c.id, p.item, p.rate ?? 0, p.source)}>
                          <Icon name="plus" size={13} />
                          {p.item}
                          {p.rate ? <b>{peso(p.rate, true)}</b> : null}
                        </button>
                      ))}
                      {c.custom && (
                        <button type="button" className="fm-addchip fm-addchip--own" onClick={() => add(c.id, "")}>
                          <Icon name="plus" size={13} />
                          {offered.length ? "Other" : "Add item"}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {part === null && spec.per && (
          <div className="fm-budget__summary">
            <table className="fm-sumtable">
              <caption className="sr-only">Budget by phase and source</caption>
              <thead>
                <tr>
                  <th scope="col">Phase</th>
                  {spec.sources.map((s) => (
                    <th key={s.id} scope="col">
                      {budgetSourceLabel(s)}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {totals.byPart.map((p, i) => (
                  <tr key={i}>
                    <th scope="row">{partName(spec, table, rows, i)}</th>
                    {spec.sources.map((s) => (
                      <td key={s.id}>{peso(p.bySource[s.id] ?? 0, true)}</td>
                    ))}
                    <td>{peso(p.total, true)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">All phases</th>
                  {spec.sources.map((s) => (
                    <td key={s.id}>{peso(totals.bySource[s.id] ?? 0, true)}</td>
                  ))}
                  <td>{peso(totals.total, true)}</td>
                </tr>
              </tfoot>
            </table>
            <ul className="fm-catbars">
              {spec.categories.map((c) => (
                <li key={c.id}>
                  <span>{c.label}</span>
                  <span className="fm-catbars__bar">
                    <i style={{ width: `${totals.total ? ((totals.byCategory[c.id] ?? 0) / totals.total) * 100 : 0}%` }} />
                  </span>
                  <b>{peso(totals.byCategory[c.id] ?? 0, true)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className="fm-budget__foot" aria-live="polite">
          <span className="fm-split" aria-hidden="true">
            {spec.sources.map((s) => (shown.bySource[s.id] ? <i key={s.id} data-source={s.id} style={{ flexGrow: shown.bySource[s.id] }} /> : null))}
          </span>
          <span className="fm-budget__sources">
            {spec.sources.map((s) => (
              <span key={s.id} className="fm-budget__source" data-source={s.id}>
                <i aria-hidden="true" />
                {budgetSourceLabel(s)} <b>{peso(shown.bySource[s.id] ?? 0)}</b>
              </span>
            ))}
          </span>
          <span className="fm-budget__total">
            {spec.theoretical ? "Theoretical value" : part !== null && spec.per ? "This phase" : "Total"} <b>{peso(shown.total)}</b>
            {part !== null && spec.per && parts > 1 && <small>All phases {peso(totals.total)}</small>}
          </span>
        </footer>
      </div>
      <GroupCheck message={problem} group={group} />
    </div>
  );
}

/* ---------- Budget summary ---------- */

/**
 * One source of the budget added up as the paper's summary of budget under the CSF, live from every phase's lines.
 * With payees (the office's part), each category with an amount asks who it's paid to.
 */
export function BudgetSummaryInput({ spec, value, onChange, ctx }: InputProps<BudgetSummarySpec>) {
  const group = useRef<HTMLDivElement>(null);
  const budget = ctx.fields.get(spec.budget);
  if (budget?.type !== "budget") return null;
  const picked = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, string>;
  const set = (id: string, v: string) => {
    const next = { ...picked };
    if (v) next[id] = v;
    else delete next[id];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="fm-proxied">
      <div ref={group} className="fm-srcsum-wrap" tabIndex={-1} data-multiline>
        <SourceSummaryTable
          budget={budget}
          value={ctx.answers[spec.budget] as BudgetValue | undefined}
          source={spec.source}
          ctx={ctx}
          lines={!spec.payee}
          payee={
            spec.payee &&
            ((id, label) => (
              <Select className="select select--sm" value={picked[id] ?? ""} onChange={(v) => set(id, v)} placeholder="Choose" aria-label={`${label}: paid to`}>
                {spec.payee!.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ))
          }
        />
      </div>
      {spec.payee && <GroupCheck message={moduleOf(spec).problem(spec, value, ctx)} group={group} />}
    </div>
  );
}
