"use client";

import { useEffect } from "react";

/*
 * A loader inside the button that started an action, for as long as the action runs. Mounted once
 * in the root layout, next to <ButtonFx />. Buttons need no markup: the layer remembers which
 * button was just pressed, and code that does work reports it with `usePending(pending)` or
 * `trackPending(promise)`. The shared action hooks (useGovern, useRun, Command & Control's
 * console) already report, so their buttons get the loader for free.
 * - Only the pressed button shows it; siblings disabled by the same pending state just dim.
 * - A press inside a dialog that closes before the work starts (a confirm step, a menu item)
 *   passes the loader back to the button that opened it.
 * - The loader replaces the button's icon when it has one, so nothing shifts; otherwise it sits
 *   before the label. It appears only after 120 ms, so instant actions never flash.
 * Tabs, options, switches, checkboxes and picker triggers never show it. Give anything else
 * data-loader="off" to leave it alone.
 */

const HOST = 'button, [role="button"], input:is([type="button"], [type="submit"]), a.btn, a.w-btn';
const INTERACTIVE = `${HOST}, a[href], input, textarea, select, [role], [contenteditable="true"], label`;
const NEVER = '[role="tab"], [role="option"], [role^="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], .pick-trigger, [data-loader="off"]';

const RECENT_MS = 1500; // a press this recent can own work that just started
const HANDOFF_MS = 60_000; // how far back a closed dialog can hand the loader to its opener
const SHOW_AFTER_MS = 120;
const HISTORY = 6;

type Press = { el: Element; t: number };
type Busy = { count: number; timer: number; shown: boolean; hid: Element | null; ownAriaBusy: string | null };

const history: Press[] = [];
const busy = new Map<HTMLElement, Busy>();
let observer: MutationObserver | null = null;
let listening = false;

const gone = (el: Element) => !el.isConnected || (typeof el.checkVisibility === "function" && !el.checkVisibility());

/** The button that owns work starting now, or null when nobody pressed one for it. */
function owner(): HTMLElement | null {
  const now = performance.now();
  for (let i = history.length - 1; i >= 0; i--) {
    const { el, t } = history[i];
    const newest = i === history.length - 1;
    if (now - t > (newest ? RECENT_MS : HANDOFF_MS)) return null;
    // Closed with its dialog or menu: the press before it opened that dialog.
    if (gone(el)) continue;
    if (!(el instanceof HTMLElement) || !el.matches(HOST) || el.matches(NEVER) || el.closest('[data-loader="off"]')) return null;
    return el;
  }
  return null;
}

function remember(el: Element) {
  history.push({ el, t: performance.now() });
  if (history.length > HISTORY) history.shift();
}

/* ---------- Drawing the loader ---------- */

const contentChildren = (btn: HTMLElement) =>
  [...btn.children].filter((c) => c.tagName !== "BUTTON-FX" && !c.classList.contains("btn-loader"));

const isIcon = (el: Element | undefined) =>
  Boolean(el && el.matches("svg, img, .icon, [data-icon]") && !el.matches(".sr-only"));

/** Puts the loader in place: over the icon when there is one, else before the label. Idempotent. */
function place(btn: HTMLElement, b: Busy) {
  let spin = btn.querySelector<HTMLElement>(":scope > .btn-loader");
  // Still in place (moving it again would trigger the observer and loop).
  if (spin && (!b.hid || (b.hid.parentElement === btn && b.hid.hasAttribute("data-loader-hidden")))) return;

  b.hid?.removeAttribute("data-loader-hidden");
  b.hid = null;
  if (!spin) {
    spin = document.createElement("span");
    spin.className = "btn-loader";
    spin.setAttribute("aria-hidden", "true");
  }
  spin.removeAttribute("style");

  const kids = contentChildren(btn);
  const icon = isIcon(kids[0]) ? kids[0] : isIcon(kids[kids.length - 1]) ? kids[kids.length - 1] : null;
  if (icon) {
    const r = icon.getBoundingClientRect();
    const c = getComputedStyle(icon);
    const size = Math.max(10, Math.min(24, Math.round(Math.min(r.width, r.height) || 16)));
    spin.style.width = spin.style.height = `${size}px`;
    spin.style.margin = c.margin;
    icon.before(spin);
    icon.setAttribute("data-loader-hidden", "");
    b.hid = icon;
    return;
  }
  // No icon: lead the label. Flex and grid buttons space it with their own gap.
  const c = getComputedStyle(btn);
  const gap = /flex|grid/.test(c.display) && parseFloat(c.columnGap) > 0;
  if (!gap && btn.textContent?.trim()) spin.style.marginInlineEnd = "0.5em";
  const first = kids[0] ?? null;
  const lead = [...btn.childNodes].find((n) => n === first || (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()));
  btn.insertBefore(spin, lead ?? null);
}

