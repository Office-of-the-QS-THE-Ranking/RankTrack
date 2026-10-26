/*
 * Rich text for post stories: a small, fixed subset of HTML that the composer writes, the server stores and the
 * site renders. Paragraphs, bulleted and numbered lists, bold, italic, underline, strikethrough, superscript,
 * subscript, links, and colour, highlight and size from fixed palettes. Anything else (pasted Word or Google Docs
 * markup, scripts, unknown tags and styles) is reduced to that subset by one parser that needs no DOM, so the
 * browser and the server clean a story the same way and nothing is ever injected as raw HTML.
 */

export const TEXT_COLORS = [
  { name: "Gray", hex: "#6e6e73" },
  { name: "Red", hex: "#d70015" },
  { name: "Orange", hex: "#c93400" },
  { name: "Gold", hex: "#a77700" },
  { name: "Green", hex: "#248a3d" },
  { name: "Teal", hex: "#0b7f8a" },
  { name: "Blue", hex: "#0060df" },
  { name: "Purple", hex: "#8944ab" },
] as const;

export const HIGHLIGHTS = [
  { name: "Yellow", hex: "#fff2a8" },
  { name: "Green", hex: "#d3f5d5" },
  { name: "Blue", hex: "#d7e9ff" },
  { name: "Pink", hex: "#ffdbe7" },
  { name: "Orange", hex: "#ffe3c7" },
  { name: "Purple", hex: "#ecdfff" },
] as const;

/** Text sizes, as multiples of the story's own size. Normal text carries no size. */
export const TEXT_SIZES = { small: "0.875em", large: "1.25em", huge: "1.625em" } as const;
export type TextSize = keyof typeof TEXT_SIZES;

/* ---------- The normalised tree ---------- */

export type Style = { color?: string; bg?: string; size?: TextSize };
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "br" }
  | { kind: "a"; href: string; kids: Inline[] }
  | { kind: "span"; style: Style; kids: Inline[] }
  | { kind: "strong" | "em" | "u" | "s" | "sup" | "sub"; kids: Inline[] };
export type List = { kind: "ul" | "ol"; items: Item[] };
/** A list item: its lines, with any nested list where it was written. */
export type Item = (Inline[] | List)[];
export type Block = { kind: "p"; kids: Inline[] } | List;

/* ---------- Reading HTML ---------- */

type Raw = { tag: string; attrs: Record<string, string>; kids: (Raw | string)[] };

const VOID = new Set(["br", "img", "hr", "input", "meta", "link", "wbr", "col", "area", "base", "embed", "source", "track", "param"]);
/** Dropped with everything inside them. */
const SKIP = new Set(["script", "style", "noscript", "template", "iframe", "object", "svg", "math", "head", "title", "textarea", "select", "button", "canvas", "video", "audio", "xml"]);
const BLOCKS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "section", "article", "header", "footer", "main", "aside", "nav", "figure", "figcaption", "address", "center", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "dl", "dt", "dd", "hr", "li", "body", "html"]);

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°" };

