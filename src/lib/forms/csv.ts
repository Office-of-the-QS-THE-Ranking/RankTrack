/*
 * A form's responses as a spreadsheet: one row per response, its reference, when it came, its status and each
 * sign-off, then one column per question in the form's order, then the office's own fields. Each answer reads as
 * its module writes it. Cells that a spreadsheet would run as a formula are made plain text.
 */
import type { CheckContext } from "./check";
import { dayLabel, stampLabel } from "./format";
import { fieldMap, moduleOf } from "./modules";
import { decisionLabel, STATUS_LABEL } from "./review";
import type { Answers, FormSchema, ResponseStatus, ReviewState } from "./types";

export interface Exported {
  ref: string;
  submittedAt: string;
  status: ResponseStatus;
  answers: Answers;
  review: ReviewState;
}

const cell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function responsesCsv(schema: FormSchema, responses: Exported[], ctx: CheckContext): string {
  const fields = fieldMap(schema.sections, schema.review?.fields);
  const questions = schema.sections.flatMap((s) => s.fields).filter((f) => f.type !== "note");
  const office = (schema.review?.fields ?? []).filter((f) => f.type !== "note");
  const stages = schema.review?.stages ?? [];
  const head = ["Reference", "Submitted", "Status", ...stages.map((s) => `${s.verb} by (${s.role})`), ...questions.map((f) => f.label), ...office.map((f) => f.label)];
  const rows = responses.map((r) => {
    const full = { ...ctx, answers: r.answers, fields };
    return [
      r.ref,
      stampLabel(r.submittedAt),
      STATUS_LABEL[r.status],
      ...stages.map((s) => {
        const rec = r.review.stages[s.id];
        return rec ? `${decisionLabel(s, rec)} · ${rec.name} · ${dayLabel(rec.on)}${rec.note ? ` · ${rec.note}` : ""}` : "";
      }),
      ...questions.map((f) => moduleOf(f).text(f, r.answers[f.id], full)),
      ...office.map((f) => moduleOf(f).text(f, r.review.fields[f.id], { ...full, answers: { ...r.answers, ...r.review.fields } })),
    ];
  });
  return [head, ...rows].map((row) => row.map((v) => cell(String(v ?? ""))).join(",")).join("\r\n");
}
