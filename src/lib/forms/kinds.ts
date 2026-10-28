/*
 * The words and limits Digital Forms share between the shelf, the form's page and the server: what a form can
 * be, where it stands, and how long its details may run. No server code, so pages can import it.
 */
import type { FieldType, FormKind, FormStatus } from "./types";

export const FORM_KINDS: { key: FormKind; label: string; plural: string }[] = [
  { key: "survey", label: "Survey", plural: "Surveys" },
  { key: "registration", label: "Registration Form", plural: "Registrations" },
  { key: "application", label: "Application Form", plural: "Applications" },
  { key: "proposal", label: "Proposal Form", plural: "Proposals" },
  { key: "evaluation", label: "Evaluation Form", plural: "Evaluations" },
  { key: "terminal-report", label: "Terminal Report", plural: "Terminal Reports" },
];

export const isFormKind = (k: unknown): k is FormKind => FORM_KINDS.some((x) => x.key === k);

export const formKindLabel = (k: FormKind) => FORM_KINDS.find((x) => x.key === k)!.label;

export const FORM_STATUS_LABEL: Record<FormStatus, string> = { draft: "Draft", open: "Open", closed: "Closed" };

export const FORM_LIMITS = { title: 160, description: 300, reference: 80, prefix: 6, answers: 300_000 } as const;

/** A responder link's code: lowercase letters, digits and dashes. */
export const FORM_CODE = /^[a-z0-9][a-z0-9-]{3,39}$/;

/** The responder link for a form. */
export const formPath = (code: string) => `/f/${code}`;

/** What each module is called where people see it: the form's map, and the Forms Builder's palette. */
export const MODULE_NAMES: Record<FieldType, string> = {
  text: "Short answer",
  paragraph: "Paragraph",
  choice: "Choice",
  yesno: "Yes or no",
  unit: "University unit",
  sdgs: "SDGs",
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
  signature: "E-signature",
  note: "Note",
};
