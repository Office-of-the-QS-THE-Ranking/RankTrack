"use client";

/*
 * The Hub's own field validation, in place of the bubble each browser draws its own way (AGENTS.md).
 * Forms keep native constraints (required, type="email", min, maxLength, pattern, setCustomValidity);
 * <FieldErrors /> sits once in the root layout, catches every `invalid` event and cancels the browser's
 * bubble. Each failing field gets a red edge, a short shake and a warning sign at its right end; the
 * message shows in a tooltip while the pointer is on the sign, and is read out with the field. The first
 * failing field takes focus. Interacting with a flagged field clears its feedback; a later failed submit
 * marks it again. Feedback also clears as soon as the field passes.
 * The signs are manual popovers, so they show above modal drawers, and they borrow the surface's
 * --pick-* colours, so they read as part of the page they sit on.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Entry = {
  el: Control;
  target: HTMLElement;
  message: string;
  id: string;
  /** Distance of the sign from the field's right edge; negative sits it just outside (checkboxes). */
  inset: number;
  /** The field's own inline padding, put back when it passes. */
  pad: string | null;
  /** Bumped on each failed submit, to replay the shake. */
  shake: number;
};

const entries = new Map<Control, Entry>();
let list: Entry[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => {
  list = [...entries.values()];
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => list;
const none: Entry[] = [];

const SIGN = 18;
const SHAKE_MS = 420;

/* What a person sees and focuses: a picker's trigger rather than its hidden field. */
const targetOf = (el: Control): HTMLElement => (el.classList.contains("pick-proxy") && el.previousElementSibling instanceof HTMLElement ? el.previousElementSibling : el);

/** Plain words for each broken constraint. `data-missing` on a field overrides the empty-field message. */
export function messageFor(el: Control): string {
  const v = el.validity;
  const type = el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase();
  const input = el instanceof HTMLInputElement ? el : null;
  if (v.valueMissing) {
    if (el.dataset.missing) return el.dataset.missing;
    if (type === "checkbox") return "Tick this box to continue.";
    if (type === "radio") return "Choose one of these.";
    if (type === "file") return "Choose a file.";
    if (type === "select") return "Choose one.";
    if (type === "email") return "Enter an email address.";
    return "Fill in this field.";
  }
  if (v.customError) return el.validationMessage;
  if (v.typeMismatch) return type === "email" ? "Enter an email address, like name@institution.org." : type === "url" ? "Enter a web address, starting with https://." : "Check the format.";
  if (v.badInput) return type === "number" ? "Enter a number." : "Check the format.";
  if (v.patternMismatch) return el.title || "Use the format shown.";
  if (v.tooShort && input) return `Use at least ${input.minLength} characters. This has ${input.value.length}.`;
  if (v.tooLong && "maxLength" in el) return `Use ${el.maxLength} characters or fewer.`;
  if (v.rangeUnderflow && input) return `Enter ${input.min} or more.`;
  if (v.rangeOverflow && input) return `Enter ${input.max} or less.`;
  if (v.stepMismatch && input) return Number(input.step || 1) === 1 ? "Enter a whole number." : `Use steps of ${input.step}.`;
  return el.validationMessage || "Check this field.";
}

const describe = (target: HTMLElement, id: string, on: boolean) => {
  const ids = (target.getAttribute("aria-describedby") ?? "").split(" ").filter((x) => x && x !== id);
  if (on) ids.push(id);
  if (ids.length) target.setAttribute("aria-describedby", ids.join(" "));
  else target.removeAttribute("aria-describedby");
};

function mark(el: Control) {
  const known = entries.get(el);
  const target = targetOf(el);
  if (known) {
    known.message = messageFor(el);
    known.shake++;
  } else {
    const box = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
    // Warnings take the rightmost slot; CSS temporarily hides the field's usual adornments.
    const inset = box ? -(SIGN + 6) : 10;
    const entry: Entry = { el, target, message: messageFor(el), id: `field-error-${++seq}`, inset, pad: box ? null : target.style.paddingRight, shake: 1 };
    entries.set(el, entry);
    if (!box) target.style.paddingRight = `${inset + SIGN + 8}px`;
    target.setAttribute("data-invalid", "");
    if (!target.hasAttribute("aria-invalid")) target.setAttribute("aria-invalid", "true");
    describe(target, entry.id, true);
  }
  target.removeAttribute("data-shake");
  void target.offsetWidth; // restart the animation on a repeat
  target.setAttribute("data-shake", "");
  setTimeout(() => target.removeAttribute("data-shake"), SHAKE_MS);
}

function unmark(el: Control) {
  const e = entries.get(el);
  if (!e) return;
  entries.delete(el);
  const t = e.target;
  if (e.pad !== null) t.style.paddingRight = e.pad;
  t.removeAttribute("data-invalid");
  t.removeAttribute("data-shake");
  if (t.getAttribute("aria-invalid") === "true") t.removeAttribute("aria-invalid");
  describe(t, e.id, false);
  emit();
}

/* Re-check a marked field after it changes: clear it once it passes, or refresh its message. */
function recheck(el: Control) {
  const e = entries.get(el);
  if (!e) return;
  if (!el.isConnected || el.validity.valid) return unmark(el);
  const message = messageFor(el);
  if (message !== e.message) {
    e.message = message;
    emit();
  }
}

/** For pickers: their hidden field changes without an input event, so they report a new value here. */
export function recheckField(trigger: HTMLElement | null) {
  if (!trigger) return;
  // Wait for React to write the new value into the hidden field.
  setTimeout(() => {
    for (const e of entries.values()) if (e.target === trigger) recheck(e.el);
  });
}

const isControl = (t: EventTarget | null): t is Control => t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;

/* The surface's picker palette and type, so the sign and its tooltip match the field. */
const BORROWED = ["--pick-bg", "--pick-fg", "--pick-shadow", "--pick-edge", "--pick-warn", "font-family"];

function Sign({ entry }: { entry: Entry }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState(false);
  const [below, setBelow] = useState(false);

  useLayoutEffect(() => {
    const pop = ref.current;
    if (!pop) return;
    const cs = getComputedStyle(entry.target);
    for (const p of BORROWED) {
      const v = cs.getPropertyValue(p);
      if (v) pop.style.setProperty(p, v);
    }
    if (typeof pop.showPopover === "function" && !pop.matches(":popover-open")) pop.showPopover();
    // Follow the field through scrolling, resizing and layout shifts.
    let frame = 0;
    let last = "";
    const follow = () => {
      if (!entry.target.isConnected) return unmark(entry.el);
      const r = (entry.target.closest(".input-group, .pick-num") ?? entry.target).getBoundingClientRect();
      const gone = r.width === 0 && r.height === 0;
      // Multi-line fields, and anything marked `data-multiline`, carry the sign by their first line.
      const top = entry.target instanceof HTMLTextAreaElement || entry.target.hasAttribute("data-multiline") ? r.top + 10 : r.top + r.height / 2 - SIGN / 2;
      const left = r.right - entry.inset - SIGN;
      const key = `${gone}|${left}|${top}`;
      if (key !== last) {
        last = key;
        pop.style.visibility = gone ? "hidden" : "";
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
        setBelow(top < 72);
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [entry]);

  return (
    <div ref={ref} popover="manual" className="fieldwarn" data-tip={tip ? (below ? "below" : "above") : undefined} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      <span
        key={entry.shake}
        className="fieldwarn__sign"
        aria-hidden="true"
        onClick={() => {
          unmark(entry.el);
          entry.target.focus();
        }}
      >
        <Icon name="alert" size={SIGN} strokeWidth={2} />
      </span>
      <span id={entry.id} className="fieldwarn__tip">
        {entry.message}
      </span>
    </div>
  );
}

export function FieldErrors() {
  const signs = useSyncExternalStore(subscribe, snapshot, () => none);
  const [said, setSaid] = useState<{ text: string; host: Element | null; n: number }>({ text: "", host: null, n: 0 });

  useEffect(() => {
    let batch = false;
    const onInvalid = (e: Event) => {
      if (!isControl(e.target)) return;
      const el = e.target;
      e.preventDefault();
      mark(el);
      // A failed submit fires `invalid` at every failing field in order; the first one gets focus.
      if (!batch) {
        batch = true;
        setTimeout(() => {
          batch = false;
          emit();
        });
        const target = targetOf(el);
        target.focus();
        if (document.activeElement !== target) target.scrollIntoView({ block: "center" });
        setSaid((s) => ({ text: messageFor(el), host: target.closest("dialog[open]"), n: s.n + 1 }));
      }
    };
    const onEdit = (e: Event) => {
      if (isControl(e.target)) {
        const el = e.target;
        // After the page's own handlers, which may set a custom message.
        setTimeout(() => recheck(el));
      }
    };
    const onInteract = (e: Event) => {
      // Keep the feedback when a failed submit automatically focuses its first invalid field.
      if (e.type === "focusin" && batch) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const label = target.closest("label");
      for (const entry of [...entries.values()]) {
        if (entry.target.contains(target) || label?.contains(entry.target)) unmark(entry.el);
      }
    };
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onEdit);
    document.addEventListener("change", onEdit);
    document.addEventListener("pointerdown", onInteract, true);
    document.addEventListener("click", onInteract, true);
    document.addEventListener("focusin", onInteract);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onEdit);
      document.removeEventListener("change", onEdit);
      document.removeEventListener("pointerdown", onInteract, true);
      document.removeEventListener("click", onInteract, true);
      document.removeEventListener("focusin", onInteract);
    };
  }, []);

  return (
    <>
      {signs.map((entry) => createPortal(<Sign key={entry.id} entry={entry} />, entry.target.closest("dialog[open]") ?? document.body, entry.id))}
      {/* The first problem is read out once per failed submit; an open modal dialog makes the rest of the page inert. */}
      {said.text &&
        createPortal(
          <div key={said.n} className="sr-only" role="alert">
            {said.text}
          </div>,
          said.host ?? document.body,
        )}
    </>
  );
}
