/*
 * A response from end to end: the answers as kept, which sections and fields show, and what still needs fixing.
 * The server runs it on every response and on every review; the responder page runs the same rules before it
 * sends, so the two never disagree.
 */
import { fieldMap, holds, moduleOf, type FormContext } from "./modules";
import type { Answers, BudgetValue, FieldSpec, FormSchema, Row, SectionSpec } from "./types";

export interface Problem {
  section: string;
  field: string;
  message: string;
}

/** What a check needs besides the answers: units and SDG names. */
export type CheckContext = Omit<FormContext, "answers" | "fields">;

/**
 * The answers as kept, from what a browser sent: known fields only, each cleaned by its module, in order, and
 * fields that don't show dropped; with every problem in the fields that do. `base` holds answers the conditions
 * may also read (the response itself, when its review is checked), and `known` their fields.
 */
export function checkAnswers(sections: SectionSpec[], raw: unknown, ctx: CheckContext, base: Answers = {}, known: FieldSpec[] = []): { answers: Answers; problems: Problem[] } {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields = fieldMap(sections, known);
  const scope: Answers = { ...base };
  const full: FormContext = { ...ctx, answers: scope, fields };
  const answers: Answers = {};
  const problems: Problem[] = [];
  for (const section of sections) {
    const shows = holds(section.showIf, scope, fields);
    for (const spec of section.fields) {
      if (spec.type === "note" || !shows || !holds(spec.showIf, scope, fields)) continue;
      const m = moduleOf(spec);
      const value = m.clean(spec, src[spec.id], full);
      if (value !== undefined) answers[spec.id] = scope[spec.id] = value;
      const message = m.problem(spec, value, full);
      if (message) problems.push({ section: section.id, field: spec.id, message });
    }
  }
  return { answers, problems };
}

/** A problem as a sentence that names its question: "Project title: fill this in." */
export function problemText(schema: FormSchema, p: Pick<Problem, "field" | "message">) {
  const label = fieldMap(schema.sections, schema.review?.fields).get(p.field)?.label;
  return label ? `${label}: ${p.message.charAt(0).toLowerCase()}${p.message.slice(1)}` : p.message;
}

/** The sections a response shows, given its answers. */
export function shownSections(schema: FormSchema, answers: Answers) {
  const fields = fieldMap(schema.sections);
  return schema.sections.filter((s) => holds(s.showIf, answers, fields));
}

/** Whether a field shows in a response, its section included. */
export function fieldShows(section: SectionSpec, spec: FieldSpec, answers: Answers, fields: Map<string, FieldSpec>) {
  return holds(section.showIf, answers, fields) && holds(spec.showIf, answers, fields);
}

/** Who a response is from, by the fields the form names: a name and an email. */
export function respondentOf(schema: FormSchema, answers: Answers): { name: string; email: string } {
  const from = schema.from;
  const name = from ? answers[from.name] : undefined;
  const mail = from?.email ? answers[from.email] : undefined;
  const email = typeof mail === "string" ? mail : Array.isArray(mail) && mail.length && typeof mail[0] === "object" ? ((mail[0] as { email?: string }).email ?? "") : "";
  return { name: typeof name === "string" ? name : "", email };
}

/**
 * The answers once a row of a table field is removed: what pointed at that row (a budget's lines for a phase, an
 * activity's phase) goes with it, and what pointed at later rows moves up one.
 */
export function afterRowRemoved(schema: FormSchema, answers: Answers, tableId: string, index: number): Answers {
  const next = { ...answers };
  for (const s of schema.sections) {
    for (const f of s.fields) {
      if (f.type === "budget" && f.per === tableId && next[f.id]) {
        const lines = (next[f.id] as BudgetValue).lines.filter((l) => l.part !== index).map((l) => (l.part !== undefined && l.part > index ? { ...l, part: l.part - 1 } : l));
        if (lines.length) next[f.id] = { lines };
        else delete next[f.id];
      }
      const pointing = f.type === "table" ? f.columns.filter((c) => c.optionsFrom === tableId) : [];
      if (pointing.length && next[f.id]) {
        next[f.id] = (next[f.id] as Row[]).map((r) => {
          const row = { ...r };
          for (const c of pointing) {
            const n = Number(row[c.id]);
            if (n === index + 1) delete row[c.id];
            else if (n > index + 1) row[c.id] = String(n - 1);
          }
          return row;
        });
      }
    }
  }
  return next;
}
