"use client";

/*
 * The form modules' answers, read back: what the responder checks before signing, what the people who run the
 * form read in a response, and what prints. Each module reads its own way: chips for choices, the goals' own
 * icons for SDGs, cards for people, a small table for rows, the mix for counts, the lines and totals for a
 * budget, typed names in ink for signatures.
 */
import { Fragment, type ReactNode } from "react";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Face } from "@/components/ui/Face";
import { Icon } from "@/components/ui/Icon";
import { LinkGlyph } from "@/components/workspace/LinkGlyph";
import { cleanLink, LINK_KIND_LABEL, linkKind } from "@/lib/governance/workspace";
import { budgetItemLabel, budgetSourceLabel, budgetTotals, lineAmount, partName, partsOf, sourceSummary } from "@/lib/forms/budget";
import { fieldShows } from "@/lib/forms/check";
import { datesLabel, dayLabel, nounFor, num, peso } from "@/lib/forms/format";
import { choiceOptions, columnOptions, columnShows, countsTotal, fullName, isNameCell, moduleOf, rowName, type FormContext } from "@/lib/forms/modules";
import type { BudgetSpec, BudgetValue, ChoiceValue, DateRange, FieldSpec, Person, Row, SectionSpec, Signature, TableSpec, Value } from "@/lib/forms/types";

