/*
 * The autopilot bridge (shared copy: the portfolio's scripts/autopilot-bridge/autopilot-bridge.ts).
 *
 * Lets a portfolio that frames this site (PORTFOLIO_ORIGINS) demo it live: the portfolio's autopilot
 * asks where the links are, scrolls the page, points at links and opens them, and follows the route,
 * the way a visitor would. It does nothing outside a frame, answers only its own parent frame and
 * only from the listed origins, and only ever opens pages that may be framed.
 *
 * Protocol (every message carries `"autopilot-bridge": 1`):
 *   parent → frame  { id, cmd: "ping" | "look" | "scroll" | "stop" | "hover" | "click" | "go" | "back" | "forward", ... }
 *   frame → parent  { re: id, ok, data }                       (a reply)
 *                   { event: "ready" | "route" | "scroll" | "leaving", ... }   (unprompted)
 */

export type BridgeOptions = {
  /** The origins allowed to drive the site (PORTFOLIO_ORIGINS). */
  origins: string[];
  /** Whether the site's first-load screen is still up. */
  busy?: () => boolean;
  /** Whether a path may be opened in the frame. */
  allow?: (path: string) => boolean;
  /** Opens a path in place, through the site's own router. */
  navigate?: (path: string) => void;
  /** Jumps the page to `y` at once (through the site's smooth scroller, if it has one). */
  scrollTo?: (y: number) => void;
  /** Where the page is drawn now, if a smooth scroller draws it behind the real scroll position. */
  visualY?: () => number;
};

type Link = { x: number; y: number; w: number; h: number; path: string; label: string; id: number; fixed: boolean };

