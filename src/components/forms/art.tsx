/*
 * A form drawn as one, for the Digital Forms shelf and its empty states: a card with a coloured band, a title,
 * three questions, a row of choices and a button, tinted by what the form is for (application gold, survey
 * violet, proposal teal, evaluation amber, registration rose, terminal report blue). Sized in em, so one font-size scales it. Styles in
 * styles/forms.css.
 */
import type { FormKind } from "@/lib/forms/types";

export function FormArt({ kind = "application", size = "md" }: { kind?: FormKind; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`fm-art fm-art--${kind} fm-art--${size}`} aria-hidden="true">
      <span className="fm-art__back" />
      <span className="fm-art__card">
        <span className="fm-art__band" />
        <span className="fm-art__title" />
        <span className="fm-art__q">
          <i />
          <b />
        </span>
        <span className="fm-art__q">
          <i />
          <b />
        </span>
        <span className="fm-art__dots">
          <i data-on="" />
          <i />
          <i />
        </span>
        <span className="fm-art__btn" />
      </span>
    </span>
  );
}
