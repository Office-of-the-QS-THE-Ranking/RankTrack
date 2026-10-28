/*
 * A form's schema as the Hub keeps it, rebuilt from untrusted input (the Forms Builder sends one with form.save):
 * every field one of the modules, ids unique, conditions and option sources pointing back at earlier fields, and
 * every list and text within bounds. Unknown keys are dropped. Returns the schema or what's wrong with it.
 */
import { hasEmoji } from "./letters";
import type {
  BudgetCategory,
  ChoiceOption,
  ColumnType,
  Condition,
  FieldSpec,
  FieldType,
  FormSchema,
  ReviewSpec,
  SectionSpec,
  StageSpec,
  TableColumn,
  UnitSection,
} from "./types";

export const SCHEMA_LIMITS = { sections: 20, fields: 300, sectionFields: 60, options: 60, columns: 12, stages: 10, reviewFields: 30, bytes: 400_000 } as const;

const ID = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TYPES: FieldType[] = ["text", "paragraph", "choice", "yesno", "unit", "sdgs", "date", "daterange", "number", "money", "link", "people", "table", "counts", "budget", "budgetsummary", "consent", "signature", "note"];
const COLUMN_TYPES: ColumnType[] = ["text", "name", "paragraph", "choice", "date", "daterange", "number", "money", "link"];
const SECTIONS: UnitSection[] = ["academic", "offices", "research"];

class Bad extends Error {}

type Obj = Record<string, unknown>;
const obj = (v: unknown, what: string): Obj => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Bad(`${what} isn’t set up right.`);
  return v as Obj;
};
const list = (v: unknown, what: string, max: number, min = 0): unknown[] => {
  if (v === undefined && min === 0) return [];
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Bad(min ? `${what} needs ${min} to ${max} items.` : `${what} takes at most ${max} items.`);
  return v;
};
const text = (v: unknown, what: string, max: number, required = true): string => {
  const t = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (required && !t) throw new Bad(`Name the ${what}.`);
  if (hasEmoji(t)) throw new Bad(`Take the emoji out of the ${what}.`);
  if (t.length > max) throw new Bad(`Keep the ${what} under ${max} characters.`);
  return t;
};
const opt = (v: unknown, what: string, max: number) => (v === undefined || v === "" ? undefined : text(v, what, max, false) || undefined);
const id = (v: unknown, what: string) => {
  if (typeof v !== "string" || !ID.test(v)) throw new Bad(`${what} needs an id of letters, digits and dashes.`);
  return v;
};
const int = (v: unknown, what: string, min: number, max: number) => {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new Bad(`${what} must be a whole number from ${min} to ${max}.`);
  return v;
};
const amount = (v: unknown, what: string, max: number) => {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) throw new Bad(`${what} must be a number from 0 to ${max}.`);
  return Math.round(v * 100) / 100;
};
const flag = (v: unknown) => (v === true ? true : undefined);
const day = (v: unknown, what: string) => {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !DAY.test(v)) throw new Bad(`${what} must be a date.`);
  return v;
};
/** Drop the keys left undefined. */
const tidy = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

function options(v: unknown, what: string): ChoiceOption[] {
  const out = list(v, what, SCHEMA_LIMITS.options, 1).map((o, i) => {
    const x = obj(o, `${what} option ${i + 1}`);
    const value = text(x.value, `${what} option value`, 60);
    if (value === "other") throw new Bad(`${what}: “other” is kept for the Others option.`);
    return tidy({ value, label: text(x.label, `${what} option`, 200), hint: opt(x.hint, "option hint", 200) });
  });
  if (new Set(out.map((o) => o.value)).size !== out.length) throw new Bad(`${what} has two options with the same value.`);
  return out;
}

/** A condition may only read a field that comes before it. */
function condition(v: unknown, before: Map<string, FieldSpec>, what: string): Condition | undefined {
  if (v === undefined) return undefined;
  const c = obj(v, `${what}’s condition`);
  const field = id(c.field, `${what}’s condition`);
  if (!before.has(field)) throw new Bad(`${what} depends on a question that doesn’t come before it.`);
  const is = c.is === undefined ? undefined : list(c.is, `${what}’s condition`, 20, 1).map((x) => text(x, "condition value", 60));
  const filled = typeof c.filled === "boolean" ? c.filled : undefined;
  if (!is && filled === undefined) throw new Bad(`${what}’s condition says nothing.`);
  return tidy({ field, is, filled });
}

