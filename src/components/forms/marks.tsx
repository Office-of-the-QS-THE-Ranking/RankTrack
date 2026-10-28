/*
 * Small marks the Digital Forms pages share: where a form stands (a live dot while it takes responses), where a
 * response stands, and how long ago something happened.
 */
import { dayLabel } from "@/lib/forms/format";
import { FORM_STATUS_LABEL } from "@/lib/forms/kinds";
import { INCOMPLETE, STATUS_LABEL } from "@/lib/forms/review";
import type { FormStatus, ResponseStatus } from "@/lib/forms/types";

const AGO = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
/** "today", "yesterday", "3 days ago", or the day. */
export function ago(iso: string) {
  const days = Math.round((Date.now() - Date.parse(iso)) / 86_400_000);
  return days < 1 ? "today" : days < 7 ? AGO.format(-days, "day") : dayLabel(iso.slice(0, 10));
}

/** A form's status as a small pill: a live dot while it takes responses. */
export function StatusMark({ status }: { status: FormStatus }) {
  return (
    <span className={`fm-status fm-status--${status}`}>
      <i aria-hidden="true" />
      {status === "open" ? "Taking responses" : FORM_STATUS_LABEL[status]}
    </span>
  );
}

/** A response's review status as a pill. */
export function ResponseMark({ status }: { status: "draft" | ResponseStatus }) {
  return <span className={`fm-rstatus fm-rstatus--${status}`}>{status === "draft" ? INCOMPLETE : STATUS_LABEL[status]}</span>;
}
