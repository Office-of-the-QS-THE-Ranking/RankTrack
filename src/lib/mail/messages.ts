/*
 * What each message looks like as an email. The words are the Office's: every message is a template on System
 * Configuration › Messages, with a subject and a body the Office edits. This file adds what a template can't say in
 * a sentence: what kind of message it is, the reference code and facts to set on the ticket, where a request stands,
 * what the button says, and why the person is getting it. Pure, so the Email tab previews with the same code.
 */
import { PORTAL_NAME } from "@/lib/brand";
import type { EmailContent, StepState } from "./layout";

export type MailVars = Record<string, string | number>;

interface Spec {
  eyebrow: string;
  /** The button's label; no button without one, or without somewhere to go. */
  cta?: string;
  /** Receipts and account notices: always sent, whatever the person's notification choices, never rate-limited. */
  required?: boolean;
  /** Goes to an address rather than an account, so it is email only. */
  direct?: boolean;
  reference?: (v: MailVars) => { label: string; value: string } | undefined;
  facts?: (v: MailVars) => [string, string | number | undefined][];
  steps?: [string, StepState][];
  /** Someone's own words carried in a variable, set apart as a quotation. */
  note?: { label: string; from: string };
  reason: string;
}

const ACCOUNT = `You are receiving this because you have an account on the ${PORTAL_NAME}.`;
const REQUESTED = `You are receiving this because this address was used to request access to the ${PORTAL_NAME}. If that was not you, reply to this email.`;

const code = (label: string, key = "reference") => (v: MailVars) => (v[key] ? { label, value: String(v[key]) } : undefined);

const SPECS: Record<string, Spec> = {
  "tpl-access-received": {
    eyebrow: "Receipt",
    cta: "Track your request",
    required: true,
    direct: true,
    reference: code("Reference code"),
    facts: (v) => [
      ["Submitted", v.date],
      ["Email", v.email],
      ["Affiliation", v.affiliation],
    ],
    steps: [
      ["Received", "done"],
      ["Under review", "now"],
      ["Decision", "next"],
      ["Sign in", "next"],
    ],
    reason: REQUESTED,
  },
  "tpl-access-approved": {
    eyebrow: "Access approved",
    cta: "Sign in",
    required: true,
    direct: true,
    reference: code("Reference code"),
    facts: (v) => [
      ["Role", v.role],
      ["Unit", v.unit],
      ["Sign in with", v.email],
    ],
    steps: [
      ["Received", "done"],
      ["Under review", "done"],
      ["Approved", "done"],
      ["Sign in", "now"],
    ],
    reason: REQUESTED,
  },
  "tpl-access-declined": {
    eyebrow: "Access request",
    required: true,
    direct: true,
    reference: code("Reference code"),
    note: { label: "From the Office", from: "comment" },
    reason: REQUESTED,
  },
  "tpl-invite": {
    eyebrow: "Invitation",
    cta: "Sign in to accept",
    required: true,
    facts: (v) => [
      ["Role", v.role],
      ["Unit", v.unit],
      ["Invited by", v.inviter],
    ],
    reason: `You are receiving this because someone at the University of Santo Tomas invited this address to the ${PORTAL_NAME}.`,
  },
  "tpl-suspended": { eyebrow: "Account notice", required: true, reason: ACCOUNT },
  "tpl-receipt": {
    eyebrow: "Receipt",
    cta: "View your submission",
    reference: code("Reference code"),
    facts: (v) => [
      ["Unit", v.unit],
      ["Submitted", v.date],
    ],
    steps: [
      ["Received", "done"],
      ["In review", "now"],
      ["Result", "next"],
    ],
    reason: "You are receiving this because you sent this submission.",
  },
  "tpl-form-receipt": {
    eyebrow: "Receipt",
    cta: "Open your response",
    required: true,
    direct: true,
    reference: code("Reference code"),
    facts: (v) => [
      ["Form", v.form],
      ["Submitted", v.date],
    ],
    reason: "You are receiving this because you sent, or were named on, this form response.",
  },
  "tpl-submitted": { eyebrow: "New submission", cta: "Review the submission", reason: "You are receiving this because you review submissions for the Office." },
  "tpl-accepted": { eyebrow: "Review result", cta: "View the submission", reason: "You are receiving this because you contribute for this unit." },
  "tpl-revision": { eyebrow: "Review result", cta: "Revise the submission", reason: "You are receiving this because you contribute for this unit." },
  "tpl-decision": { eyebrow: "Request", cta: "Open the request", reason: "You are receiving this because this request is yours to follow or decide." },
  "tpl-published": { eyebrow: "Published", cta: "View on the website", reason: "You are receiving this because you contribute for this unit." },
  "tpl-deadline": {
    eyebrow: "Deadline",
    cta: "Open the ranking",
    facts: (v) => [
      ["Ranking", v.ranking],
      ["Closes", v.date],
    ],
    reason: "You are receiving this because you work on rankings for the Office.",
  },
  "tpl-deadline-found": { eyebrow: "Deadline", cta: "Review the date", reason: "You are receiving this because you work on rankings for the Office." },
  "tpl-data-request": {
    eyebrow: "Data request",
    cta: "Open data requests",
    facts: (v) => [
      ["Ranking", v.ranking],
      ["Items", v.count],
      ["Due", v.due],
    ],
    reason: "You are receiving this because you contribute for this unit.",
  },
  "tpl-data-reminder": {
    eyebrow: "Reminder",
    cta: "Open data requests",
    facts: (v) => [
      ["Ranking", v.ranking],
      ["Still open", v.open],
      ["Due", v.due],
    ],
    reason: "You are receiving this because you contribute for this unit.",
  },
  "tpl-data-escalated": { eyebrow: "Overdue", cta: "Open the ranking", reason: "You are receiving this because you work on rankings for the Office." },
  "tpl-data-returned": { eyebrow: "Review result", cta: "Open data requests", reason: "You are receiving this because you contribute for this unit." },
  "tpl-data-thanks": { eyebrow: "Data received", cta: "Open data requests", reason: "You are receiving this because you contribute for this unit." },
  "tpl-data-sent": { eyebrow: "New data", cta: "Open the ranking", reason: "You are receiving this because you work on rankings for the Office." },
};