function column(v: unknown, before: Map<string, FieldSpec>, cols: TableColumn[], what: string): TableColumn {
  const c = obj(v, what);
  const type = c.type as ColumnType;
  if (!COLUMN_TYPES.includes(type)) throw new Bad(`${what} has a type the Hub doesn’t know.`);
  const colId = id(c.id, what);
  if (cols.some((x) => x.id === colId)) throw new Bad(`${what} repeats a column id.`);
  let showIf: TableColumn["showIf"];
  if (c.showIf !== undefined) {
    const s = obj(c.showIf, `${what}’s condition`);
    const col = id(s.column, `${what}’s condition`);
    if (!cols.some((x) => x.id === col)) throw new Bad(`${what} depends on a column that doesn’t come before it.`);
    showIf = { column: col, is: list(s.is, `${what}’s condition`, 20, 1).map((x) => text(x, "condition value", 60)) };
  }
  let optionsFrom: string | undefined;
  if (c.optionsFrom !== undefined) {
    optionsFrom = id(c.optionsFrom, what);
    if (before.get(optionsFrom)?.type !== "table") throw new Bad(`${what} takes its options from a table that doesn’t come before it.`);
  }
  if (type === "choice" && !optionsFrom && c.options === undefined) throw new Bad(`${what} needs options.`);
  return tidy({
    id: colId,
    label: text(c.label, "column", 80),
    type,
    required: flag(c.required),
    options: type === "choice" && !optionsFrom ? options(c.options, what) : undefined,
    optionsFrom: type === "choice" ? optionsFrom : undefined,
    placeholder: opt(c.placeholder, "placeholder", 120),
    examples: c.examples === undefined ? undefined : list(c.examples, `${what}’s examples`, 10).map((x) => text(x, "example", 60)),
    max: int(c.max, `${what}’s length`, 1, 5000),
    showIf,
    wide: flag(c.wide),
    caps: type === "text" ? flag(c.caps) : undefined,
  });
}

function categories(v: unknown, sources: string[]): BudgetCategory[] {
  const out = list(v, "The budget’s categories", 12, 1).map((x, i) => {
    const c = obj(x, `Budget category ${i + 1}`);
    return tidy({
      id: id(c.id, `Budget category ${i + 1}`),
      label: text(c.label, "budget category", 60),
      hint: opt(c.hint, "category hint", 300),
      presets: c.presets === undefined
        ? undefined
        : list(c.presets, "A category’s items", 20).map((p, j) => {
            const preset = obj(p, `Item ${j + 1}`);
            const source = preset.source === undefined ? undefined : text(preset.source, "source", 40);
            if (source && !sources.includes(source)) throw new Bad("A budget item is paid from a source the budget doesn’t have.");
            return tidy({ item: text(preset.item, "budget item", 80), rate: amount(preset.rate, "A rate", 10_000_000), locked: flag(preset.locked), source, hint: opt(preset.hint, "item hint", 200), recipient: flag(preset.recipient) });
          }),
      custom: flag(c.custom),
      perDay: c.perDay === false ? false : undefined,
    });
  });
  if (new Set(out.map((c) => c.id)).size !== out.length) throw new Bad("The budget repeats a category.");
  return out;
}

