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

  const pointer = (el: HTMLElement, type: string, bubbles: boolean) => {
    const r = el.getBoundingClientRect();
    const init = { bubbles, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window };
    el.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, { ...init, pointerType: "mouse" }) : new MouseEvent(type, init));
  };

  const hover = (el: HTMLElement | null) => {
    if (hovered === el) return;
    if (hovered) {
      for (const type of ["pointerout", "mouseout"]) pointer(hovered, type, true);
      for (const type of ["pointerleave", "mouseleave"]) pointer(hovered, type, false);
      delete hovered.dataset.autopilotHover;
    }
    hovered = el;
    if (el) {
      el.dataset.autopilotHover = "";
      for (const type of ["pointerover", "mouseover"]) pointer(el, type, true);
      for (const type of ["pointerenter", "mouseenter"]) pointer(el, type, false);
    }
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
        if (!el || !el.isConnected) return false;
        const url = new URL((el as HTMLAnchorElement).href, location.href);
        if (url.origin !== location.origin || !allow(url.pathname)) return false;
        hover(null);
        // A link the site's router doesn't handle itself (a plain <a>) would load a whole new page in the
        // frame; with `navigate`, it opens in place instead. Listening on window, last, sees what the
        // site's own handlers did first.
        const inPlace = (event: MouseEvent) => {
          window.removeEventListener("click", inPlace);
          if (event.defaultPrevented || !options.navigate) return;
          event.preventDefault();
          options.navigate(url.pathname + url.search + url.hash);
        };
        window.addEventListener("click", inPlace);
        el.click();
        window.removeEventListener("click", inPlace);
        return true;
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
  };
}
