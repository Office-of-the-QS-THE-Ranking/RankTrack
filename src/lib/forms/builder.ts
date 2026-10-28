/*
 * The Forms Builder's working parts: a new question of each module with sensible defaults, answer keys made from
 * labels, presets dropped into a form without clashing with what's there, the references between fields (a
 * condition, a budget split by a table, a summary of a budget, a column's options from a table) kept right when
 * fields are renamed or removed, and what a condition can match. No server code; the Builder's save goes through
 * form.save, which checks the schema again with readSchema().
 */
import { PRESETS } from "./presets";
import { readSchema } from "./schema";
import type { ChoiceOption, Condition, FieldSpec, FieldType, FormSchema, SectionSpec, StageSpec } from "./types";

/** The modules a Builder palette offers, in the order people reach for them. */
export const PALETTE: { group: string; types: FieldType[] }[] = [
  { group: "Ask", types: ["text", "paragraph", "choice", "yesno", "number", "money", "date", "daterange", "link"] },
  { group: "Hub", types: ["unit", "sdgs", "people"] },
  { group: "Blocks", types: ["table", "counts", "budget", "budgetsummary"] },
  { group: "Sign", types: ["consent", "note"] },
];

/** Every answer key and section id in a form, review included. */
export function takenIds(schema: FormSchema): Set<string> {
  const out = new Set<string>();
  for (const s of schema.sections) {
    out.add(s.id);
    for (const f of s.fields) out.add(f.id);
  }
  for (const f of schema.review?.fields ?? []) out.add(f.id);
  for (const st of schema.review?.stages ?? []) out.add(st.id);
  return out;
}

/** "Name of the project" → "nameOfTheProject", kept free in `taken` with a number when needed. */
export function keyFrom(words: string, taken: Set<string>, fallback = "question"): string {
  const parts = words
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  let base = parts.map((p, i) => (i ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase())).join("");
  if (!/^[a-z]/.test(base)) base = fallback + base;
  base = base.slice(0, 32);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
}

const options = (...labels: string[]): ChoiceOption[] => labels.map((label, i) => ({ value: `option${i + 1}`, label }));

/** A new question of a module, ready to edit. `budgets` are the budget fields before it, for a summary. */
export function blankField(type: FieldType, taken: Set<string>, budgets: FieldSpec[] = []): FieldSpec | null {
  const label = BLANK_LABEL[type];
  const id = keyFrom(label, taken);
  const base = { id, label, required: type !== "note" && type !== "consent" ? true : undefined };
  switch (type) {
    case "text":
      return { ...base, type, max: 160 };
    case "paragraph":
      return { ...base, type, max: 3000 };
    case "choice":
      return { ...base, type, options: options("Option 1", "Option 2"), display: "cards" };
    case "yesno":
      return { ...base, type };
    case "unit":
      return { ...base, type, sections: ["academic"] };
    case "sdgs":
      return { ...base, type, max: 3 };
    case "date":
    case "daterange":
    case "money":
    case "link":
      return { ...base, type };
    case "number":
      return { ...base, type, min: 0 };
    case "people":
      return { ...base, type, ask: ["email"], min: 1, max: 2, noun: "person" };
    case "table":
      return { ...base, type, required: undefined, max: 10, add: "Add row", columns: [{ id: "name", label: "Name", type: "text", required: true }] };
    case "counts":
      return { ...base, type, rows: [{ id: "groupA", label: "Group A" }, { id: "groupB", label: "Group B" }], total: "Total" };
    case "budget":
      return {
        ...base,
        type,
        sources: [{ id: "requested", label: "Requested" }],
        categories: [{ id: "items", label: "Items", custom: true, perDay: false }],
      };
    case "budgetsummary": {
      const budget = budgets.findLast((f) => f.type === "budget");
      if (budget?.type !== "budget") return null;
      return { ...base, type, required: undefined, budget: budget.id, source: budget.sources[0].id };
    }
    case "consent":
      return { ...base, type, statements: [{ id: "agree", text: "I confirm that the information given is true and complete." }] };
    case "signature":
      return { ...base, type, signers: ["Respondent"] };
    case "note":
      return { id, type, label, text: "Words for the people filling in the form." };
  }
}

const BLANK_LABEL: Record<FieldType, string> = {
  text: "Short answer",
  paragraph: "Paragraph",
  choice: "Choose one",
  yesno: "Yes or no",
  unit: "University unit",
  sdgs: "Target SDGs",
  date: "Date",
  daterange: "Dates",
  number: "Number",
  money: "Amount",
  link: "Link",
  people: "People",
  table: "Rows",
  counts: "Counts",
  budget: "Budget",
  budgetsummary: "Budget summary",
  consent: "Declarations",
  signature: "Signature",
  note: "Note",
};