const TAG = "autopilot-bridge";
const VERSION = 1;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function startBridge(options: BridgeOptions): () => void {
  if (typeof window === "undefined" || window.parent === window || options.origins.length === 0) return () => {};
  // A frame of this same site (a preview of a page inside the site) isn't a portfolio.
  try {
    if (window.parent.location.origin === window.location.origin) return () => {};
  } catch {
    // A cross-origin parent can't be read: that's the portfolio.
  }

  const allow = options.allow ?? (() => true);
  const jump = options.scrollTo ?? ((y: number) => window.scrollTo({ top: y, behavior: "instant" }));
  const visualY = options.visualY ?? (() => window.scrollY);
  const busy = () => document.readyState === "loading" || Boolean(options.busy?.());
  const path = () => location.pathname + location.search;
  const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  let parentOrigin: string | null = null;
  let elements: HTMLElement[] = [];
  let hovered: HTMLElement | null = null;
  let scrollRun = 0;
  let lastPath = path();
  let wasBusy = busy();
  let lastScroll = -1;

  const post = (message: Record<string, unknown>) => {
    if (parentOrigin) window.parent.postMessage({ [TAG]: VERSION, ...message }, parentOrigin);
  };
  const state = () => ({ path: path(), title: document.title, busy: busy(), y: visualY(), max: maxY() });

  const isFixed = (el: HTMLElement, cache: Map<Element, boolean>): boolean => {
    let node: Element | null = el;
    const seen: Element[] = [];
    let fixed = false;
    while (node && node !== document.body) {
      const known = cache.get(node);
      if (known !== undefined) {
        fixed = known;
        break;
      }
      seen.push(node);
      const position = getComputedStyle(node).position;
      // A fixed bar stays put; so does a sticky one (a header), but not a tall sticky section that
      // pins a scroll animation, which scrolls away again.
      if (position === "fixed" || (position === "sticky" && (node as HTMLElement).offsetHeight < window.innerHeight * 0.5)) {
        fixed = true;
        break;
      }
      node = node.parentElement;
    }
    for (const n of seen) cache.set(n, fixed);
    return fixed;
  };

  /** Every link on the page that the autopilot may use, in page coordinates. */
  const look = () => {
    const y0 = visualY();
    const cache = new Map<Element, boolean>();
    const seen = new Set<string>();
    const links: Link[] = [];
    elements = [];
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      if (links.length >= 600) break;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) continue;
      const r = a.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      // Not opacity: sites fade content in as it scrolls into view, and those links are there to be found.
      if (a.checkVisibility && !a.checkVisibility({ visibilityProperty: true })) continue;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        continue;
      }
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) continue;
      const to = url.pathname + url.search;
      if (!allow(url.pathname)) continue;
      const fixed = isFixed(a, cache);
      const box = [r.left, r.top + (fixed ? 0 : y0), r.width, r.height].map(Math.round);
      const key = box.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      // innerText keeps the breaks between a card's lines ("Party registration", "Open until …").
      const label = (a.getAttribute("aria-label") || a.innerText || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
      elements.push(a);
      links.push({ x: box[0], y: box[1], w: box[2], h: box[3], path: to, label, id: elements.length - 1, fixed });
    }
    return { ...state(), vw: window.innerWidth, vh: window.innerHeight, links };
  };

  /** Glides the page to `y` over `ms`, then waits for a smooth scroller to catch up. */
  const glide = (target: number, ms: number) =>
    new Promise<void>((resolve) => {
      const run = ++scrollRun;
      const from = window.scrollY;
      const to = Math.max(0, Math.min(maxY(), target));
      const start = performance.now();
      const duration = Math.max(0, ms);
      const settle = (since: number) => {
        if (run !== scrollRun) return resolve();
        if (Math.abs(visualY() - to) < 2 || performance.now() - since > 1400) return resolve();
        requestAnimationFrame(() => settle(since));
      };
      const frame = (now: number) => {
        if (run !== scrollRun) return resolve();
        const t = duration ? Math.min(1, (now - start) / duration) : 1;
        jump(from + (to - from) * easeInOut(t));
        if (t < 1) requestAnimationFrame(frame);
        else settle(performance.now());
      };
      requestAnimationFrame(frame);
    });

  const pointer = (el: Element, type: string, bubbles: boolean) => {
    const r = el.getBoundingClientRect();
    const init = { bubbles, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window };
    el.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, { ...init, pointerType: "mouse" }) : new MouseEvent(type, init));
  };

  /*
   * Hover styles. A script can't put an element in :hover, so the site's :hover and :active rules are
   * copied onto attributes the bridge can set (same specificity, later in the cascade), and the
   * pointed-at element and its ancestors get them, as a real pointer's would. Mirrors are rebuilt when
   * the site's stylesheets change (a new page brings its own).
   */
  const HOVER = "data-autopilot-hover";
  const ACTIVE = "data-autopilot-active";
  /** The visitor's own pointer, passed on by the portfolio while the autopilot flies (see "pointer"). */
  const VISITOR = "data-autopilot-visitor";
  let mirror: CSSStyleSheet | null = null;
  let mirrorKey = "";

  /** Splits a selector list at its top-level commas. */
  const splitList = (list: string) => {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === "," && depth === 0) {
        parts.push(list.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(list.slice(start));
    return parts.map((p) => p.trim()).filter(Boolean);
  };
  /** A nested rule's selector, written out in full. */
  const unnest = (selector: string, parent: string) =>
    splitList(selector)
      .map((part) => (part.includes("&") ? part.replace(/&/g, `:is(${parent})`) : `:is(${parent}) ${part}`))
      .join(", ");
  const toMirror = (selector: string) =>
    selector.replace(/:hover\b/g, `:is([${HOVER}], [${VISITOR}])`).replace(/:active\b/g, `[${ACTIVE}]`);

  const mirrorRules = (rules: CSSRuleList, parent: string | null): string => {
    let out = "";
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const selector = parent ? unnest(rule.selectorText, parent) : rule.selectorText;
        if (/:hover|:active/.test(selector) && rule.style.length) out += `${toMirror(selector)}{${rule.style.cssText}}`;
        if (rule.cssRules?.length) out += mirrorRules(rule.cssRules, selector);
      } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
        const inner = mirrorRules(rule.cssRules, parent);
        if (inner) out += `@${rule instanceof CSSMediaRule ? "media" : "supports"} ${rule.conditionText}{${inner}}`;
      } else if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule) {
        const inner = mirrorRules(rule.cssRules, parent);
        if (inner) out += `@container ${rule.conditionText}{${inner}}`;
      } else if (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) {
        const inner = mirrorRules(rule.cssRules, parent);
        // A named layer keeps its place in the site's layer order; an anonymous one can't be named again.
        if (inner) out += rule.name ? `@layer ${rule.name}{${inner}}` : inner;
      }
    }
    return out;
  };

  const sheetRules = (sheet: CSSStyleSheet) => {
    try {
      return sheet.cssRules;
    } catch {
      return null; // a stylesheet from another origin (web fonts) can't be read, and has no hovers of the site's
    }
  };

  const ensureMirror = () => {
    const sheets = Array.from(document.styleSheets);
    const key = sheets.map((sheet) => `${sheet.href ?? "inline"}:${sheetRules(sheet)?.length ?? 0}`).join("|");
    if (key === mirrorKey) return;
    mirrorKey = key;
    let css = "";
    for (const sheet of sheets) {
      const rules = sheetRules(sheet);
      if (rules) css += mirrorRules(rules, null);
    }
    try {
      if (!mirror) {
        mirror = new CSSStyleSheet();
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, mirror];
      }
      mirror.replaceSync(css);
    } catch {
      // No constructable stylesheets: the pointer events below still run the site's own hover scripts.
    }
  };

  /** Puts `attr` on an element and every ancestor, as the pointer's state is, or clears it. */
  const mark = (attr: string, el: Element | null) => {
    for (const node of document.querySelectorAll(`[${attr}]`)) node.removeAttribute(attr);
    for (let node = el; node; node = node.parentElement) node.setAttribute(attr, "");
  };

  const hover = (el: HTMLElement | null) => {
    if (hovered === el) return;
    if (hovered) {
      for (const type of ["pointerout", "mouseout"]) pointer(hovered, type, true);
      for (const type of ["pointerleave", "mouseleave"]) pointer(hovered, type, false);
    }
    hovered = el;
    if (el) ensureMirror();
    mark(HOVER, el);
    if (el) {
      for (const type of ["pointerover", "mouseover"]) pointer(el, type, true);
      for (const type of ["pointerenter", "mouseenter"]) pointer(el, type, false);
    }
  };

  /** The visitor's pointer, over the page at (x, y) in its viewport, or off it. */
  let pointed: Element | null = null;
  const visitorAt = (x: number | null, y: number | null) => {
    const el = x === null || y === null ? null : document.elementFromPoint(x, y);
    if (el === pointed) return el;
    if (pointed) {
      for (const type of ["pointerout", "mouseout"]) pointer(pointed, type, true);
    }
    pointed = el;
    if (el) ensureMirror();
    mark(VISITOR, el);
    if (el) for (const type of ["pointerover", "mouseover"]) pointer(el, type, true);
    return el;
  };

  /** Clicks an element the way a pointer does: pressed for a moment, then the click. Links that may not be framed are refused. */
  const press = async (el: Element) => {
    const link = el.closest<HTMLAnchorElement>("a[href]");
    let url: URL | null = null;
    if (link) {
      url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !allow(url.pathname)) return false;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return false;
    }
    ensureMirror();
    mark(ACTIVE, el);
    await new Promise((resolve) => window.setTimeout(resolve, 130));
    mark(ACTIVE, null);
    hover(null);
    // A link the site's router doesn't handle itself (a plain <a>) would load a whole new page in the
    // frame; with `navigate`, it opens in place instead. Listening on window, last, sees what the
    // site's own handlers did first.
    const inPlace = (event: MouseEvent) => {
      window.removeEventListener("click", inPlace);
      if (!url || event.defaultPrevented || !options.navigate) return;
      event.preventDefault();
      options.navigate(url.pathname + url.search + url.hash);
    };
    window.addEventListener("click", inPlace);
    if (el instanceof HTMLElement) el.click();
    else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    window.removeEventListener("click", inPlace);
    return true;
  };

  const go = (to: string) => {
    const url = new URL(to, location.href);
    if (url.origin !== location.origin || !allow(url.pathname)) return false;
    hover(null);
    if (options.navigate) options.navigate(url.pathname + url.search);
    else location.assign(url.href);
    return true;
  };

  const handle = async (cmd: string, data: Record<string, unknown>): Promise<unknown> => {
    switch (cmd) {
      case "ping":
        return state();
      case "look":
        return look();
      case "scroll":
        await glide(Number(data.y) || 0, Number(data.ms) || 0);
        return state();
      case "stop":
        scrollRun++;
        hover(null);
        return state();
      case "hover": {
        const el = typeof data.link === "number" ? elements[data.link] : null;
        hover(el && el.isConnected ? el : null);
        return null;
      }
      case "click": {
        const el = typeof data.link === "number" ? elements[data.link] : null;
        return el && el.isConnected ? press(el) : false;
      }
      case "pointer": {
        // The visitor's pointer moving over the page: its hover effects, and the cursor it should show.
        const x = typeof data.x === "number" ? data.x : null;
        const y = typeof data.y === "number" ? data.y : null;
        const el = visitorAt(x, y);
        if (!el) return { cursor: "default" };
        const cursor = getComputedStyle(el).cursor;
        return { cursor: cursor === "auto" ? (el.closest("a[href], button, [role=button]") ? "pointer" : "default") : cursor };
      }
      case "clickAt": {
        // The visitor's click that took the controls, passed on to what was under it.
        const el = document.elementFromPoint(Number(data.x) || 0, Number(data.y) || 0);
        visitorAt(null, null);
        return el ? press(el) : false;
      }
      case "go":
        return go(String(data.path ?? "/"));
      case "back":
        history.back();
        return true;
      case "forward":
        history.forward();
        return true;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || !options.origins.includes(event.origin)) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data[TAG] !== VERSION || typeof data.cmd !== "string") return;
    parentOrigin = event.origin;
    const id = data.id;
    handle(data.cmd, data).then(
      (result) => post({ re: id, ok: true, data: result }),
      (error: unknown) => post({ re: id, ok: false, data: String(error) }),
    );
  };

  // The route, the first-load screen and the scroll position, reported as they change.
  const watch = window.setInterval(() => {
    if (!parentOrigin) return;
    const now = path();
    if (now !== lastPath) {
      lastPath = now;
      hover(null);
      visitorAt(null, null);
      // Give the new page a frame or two to draw before it's measured.
      requestAnimationFrame(() => requestAnimationFrame(() => post({ event: "route", ...state() })));
    }
    const isBusy = busy();
    if (wasBusy && !isBusy) post({ event: "ready", ...state() });
    wasBusy = isBusy;
    const y = Math.round(visualY());
    if (y !== lastScroll) {
      lastScroll = y;
      post({ event: "scroll", y, max: maxY() });
    }
  }, 120);

  const onLeave = () => post({ event: "leaving" });

  // scrollIntoView scrolls every scrolling box up to the top window, the framing page included: a
  // route change (Next.js scrolls the new page into view) would yank the portfolio around. While
  // framed it scrolls only this page: the nearest scrolling box, then the window.
  const nativeScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoViewHere(this: Element, arg?: boolean | ScrollIntoViewOptions) {
    const block = typeof arg === "object" ? (arg.block ?? "start") : arg === false ? "end" : "start";
    const behavior = typeof arg === "object" && arg.behavior === "smooth" ? "smooth" : "instant";
    const offset = (top: number, height: number, viewTop: number, viewHeight: number) => {
      const rel = top - viewTop;
      if (block === "center") return rel - (viewHeight - height) / 2;
      if (block === "end") return rel - (viewHeight - height);
      if (block === "nearest") return rel < 0 ? rel : rel + height > viewHeight ? rel + height - viewHeight : 0;
      return rel;
    };
    for (let box = this.parentElement; box && box !== document.body && box !== document.documentElement; box = box.parentElement) {
      if (box.scrollHeight <= box.clientHeight || !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) continue;
      const outer = box.getBoundingClientRect();
      const r = this.getBoundingClientRect();
      box.scrollBy({ top: offset(r.top, r.height, outer.top, box.clientHeight), behavior });
      break;
    }
    const r = this.getBoundingClientRect();
    const dy = offset(r.top, r.height, 0, window.innerHeight);
    if (Math.abs(dy) < 1) return;
    if (behavior === "smooth") window.scrollBy({ top: dy, behavior });
    else jump(window.scrollY + dy);
  };

  window.addEventListener("message", onMessage);
  window.addEventListener("pagehide", onLeave);
  return () => {
    Element.prototype.scrollIntoView = nativeScrollIntoView;
    window.clearInterval(watch);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("pagehide", onLeave);
    hover(null);
    if (mirror) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== mirror);
  };
}
