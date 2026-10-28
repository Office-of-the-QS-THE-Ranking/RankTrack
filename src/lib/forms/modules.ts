/*
 * The form modules' rules: for each field type, how its answer is cleaned from untrusted input, whether it is
 * filled, what is wrong with it, what a condition can match in it, and how it reads as text. The responder page,
 * the server, the responses table, CSV export and the analytics all go through here, so a form checks the same
 * everywhere. A new module is a spec in types.ts, an entry here, its views in components/forms/fields.tsx and
 * answers.tsx, and its analytics (analytics.ts); docs/digital-forms.md has the checklist.
 */
import { cleanLink } from "@/lib/governance/workspace";
import { budgetSourceLabel, budgetTotals, fixedLines, lineAmount, partsOf, rateIsLocked, sourceSummary } from "./budget";
import { cents, datesLabel, dayLabel, num, peso } from "./format";
import { isName, noEmoji } from "./letters";
import { directoryPicked, personPhoto } from "./people-lookup";
import type {
  Answers,
  BudgetLine,
  BudgetSpec,
  BudgetValue,
  Cell,
  ChoiceSpec,
  ChoiceValue,
  Condition,
  DateRange,
  FieldSpec,
  FieldType,
  NameParts,
  Person,
  PeopleSpec,
  Row,
  Signature,
  TableColumn,
  TableSpec,
  UnitSection,
  Value,
} from "./types";

/** What the rules may need besides the answer itself. */
export interface FormContext {
  /** Units a unit question may name, with their Directory section. */
  units: { id: string; name: string; section: UnitSection; depth?: number }[];
  /** Every answer so far, for questions that read another: options from a table's rows, a budget's parts. */
  answers: Answers;
  /** Every field of the form by id (fieldMap), for columns that take their options from another table. */
  fields: Map<string, FieldSpec>;
  /** SDG names by number, for text. */
  sdgNames?: Record<number, string>;
  /** Cleaning a team copy as it's filled in (lib/forms/copies.ts): blank rows, people and budget lines stay where they were added. */
  draft?: boolean;
  /** The form's code, when the responder may find people in the University directory by name (actions/form-people.ts). */
  directory?: string;
}

export const LIMITS = { text: 160, paragraph: 3000, other: 120, name: 80, email: 120, phone: 24, cell: 300, cellLong: 1000, rows: 30, lines: 200, qty: 100_000, days: 365, rate: 10_000_000, count: 1_000_000, money: 100_000_000 } as const;

/** Keep contact details current for existing saved forms too. */
export const peopleDetails = (spec: PeopleSpec): PeopleSpec["ask"] =>
  spec.label.trim().toLowerCase() === "liquidation officers"
    ? [...new Set<"phone" | "email">(["phone", ...spec.ask])]
    : spec.label.trim().toLowerCase() === "emergency contact"
      ? [...new Set<"phone" | "email">([...spec.ask, "email"])]
      : spec.ask;

export const peopleEmailOptional = (spec: PeopleSpec) => !!spec.emailOptional || spec.label.trim().toLowerCase() === "emergency contact";

/* ---------- Small cleaners ---------- */

/** One line: no control characters or emoji, single spaces. */
export const oneLine = (v: unknown, max: number) =>
  typeof v === "string"
    ? noEmoji(v)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/** Several lines: line breaks kept, at most one blank line in a row, no emoji. */
const lines = (v: unknown, max: number) =>
  typeof v === "string"
    ? noEmoji(v)
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max)
    : "";

const isDay = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(v);
};

const finite = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/^\s*Php\s*/i, "").replace(/[,\s₱]/g, "")) : NaN);