/* ---------- References between fields ---------- */

/** The ids a field points back at. */
export function refsOf(f: FieldSpec): string[] {
  const out: string[] = [];
  if (f.showIf) out.push(f.showIf.field);
  if (f.type === "budget" && f.per) out.push(f.per);
  if (f.type === "budgetsummary") out.push(f.budget);
  if (f.type === "table") for (const c of f.columns) if (c.optionsFrom) out.push(c.optionsFrom);
  return out;
}

/** A field with its references renamed. */
export function renameRefs<T extends FieldSpec>(f: T, map: Map<string, string>): T {
  const to = (id: string) => map.get(id) ?? id;
  const g = structuredClone(f) as FieldSpec;
  if (g.showIf) g.showIf = { ...g.showIf, field: to(g.showIf.field) };
  if (g.type === "budget" && g.per) g.per = to(g.per);
  if (g.type === "budgetsummary") g.budget = to(g.budget);
  if (g.type === "table") g.columns = g.columns.map((c) => (c.optionsFrom ? { ...c, optionsFrom: to(c.optionsFrom) } : c));
  return g as T;
}

/** Renames a field's key everywhere it's read. */
export function renameField(schema: FormSchema, from: string, to: string): FormSchema {
  const map = new Map([[from, to]]);
  const re = (f: FieldSpec) => renameRefs(f.id === from ? { ...f, id: to } : f, map);
  return {
    ...schema,
    sections: schema.sections.map((s) => ({ ...s, ...(s.showIf && { showIf: { ...s.showIf, field: s.showIf.field === from ? to : s.showIf.field } }), fields: s.fields.map(re) })),
    ...(schema.review && {
      review: {
        stages: schema.review.stages.map((st) => (st.showIf?.field === from ? { ...st, showIf: { ...st.showIf, field: to } } : st)),
        fields: schema.review.fields.map(re),
      },
    }),
    ...(schema.from && { from: { name: schema.from.name === from ? to : schema.from.name, ...(schema.from.email && { email: schema.from.email === from ? to : schema.from.email }) } }),
  };
}

/** The questions that read this one: they'd break if it went. */
export function dependents(schema: FormSchema, id: string): string[] {
  const all = [...schema.sections.flatMap((s) => s.fields), ...(schema.review?.fields ?? [])];
  const out = all.filter((f) => f.id !== id && refsOf(f).includes(id)).map((f) => f.label);
  for (const s of schema.sections) if (s.showIf?.field === id) out.push(s.title);
  for (const st of schema.review?.stages ?? []) if (st.showIf?.field === id) out.push(st.role);
  return out;
}

/** Removes a field, and the conditions and respondent settings that read it. */
export function withoutField(schema: FormSchema, id: string): FormSchema {
  const keep = (f: FieldSpec) => {
    if (f.showIf?.field !== id) return f;
    const { showIf: _drop, ...rest } = f;
    void _drop;
    return rest as FieldSpec;
  };
  const from = schema.from && schema.from.name !== id ? { name: schema.from.name, ...(schema.from.email && schema.from.email !== id && { email: schema.from.email }) } : undefined;
  return {
    sections: schema.sections.map((s) => {
      const fields = s.fields.filter((f) => f.id !== id).map(keep);
      if (s.showIf?.field !== id) return { ...s, fields };
      const { showIf: _drop, ...rest } = s;
      void _drop;
      return { ...rest, fields };
    }),
    ...(schema.review && {
      review: {
        stages: schema.review.stages.map((st) => {
          if (st.showIf?.field !== id) return st;
          const { showIf: _drop, ...rest } = st;
          void _drop;
          return rest;
        }),
        fields: schema.review.fields.filter((f) => f.id !== id).map(keep),
      },
    }),
    ...(from && { from }),
  };
}

/** A copy of a field with a new key, right after it. */
export function copyOf(f: FieldSpec, taken: Set<string>): FieldSpec {
  return { ...structuredClone(f), id: keyFrom(f.label, taken), label: f.label, column: undefined } as FieldSpec;
}

/* ---------- Presets ---------- */

export type PresetDrop = { fields: FieldSpec[]; stages: StageSpec[]; review: boolean };