const FALLBACK: Spec = { eyebrow: "Notification", cta: "Open in the Portal", reason: ACCOUNT };

export const specOf = (templateId: string): Spec => SPECS[templateId] ?? FALLBACK;

/** Always sent, whatever the person chose, and never held back by the hourly limit. */
export const isRequired = (templateId: string) => !!SPECS[templateId]?.required;

/** Sent to an address, not an account: such a template is email only. */
export const isDirect = (templateId: string) => !!SPECS[templateId]?.direct;

/** Fill a template's {placeholders}. One with no value is dropped rather than shown in braces. */
export const fillText = (s: string, vars: MailVars) =>
  s
    .replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:])/g, "$1");

export interface Message {
  templateId: string;
  /** The template's subject and body as the Office wrote them, placeholders and all. */
  subject: string;
  body: string;
  vars: MailVars;
  /** Where the button goes: a path on the Hub, or nothing. */
  href?: string;
  /** Whether the person has an account, and so somewhere to choose their emails. */
  account?: boolean;
}

const absolute = (origin: string | null, path: string | undefined) => (origin && path?.startsWith("/") ? `${origin}${path}` : undefined);

/** A message as the layout's content, and its subject line. */
export function composeEmail(m: Message, origin: string | null): { subject: string; content: EmailContent } {
  const spec = specOf(m.templateId);
  const subject = fillText(m.subject, m.vars).trim().slice(0, 200) || PORTAL_NAME;
  const paragraphs = fillText(m.body, m.vars)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const facts = (spec.facts?.(m.vars) ?? []).flatMap(([label, value]): [string, string][] => (value === undefined || value === "" ? [] : [[label, String(value)]]));
  const noteText = spec.note ? String(m.vars[spec.note.from] ?? "").trim() : "";
  const href = absolute(origin, m.href);
  return {
    subject,
    content: {
      preheader: (paragraphs[0] ?? subject).slice(0, 140),
      eyebrow: spec.eyebrow,
      heading: subject,
      paragraphs,
      reference: spec.reference?.(m.vars),
      facts,
      steps: spec.steps?.map(([label, state]) => ({ label, state })),
      note: spec.note && noteText ? { label: spec.note.label, text: noteText } : undefined,
      cta: spec.cta && href ? { label: spec.cta, href } : undefined,
      reason: spec.reason,
      settings: !!m.account,
    },
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A moment as Manila reads it, "14 Nov 2026, 09:30", or a day alone, "14 Nov 2026". Worked out by hand, so every server agrees. */
export function mailDate(iso: string) {
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dayOnly ? `${iso}T00:00:00Z` : Date.parse(iso) + 8 * 3_600_000);
  if (Number.isNaN(d.getTime())) return iso;
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const p = (n: number) => String(n).padStart(2, "0");
  return dayOnly ? day : `${day}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/* ---------- Previews ---------- */

/** Stand-in values for the Email tab's previews and the test message. */
export const SAMPLE_VARS: MailVars = {
  name: "Dr. J. Santiago",
  inviter: "Engr. Nestor R. Ong",
  unit: "Faculty of Engineering",
  role: "Coordinator",
  title: "Flood-resilience design studio",
  comment: "Please attach the barangay resolution.",
  count: 3,
  decision: "approved",
  approver: "Engr. Rodablas P. Nicolas",
  ranking: "UI GreenMetric",
  days: "10 days",
  open: 2,
  reason: "Five failed sign-ins.",
  reference: "RQ-0042",
  date: "14 Nov 2026, 09:30",
  due: "30 Nov 2026",
  email: "j.santiago@ust.edu.ph",
  affiliation: "University of Santo Tomas",
  form: "Community Development Project Proposal",
  indicator: "Academic staff with PhD",
  label: "Data collection closes",
  source: "the ranking body's website",
  model: "Gemini Flash-Lite",
  provider: "Google",
  budget: "20.00",
  left: "4.50",
};

/** Where a preview's button would go. */
export const SAMPLE_HREF: Record<string, string> = {
  "tpl-access-received": "/signin?track=RQ-0042",
  "tpl-access-approved": "/signin",
  "tpl-invite": "/signin",
  "tpl-receipt": "/portal/submit",
  "tpl-form-receipt": "/portal",
};
