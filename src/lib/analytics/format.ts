/* How analytics figures read on the page and in exports. Safe anywhere. */
import type { IndicatorState, InputSpec, Value } from "./types";

/** A number as the Office writes it: thousands separated, at most two decimals, small ones kept precise. */
/** "1 unit", "3 units". */
export const count = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

export function num(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const d = abs >= 1000 ? 0 : abs >= 1 ? digits : abs === 0 ? 0 : Math.max(digits, 3);
  return n.toLocaleString("en-PH", { maximumFractionDigits: d });
}

/** Points on an edition's scale. */
export const pts = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-PH") : num(n, 1));

export const pct = (n: number | null | undefined, digits = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n.toFixed(digits)}%`);

/** An entered value as one line of text. */
export function valueText(input: InputSpec, v: Value | null | undefined, unit?: string | null): string {
  if (!v) return "";
  switch (input.type) {
    case "number":
      return v.num === undefined ? "" : `${num(v.num)}${unit ?? input.unit ? ` ${unit ?? input.unit}` : ""}`;
    case "choice":
      return v.choice === undefined ? "" : (input.options.find((o) => o.key === v.choice)?.label ?? v.choice);
    case "picks": {
      const labels = (v.picks ?? []).map((p) => input.options.find((o) => o.key === p)?.label ?? p);
      return labels.length ? labels.join(", ") : v.yes === true ? "Yes" : v.yes === false ? "No" : "";
    }
    case "yesno":
      return v.yes === undefined ? "" : v.yes ? "Yes" : "No";
    case "date":
      return v.date ?? "";
    case "text":
      return v.text ?? "";
    default:
      return v.num !== undefined ? num(v.num) : (v.text ?? "");
  }
}

export const STATE_TONE: Record<IndicatorState, "ok" | "review" | "revise" | "missing" | "neutral"> = {
  Validated: "ok",
  "For review": "review",
  "Needs revision": "revise",
  "Not started": "missing",
  "Not applicable": "neutral",
};

/** A day as "26 Oct 2026". */
export const day = (iso?: string) => (iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00+08:00` : iso)) : "—");

/** Days from today (Manila) to a date; negative when it has passed. */
export function daysTo(isoDay: string, now = new Date()) {
  const today = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDay}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