/**
 * A preset's specs, fitted to a form: a field it brings that the form already has (same key, same module, like the
 * phases a budget is split by) is reused rather than added twice; any other key the form uses is renamed, and the
 * preset's own references follow the new names.
 */
export function fitPreset(key: string, schema: FormSchema): PresetDrop | null {
  const preset = PRESETS.find((p) => p.key === key);
  if (!preset) return null;
  const built = preset.build();
  const items = Array.isArray(built) ? built : [built];
  const stages = items.filter((x): x is StageSpec => "verb" in x);
  const fields = items.filter((x): x is FieldSpec => !("verb" in x));
  const taken = takenIds(schema);
  const existing = new Map([...schema.sections.flatMap((s) => s.fields), ...(schema.review?.fields ?? [])].map((f) => [f.id, f]));
  const map = new Map<string, string>();
  const out: FieldSpec[] = [];
  for (const f of fields) {
    const had = existing.get(f.id);
    if (had && had.type === f.type) continue;
    if (taken.has(f.id)) {
      const id = keyFrom(f.id, taken);
      map.set(f.id, id);
      taken.add(id);
      out.push({ ...f, id });
    } else {
      taken.add(f.id);
      out.push(f);
    }
  }
  const fitted = out.map((f) => renameRefs(f, map));
  const fittedStages = stages.map((st) => {
    const id = taken.has(st.id) ? keyFrom(st.id, taken) : st.id;
    taken.add(id);
    return { ...st, id };
  });
  return { fields: fitted, stages: fittedStages, review: preset.group === "Review" };
}

/* ---------- Conditions ---------- */

/** What a condition on this field can match, as options; empty when it can only be filled or not. */
export function conditionChoices(f: FieldSpec, sdgNames?: Record<number, string>): ChoiceOption[] {
  switch (f.type) {
    case "choice":
      return [...f.options, ...(f.other ? [{ value: "other", label: f.other }] : [])];
    case "yesno":
      return [
        { value: "yes", label: f.yes ?? "Yes" },
        { value: "no", label: f.no ?? "No" },
      ];
    case "sdgs":
      return Array.from({ length: 17 }, (_, i) => ({ value: String(i + 1), label: `SDG ${i + 1}${sdgNames?.[i + 1] ? ` · ${sdgNames[i + 1]}` : ""}` }));
    case "consent":
      return f.statements.map((s) => ({ value: s.id, label: s.text.length > 60 ? `${s.text.slice(0, 57)}…` : s.text }));
    case "budget":
      return f.categories.map((c) => ({ value: c.id, label: c.label }));
    default:
      return [];
  }
}

/** Fields a condition can read, from where it sits: every question before it. */
export function fieldsBefore(schema: FormSchema, at: { section: number | "review"; index: number }): FieldSpec[] {
  const out: FieldSpec[] = [];
  const last = at.section === "review" ? schema.sections.length : at.section;
  for (let s = 0; s < last; s++) out.push(...schema.sections[s].fields);
  if (at.section === "review") out.push(...(schema.review?.fields ?? []).slice(0, at.index));
  else out.push(...schema.sections[at.section].fields.slice(0, at.index));
  return out.filter((f) => f.type !== "note");
}

/** A condition in words: "When Affiliation is NSTP". */
export function conditionWords(c: Condition, fields: Map<string, FieldSpec>): string {
  const f = fields.get(c.field);
  if (!f) return "When an earlier answer says so";
  if (c.filled !== undefined) return `When ${f.label} is ${c.filled ? "answered" : "left empty"}`;
  const labels = conditionChoices(f);
  const named = (c.is ?? []).map((v) => labels.find((o) => o.value === v)?.label ?? v);
  return `When ${f.label} is ${named.join(" or ")}`;
}

/* ---------- Starting points ---------- */

export const blankSchema = (): FormSchema => ({ sections: [{ id: "section1", title: "Section 1", fields: [] }] });

export function newSection(schema: FormSchema): SectionSpec {
  const taken = takenIds(schema);
  const n = schema.sections.length + 1;
  return { id: keyFrom(`section ${n}`, taken, "section"), title: `Section ${n}`, fields: [] };
}

/** What's wrong with the form as it stands, or null when it saves. */
export function schemaProblem(schema: FormSchema): string | null {
  const r = readSchema(schema);
  return typeof r === "string" ? r : null;
}

/** How many questions, notes aside. */
export const questionsIn = (schema: FormSchema) => schema.sections.reduce((n, s) => n + s.fields.filter((f) => f.type !== "note").length, 0);