function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? m;
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
  });
}

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseHtml(html: string): Raw {
  const root: Raw = { tag: "#root", attrs: {}, kids: [] };
  const stack: Raw[] = [root];
  const top = () => stack[stack.length - 1];
  const TAG = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
  const lower = html.toLowerCase();
  let at = 0;
  for (let m = TAG.exec(html); m; m = TAG.exec(html)) {
    if (m.index > at) top().kids.push(decode(html.slice(at, m.index)));
    at = TAG.lastIndex;
    const [, close, open, attrText] = m;
    if (close) {
      const name = close.toLowerCase();
      const i = stack.findLastIndex((n) => n.tag === name);
      if (i > 0) stack.length = i;
    } else if (open) {
      const name = open.toLowerCase();
      if (SKIP.has(name)) {
        // Skip to the matching close tag, content and all.
        const end = lower.indexOf(`</${name}`, at);
        if (end < 0) continue;
        TAG.lastIndex = at = html.indexOf(">", end) + 1 || html.length;
        continue;
      }
      const attrs: Record<string, string> = {};
      for (const a of (attrText ?? "").matchAll(ATTR)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
      const el: Raw = { tag: name, attrs, kids: [] };
      // A new paragraph or list item ends an open one, as browsers do.
      if (name === "p" || name === "li") {
        const i = stack.findLastIndex((n) => n.tag === name || n.tag === "ul" || n.tag === "ol");
        if (i > 0 && stack[i].tag === name) stack.length = i;
      }
      top().kids.push(el);
      if (!VOID.has(name)) stack.push(el);
    }
  }
  if (at < html.length) top().kids.push(decode(html.slice(at)));
  return root;
}

/* ---------- Formats ---------- */

type Fmt = { b?: boolean; i?: boolean; u?: boolean; s?: boolean; script?: "sup" | "sub"; href?: string; color?: string; bg?: string; size?: TextSize };

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** A CSS colour as #rrggbb, or null for anything transparent or unreadable. */
export function toHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return `#${[...m[1]].map((c) => c + c).join("")}`;
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
  if (m) return v.length === 9 && v.endsWith("00") ? null : `#${m[1]}`;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}`;
  }
  return null;
}

const paletteHex = (list: readonly { hex: string }[], value: string) => {
  const h = toHex(value);
  return h && list.some((c) => c.hex === h) ? h : undefined;
};

/** Sizes from <font size>, CSS keywords and em/px values, onto the three the story allows. */
function toSize(value: string): TextSize | null | undefined {
  const v = value.trim().toLowerCase();
  if (/^[1-7]$/.test(v)) return +v <= 2 ? "small" : +v === 3 ? null : +v <= 5 ? "large" : "huge";
  const words: Record<string, TextSize | null> = { "xx-small": "small", "x-small": "small", small: "small", smaller: "small", medium: null, large: "large", larger: "large", "x-large": "large", "xx-large": "huge", "xxx-large": "huge" };
  if (v in words) return words[v];
  const m = /^([\d.]+)(em|rem|px|pt|%)$/.exec(v);
  if (!m) return undefined;
  const em = m[2] === "px" ? +m[1] / 16 : m[2] === "pt" ? +m[1] / 12 : m[2] === "%" ? +m[1] / 100 : +m[1];
  return em <= 0.85 ? "small" : em < 1.1 ? null : em < 1.45 ? "large" : "huge";
}

/** A link the story may carry: web and mail addresses only. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(h) || /[\s<>"]/.test(h) || h.length > 2000) return null;
  try {
    const u = new URL(h);
    return u.protocol === "mailto:" || u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

function styleOf(css: string, f: Fmt) {
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).replace(/!important/i, "").trim().toLowerCase();
    if (prop === "color") f.color = paletteHex(TEXT_COLORS, val);
    else if (prop === "background-color" || prop === "background") f.bg = paletteHex(HIGHLIGHTS, val.split(/\s+(?![^(]*\))/)[0]);
    else if (prop === "font-size") {
      const s = toSize(val);
      if (s !== undefined) f.size = s ?? undefined;
    } else if (prop === "font-weight") f.b = val === "bold" || val === "bolder" || +val >= 600;
    else if (prop === "font-style") f.i = val === "italic" || val === "oblique";
    else if (prop === "text-decoration" || prop === "text-decoration-line") {
      if (val.includes("none")) f.u = f.s = false;
      if (val.includes("underline")) f.u = true;
      if (val.includes("line-through")) f.s = true;
    } else if (prop === "vertical-align") f.script = val === "super" ? "sup" : val === "sub" ? "sub" : undefined;
  }
}

function formatOf(el: Raw, base: Fmt): Fmt {
  const f: Fmt = { ...base };
  switch (el.tag) {
    case "b":
    case "strong":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
    case "th":
      f.b = true;
      break;
    case "i":
    case "em":
    case "cite":
    case "dfn":
    case "var":
      f.i = true;
      break;
    case "u":
    case "ins":
      f.u = true;
      break;
    case "s":
    case "strike":
    case "del":
      f.s = true;
      break;
    case "sup":
    case "sub":
      f.script = el.tag;
      break;
    case "mark":
      f.bg = HIGHLIGHTS[0].hex;
      break;
    case "a": {
      const href = safeHref(el.attrs.href ?? "");
      if (href) f.href = href;
      break;
    }
    case "font": {
      if (el.attrs.color) f.color = paletteHex(TEXT_COLORS, el.attrs.color);
      const s = el.attrs.size ? toSize(el.attrs.size) : undefined;
      if (s !== undefined) f.size = s ?? undefined;
      break;
    }
  }
  if (el.attrs.style) styleOf(el.attrs.style, f);
  return f;
}

/* ---------- Flattening into a stream, then rebuilding ---------- */

type Ev = { k: "text"; v: string; f: Fmt } | { k: "br" } | { k: "break" } | { k: "list"; ordered: boolean } | { k: "end-list" } | { k: "item" } | { k: "end-item" };

function walk(node: Raw | string, f: Fmt, out: Ev[]) {
  if (typeof node === "string") {
    // Zero-width spaces are the editor's own stepping stones (DocEditor), never part of the story.
    const v = node.replace(/\u200b/g, "").replace(/[\t\n\r\f \u00a0]+/g, " ");
    if (v) out.push({ k: "text", v, f });
    return;
  }
  const { tag } = node;
  if (tag === "br") return void out.push({ k: "br" });
  if (VOID.has(tag)) {
    if (tag === "hr") out.push({ k: "break" });
    return;
  }
  const g = formatOf(node, f);
  if (tag === "ul" || tag === "ol") {
    out.push({ k: "list", ordered: tag === "ol" });
    let open = false;
    for (const kid of node.kids) {
      if (typeof kid === "string" && !kid.trim()) continue;
      const li = typeof kid !== "string" && kid.tag === "li";
      // A list straight inside a list (how browsers indent) belongs to the item before it.
      const nested = typeof kid !== "string" && (kid.tag === "ul" || kid.tag === "ol");
      if (!nested || !open) {
        if (open) out.push({ k: "end-item" });
        out.push({ k: "item" });
        open = true;
      }
      if (li) for (const k of kid.kids) walk(k, formatOf(kid, g), out);
      else walk(kid, g, out);
    }
    if (open) out.push({ k: "end-item" });
    out.push({ k: "end-list" });
    return;
  }
  const block = BLOCKS.has(tag);
  if (block) out.push({ k: "break" });
  for (const kid of node.kids) walk(kid, g, out);
  if (block) out.push({ k: "break" });
}

type Run = { text: string; f: Fmt } | { br: true };

/** Lines of runs into nested inline elements, sharing wrappers between neighbours that have them in common. */
const LAYERS: ((f: Fmt) => string | null)[] = [
  (f) => (f.href ? `a ${f.href}` : null),
  (f) => (f.color || f.bg || f.size ? `span ${f.color ?? ""} ${f.bg ?? ""} ${f.size ?? ""}` : null),
  (f) => (f.b ? "strong" : null),
  (f) => (f.i ? "em" : null),
  (f) => (f.u ? "u" : null),
  (f) => (f.s ? "s" : null),
  (f) => f.script ?? null,
];

function nest(runs: Run[], layer = 0): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < runs.length) {
    const r = runs[i];
    if ("br" in r) {
      out.push({ kind: "br" });
      i++;
      continue;
    }
    if (layer >= LAYERS.length) {
      const last = out[out.length - 1];
      if (last?.kind === "text") last.text += r.text;
      else out.push({ kind: "text", text: r.text });
      i++;
      continue;
    }
    const key = LAYERS[layer](r.f);
    let j = i + 1;
    while (j < runs.length && !("br" in runs[j]) && LAYERS[layer]((runs[j] as { f: Fmt }).f) === key) j++;
    const kids = nest(runs.slice(i, j), layer + 1);
    if (key === null) out.push(...kids);
    else if (layer === 0) out.push({ kind: "a", href: r.f.href!, kids });
    else if (layer === 1) out.push({ kind: "span", style: { color: r.f.color, bg: r.f.bg, size: r.f.size }, kids });
    else out.push({ kind: key as "strong", kids });
    i = j;
  }
  return out;
}

/** Trims a line's edges and drops spaces that touch a line break, as a browser would show them. */
function tidy(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if ("br" in r) {
      const last = out[out.length - 1];
      if (last && !("br" in last)) last.text = last.text.replace(/ +$/, "");
      out.push(r);
      continue;
    }
    const last = out[out.length - 1];
    let text = r.text;
    if (!last || "br" in last || last.text.endsWith(" ")) text = text.replace(/^ +/, "");
    if (text) out.push({ text, f: r.f });
  }
  // A break at the very end shows nothing.
  while (out.length && "br" in out[out.length - 1]) out.pop();
  const last = out[out.length - 1];
  if (last && !("br" in last)) last.text = last.text.replace(/ +$/, "");
  return out.filter((r) => "br" in r || r.text);
}

function build(events: Ev[]): Block[] {
  const blocks: Block[] = [];
  let para: Run[] | null = null;
  /** Open lists, innermost last, each with the item being written. */
  const lists: { list: List; item: Item | null; line: Run[] | null; gap: boolean }[] = [];
  /** A blank paragraph the person left (an empty line in the editor). */
  let blank = false;

  const closePara = () => {
    if (!para) return;
    const runs = tidy(para);
    if (runs.length) blocks.push({ kind: "p", kids: nest(runs) });
    else if (para.some((r) => "br" in r)) blank = true;
    para = null;
  };
  const pushBlank = () => {
    const last = blocks[blocks.length - 1];
    if (blank && last && !(last.kind === "p" && !last.kids.length)) blocks.push({ kind: "p", kids: [] });
    blank = false;
  };
  const closeLine = (l: (typeof lists)[number]) => {
    if (!l.line || !l.item) return;
    const runs = tidy(l.line);
    if (runs.length) l.item.push(nest(runs));
    l.line = null;
  };
  const closeItem = (l: (typeof lists)[number]) => {
    closeLine(l);
    if (l.item?.length) l.list.items.push(l.item);
    l.item = null;
  };

  for (const e of events) {
    const l = lists[lists.length - 1];
    switch (e.k) {
      case "text":
      case "br": {
        const run: Run = e.k === "br" ? { br: true } : { text: e.v, f: e.f };
        if (l) {
          if (!l.item) l.item = [];
          if (!l.line) {
            if ("br" in run) continue;
            l.line = [];
          }
          // Paragraphs inside an item become lines.
          if (l.gap && !("br" in run) && l.line.some((r) => !("br" in r))) l.line.push({ br: true });
          l.gap = false;
          l.line.push(run);
        } else {
          if (!para) {
            if (!("br" in run) && !run.text.trim()) continue;
            pushBlank();
            para = [];
          }
          para.push(run);
        }
        break;
      }
      case "break":
        if (l) l.gap = !!l.line;
        else closePara();
        break;
      case "list": {
        if (l) {
          closeLine(l);
          if (!l.item) l.item = [];
        } else {
          closePara();
          pushBlank();
        }
        lists.push({ list: { kind: e.ordered ? "ol" : "ul", items: [] }, item: null, line: null, gap: false });
        break;
      }
      case "item":
        if (l) {
          closeItem(l);
          l.item = [];
        }
        break;
      case "end-item":
        if (l) closeItem(l);
        break;
      case "end-list": {
        const done = lists.pop();
        if (!done) break;
        closeItem(done);
        if (!done.list.items.length) break;
        const outer = lists[lists.length - 1];
        if (outer) {
          if (!outer.item) outer.item = [];
          closeLine(outer);
          outer.item.push(done.list);
        } else blocks.push(done.list);
        break;
      }
    }
  }
  while (lists.length) {
    const done = lists.pop()!;
    closeItem(done);
    const outer = lists[lists.length - 1];
    if (!done.list.items.length) continue;
    if (outer) {
      if (!outer.item) outer.item = [];
      outer.item.push(done.list);
    } else blocks.push(done.list);
  }
  closePara();
  // Trailing blank lines show nothing.
  while (blocks.length && blocks[blocks.length - 1].kind === "p" && !(blocks[blocks.length - 1] as { kids: Inline[] }).kids.length) blocks.pop();
  return blocks;
}

/* ---------- Public helpers ---------- */

/** A story written in the editor; anything else is a plain-text story from before it. */
export const isRich = (body: string) => /^\s*<(p|ul|ol)[\s>]/i.test(body);

/** Any HTML as the story's normalised tree. */
export function parseRich(html: string): Block[] {
  const events: Ev[] = [];
  walk(parseHtml(html), {}, events);
  return build(events);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

export function styleCss(s: Style) {
  return [s.color && `color: ${s.color}`, s.bg && `background-color: ${s.bg}`, s.size && `font-size: ${TEXT_SIZES[s.size]}`].filter(Boolean).join("; ");
}

function inlineHtml(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.kind) {
        case "text":
          return esc(n.text);
        case "br":
          return "<br>";
        case "a":
          return `<a href="${escAttr(n.href)}">${inlineHtml(n.kids)}</a>`;
        case "span":
          return `<span style="${styleCss(n.style)}">${inlineHtml(n.kids)}</span>`;
        default:
          return `<${n.kind}>${inlineHtml(n.kids)}</${n.kind}>`;
      }
    })
    .join("");
}

const listHtml = (l: List): string => `<${l.kind}>${l.items.map((it) => `<li>${it.map((part) => (Array.isArray(part) ? inlineHtml(part) : listHtml(part))).join("")}</li>`).join("")}</${l.kind}>`;

export function serializeRich(blocks: Block[]) {
  return blocks.map((b) => (b.kind === "p" ? `<p>${b.kids.length ? inlineHtml(b.kids) : "<br>"}</p>` : listHtml(b))).join("");
}

/** Any HTML as the story's clean HTML; "" when nothing is written. */
export const cleanRich = (html: string) => serializeRich(parseRich(html));

function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.kind === "text" ? n.text : n.kind === "br" ? "\n" : inlineText(n.kids))).join("");
}

function listText(l: List, depth = 0): string {
  return l.items
    .map((it, i) => {
      const mark = `${"  ".repeat(depth)}${l.kind === "ol" ? `${i + 1}.` : "•"} `;
      return it.map((part, j) => (Array.isArray(part) ? (j === 0 ? mark : "  ".repeat(depth + 1)) + inlineText(part) : listText(part, depth + 1))).join("\n");
    })
    .join("\n");
}

/** The story as plain text, paragraphs apart: for excerpts, search and counting words. Plain stories pass through. */
export function plainText(body: string) {
  if (!isRich(body)) return body;
  return parseRich(body)
    .map((b) => (b.kind === "p" ? inlineText(b.kids) : listText(b)))
    .filter((t) => t.trim())
    .join("\n\n");
}

const URL_IN_TEXT = /(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)'"])/g;

/** A plain-text story as editor HTML: paragraphs kept, line breaks kept, web addresses made into links. */
export function toRich(body: string) {
  if (isRich(body)) return cleanRich(body);
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split("\n").map((line) => line.split(URL_IN_TEXT).map((part, i) => (i % 2 && safeHref(part) ? `<a href="${escAttr(safeHref(part)!)}">${esc(part)}</a>` : esc(part))).join("")).join("<br>")}</p>`)
    .join("");
}