const wholeIn = (v: unknown, min: number, max: number) => {
  const n = Math.round(finite(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9][0-9 ()-]{5,20}[0-9]$/;

/** What's wrong with an email, or "". */
export function emailProblem(email: string, domain?: string) {
  if (!EMAIL.test(email)) return domain ? `Enter an email address, like name@${domain}.` : "Enter an email address, like name@institution.org.";
  if (domain && !email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) return `Use an @${domain} email address.`;
  return "";
}

export const phoneProblem = (phone: string) => (PHONE.test(phone) ? "" : "Enter a phone number, like 0917 123 4567.");

/** A name in capitals, as the University's forms ask. */
export const toCaps = (name: string) => name.toLocaleUpperCase("en-PH");

/** Names are letters and spaces only: no digits, symbols (. - ') or emoji. */
export const nameProblem = (name: string) => (isName(name) ? "" : "Use letters only, like JUAN DELA CRUZ.");

/** The parts every person's name is asked in, in order; the middle name is optional. */
export const NAME_PARTS = [
  ["lastName", "Last name", "family-name"],
  ["firstName", "First name", "given-name"],
  ["middleName", "Middle name", "additional-name"],
] as const;

/** A full name from its parts, first to last: JUAN SANTOS DELA CRUZ. */
export const fullName = (p: NameParts) => [p.firstName, p.middleName, p.lastName].map((s) => s?.trim()).filter(Boolean).join(" ");

/** Whether a name came in parts (rather than whole, as answers did before names had parts). */
export const hasParts = (p: unknown) => !!p && typeof p === "object" && ("lastName" in p || "firstName" in p || "middleName" in p);

/** A name sent in parts, each part one line in capitals. */
export function cleanName(raw: unknown): NameParts {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const part = (v: unknown) => toCaps(oneLine(v, LIMITS.name));
  return { lastName: part(p.lastName), firstName: part(p.firstName), middleName: part(p.middleName) };
}

/** What's missing or wrong in a name in parts, or "". `whose`: "your", "the speaker’s". */
export function namePartsProblem(p: NameParts, whose: string) {
  if (!p.lastName) return `Enter ${whose} last name.`;
  if (!p.firstName) return `Enter ${whose} first name.`;
  for (const [k] of NAME_PARTS) if (p[k] && nameProblem(p[k])) return nameProblem(p[k]);
  return "";
}

/** Words that end in a full stop without ending a sentence. */
const ABBREVIATIONS = /\b(?:dr|mr|mrs|ms|sr|jr|st|sto|sta|brgy|engr|atty|prof|fr|rev|hon|gov|vs|etc|no|nos|inc|co|corp|e\.g|i\.e|approx|dept|univ)\.$/i;

/** Sentences in a text: ends of sentences, not abbreviations or decimals. */
export function sentenceCount(text: string) {
  const t = text.trim();
  if (!t) return 0;
  let n = 0;
  const parts = t.split(/(?<=[.!?])\s+/);
  for (const [i, p] of parts.entries()) if (i === parts.length - 1 || !ABBREVIATIONS.test(p)) n++;
  return n;
}

/* ---------- Choice values ---------- */

export const OTHER = "other";

/** Every option a choice offers, its `other` option last. */
export const choiceOptions = (spec: ChoiceSpec) => (spec.other ? [...spec.options, { value: OTHER, label: spec.other }] : spec.options);

const asChoice = (v: Value | undefined): ChoiceValue => (v && typeof v === "object" && !Array.isArray(v) && "picked" in v ? (v as ChoiceValue) : { picked: [] });

/** The options of a choice column that takes its options from another table's rows: "1", "2"… */
export function rowOptions(source: TableSpec | undefined, answers: Answers) {
  const rows = source ? ((answers[source.id] as Row[] | undefined) ?? []) : [];
  const named = source?.columns.find((c) => c.type === "text");
  return rows.map((r, i) => {
    const name = named && typeof r[named.id] === "string" ? (r[named.id] as string).trim() : "";
    return { value: String(i + 1), label: `${source?.numbered ?? "Row"} ${i + 1}${name ? ` · ${name}` : ""}` };
  });
}

/* ---------- Table cells ---------- */

const isRange = (v: unknown): v is DateRange => {
  if (!v || typeof v !== "object") return false;
  const range = v as DateRange;
  if (Array.isArray(range.entries)) return !!range.entries.length && range.entries.every((e) => e && isDay(e.from) && (e.mode === "day" || e.mode === "range" && isDay(e.to) && e.to >= e.from));
  return Array.isArray(range.dates) ? !!range.dates.length && range.dates.every(isDay) : isDay(range.from) && isDay(range.to);
};

function cleanCell(col: TableColumn, raw: unknown): Cell | undefined {
  switch (col.type) {
    case "text": {
      const t = oneLine(raw, col.max ?? LIMITS.cell);
      return (col.caps ? toCaps(t) : t) || undefined;
    }
    case "name": {
      const n = cleanName(raw);
      return fullName(n) ? n : undefined;
    }
    case "choice":
      return oneLine(raw, col.max ?? LIMITS.cell) || undefined;
    case "paragraph":
      return lines(raw, col.max ?? LIMITS.cellLong) || undefined;
    case "link": {
      const t = oneLine(raw, 2000);
      return t ? (cleanLink(t) ?? t) : undefined;
    }
    case "date":
      return isDay(raw) ? raw : undefined;
    case "daterange": {
      const r = raw as Partial<DateRange> | null;
      if (r && typeof r === "object" && Array.isArray(r.entries)) {
        const entries = r.entries.filter((e) => e && (e.mode === "range" || e.mode === "day")).slice(0, LIMITS.days).map((e) => ({ mode: e.mode, from: isDay(e.from) ? e.from : "", to: e.mode === "range" && isDay(e.to) ? e.to : "" }));
        return entries.length ? { from: "", to: "", entries } : undefined;
      }
      if (r && typeof r === "object" && Array.isArray(r.dates)) {
        const dates = [...new Set(r.dates.filter(isDay))].sort().slice(0, LIMITS.days);
        return dates.length ? { from: "", to: "", dates } : undefined;
      }
      return r && typeof r === "object" && (isDay(r.from) || isDay(r.to)) ? { from: isDay(r.from) ? r.from : "", to: isDay(r.to) ? r.to : "" } : undefined;
    }
    case "number":
    case "money": {
      const n = finite(raw);
      return Number.isFinite(n) ? cents(Math.min(col.type === "money" ? LIMITS.money : LIMITS.count, Math.max(0, n))) : undefined;
    }
  }
}

/** A cell of a `name` column: a person's name in parts. */
export const isNameCell = (c: Cell | undefined): c is NameParts => !!c && typeof c === "object" && !("from" in c);

const cellFilled = (c: Cell | undefined) => (typeof c === "string" ? !!c : typeof c === "number" ? Number.isFinite(c) : isNameCell(c) ? !!fullName(c) : !!c && (c.entries !== undefined ? c.entries.some((e) => e.from || e.to) : c.dates !== undefined ? !!c.dates.length : !!c.from || !!c.to));

/** Whether a column shows in a row. */
export const columnShows = (col: TableColumn, row: Row) => !col.showIf || col.showIf.is.includes(String(row[col.showIf.column] ?? ""));

/** Phase titles are required, including in forms saved with the earlier optional Name column. */
export const tableColumns = (spec: TableSpec): TableColumn[] => spec.numbered === "Phase"
  ? spec.columns.map((col) => col.id === "name" && col.type === "text" ? { ...col, label: "Phase Title", required: true } : col)
  : spec.columns;

function cellProblem(col: TableColumn, c: Cell | undefined, options: { value: string }[] | null): string {
  if (!cellFilled(c)) return col.required ? `Fill in ${col.label.toLowerCase()}.` : "";
  if (col.caps && typeof c === "string" && nameProblem(c)) return nameProblem(c);
  if (isNameCell(c)) return namePartsProblem(c, `the ${col.label.toLowerCase()}’s`);
  if (col.type === "link" && typeof c === "string" && !cleanLink(c)) return "Use an https link, like https://meet.google.com/….";
  if (col.type === "daterange" && typeof c === "object" && "from" in c) {
    if (c.entries !== undefined) {
      for (const [index, entry] of c.entries.entries()) {
        if (!entry.from || entry.mode === "range" && !entry.to) return `Choose ${entry.mode === "day" ? "the day" : "the first and last day"} for date ${index + 1}.`;
        if (entry.mode === "range" && entry.from > entry.to) return `Choose a last day on or after the first day for date ${index + 1}.`;
      }
      return "";
    }
    if (c.dates !== undefined) return c.dates.length ? "" : "Add at least one date.";
    if (!c.from || !c.to) return "Choose the first and last day.";
    if (c.from > c.to) return "The last day can’t be before the first.";
  }
  if (col.type === "choice" && options && !options.some((o) => o.value === c)) return `Choose ${col.label.toLowerCase()} from the list.`;
  return "";
}

function cellText(col: TableColumn, c: Cell | undefined, options: { value: string; label: string }[] | null) {
  if (!cellFilled(c)) return "";
  if (isNameCell(c)) return fullName(c);
  if (typeof c === "object") return datesLabel(c);
  if (col.type === "money" && typeof c === "number") return peso(c);
  if (col.type === "number" && typeof c === "number") return num(c);
  if (col.type === "date" && typeof c === "string") return dayLabel(c);
  if (col.type === "choice") return options?.find((o) => o.value === c)?.label ?? String(c);
  return String(c);
}

/** The table field a column takes its options from, if it does. */
const sourceOf = (col: TableColumn, ctx: FormContext) => (col.optionsFrom ? (ctx.fields.get(col.optionsFrom) as TableSpec | undefined) : undefined);

/** The options a choice column offers in this response. */
export const columnOptions = (col: TableColumn, ctx: FormContext) => {
  const source = sourceOf(col, ctx);
  return source ? rowOptions(source, ctx.answers) : (col.options ?? []);
};

/** A row's name: its fixed label, "Phase 2", or "Row 2". */
export const rowName = (spec: TableSpec, i: number) => spec.rows?.[i] ?? `${spec.numbered ?? "Row"} ${i + 1}`;

/* ---------- The modules ---------- */

interface Module<S extends FieldSpec> {
  /** The answer as kept, from anything a browser sent; undefined for none. Never throws. */
  clean(spec: S, raw: unknown, ctx: FormContext): Value | undefined;
  filled(spec: S, value: Value | undefined): boolean;
  /** What to fix, in a sentence, or "". Called only for fields that show. */
  problem(spec: S, value: Value | undefined, ctx: FormContext): string;
  /** What a condition can match in the answer. */
  tokens(spec: S, value: Value | undefined): string[];
  /** The answer in words, for search, the table and CSV. */
  text(spec: S, value: Value | undefined, ctx: FormContext): string;
}

type Modules = { [K in FieldType]: Module<Extract<FieldSpec, { type: K }>> };

const str = (v: Value | undefined) => (typeof v === "string" ? v : "");

export const MODULES: Modules = {
  text: {
    clean: (spec, raw) => {
      const t = oneLine(raw, (spec.max ?? LIMITS.text) + 40);
      return (spec.format === "email" ? t.toLowerCase() : spec.caps ? toCaps(t) : t) || undefined;
    },
    filled: (_, v) => !!str(v),
    problem: (spec, v) => {
      const t = str(v);
      if (!t) return spec.required ? (spec.format === "email" ? "Enter an email address." : "Fill this in.") : "";
      if (t.length > (spec.max ?? LIMITS.text)) return `Use ${spec.max ?? LIMITS.text} characters or fewer.`;
      if (spec.format === "email") return emailProblem(t, spec.domain);
      if (spec.format === "phone") return phoneProblem(t);
      if (spec.caps) return nameProblem(t);
      return "";
    },
    tokens: (_, v) => (str(v) ? [str(v)] : []),
    text: (_, v) => str(v),
  },
  paragraph: {
    clean: (spec, raw) => lines(raw, (spec.max ?? LIMITS.paragraph) + 200) || undefined,
    filled: (_, v) => !!str(v),
    problem: (spec, v) => {
      const t = str(v);
      if (!t) return spec.required ? "Fill this in." : "";
      if (t.length > (spec.max ?? LIMITS.paragraph)) return `Use ${num(spec.max ?? LIMITS.paragraph)} characters or fewer.`;
      const n = sentenceCount(t);
      if (spec.sentences && n > spec.sentences) return `Keep it to ${spec.sentences} sentences or fewer. This has ${n}.`;
      return "";
    },
    tokens: (_, v) => (str(v) ? ["text"] : []),
    text: (_, v) => str(v),
  },
  choice: {
    clean: (spec, raw) => {
      const given = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { picked: Array.isArray(raw) ? raw : [raw] }) as { picked?: unknown; other?: unknown };
      const wanted = new Set((Array.isArray(given.picked) ? given.picked : []).filter((x): x is string => typeof x === "string"));
      const picked = choiceOptions(spec)
        .map((o) => o.value)
        .filter((x) => wanted.has(x))
        .slice(0, spec.multiple ? undefined : 1);
      if (!picked.length) return undefined;
      const other = picked.includes(OTHER) ? oneLine(given.other, LIMITS.other) : "";
      return other ? { picked, other } : { picked };
    },
    filled: (_, v) => asChoice(v).picked.length > 0,
    problem: (spec, v) => {
      const { picked, other } = asChoice(v);
      const min = spec.min ?? (spec.required ? 1 : 0);
      if (!picked.length) return spec.required ? (spec.multiple ? (min > 1 ? `Choose at least ${min}.` : "Choose at least one.") : "Choose one.") : "";
      if (picked.length < min) return `Choose at least ${min}.`;
      if (spec.max && picked.length > spec.max) return `Choose up to ${spec.max}.`;
      if (picked.includes(OTHER) && !other) return `Write your answer for “${spec.other}”.`;
      return "";
    },
    tokens: (_, v) => asChoice(v).picked,
    text: (spec, v) => {
      const { picked, other } = asChoice(v);
      return picked.map((p) => (p === OTHER ? `${spec.other}: ${other ?? ""}` : (spec.options.find((o) => o.value === p)?.label ?? p))).join("; ");
    },
  },
  yesno: {
    clean: (_, raw) => (raw === "yes" || raw === "no" ? raw : undefined),
    filled: (_, v) => v === "yes" || v === "no",
    problem: (spec, v) => (spec.required && v !== "yes" && v !== "no" ? "Choose yes or no." : ""),
    tokens: (_, v) => (v === "yes" || v === "no" ? [v] : []),
    text: (spec, v) => (v === "yes" ? (spec.yes ?? "Yes") : v === "no" ? (spec.no ?? "No") : ""),
  },
  unit: {
    clean: (_, raw) => oneLine(raw, 80) || undefined,
    filled: (_, v) => !!str(v),
    problem: (spec, v, ctx) => {
      const id = str(v);
      if (!id) return spec.required ? "Choose a unit." : "";
      const unit = ctx.units.find((u) => u.id === id);
      return unit && (!spec.sections?.length || spec.sections.includes(unit.section)) ? "" : "Choose a unit from the list.";
    },
    tokens: (_, v) => (str(v) ? [str(v)] : []),
    text: (_, v, ctx) => ctx.units.find((u) => u.id === str(v))?.name ?? str(v),
  },
  sdgs: {
    clean: (_, raw) => {
      const list = Array.isArray(raw) ? [...new Set(raw.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 17))].sort((a, b) => a - b) : [];
      return list.length ? list : undefined;
    },
    filled: (_, v) => Array.isArray(v) && v.length > 0,
    problem: (spec, v) => {
      const n = Array.isArray(v) ? v.length : 0;
      if (!n) return spec.required ? "Choose at least one SDG." : "";
      if (spec.min && n < spec.min) return `Choose at least ${spec.min} SDGs.`;
      if (spec.max && n > spec.max) return `Choose up to ${spec.max} SDGs.`;
      return "";
    },
    tokens: (_, v) => (Array.isArray(v) ? v.map(String) : []),
    text: (_, v, ctx) => (Array.isArray(v) ? (v as number[]).map((n) => `SDG ${n}${ctx.sdgNames?.[n] ? ` ${ctx.sdgNames[n]}` : ""}`).join("; ") : ""),
  },
  date: {
    clean: (_, raw) => (isDay(raw) ? raw : undefined),
    filled: (_, v) => isDay(v),
    problem: (spec, v) => {
      if (!isDay(v)) return spec.required ? "Choose a date." : "";
      if (spec.min && v < spec.min) return `Choose ${dayLabel(spec.min)} or later.`;
      if (spec.max && v > spec.max) return `Choose ${dayLabel(spec.max)} or earlier.`;
      return "";
    },
    tokens: (_, v) => (isDay(v) ? [v] : []),
    text: (_, v) => (isDay(v) ? dayLabel(v) : ""),
  },
  daterange: {
    clean: (_, raw) => cleanCell({ id: "", label: "", type: "daterange" }, raw) as DateRange | undefined,
    filled: (_, v) => cellFilled(v as Cell | undefined),
    problem: (spec, v) => cellProblem({ id: "", label: "dates", type: "daterange", required: spec.required }, v as Cell | undefined, null),
    tokens: () => [],
    text: (_, v) => (isRange(v) ? datesLabel(v) : ""),
  },
  number: {
    clean: (spec, raw) => {
      const n = finite(raw);
      return Number.isFinite(n) ? cents(Math.min(spec.max ?? LIMITS.count, Math.max(spec.min ?? 0, n))) : undefined;
    },
    filled: (_, v) => typeof v === "number" && Number.isFinite(v),
    problem: (spec, v) => (spec.required && !(typeof v === "number" && Number.isFinite(v)) ? "Enter a number." : ""),
    tokens: () => [],
    text: (spec, v) => (typeof v === "number" ? `${num(v)}${spec.unit ? ` ${spec.unit}` : ""}` : ""),
  },
  money: {
    clean: (spec, raw) => {
      const n = finite(raw);
      return Number.isFinite(n) ? cents(Math.min(spec.max ?? LIMITS.money, Math.max(0, n))) : undefined;
    },
    filled: (_, v) => typeof v === "number" && Number.isFinite(v),
    problem: (spec, v) => (spec.required && !(typeof v === "number" && Number.isFinite(v)) ? "Enter an amount." : ""),
    tokens: () => [],
    text: (_, v) => (typeof v === "number" ? peso(v) : ""),
  },
  link: {
    clean: (_, raw) => cleanCell({ id: "", label: "", type: "link" }, raw) as string | undefined,
    filled: (_, v) => !!str(v),
    problem: (spec, v) => (str(v) ? (cleanLink(str(v)) ? "" : "Use an https link, like https://forms.gle/….") : spec.required ? "Paste a link." : ""),
    tokens: (_, v) => (str(v) ? ["link"] : []),
    text: (_, v) => str(v),
  },
  people: {
    clean: (spec, raw, ctx) => {
      const given = Array.isArray(raw) ? raw : [];
      const slots = spec.roles?.length ? spec.roles.length : Math.min(given.length, spec.max);
      const people: Person[] = [];
      for (let i = 0; i < slots; i++) {
        const p = (given[i] && typeof given[i] === "object" ? given[i] : {}) as Partial<Person>;
        // Every name is in parts and in capitals; one sent whole (from before names had parts) stays whole.
        const parts = hasParts(p) ? cleanName(p) : undefined;
        const person: Person = parts ? { ...parts, name: fullName(parts) } : { name: toCaps(oneLine(p.name, LIMITS.name)) };
        if (peopleDetails(spec).includes("phone")) person.phone = oneLine(p.phone, LIMITS.phone);
        if (peopleDetails(spec).includes("email")) person.email = oneLine(p.email, LIMITS.email).toLowerCase();
        const photo = person.email ? personPhoto(p.photo) : undefined;
        if (photo) person.photo = photo;
        if (directoryPicked({ ...person, directoryEmail: typeof p.directoryEmail === "string" ? p.directoryEmail : undefined })) person.directoryEmail = person.email;
        if (spec.roles?.[i]) person.role = spec.roles[i];
        if (ctx.draft || spec.roles?.length || person.name || person.phone || person.email) people.push(person);
      }
      return people.some((p) => p.name || p.phone || p.email) || (ctx.draft && people.length) ? people : undefined;
    },
    filled: (_, v) => Array.isArray(v) && (v as Person[]).some((p) => p.name),
    problem: (spec, v) => {
      const people = (Array.isArray(v) ? v : []) as Person[];
      const min = spec.roles?.length ?? spec.min ?? (spec.required ? 1 : 0);
      if (!people.length) return spec.required ? (spec.roles?.length ? "Name each person." : `Add at least ${min === 1 ? "one person" : `${min} people`}.`) : "";
      if (people.length < min) return `Add at least ${min} people.`;
      if (people.length > spec.max) return `Add up to ${spec.max}.`;
      for (const p of people) {
        const who = (p.role ?? spec.noun ?? "person").toLowerCase();
        if (hasParts(p)) {
          const bad = namePartsProblem(p, `the ${who}’s`);
          if (bad) return bad;
        }
        if (!p.name) return `Name the ${who}.`;
        if (nameProblem(p.name)) return nameProblem(p.name);
        if (peopleDetails(spec).includes("phone") && !p.phone) return `Enter ${p.name}’s phone number.`;
        if (p.phone && phoneProblem(p.phone)) return phoneProblem(p.phone);
        if (peopleDetails(spec).includes("email") && !peopleEmailOptional(spec) && !p.email) return `Enter ${p.name}’s email address.`;
        if (p.email) {
          const bad = emailProblem(p.email, spec.domain);
          if (bad) return bad;
        }
      }
      return "";
    },
    tokens: (_, v) => (Array.isArray(v) && v.length ? ["people"] : []),
    text: (_, v) =>
      ((Array.isArray(v) ? v : []) as Person[])
        .map((p) => [p.role ? `${p.name} (${p.role})` : p.name, p.phone, p.email].filter(Boolean).join(" · "))
        .join("; "),
  },
  table: {
    clean: (spec, raw, ctx) => {
      const given = Array.isArray(raw) ? raw : [];
      const count = spec.rows?.length ?? Math.min(given.length, spec.max ?? LIMITS.rows);
      const rows: Row[] = [];
      for (let i = 0; i < count; i++) {
        const r = (given[i] && typeof given[i] === "object" ? given[i] : {}) as Record<string, unknown>;
        const row: Row = {};
        for (const col of tableColumns(spec)) {
          const c = cleanCell(col, r[col.id]);
          if (c !== undefined) row[col.id] = c;
        }
        for (const col of tableColumns(spec)) if (!columnShows(col, row)) delete row[col.id];
        // A blank row added and left empty is dropped (kept in a copy being filled in); a fixed row keeps its place.
        if (ctx.draft || spec.rows?.length || Object.keys(row).length) rows.push(row);
      }
      return rows.some((r) => Object.keys(r).length) || (ctx.draft && rows.length) ? rows : undefined;
    },
    filled: (_, v) => Array.isArray(v) && (v as Row[]).some((r) => Object.keys(r).length > 0),
    problem: (spec, v, ctx) => {
      const rows = (Array.isArray(v) ? v : []) as Row[];
      const min = spec.rows?.length ?? spec.min ?? (spec.required ? 1 : 0);
      const noun = spec.numbered ? spec.numbered.toLowerCase() : "row";
      if (!rows.length && !spec.required && !spec.min) return "";
      if (rows.length < min) return min === 1 ? `Add at least one ${noun}.` : `Add at least ${min} ${noun}s.`;
      if (rows.length > (spec.max ?? LIMITS.rows)) return `Keep it to ${spec.max ?? LIMITS.rows} ${noun}s.`;
      for (const [i, row] of rows.entries()) {
        for (const col of tableColumns(spec)) {
          if (!columnShows(col, row)) continue;
          const bad = cellProblem(col, row[col.id], col.type === "choice" ? columnOptions(col, ctx) : null);
          if (bad) return `${rowName(spec, i)}: ${bad.charAt(0).toLowerCase()}${bad.slice(1)}`;
        }
      }
      return "";
    },
    tokens: (_, v) => (Array.isArray(v) && v.length ? ["rows"] : []),
    text: (spec, v, ctx) =>
      ((Array.isArray(v) ? v : []) as Row[])
        .map((row, i) => {
          const cells = spec.columns
            .filter((col) => columnShows(col, row))
            .map((col) => cellText(col, row[col.id], col.type === "choice" ? columnOptions(col, ctx) : null))
            .filter(Boolean);
          return `${rowName(spec, i)}: ${cells.join(" · ")}`;
        })
        .join("; "),
  },
  counts: {
    clean: (spec, raw) => {
      const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const out: Record<string, number> = {};
      for (const r of spec.rows) {
        const n = wholeIn(given[r.id], 0, LIMITS.count);
        if (n > 0) out[r.id] = n;
      }
      return Object.keys(out).length ? out : undefined;
    },
    filled: (_, v) => countsTotal(v) > 0,
    problem: (spec, v) => (spec.required && countsTotal(v) <= 0 ? "Enter at least one number." : ""),
    tokens: () => [],
    text: (spec, v) => {
      const counts = (v ?? {}) as Record<string, number>;
      const parts = spec.rows.filter((r) => counts[r.id]).map((r) => `${r.label} ${num(counts[r.id])}`);
      return parts.length ? `${parts.join(", ")} (${spec.total.toLowerCase()} ${num(countsTotal(v))})` : "";
    },
  },
  budget: {
    clean: (spec, raw, ctx) => cleanBudget(spec, raw, ctx.draft),
    filled: (spec, v) => budgetTotals(spec, v as BudgetValue | undefined).total > 0,
    problem: (spec, v, ctx) => {
      const value = v as BudgetValue | undefined;
      const parts = partsOf(spec, ctx.answers);
      const lines = value?.lines ?? [];
      if (budgetTotals(spec, value, parts).total <= 0) return spec.required ? (spec.fixed ? "Enter at least one number." : "Add at least one line with an amount.") : "";
      if (lines.length > LIMITS.lines) return `Keep the budget to ${LIMITS.lines} lines.`;
      for (const l of lines) {
        if (!l.item) return "Name each item.";
        if (spec.per && (l.part === undefined || l.part >= parts)) return "A line belongs to a phase that’s gone. Check the budget.";
        const preset = spec.categories.find((c) => c.id === l.category)?.presets?.find((p) => p.item === l.item);
        if (preset?.recipient && lineAmount(l) > 0 && !l.recipient) return `Name who receives the ${l.item.toLowerCase()}.`;
        if (l.recipientName) {
          const bad = namePartsProblem(l.recipientName, `the ${l.item.toLowerCase()} recipient’s`);
          if (bad) return bad;
        } else if (l.recipient && nameProblem(l.recipient)) return nameProblem(l.recipient);
      }
      return "";
    },
    tokens: (spec, v) => {
      const t = budgetTotals(spec, v as BudgetValue | undefined);
      return spec.categories.filter((c) => (t.byCategory[c.id] ?? 0) > 0).map((c) => c.id);
    },
    text: (spec, v) => {
      const t = budgetTotals(spec, v as BudgetValue | undefined);
      if (!t.total) return "";
      const by = spec.sources.filter((s) => t.bySource[s.id]).map((s) => `${budgetSourceLabel(s)} ${peso(t.bySource[s.id])}`);
      return `${peso(t.total)}${by.length > 1 ? ` (${by.join(", ")})` : ""}`;
    },
  },
  budgetsummary: {
    clean: (spec, raw, ctx) => {
      const budget = ctx.fields.get(spec.budget);
      if (!spec.payee?.length || budget?.type !== "budget" || !raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
      const out: Record<string, string> = {};
      for (const c of budget.categories) {
        const v = (raw as Record<string, unknown>)[c.id];
        if (typeof v === "string" && spec.payee.some((o) => o.value === v)) out[c.id] = v;
      }
      return Object.keys(out).length ? out : undefined;
    },
    filled: (spec, v) => !!spec.payee?.length && !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0,
    problem: (spec, v, ctx) => {
      const budget = ctx.fields.get(spec.budget);
      if (!spec.payee?.length || !spec.required || budget?.type !== "budget") return "";
      const picked = (v ?? {}) as Record<string, string>;
      const missing = sourceSummary(budget, ctx.answers[spec.budget] as BudgetValue | undefined, spec.source).categories.find((c) => c.total > 0 && !picked[c.id]);
      return missing ? `Choose who the ${missing.label.toLowerCase()} is paid to.` : "";
    },
    tokens: () => [],
    text: (spec, v, ctx) => {
      const budget = ctx.fields.get(spec.budget);
      if (budget?.type !== "budget") return "";
      const picked = (v ?? {}) as Record<string, string>;
      const sum = sourceSummary(budget, ctx.answers[spec.budget] as BudgetValue | undefined, spec.source);
      const parts = sum.categories
        .filter((c) => c.total > 0)
        .map((c) => `${c.label} ${peso(c.total)}${picked[c.id] ? ` to ${spec.payee?.find((o) => o.value === picked[c.id])?.label ?? picked[c.id]}` : ""}`);
      return parts.length ? `${parts.join("; ")}; total ${peso(sum.total)}` : "";
    },
  },
  consent: {
    clean: (spec, raw) => {
      const given = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
      const agreed = spec.statements.map((s) => s.id).filter((id) => given.has(id));
      return agreed.length ? agreed : undefined;
    },
    filled: (spec, v) => Array.isArray(v) && v.length === spec.statements.length,
    problem: (spec, v) => (spec.required && !(Array.isArray(v) && v.length === spec.statements.length) ? "Tick each box to continue." : ""),
    tokens: (_, v) => (Array.isArray(v) ? (v as string[]) : []),
    text: (spec, v) => (Array.isArray(v) ? `Agreed to ${v.length} of ${spec.statements.length}` : ""),
  },
  signature: {
    clean: (spec, raw) => {
      const given = Array.isArray(raw) ? raw : [];
      const signed: Signature[] = spec.signers.map((_, i) => {
        const s = (given[i] && typeof given[i] === "object" ? given[i] : {}) as Partial<Signature>;
        const on = isDay(s.on) ? s.on : "";
        if (!hasParts(s)) return { name: toCaps(oneLine(s.name, LIMITS.name)), on };
        const parts = cleanName(s);
        return { ...parts, name: fullName(parts), on };
      });
      return signed.some((s) => s.name) ? signed : undefined;
    },
    filled: (spec, v) => Array.isArray(v) && (v as Signature[]).filter((s) => s.name).length === spec.signers.length,
    problem: (spec, v) => {
      const signed = (Array.isArray(v) ? v : []) as Signature[];
      if (!spec.required && !signed.some((s) => s.name)) return "";
      const missing = spec.signers.findIndex((_, i) => !signed[i]?.name);
      if (missing >= 0) return spec.signers.length > 1 ? `Type the ${spec.signers[missing].toLowerCase()}’s full name to sign.` : "Type your full name to sign.";
      for (const [i, s] of signed.entries()) {
        const bad = hasParts(s) ? namePartsProblem(s, spec.signers.length > 1 ? `the ${(spec.signers[i] ?? "signer").toLowerCase()}’s` : "your") : nameProblem(s.name);
        if (bad) return bad;
      }
      return "";
    },
    tokens: () => [],
    text: (spec, v) =>
      ((Array.isArray(v) ? v : []) as Signature[])
        .map((s, i) => (s.name ? `${s.name} (${spec.signers[i] ?? "Signer"}${s.on ? `, ${dayLabel(s.on)}` : ""})` : ""))
        .filter(Boolean)
        .join("; "),
  },
  note: {
    clean: () => undefined,
    filled: () => false,
    problem: () => "",
    tokens: () => [],
    text: () => "",
  },
};

/** The rules for a field's type. */
export const moduleOf = <S extends FieldSpec>(spec: S) => MODULES[spec.type] as unknown as Module<S>;

export const countsTotal = (v: Value | undefined) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.values(v as Record<string, number>).reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0) : 0;

