/*
 * What an indicator accepts, checked the same way in the entry forms and on the server: a number within the
 * indicator's range (whole when it counts things), an option it offers, a date, text within its length, and a
 * policy's dates where the body asks for them. Returns the clean value, or a sentence saying what to fix.
 */
import type { CatalogIndicator, Value } from "./types";

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export const VALUE_LIMITS = { text: 4000, note: 2000 };

export function readValue(ind: Pick<CatalogIndicator, "input" | "evidence" | "name">, raw: unknown): Value | string {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Value = {};
  const input = ind.input;
  switch (input.type) {
    case "number": {
      const n = typeof r.num === "number" ? r.num : typeof r.num === "string" && r.num.trim() ? Number(r.num.replace(/[,\s]/g, "")) : NaN;
      if (!Number.isFinite(n)) return "Enter a number.";
      if (input.min !== undefined && n < input.min) return `Enter ${input.min} or more.`;
      if (input.max !== undefined && n > input.max) return `Enter ${input.max} or less.`;
      if (input.integer && !Number.isInteger(n)) return "Enter a whole number.";
      if (Math.abs(n) > 1e15) return "That number is too large.";
      out.num = n;
      break;
    }
    case "choice": {
      if (typeof r.choice !== "string" || !input.options.some((o) => o.key === r.choice)) return "Choose one of the options.";
      out.choice = r.choice;
      break;
    }
    case "picks": {
      const picks = Array.isArray(r.picks) ? [...new Set(r.picks.filter((p): p is string => typeof p === "string" && input.options.some((o) => o.key === p)))] : [];
      if (r.yes === false) {
        out.yes = false;
        break;
      }
      if (!picks.length) return "Tick at least one option, or answer No.";
      out.picks = picks;
      out.yes = true;
      break;
    }
    case "yesno": {
      if (typeof r.yes !== "boolean") return "Answer Yes or No.";
      out.yes = r.yes;
      break;
    }
    case "text": {
      const t = typeof r.text === "string" ? r.text.trim() : "";
      if (!t) return "Write the answer.";
      if (t.length > (input.max ?? VALUE_LIMITS.text)) return `Keep it under ${(input.max ?? VALUE_LIMITS.text).toLocaleString("en-PH")} characters.`;
      out.text = t;
      break;
    }
    case "date": {
      if (!isDay(r.date)) return "Choose a date.";
      out.date = r.date;
      break;
    }
    default:
      return `${ind.name} is computed or recorded elsewhere, not entered.`;
  }
  if (ind.evidence.policyDates && out.yes !== false) {
    if (r.created !== undefined && r.created !== "" && !isDay(r.created)) return "Choose when the policy was made.";
    if (r.reviewed !== undefined && r.reviewed !== "" && !isDay(r.reviewed)) return "Choose when the policy was last reviewed.";
    if (isDay(r.created)) out.created = r.created;
    if (isDay(r.reviewed)) out.reviewed = r.reviewed;
    if (out.created && out.reviewed && out.reviewed < out.created) return "The review date can’t be before the policy was made.";
  }
  return out;
}

/** Whether an indicator takes a typed value at all. */
export const enterable = (ind: Pick<CatalogIndicator, "input">) => !["none", "result", "cases"].includes(ind.input.type);