function show(btn: HTMLElement) {
  const b = busy.get(btn);
  if (!b || b.shown || !btn.isConnected) return;
  // Already draws its own (the sign-in button's): one loader is enough.
  if (btn.querySelector('[class*="spin"]:not(.btn-loader), [role="progressbar"]')) return;
  b.shown = true;
  b.ownAriaBusy = btn.getAttribute("aria-busy");
  btn.setAttribute("aria-busy", "true");
  btn.setAttribute("data-busy", "");
  place(btn, b);
  // React may rewrite the label (Save → Saving…) and take the loader with it; put it back.
  observer ??= new MutationObserver((records) => {
    const seen = new Set<HTMLElement>();
    for (const r of records) {
      const host = r.target as HTMLElement;
      const st = busy.get(host);
      if (st?.shown && !seen.has(host)) {
        seen.add(host);
        place(host, st);
      }
    }
  });
  observer.observe(btn, { childList: true });
}

function clear(btn: HTMLElement) {
  const b = busy.get(btn);
  if (!b) return;
  window.clearTimeout(b.timer);
  busy.delete(btn);
  if (!b.shown) return;
  btn.querySelector(":scope > .btn-loader")?.remove();
  b.hid?.removeAttribute("data-loader-hidden");
  btn.removeAttribute("data-busy");
  if (b.ownAriaBusy === null) btn.removeAttribute("aria-busy");
  else btn.setAttribute("aria-busy", b.ownAriaBusy);
  if (observer) {
    observer.disconnect();
    for (const [el, st] of busy) if (st.shown) observer.observe(el, { childList: true });
  }
}

/**
 * Marks the start of work. The button the person just pressed shows the loader until the returned
 * function is called. Safe to call when nobody pressed anything: then it does nothing.
 */
export function beginPending(): () => void {
  if (typeof window === "undefined" || !listening) return () => {};
  const btn = owner();
  if (!btn) return () => {};
  let b = busy.get(btn);
  if (!b) {
    b = { count: 0, timer: 0, shown: false, hid: null, ownAriaBusy: null };
    busy.set(btn, b);
    b.timer = window.setTimeout(() => show(btn), SHOW_AFTER_MS);
  }
  b.count++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const st = busy.get(btn);
    if (st && --st.count <= 0) clear(btn);
  };
}

/** Shows the loader on the pressed button until the promise settles, and passes the promise on. */
export function trackPending<T>(work: Promise<T>): Promise<T> {
  const end = beginPending();
  return work.finally(end);
}

/** Reports a component's pending state (a transition, a `busy` flag) to the pressed button. */
export function usePending(pending: unknown) {
  const on = Boolean(pending);
  useEffect(() => {
    if (!on) return;
    return beginPending();
  }, [on]);
}

export function ButtonBusy() {
  useEffect(() => {
    listening = true;
    // Capture, so the press is on record before any handler starts work.
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      remember(e.target.closest(HOST) ?? e.target.closest(INTERACTIVE) ?? e.target);
    };
    // Enter in a field submits with the form's default button.
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      const by = e.submitter ?? form.querySelector('button:not([type="button"]):not([type="reset"]), input[type="submit"]');
      if (by && history[history.length - 1]?.el !== by) remember(by);
    };
    // Typing or picking a value: work that follows (an autosave) isn't a button's.
    const onInput = (e: Event) => {
      if (e.target instanceof Element) remember(e.target);
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("submit", onSubmit, true);
    window.addEventListener("input", onInput, true);
    return () => {
      listening = false;
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("input", onInput, true);
      for (const btn of [...busy.keys()]) clear(btn);
      observer?.disconnect();
      observer = null;
    };
  }, []);
  return null;
}