/** A budget as kept: known categories and sources, fixed rates where the form fixes them, and parts that exist. */
function cleanBudget(spec: BudgetSpec, raw: unknown, draft = false): BudgetValue | undefined {
  const given = raw && typeof raw === "object" && Array.isArray((raw as BudgetValue).lines) ? (raw as BudgetValue).lines.slice(0, LIMITS.lines) : [];
  const source = (s: unknown) => (spec.sources.some((x) => x.id === s) ? (s as string) : (spec.sources[0]?.id ?? ""));
  if (spec.fixed) {
    // The presets are the lines: only how many and for how long come from the browser.
    const lines = fixedLines(spec).map((l) => {
      const g = given.find((x) => x && typeof x === "object" && x.category === l.category && x.item === l.item);
      const perDay = spec.categories.find((c) => c.id === l.category)?.perDay !== false;
      return { ...l, qty: wholeIn(g?.qty, 0, LIMITS.qty), days: perDay ? wholeIn(g?.days, 1, LIMITS.days) : 1 };
    });
    return lines.some((l) => lineAmount(l) > 0) ? { lines } : undefined;
  }
  const lines: BudgetLine[] = [];
  for (const g of given) {
    if (!g || typeof g !== "object") continue;
    const category = spec.categories.find((c) => c.id === g.category);
    if (!category) continue;
    const item = oneLine(g.item, LIMITS.name);
    const preset = category.presets?.find((p) => p.item === item);
    if (!preset && !category.custom) continue;
    const paidFrom = preset?.source ?? source(g.source);
    const rate = rateIsLocked(spec, preset, paidFrom) ? (preset?.rate ?? 0) : cents(Math.min(LIMITS.rate, Math.max(0, finite(g.rate) || 0)));
    const line: BudgetLine = {
      // A copy being filled in keeps the page's own keys, so a line being edited stays put on every page.
      key: draft && typeof g.key === "string" && /^[A-Za-z0-9]{1,24}$/.test(g.key) ? g.key : `L${lines.length + 1}`,
      category: category.id,
      item,
      qty: wholeIn(g.qty, 0, LIMITS.qty),
      rate,
      days: category.perDay === false ? 1 : wholeIn(g.days, 1, LIMITS.days),
      source: paidFrom,
    };
    if (spec.per) line.part = Math.min(Math.max(0, wholeIn(g.part, 0, 99)), 99);
    if (preset?.recipient) {
      // In parts and in capitals; a recipient sent whole (from before names had parts) stays whole.
      const parts = hasParts(g.recipientName) ? cleanName(g.recipientName) : undefined;
      const recipient = parts ? fullName(parts) : toCaps(oneLine(g.recipient, LIMITS.name));
      if (recipient) line.recipient = recipient;
      if (parts && recipient) line.recipientName = parts;
    }
    if (category.id === "transport" && (g.transportPayment === "cash" || g.transportPayment === "ovrf")) line.transportPayment = g.transportPayment;
    // Keep a line once anything is in it, even a part that's gone (the check reports that); a copy keeps blank ones.
    if (draft || item || line.qty || line.rate) lines.push(line);
  }
  return lines.length ? { lines } : undefined;
}

/* ---------- Conditions ---------- */

/** Whether a condition holds for these answers. A field the condition names that is hidden has no answer. */
export function holds(cond: Condition | undefined, answers: Answers, specs: Map<string, FieldSpec>) {
  if (!cond) return true;
  const spec = specs.get(cond.field);
  if (!spec) return false;
  const value = answers[cond.field];
  const m = moduleOf(spec);
  if (cond.filled !== undefined && m.filled(spec, value) !== cond.filled) return false;
  if (cond.is) {
    const tokens = m.tokens(spec, value);
    if (!cond.is.some((x) => tokens.includes(x))) return false;
  }
  return true;
}

/** Every field of these sections by id. */
export function fieldMap(sections: { fields: FieldSpec[] }[], extra: FieldSpec[] = []) {
  const map = new Map<string, FieldSpec>();
  for (const s of sections) for (const f of s.fields) map.set(f.id, f);
  for (const f of extra) map.set(f.id, f);
  return map;
}