const host = (href: string) => {
  try {
    const u = new URL(href);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname.slice(0, 24) + (u.pathname.length > 24 ? "…" : "") : ""}`;
  } catch {
    return href;
  }
};

function Sdgs({ list }: { list: number[] }) {
  const { sdgNames, sdgIcons } = useViews();
  return (
    <ul className="fm-a-sdgs">
      {list.map((n) => (
        <li key={n} title={`SDG ${n}: ${sdgNames[n] ?? ""}`}>
          <img src={sdgIcons[n]} alt={`SDG ${n}: ${sdgNames[n] ?? ""}`} width={466} height={466} loading="lazy" />
        </li>
      ))}
    </ul>
  );
}

/** One answer, read back. */
export function AnswerView({ spec, value, ctx }: { spec: FieldSpec; value: Value | undefined; ctx: FormContext }) {
  if (spec.type === "note") return null;
  if (!moduleOf(spec).filled(spec, value) && !(spec.type === "budget" && spec.fixed) && spec.type !== "budgetsummary") return <span className="fm-a-none">Not answered</span>;
  switch (spec.type) {
    case "text":
      return spec.format === "email" ? <a className="fm-a-link" href={`mailto:${value}`}>{String(value)}</a> : <span>{String(value)}</span>;
    case "paragraph":
      return <p className="fm-a-para">{String(value)}</p>;
    case "choice": {
      const { picked, other } = value as ChoiceValue;
      return (
        <ul className="fm-a-chips">
          {picked.map((p) => (
            <li key={p}>{p === "other" ? `${spec.other}: ${other ?? ""}` : (choiceOptions(spec).find((o) => o.value === p)?.label ?? p)}</li>
          ))}
        </ul>
      );
    }
    case "yesno":
    case "unit":
    case "date":
    case "number":
    case "money":
      return <span>{moduleOf(spec).text(spec, value, ctx)}</span>;
    case "daterange":
      return <span>{datesLabel(value as DateRange)}</span>;
    case "sdgs":
      return <Sdgs list={value as number[]} />;
    case "link": {
      const link = cleanLink(String(value));
      return link ? (
        <a className="fm-a-linkcard" href={link} target="_blank" rel="noopener noreferrer">
          <LinkGlyph kind={linkKind(link)} size={22} />
          <span>
            <b>{LINK_KIND_LABEL[linkKind(link)]}</b>
            {host(link)}
          </span>
          <Icon name="external" size={14} />
        </a>
      ) : (
        <span>{String(value)}</span>
      );
    }
    case "people":
      return (
        <ul className="fm-a-people">
          {(value as Person[])
            .filter((p) => p.name)
            .map((p, i) => (
              <li key={i}>
                <span className="fm-a-people__face" aria-hidden="true">
                  <Face src={p.photo}>
                    {p.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase())
                      .join("")}
                  </Face>
                </span>
                <span className="fm-a-people__who">
                  <b>{p.name}</b>
                  {p.role && <em>{p.role}</em>}
                </span>
                <span className="fm-a-people__reach">
                  {p.phone && (
                    <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>
                      <Icon name="phone" size={12} />
                      {p.phone}
                    </a>
                  )}
                  {p.email && (
                    <a href={`mailto:${p.email}`}>
                      <Icon name="mail" size={12} />
                      {p.email}
                    </a>
                  )}
                </span>
              </li>
            ))}
        </ul>
      );
    case "table":
      return <TableAnswer spec={spec} rows={value as Row[]} ctx={ctx} />;
    case "counts": {
      const counts = value as Record<string, number>;
      return (
        <div className="fm-a-counts">
          <ul>
            {spec.rows
              .filter((r) => counts[r.id])
              .map((r) => (
                <li key={r.id}>
                  <span>{r.label}</span>
                  <b>{num(counts[r.id])}</b>
                </li>
              ))}
          </ul>
          <p className="fm-a-counts__total">
            {spec.total} <b>{num(countsTotal(counts))}</b>
          </p>
        </div>
      );
    }
    case "budget":
      return <BudgetAnswer spec={spec} value={value as BudgetValue | undefined} ctx={ctx} />;
    case "budgetsummary": {
      const budget = ctx.fields.get(spec.budget);
      const picked = (value ?? {}) as Record<string, string>;
      return budget?.type === "budget" ? (
        <SourceSummaryTable
          budget={budget}
          value={ctx.answers[spec.budget] as BudgetValue | undefined}
          source={spec.source}
          ctx={ctx}
          lines={!spec.payee}
          payee={spec.payee && ((id) => spec.payee!.find((o) => o.value === picked[id])?.label ?? <span className="fm-a-none">Not chosen</span>)}
        />
      ) : null;
    }
    case "consent":
      return (
        <ul className="fm-a-agreed">
          {spec.statements
            .filter((s) => (value as string[]).includes(s.id))
            .map((s) => (
              <li key={s.id}>
                <Icon name="check" size={14} />
                {s.text}
              </li>
            ))}
        </ul>
      );
    case "signature":
      return (
        <ul className="fm-a-signs">
          {(value as Signature[]).map((s, i) =>
            s.name ? (
              <li key={i}>
                <span className="fm-a-signs__ink">{s.name}</span>
                <span className="fm-a-signs__meta">
                  {spec.signers[i]}
                  {s.on && ` · signed ${dayLabel(s.on)}`}
                </span>
              </li>
            ) : null,
          )}
        </ul>
      );
  }
}

function cellText(col: TableSpec["columns"][number], v: Row[string] | undefined, ctx: FormContext) {
  if (v === undefined || v === "") return "";
  if (isNameCell(v)) return fullName(v);
  if (typeof v === "object") return datesLabel(v as DateRange);
  if (col.type === "money") return peso(Number(v));
  if (col.type === "number") return num(Number(v));
  if (col.type === "date") return dayLabel(String(v));
  if (col.type === "choice") return columnOptions(col, ctx).find((o) => o.value === v)?.label ?? String(v);
  return String(v);
}

function TableAnswer({ spec, rows, ctx }: { spec: TableSpec; rows: Row[]; ctx: FormContext }) {
  if (spec.columns.length === 1) {
    const col = spec.columns[0];
    return spec.rows?.length ? (
      <dl className="fm-a-rows">
        {rows.map((r, i) => (
          <Fragment key={i}>
            <dt>{rowName(spec, i)}</dt>
            <dd>{cellText(col, r[col.id], ctx) || "—"}</dd>
          </Fragment>
        ))}
      </dl>
    ) : (
      <ul className="fm-a-chips">
        {rows.map((r, i) => (
          <li key={i}>{cellText(col, r[col.id], ctx)}</li>
        ))}
      </ul>
    );
  }
  return (
    <ol className="fm-a-table">
      {rows.map((r, i) => (
        <li key={i}>
          {(spec.numbered || spec.rows) && <span className="fm-a-table__name">{rowName(spec, i)}</span>}
          <dl>
            {spec.columns
              .filter((c) => columnShows(c, r) && cellText(c, r[c.id], ctx))
              .map((c) => (
                <div key={c.id} data-wide={c.wide || c.type === "paragraph" || undefined}>
                  <dt>{c.label}</dt>
                  <dd>{c.type === "link" && cleanLink(String(r[c.id])) ? <a href={cleanLink(String(r[c.id]))!} target="_blank" rel="noopener noreferrer">{host(cleanLink(String(r[c.id]))!)}</a> : cellText(c, r[c.id], ctx)}</dd>
                </div>
              ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

function BudgetAnswer({ spec, value, ctx }: { spec: Extract<FieldSpec, { type: "budget" }>; value: BudgetValue | undefined; ctx: FormContext }) {
  const parts = spec.per ? partsOf(spec, ctx.answers) : 1;
  const totals = budgetTotals(spec, value, Math.max(1, parts));
  const lines = value?.lines ?? [];
  const table = spec.per ? (ctx.fields.get(spec.per) as TableSpec | undefined) : undefined;
  const rows = spec.per ? ((ctx.answers[spec.per] as Row[] | undefined) ?? []) : [];
  const label = (id: string) => {
    const source = spec.sources.find((s) => s.id === id);
    return source ? budgetSourceLabel(source) : id;
  };
  return (
    <div className="fm-a-budget">
      {Array.from({ length: Math.max(1, parts) }, (_, p) => {
        const mine = spec.per ? lines.filter((l) => l.part === p) : lines;
        if (!mine.some((l) => lineAmount(l) > 0)) return null;
        return (
          <table key={p} className="fm-a-lines">
            {spec.per && <caption>{partName(spec, table, rows, p)}</caption>}
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Quantity × rate × days</th>
                <th scope="col">From</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {mine
                .filter((l) => lineAmount(l) > 0)
                .map((l) => (
                  <tr key={l.key}>
                    <th scope="row">
                      {budgetItemLabel(l.item)}
                      {l.recipient && <small> · {l.recipient}</small>}
                      {l.transportPayment && <small> · {l.transportPayment === "cash" ? "Through Cash" : "Purchasing Office (OVRF)"}</small>}
                    </th>
                    <td>
                      {num(l.qty)} × {peso(l.rate, true)} × {num(l.days)}
                    </td>
                    <td>{label(l.source)}</td>
                    <td>{peso(lineAmount(l))}</td>
                  </tr>
                ))}
            </tbody>
            {spec.per && (
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    {partName(spec, table, rows, p).split(" · ")[0]} total
                  </th>
                  <td>{peso(totals.byPart[p]?.total ?? 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        );
      })}
      <p className="fm-a-budget__sum">
        {spec.sources.map((s) => (
          <span key={s.id} data-source={s.id}>
            {budgetSourceLabel(s)} <b>{peso(totals.bySource[s.id] ?? 0, true)}</b>
          </span>
        ))}
        <span className="fm-a-budget__total">
          {spec.theoretical ? "Theoretical value" : "Total"} <b>{peso(totals.total, true)}</b>
        </span>
      </p>
    </div>
  );
}

/**
 * One source of a budget added up, as the paper's summary of budget under the CSF: by category, with each line under
 * it when `lines` (the item, its phase, and quantity × rate × days beneath), the subtotals and the overall total.
 * `payee` fills the Paid to column of each category with an amount: a picker while the office fills it in, the
 * choice once made.
 */
export function SourceSummaryTable({ budget, value, source, ctx, lines = true, payee }: { budget: BudgetSpec; value: BudgetValue | undefined; source: string; ctx: FormContext; lines?: boolean; payee?: (categoryId: string, label: string) => ReactNode }) {
  const sum = sourceSummary(budget, value, source);
  const table = budget.per ? (ctx.fields.get(budget.per) as TableSpec | undefined) : undefined;
  const rows = budget.per ? ((ctx.answers[budget.per] as Row[] | undefined) ?? []) : [];
  const shown = sum.categories.filter((c) => c.total > 0);
  const label = sum.source?.label ?? source;
  if (!shown.length) return <p className="fm-srcsum__empty">No {label} lines yet. Lines paid from the {label} in the budget add up here.</p>;
  return (
    <table className={`fm-srcsum${lines ? "" : " fm-srcsum--compact"}`}>
      <thead>
        <tr>
          <th scope="col">Item</th>
          {payee && <th scope="col">Paid to</th>}
          <th scope="col">{label}</th>
        </tr>
      </thead>
      {shown.map((c) => (
        <tbody key={c.id}>
          <tr className="fm-srcsum__cat">
            <th scope="rowgroup">{c.label}</th>
            {payee && <td>{payee(c.id, c.label)}</td>}
            <td>{peso(c.total, !lines)}</td>
          </tr>
          {lines &&
            c.lines.map((l) => (
              <tr key={l.key} className="fm-srcsum__line">
                <th scope="row">
                  <span className="fm-srcsum__item">
                    {budgetItemLabel(l.item)}
                    {l.recipient && <small> · {l.recipient}</small>}
                    {l.transportPayment && <small> · {l.transportPayment === "cash" ? "Through Cash" : "Purchasing Office (OVRF)"}</small>}
                    {budget.per && l.part !== undefined && <em>{partName(budget, table, rows, l.part).split(" · ")[0]}</em>}
                  </span>
                  <span className="fm-srcsum__calc">
                    {num(l.qty)} × {peso(l.rate, true)}
                    {budget.categories.find((x) => x.id === l.category)?.perDay !== false && ` × ${num(l.days)} ${nounFor(l.days, "day")}`}
                  </span>
                </th>
                {payee && <td />}
                <td>{peso(lineAmount(l))}</td>
              </tr>
            ))}
        </tbody>
      ))}
      <tfoot>
        <tr>
          <th scope="row" colSpan={payee ? 2 : 1}>
            Overall total
          </th>
          <td>{peso(sum.total, !lines)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Every shown section of a response, its answers read back. `onEdit` adds an Edit button per section. */
export function AnswerSections({ sections, ctx, onEdit, compact = false }: { sections: SectionSpec[]; ctx: FormContext; onEdit?: (sectionId: string) => void; compact?: boolean }) {
  return (
    <div className={`fm-answers${compact ? " fm-answers--compact" : ""}`}>
      {sections.map((s) => {
        const fields = s.fields.filter((f) => f.type !== "note" && fieldShows(s, f, ctx.answers, ctx.fields));
        if (!fields.length) return null;
        return (
          <section key={s.id} className="fm-answers__section" aria-label={s.title}>
            <header className="fm-answers__head">
              <h3>{s.title}</h3>
              {onEdit && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => onEdit(s.id)}>
                  <Icon name="pen" size={14} /> Edit
                </button>
              )}
            </header>
            <dl className="fm-answers__list">
              {fields.map((f) => (
                <div key={f.id} className="fm-answers__item" data-type={f.type}>
                  <dt>{f.label}</dt>
                  <dd>
                    <AnswerView spec={f} value={ctx.answers[f.id]} ctx={ctx} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
