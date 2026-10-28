/*
 * Digital Forms: what a form is made of. A form is sections of fields, and each field is one of the Hub's form
 * modules (modules.ts): the field's spec says how its module asks the question, the answer is kept under the
 * field's id. The office's review of a response (sign-offs and office-only fields) is built from the same
 * modules. The Forms Builder writes these specs; docs/digital-forms.md lists every module and preset.
 * No server code, so pages can import it.
 */

/** What a form is for; it files the form on the Digital Forms shelf. */
export type FormKind = "survey" | "registration" | "application" | "proposal" | "evaluation" | "terminal-report";

/** Draft: only its owners can open it. Open: takes responses. Closed: keeps its responses, takes no more. */
export type FormStatus = "draft" | "open" | "closed";

/** The Directory's sections a unit question lists (lib/unit-categories.ts). */
export type UnitSection = "academic" | "offices" | "research";

/** A field or section shows when an earlier answer says so. */
export interface Condition {
  field: string;
  /** Shows when the answer includes any of these: a choice's values, yes or no, a budget's categories. */
  is?: string[];
  /** Shows when the field has (true) or lacks (false) an answer. */
  filled?: boolean;
}

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

interface Base<T extends string> {
  /** The answer's key: letters, digits and dashes, unique in the form. */
  id: string;
  type: T;
  label: string;
  /** A short line under the label. */
  help?: string;
  /** Longer guidance, behind an info mark. */
  hint?: string;
  required?: boolean;
  showIf?: Condition;
  /** Half a row on wide screens. */
  half?: boolean;
  /** Shown as a column of the responses table. */
  column?: boolean;
}

export interface TextSpec extends Base<"text"> {
  format?: "plain" | "email" | "phone";
  placeholder?: string;
  /** Most characters; 160 when not given. */
  max?: number;
  /** An email must be at this domain, like ust.edu.ph. */
  domain?: string;
  /** Kept in capitals, letters only (no digits or symbols): an organization's name. A person's name is asked with People. */
  caps?: boolean;
}

export interface ParagraphSpec extends Base<"paragraph"> {
  placeholder?: string;
  /** Most characters; 3,000 when not given. */
  max?: number;
  /** Most sentences. */
  sentences?: number;
}

export interface ChoiceSpec extends Base<"choice"> {
  options: ChoiceOption[];
  /** Several answers; one when not set. */
  multiple?: boolean;
  min?: number;
  max?: number;
  /** One more option, with this label, that asks for the answer in words. */
  other?: string;
  /** Cards for a few long options, chips for many short ones. */
  display?: "cards" | "chips";
}

export interface YesNoSpec extends Base<"yesno"> {
  yes?: string;
  no?: string;
}

/** A unit of the University, picked from the Hub's directory. */
export interface UnitSpec extends Base<"unit"> {
  sections?: UnitSection[];
}

export interface SdgsSpec extends Base<"sdgs"> {
  min?: number;
  max?: number;
}

export interface DateSpec extends Base<"date"> {
  min?: string;
  max?: string;
}

export type DateRangeSpec = Base<"daterange">;

export interface NumberSpec extends Base<"number"> {
  min?: number;
  max?: number;
  /** What is counted, after the number: "people", "years". */
  unit?: string;
}

export interface MoneySpec extends Base<"money"> {
  max?: number;
}

export interface LinkSpec extends Base<"link"> {
  placeholder?: string;
}

/** People named one by one: a name in parts (last, first, middle) in capitals, and the phone or email asked for. */
export interface PeopleSpec extends Base<"people"> {
  ask: ("phone" | "email")[];
  /** Show email without requiring it for an otherwise completed person. */
  emailOptional?: boolean;
  min?: number;
  max: number;
  /** Emails must be at this domain. */
  domain?: string;
  /** One person per role, in this order: "President", "Treasurer". */
  roles?: string[];
  /** What one of them is called, for "Add …": "contact person". */
  noun?: string;
  /** From before every person's name was in capitals; names always are now. */
  caps?: boolean;
}

/** `name`: a person's name in parts (last, first, middle), in capitals. */
export type ColumnType = "text" | "name" | "paragraph" | "choice" | "date" | "daterange" | "number" | "money" | "link";

export interface TableColumn {
  id: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  /** For a choice column. */
  options?: ChoiceOption[];
  /** For a choice column: one option per row of that table field ("Phase 1", "Phase 2"…). */
  optionsFrom?: string;
  placeholder?: string;
  /** A placeholder per row, in order: "Preparation", "Implementation", "Evaluation". */
  examples?: string[];
  max?: number;
  /** Shown in a row only when that row's other column holds one of these. */
  showIf?: { column: string; is: string[] };
  /** Takes the whole width of its row. */
  wide?: boolean;
  /** For a text column: kept in capitals, letters only (an organization's name). */
  caps?: boolean;
}

/** Rows of the same questions: phases, activities, speakers. */
export interface TableSpec extends Base<"table"> {
  columns: TableColumn[];
  min?: number;
  /** Most rows; 30 when not given. */
  max?: number;
  /** Fixed rows, one each, named in order; none can be added. */
  rows?: string[];
  /** Rows are numbered under this name: "Phase" makes Phase 1, Phase 2… */
  numbered?: string;
  /** The add button's words: "Add activity". */
  add?: string;
}

/** Numbers by group, with their total: participants by kind. */
export interface CountsSpec extends Base<"counts"> {
  rows: { id: string; label: string }[];
  total: string;
}

export interface BudgetSource {
  id: string;
  label: string;
}

/** A line the budget offers: its item, and the rate, which may be fixed. */
export interface BudgetPreset {
  item: string;
  rate?: number;
  /** The rate can't be changed; in budgets with CSF, applies only to that source. */
  locked?: boolean;
  /** Always paid from this source. */
  source?: string;
  hint?: string;
  /** Asks who receives it. */
  recipient?: boolean;
}