function field(v: unknown, before: Map<string, FieldSpec>, seen: Set<string>): FieldSpec {
  const f = obj(v, "A question");
  const type = f.type as FieldType;
  if (!TYPES.includes(type)) throw new Bad("A question has a type the Hub doesn’t know.");
  const fid = id(f.id, "A question");
  if (seen.has(fid)) throw new Bad(`Two questions share the id “${fid}”.`);
  seen.add(fid);
  const label = text(f.label, "question", 200);
  const what = `“${label}”`;
  const base = { id: fid, type, label, help: opt(f.help, "help line", 300), hint: opt(f.hint, "hint", 1000), required: flag(f.required), showIf: condition(f.showIf, before, what), half: flag(f.half), column: flag(f.column) };
  switch (type) {
    case "text": {
      const format = f.format === "email" || f.format === "phone" ? f.format : undefined;
      const domain = f.domain === undefined ? undefined : text(f.domain, "email domain", 60);
      if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Bad(`${what} has an email domain the Hub can’t read.`);
      return tidy({ ...base, type, format, placeholder: opt(f.placeholder, "placeholder", 120), max: int(f.max, `${what}’s length`, 1, 2000), domain, caps: flag(f.caps) });
    }
    case "paragraph":
      return tidy({ ...base, type, placeholder: opt(f.placeholder, "placeholder", 200), max: int(f.max, `${what}’s length`, 1, 20000), sentences: int(f.sentences, `${what}’s sentences`, 1, 50) });
    case "choice":
      return tidy({ ...base, type, options: options(f.options, what), multiple: flag(f.multiple), min: int(f.min, `${what}’s least`, 0, 60), max: int(f.max, `${what}’s most`, 1, 60), other: opt(f.other, "other option", 60), display: f.display === "chips" ? "chips" : f.display === "cards" ? "cards" : undefined });
    case "yesno":
      return tidy({ ...base, type, yes: opt(f.yes, "yes label", 40), no: opt(f.no, "no label", 40) });
    case "unit":
      return tidy({ ...base, type, sections: f.sections === undefined ? undefined : list(f.sections, `${what}’s sections`, 3, 1).map((s) => (SECTIONS.includes(s as UnitSection) ? (s as UnitSection) : (() => { throw new Bad(`${what} lists a section the Directory doesn’t have.`); })())) });
    case "sdgs":
      return tidy({ ...base, type, min: int(f.min, `${what}’s least`, 1, 17), max: int(f.max, `${what}’s most`, 1, 17) });
    case "date":
      return tidy({ ...base, type, min: day(f.min, `${what}’s earliest`), max: day(f.max, `${what}’s latest`) });
    case "daterange":
      return tidy({ ...base, type });
    case "number":
      return tidy({ ...base, type, min: amount(f.min, `${what}’s least`, 1_000_000), max: amount(f.max, `${what}’s most`, 1_000_000), unit: opt(f.unit, "unit", 20) });
    case "money":
      return tidy({ ...base, type, max: amount(f.max, `${what}’s most`, 100_000_000) });
    case "link":
      return tidy({ ...base, type, placeholder: opt(f.placeholder, "placeholder", 120) });
    case "people": {
      const ask = list(f.ask, `${what}’s details`, 2).filter((x): x is "phone" | "email" => x === "phone" || x === "email");
      const domain = f.domain === undefined ? undefined : text(f.domain, "email domain", 60);
      return tidy({ ...base, type, ask: [...new Set(ask)], emailOptional: flag(f.emailOptional), min: int(f.min, `${what}’s least`, 0, 20), max: int(f.max, `${what}’s most`, 1, 20) ?? 1, domain, roles: f.roles === undefined ? undefined : list(f.roles, `${what}’s roles`, 10, 1).map((r) => text(r, "role", 60)), noun: opt(f.noun, "noun", 40), caps: flag(f.caps) });
    }
    case "table": {
      const cols: TableColumn[] = [];
      for (const [i, c] of list(f.columns, `${what}’s columns`, SCHEMA_LIMITS.columns, 1).entries()) cols.push(column(c, before, cols, `${what} column ${i + 1}`));
      return tidy({ ...base, type, columns: cols, min: int(f.min, `${what}’s least`, 0, 50), max: int(f.max, `${what}’s most`, 1, 50), rows: f.rows === undefined ? undefined : list(f.rows, `${what}’s rows`, 20, 1).map((r) => text(r, "row", 80)), numbered: opt(f.numbered, "row name", 30), add: opt(f.add, "add button", 40) });
    }
    case "counts": {
      const rows = list(f.rows, `${what}’s groups`, 20, 1).map((r, i) => {
        const x = obj(r, `Group ${i + 1}`);
        return { id: id(x.id, `Group ${i + 1}`), label: text(x.label, "group", 80) };
      });
      if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Bad(`${what} repeats a group.`);
      return tidy({ ...base, type, rows, total: text(f.total, "total", 60) });
    }
    case "budget": {
      const sources = list(f.sources, "The budget’s sources", 6, 1).map((s, i) => {
        const x = obj(s, `Source ${i + 1}`);
        return { id: id(x.id, `Source ${i + 1}`), label: text(x.label, "source", 60) };
      });
      let per: string | undefined;
      if (f.per !== undefined) {
        per = id(f.per, what);
        if (before.get(per)?.type !== "table") throw new Bad(`${what} is split by a table that doesn’t come before it.`);
      }
      return tidy({ ...base, type, sources, categories: categories(f.categories, sources.map((s) => s.id)), per, fixed: flag(f.fixed), theoretical: flag(f.theoretical), caps: flag(f.caps) });
    }
    case "budgetsummary": {
      const budget = id(f.budget, what);
      const spec = before.get(budget);
      if (spec?.type !== "budget") throw new Bad(`${what} adds up a budget that doesn’t come before it.`);
      const source = text(f.source, "source", 40);
      if (!spec.sources.some((s) => s.id === source)) throw new Bad(`${what} adds up a source the budget doesn’t have.`);
      return tidy({ ...base, type, budget, source, payee: f.payee === undefined ? undefined : options(f.payee, what) });
    }
    case "consent":
      return tidy({
        ...base,
        type,
        statements: list(f.statements, `${what}’s statements`, 10, 1).map((s, i) => {
          const x = obj(s, `Statement ${i + 1}`);
          return tidy({ id: id(x.id, `Statement ${i + 1}`), text: text(x.text, "statement", 600), hint: opt(x.hint, "statement hint", 1000) });
        }),
      });
    case "signature":
      return tidy({ ...base, type, signers: list(f.signers, `${what}’s signers`, 6, 1).map((s) => text(s, "signer", 80)), caps: flag(f.caps) });
    case "note":
      return tidy({ ...base, type, text: text(f.text, "note", 1000) });
  }
}

function section(v: unknown, before: Map<string, FieldSpec>, seen: Set<string>, sectionIds: Set<string>): SectionSpec {
  const s = obj(v, "A section");
  const sid = id(s.id, "A section");
  if (sectionIds.has(sid)) throw new Bad(`Two sections share the id “${sid}”.`);
  sectionIds.add(sid);
  const title = text(s.title, "section", 60);
  const showIf = condition(s.showIf, before, `“${title}”`);
  const fields: FieldSpec[] = [];
  for (const f of list(s.fields, `“${title}”`, SCHEMA_LIMITS.sectionFields)) {
    const spec = field(f, before, seen);
    fields.push(spec);
    before.set(spec.id, spec);
  }
  return tidy({ id: sid, title, icon: typeof s.icon === "string" && /^[a-z-]{1,30}$/.test(s.icon) ? s.icon : undefined, showIf, fields });
}

/** The schema as kept, or what's wrong with it in a sentence. */
export function readSchema(raw: unknown): FormSchema | string {
  try {
    if (JSON.stringify(raw ?? null).length > SCHEMA_LIMITS.bytes) return "The form is too large to save.";
    const s = obj(raw, "The form");
    const before = new Map<string, FieldSpec>();
    const seen = new Set<string>();
    const sectionIds = new Set<string>();
    const sections = list(s.sections, "The form’s sections", SCHEMA_LIMITS.sections, 1).map((x) => section(x, before, seen, sectionIds));
    if (seen.size > SCHEMA_LIMITS.fields) return `A form holds at most ${SCHEMA_LIMITS.fields} questions.`;
    let review: ReviewSpec | undefined;
    if (s.review !== undefined) {
      const r = obj(s.review, "The review");
      const stages: StageSpec[] = list(r.stages, "The review’s sign-offs", SCHEMA_LIMITS.stages).map((x, i) => {
        const st = obj(x, `Sign-off ${i + 1}`);
        const verb = st.verb === "Noted" || st.verb === "Endorsed" || st.verb === "Approved" ? st.verb : null;
        if (!verb) throw new Bad(`Sign-off ${i + 1} must be noted, endorsed or approved.`);
        return tidy({ id: id(st.id, `Sign-off ${i + 1}`), role: text(st.role, "role", 80), verb, showIf: condition(st.showIf, before, `Sign-off ${i + 1}`) });
      });
      if (new Set(stages.map((x) => x.id)).size !== stages.length) throw new Bad("Two sign-offs share an id.");
      const fields: FieldSpec[] = [];
      for (const f of list(r.fields, "The office’s fields", SCHEMA_LIMITS.reviewFields)) {
        const spec = field(f, before, seen);
        fields.push(spec);
        before.set(spec.id, spec);
      }
      review = { stages, fields };
    }
    let from: FormSchema["from"];
    if (s.from !== undefined) {
      const f = obj(s.from, "Who a response is from");
      const name = id(f.name, "Who a response is from");
      const email = f.email === undefined ? undefined : id(f.email, "Who a response is from");
      if (before.get(name)?.type !== "text") throw new Bad("Name a text question for who a response is from.");
      if (email && !["text", "people"].includes(before.get(email)?.type ?? "")) throw new Bad("Name an email or people question for the respondent’s email.");
      from = tidy({ name, email });
    }
    return tidy({ sections, review, from });
  } catch (e) {
    if (e instanceof Bad) return e.message;
    throw e;
  }
}