export interface BudgetCategory {
  id: string;
  label: string;
  hint?: string;
  presets?: BudgetPreset[];
  /** Lines of one's own may be added. */
  custom?: boolean;
  /** Lines count days; one day when false. */
  perDay?: boolean;
}

/** Lines of quantity × rate × days, each paid from a source, with totals by source, category and part. */
export interface BudgetSpec extends Base<"budget"> {
  sources: BudgetSource[];
  categories: BudgetCategory[];
  /** One budget per row of that table field (a phase). */
  per?: string;
  /** The presets are the lines: always there, rates and sources fixed, none added. */
  fixed?: boolean;
  /** A hypothetical value: no money is released. */
  theoretical?: boolean;
  /** From before recipients' names were always in capitals. */
  caps?: boolean;
}

/**
 * One source of a budget field added up, category by category: the paper's "summary of budget under the CSF". It
 * reads the budget, so nothing is typed twice. With `payee`, it asks for each category with an amount who it's
 * paid to (the office's part); without, it only shows the lines and totals.
 */
export interface BudgetSummarySpec extends Base<"budgetsummary"> {
  /** The budget field it adds up. */
  budget: string;
  /** The source it adds up: "csf". */
  source: string;
  payee?: ChoiceOption[];
}

export interface ConsentSpec extends Base<"consent"> {
  statements: { id: string; text: string; hint?: string }[];
}

/** Typed names that sign the form, one per signer (last, first, middle, in capitals), dated on submission. */
export interface SignatureSpec extends Base<"signature"> {
  signers: string[];
  /** From before signatures were always in capitals. */
  caps?: boolean;
}

/** Words between the questions; collects nothing. */
export interface NoteSpec extends Base<"note"> {
  text: string;
}

export type FieldSpec =
  | TextSpec
  | ParagraphSpec
  | ChoiceSpec
  | YesNoSpec
  | UnitSpec
  | SdgsSpec
  | DateSpec
  | DateRangeSpec
  | NumberSpec
  | MoneySpec
  | LinkSpec
  | PeopleSpec
  | TableSpec
  | CountsSpec
  | BudgetSpec
  | BudgetSummarySpec
  | ConsentSpec
  | SignatureSpec
  | NoteSpec;

export type FieldType = FieldSpec["type"];

export interface SectionSpec {
  id: string;
  title: string;
  /** An icon name (components/ui/Icon.tsx); a numbered dot when unknown. */
  icon?: string;
  showIf?: Condition;
  fields: FieldSpec[];
}

export type StageVerb = "Noted" | "Endorsed" | "Approved";

/** One sign-off on a response, by someone in this role. */
export interface StageSpec {
  id: string;
  role: string;
  verb: StageVerb;
  showIf?: Condition;
}

/** How the form's owners review a response: sign-offs in order, then fields only they fill in. */
export interface ReviewSpec {
  stages: StageSpec[];
  fields: FieldSpec[];
}

export interface FormSchema {
  sections: SectionSpec[];
  review?: ReviewSpec;
  /** The answers that say who a response is from: a text field's id and a text or people field with emails. */
  from?: { name: string; email?: string };
}

/* ---------- Answers ---------- */

export interface ChoiceValue {
  picked: string[];
  /** The words given for the `other` option. */
  other?: string;
}

export interface DateRange {
  from: string;
  to: string;
  /** Individual days instead of a continuous range. */
  dates?: string[];
  /** Ordered selections that can mix continuous ranges and individual dates. */
  entries?: { mode: "range" | "day"; from: string; to: string }[];
}

/** A person's name as the University's forms ask it: last, first and an optional middle name, in capitals. */
export interface NameParts {
  lastName?: string;
  firstName?: string;
  middleName?: string;
}

export interface Person extends NameParts {
  /** The full name, first to last, from the parts (or as typed whole, before names had parts). */
  name: string;
  phone?: string;
  email?: string;
  role?: string;
  /** Their photo, from the University directory when the email was picked there (lib/forms/people-lookup.ts). */
  photo?: string;
  /** The email explicitly picked from a directory suggestion; a display marker, never an access grant. */
  directoryEmail?: string;
}

export type Cell = string | number | DateRange | NameParts;
export type Row = Record<string, Cell>;

export interface BudgetLine {
  key: string;
  /** The row of the `per` table it belongs to, from 0. */
  part?: number;
  category: string;
  item: string;
  qty: number;
  rate: number;
  days: number;
  source: string;
  /** The full name, first to last, from `recipientName`. */
  recipient?: string;
  recipientName?: NameParts;
  transportPayment?: "cash" | "ovrf";
}

export interface BudgetValue {
  lines: BudgetLine[];
}

export interface Signature extends NameParts {
  /** The full name, first to last, from the parts. */
  name: string;
  /** The day it was signed, set when the response arrives. */
  on: string;
}

export type Value =
  | string
  | number
  | number[]
  | string[]
  | ChoiceValue
  | DateRange
  | Person[]
  | Row[]
  | Record<string, number>
  | Record<string, string>
  | BudgetValue
  | Signature[];

export type Answers = Record<string, Value>;

/* ---------- Review of a response ---------- */

export type StageDecision = "approved" | "returned" | "declined";

export interface StageRecord {
  decision: StageDecision;
  /** The signatory, as the office typed it. */
  name: string;
  /** The day they decided. */
  on: string;
  note?: string;
  /** Who recorded it in the Hub, and when. */
  by: string;
  at: string;
}

export interface ReviewState {
  stages: Record<string, StageRecord>;
  fields: Answers;
}

export type ResponseStatus = "received" | "in-review" | "approved" | "returned" | "declined";
