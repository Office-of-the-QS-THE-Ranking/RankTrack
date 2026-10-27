"use client";

/*
 * The post's document: one page holding the title, the subtitle (passed in as `lead`) and the story, under a
 * ribbon for size, bold, italic, underline, strikethrough, colour, highlight, superscript, subscript, lists and
 * links. The ribbon formats the story only; titles stay plain text and it rests while one of them has focus. The browser's editing commands do the work; what leaves the editor is always the story's clean
 * HTML (lib/rich-text.ts), so pasted Word or Google Docs markup arrives tidied to what the story allows.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { HIGHLIGHTS, TEXT_COLORS, cleanRich, parseRich, plainText, safeHref, serializeRich, toHex, type TextSize } from "@/lib/rich-text";
import { inkOn } from "@/lib/data";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Select, usePopover } from "@/components/ui/pickers";

type Size = TextSize | "normal";

type Marks = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sup: boolean;
  sub: boolean;
  ul: boolean;
  ol: boolean;
  link: string | null;
  size: Size;
  color: string | null;
  bg: string | null;
};

const NONE: Marks = { bold: false, italic: false, underline: false, strike: false, sup: false, sub: false, ul: false, ol: false, link: null, size: "normal", color: null, bg: null };

/** The legacy sizes the browser's fontSize command takes; the page's CSS draws them at the story's sizes. */
const FONT_SIZE: Record<Size, string> = { small: "2", normal: "3", large: "5", huge: "6" };

const keepSelection = (e: MouseEvent) => e.preventDefault();

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** What someone typed as a link: a web address with or without https://, or an email address. */
function linkFrom(text: string) {
  const t = text.trim();
  if (!t) return null;
  if (/^[^\s@/:]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return safeHref(`mailto:${t}`);
  return safeHref(/^[a-z][a-z\d+.-]*:/i.test(t) ? t : `https://${t}`);
}

const query = (cmd: string) => {
  try {
    return document.queryCommandState(cmd);
  } catch {
    return false;
  }
};

export function DocEditor({
  id,
  html,
  placeholder,
  label = "Post",
  contentLabel = "The story",
  lead,
  after,
  pageRef,
  inert,
  onChange,
  onPhotos,
}: {
  id: string;
  /** The story when the editor opens; read once. */
  html: string;
  placeholder: string;
  /** What the editor and its writing area are called to assistive technology. */
  label?: string;
  contentLabel?: string;
  /** Fields above the story on the same page: the title and subtitle. */
  lead?: ReactNode;
  /** Placed right after the story's editable area, e.g. its hidden validation field. */
  after?: ReactNode;
  /** The story's editable area, for the composer to focus and validate. */
  pageRef?: RefObject<HTMLDivElement | null>;
  inert?: boolean;
  onChange: (html: string) => void;
  onPhotos: (files: File[]) => void;
}) {
  const own = useRef<HTMLDivElement>(null);
  const page = pageRef ?? own;
  /** Whether the story, rather than the title or subtitle, was the last place written in. */
  const [active, setActive] = useState(false);
  const saved = useRef<Range | null>(null);
  const [initial] = useState(html);
  const [marks, setMarks] = useState<Marks>(NONE);
  const [text, setText] = useState(() => plainText(html));
  const [open, setOpen] = useState<null | "color" | "highlight" | "link">(null);
  const [mac, setMac] = useState(true);

  /* ---------- The page and its selection ---------- */

  useLayoutEffect(() => {
    const el = page.current;
    if (!el) return;
    // The story's own clean HTML: nothing else is ever written into the page.
    el.innerHTML = initial || "<p><br></p>";
    // Where the ribbon writes until the person clicks into the story: its end.
    const r = document.createRange();
    r.selectNodeContents(el.lastElementChild ?? el);
    r.collapse(false);
    saved.current = r;
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, [initial, page]);

  /** Where the selection sits, as the element holding its start: the live selection while typing, else the last one. */
  const anchorEl = () => {
    const sel = window.getSelection();
    const live = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const n = (live && page.current?.contains(live.commonAncestorContainer) ? live : saved.current)?.startContainer;
    const el = n instanceof Element ? n : n?.parentElement;
    return el && page.current?.contains(el) ? el : null;
  };

  const read = () => {
    const el = page.current;
    const at = anchorEl();
    if (!el || !at) return;
    const base = parseFloat(getComputedStyle(el).fontSize) || 16;
    const cs = getComputedStyle(at);
    const ratio = parseFloat(cs.fontSize) / base;
    let bg: string | null = null;
    for (let n: Element | null = at; n && n !== el; n = n.parentElement) {
      bg = toHex(getComputedStyle(n).backgroundColor);
      if (bg) break;
    }
    const color = toHex(cs.color);
    setMarks({
      bold: query("bold"),
      italic: query("italic"),
      underline: query("underline"),
      strike: query("strikeThrough"),
      sup: query("superscript"),
      sub: query("subscript"),
      ul: query("insertUnorderedList"),
      ol: query("insertOrderedList"),
      link: at.closest("a")?.getAttribute("href") ?? null,
      size: ratio <= 0.9 ? "small" : ratio < 1.1 ? "normal" : ratio < 1.45 ? "large" : "huge",
      color: TEXT_COLORS.some((c) => c.hex === color) ? color : null,
      bg: HIGHLIGHTS.some((c) => c.hex === bg) ? bg : null,
    });
  };

  useEffect(() => {
    const onSelection = () => {
      const sel = window.getSelection();
      const el = page.current;
      if (!sel?.rangeCount || !el) return;
      const r = sel.getRangeAt(0);
      if (!el.contains(r.commonAncestorContainer)) return;
      saved.current = r.cloneRange();
      read();
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  /** Back to the page with the selection it had, after a toolbar control took focus. */
  const restore = () => {
    const el = page.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    // Still on the page: the live cursor is newer than any saved one.
    const live = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (document.activeElement === el && live && el.contains(live.commonAncestorContainer)) return;
    el.focus({ preventScroll: true });
    if (saved.current) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
  };

  /**
   * Chrome starts a list inside the paragraph it was made from, which later edits tangle further. Lift such lists
   * out, so the page stays a run of paragraphs and lists, and put the cursor back where it was.
   */
  const liftLists = (el: HTMLElement) => {
    const stuck = el.querySelectorAll(":scope p > ul, :scope p > ol");
    if (!stuck.length) return;
    const sel = window.getSelection();
    const r = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const at = r && { a: r.startContainer, ao: r.startOffset, b: r.endContainer, bo: r.endOffset };
    for (const list of stuck) {
      const p = list.parentElement!;
      const rest = [...list.parentNode!.childNodes].slice([...p.childNodes].indexOf(list) + 1);
      p.after(list);
      let last: ChildNode = list;
      let line: HTMLParagraphElement | null = null;
      for (const n of rest) {
        if (n instanceof Element && /^(P|DIV|UL|OL)$/.test(n.tagName)) {
          last.after(n);
          last = n;
          line = null;
        } else {
          if (!line) {
            line = document.createElement("p");
            last.after(line);
            last = line;
          }
          line.append(n);
        }
      }
      for (const q of [p, line]) if (q && !q.textContent?.trim() && !q.querySelector("ul, ol")) q.remove();
    }
    if (sel && at?.a.isConnected && at.b.isConnected && el.contains(at.a)) {
      try {
        sel.setBaseAndExtent(at.a, at.ao, at.b, at.bo);
      } catch {
        // The old offsets no longer fit; the browser keeps its own cursor.
      }
    }
  };

  const emit = () => {
    const el = page.current;
    if (!el) return;
    liftLists(el);
    // An emptied page keeps a paragraph, so the next line typed is one.
    if (!el.firstElementChild && !el.textContent) {
      el.innerHTML = "<p><br></p>";
      const r = document.createRange();
      r.setStart(el.firstChild!, 0);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
    }
    const clean = cleanRich(el.innerHTML);
    setText(plainText(clean));
    onChange(clean);
  };

  const exec = (cmd: string, value?: string, css = false) => {
    restore();
    document.execCommand("styleWithCSS", false, String(css));
    document.execCommand(cmd, false, value);
    document.execCommand("styleWithCSS", false, "false");
    emit();
    read();
  };

  /**
   * Superscript and subscript at the cursor. Turning one off there steps out of the raised or lowered text;
   * the browser's own toggle would carry its size into what is typed next.
   */
  const script = (cmd: "superscript" | "subscript") => {
    restore();
    const sel = window.getSelection();
    const inside = anchorEl()?.closest(cmd === "superscript" ? "sup" : "sub");
    if (!sel?.isCollapsed || !inside) return exec(cmd);
    const gap = document.createTextNode("\u200b");
    inside.after(gap);
    const r = document.createRange();
    r.setStart(gap, 1);
    sel.removeAllRanges();
    sel.addRange(r);
    saved.current = r.cloneRange();
    read();
  };

  /* ---------- Links ---------- */

  const linkAt = () => anchorEl()?.closest("a") ?? null;

  /** The whole link under a collapsed cursor, so editing or removing it covers all of it. */
  const selectLink = (a: HTMLAnchorElement) => {
    const r = document.createRange();
    r.selectNodeContents(a);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    saved.current = r.cloneRange();
  };

  const setLink = (href: string) => {
    restore();
    const a = linkAt();
    const sel = window.getSelection();
    if (a && sel?.isCollapsed) selectLink(a);
    if (window.getSelection()?.isCollapsed) {
      const label = href.replace(/^mailto:/, "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      document.execCommand("insertHTML", false, `<a href="${esc(href)}">${esc(label)}</a>&nbsp;`);
      emit();
      read();
    } else exec("createLink", href);
  };

  const removeLink = () => {
    restore();
    const a = linkAt();
    if (a && window.getSelection()?.isCollapsed) selectLink(a);
    exec("unlink");
  };

  /* ---------- Typing, pasting and dropping ---------- */

  const inList = () => !!anchorEl()?.closest("li");

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const run = (fn: () => void) => {
      e.preventDefault();
      fn();
    };
    if (mod && !e.altKey && !e.shiftKey && key === "k") run(() => setOpen("link"));
    else if (mod && e.shiftKey && e.code === "Digit7") run(() => exec("insertOrderedList"));
    else if (mod && e.shiftKey && e.code === "Digit8") run(() => exec("insertUnorderedList"));
    else if (mod && e.shiftKey && e.code === "KeyX") run(() => exec("strikeThrough"));
    else if (mod && !e.shiftKey && e.key === ".") run(() => script("superscript"));
    else if (mod && !e.shiftKey && e.key === ",") run(() => script("subscript"));
    // Tab nests list items; outside a list it moves on, as it does everywhere else.
    else if (e.key === "Tab" && !mod && !e.altKey && inList()) run(() => exec(e.shiftKey ? "outdent" : "indent"));
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      onPhotos(files);
      return;
    }
    const pasted = e.clipboardData.getData("text/html");
    if (!pasted) return; // plain text pastes as typed text
    e.preventDefault();
    const blocks = parseRich(pasted);
    // One paragraph joins the line it lands in; more keep their own paragraphs.
    const out = blocks.length === 1 && blocks[0].kind === "p" ? serializeRich(blocks).replace(/^<p>|<\/p>$/g, "") : serializeRich(blocks);
    if (out) document.execCommand("insertHTML", false, out);
    emit();
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    onPhotos(files);
  };

  /* ---------- Toolbar ---------- */

  const onFocusIn = (e: FocusEvent<HTMLElement>) => {
    const t = e.target as Element;
    if (t === page.current) {
      document.execCommand("defaultParagraphSeparator", false, "p");
      setActive(true);
    } else if (t.closest(".pc-doc__lead")) setActive(false);
  };

  const k = (keys: string) => (mac ? keys.replace("Mod+", "⌘").replace("Shift+", "⇧") : keys.replace("Mod+", "Ctrl+"));

  const tool = (icon: IconName, label: string, on: boolean, act: () => void, keys?: string) => (
    <button
      type="button"
      className="pc-doc__btn"
      aria-label={label}
      aria-pressed={on}
      aria-keyshortcuts={keys?.replace("Mod", mac ? "Meta" : "Control")}
      data-tip={keys ? `${label}  ${k(keys)}` : label}
      disabled={!active}
      onMouseDown={keepSelection}
      onClick={act}
    >
      <Icon name={icon} size={18} strokeWidth={icon === "bold" ? 2.2 : 1.8} />
    </button>
  );

  return (
    <section className="pc-doc pc-doc--document" aria-label={label} inert={inert} onFocus={onFocusIn}>
      <div className="pc-doc__canvas">
        {/* The ribbon and the page share one column, so their edges line up. */}
        <div className="pc-doc__sheet">
          <div className="pc-doc__toolbar" role="toolbar" aria-label={`${contentLabel} formatting`} aria-controls={`${id}-page`} data-idle={active ? undefined : ""}>
            <span className="pc-doc__group">
              {tool("undo", "Undo", false, () => exec("undo"), "Mod+Z")}
              {tool("redo", "Redo", false, () => exec("redo"), "Mod+Shift+Z")}
            </span>
            <span className="pc-doc__group">
              <Select className="select select--sm pc-doc__size" value={marks.size} aria-label="Text size" disabled={!active} onChange={(v) => exec("fontSize", FONT_SIZE[v as Size])}>
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
                <option value="huge">Huge</option>
              </Select>
            </span>
            <span className="pc-doc__group">
              {tool("bold", "Bold", marks.bold, () => exec("bold"), "Mod+B")}
              {tool("italic", "Italic", marks.italic, () => exec("italic"), "Mod+I")}
              {tool("underline", "Underline", marks.underline, () => exec("underline"), "Mod+U")}
              {tool("strikethrough", "Strikethrough", marks.strike, () => exec("strikeThrough"), "Mod+Shift+X")}
            </span>
            <span className="pc-doc__group">
              <ColorTool
                icon="text-color"
                label="Text colour"
                none="Default"
                colors={TEXT_COLORS}
                value={marks.color}
                disabled={!active}
                open={open === "color"}
                setOpen={(v) => setOpen(v ? "color" : null)}
                onPick={(hex) => exec("foreColor", hex ?? getComputedStyle(page.current!).color, true)}
              />
              <ColorTool
                icon="highlighter"
                label="Highlight"
                none="None"
                colors={HIGHLIGHTS}
                value={marks.bg}
                disabled={!active}
                open={open === "highlight"}
                setOpen={(v) => setOpen(v ? "highlight" : null)}
                onPick={(hex) => exec("hiliteColor", hex ?? "transparent", true)}
              />
            </span>
            <span className="pc-doc__group">
              {tool("superscript", "Superscript", marks.sup, () => script("superscript"), "Mod+.")}
              {tool("subscript", "Subscript", marks.sub, () => script("subscript"), "Mod+,")}
            </span>
            <span className="pc-doc__group">
              {tool("list", "Bulleted list", marks.ul, () => exec("insertUnorderedList"), "Mod+Shift+8")}
              {tool("list-ordered", "Numbered list", marks.ol, () => exec("insertOrderedList"), "Mod+Shift+7")}
            </span>
            <span className="pc-doc__group">
              <LinkTool
                href={marks.link}
                disabled={!active}
                open={open === "link"}
                setOpen={(v) => setOpen(v ? "link" : null)}
                label={`Link  ${k("Mod+K")}`}
                onApply={setLink}
                onRemove={removeLink}
                onBack={restore}
              />
              {tool("clear-format", "Clear formatting", false, () => exec("removeFormat"))}
            </span>
          </div>

          <div className="pc-doc__page">
            {lead && <div className="pc-doc__lead">{lead}</div>}
            <div
              ref={page}
              id={`${id}-page`}
              className="pc-doc__content rt"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={contentLabel}
              aria-placeholder={placeholder}
              data-placeholder={placeholder}
              data-empty={text.trim() || marks.ul || marks.ol ? undefined : ""}
              data-multiline=""
              spellCheck
              onInput={emit}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
            {after}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Escape closes the popover and goes back to the trigger, not out of the composer. */
const closeOnEscape = (close: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  close();
};

function ColorTool({
  icon,
  label,
  none,
  colors,
  value,
  disabled,
  open,
  setOpen,
  onPick,
}: {
  icon: IconName;
  label: string;
  none: string;
  colors: readonly { name: string; hex: string }[];
  value: string | null;
  disabled?: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  onPick: (hex: string | null) => void;
}) {
  const { anchor, pop } = usePopover(open, () => setOpen(false), false);
  const pick = (hex: string | null) => {
    setOpen(false);
    onPick(hex);
  };
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="pc-doc__btn pc-doc__btn--color"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tip={open ? undefined : label}
        disabled={disabled}
        onMouseDown={keepSelection}
        onClick={() => setOpen(!open)}
      >
        <Icon name={icon} size={18} />
        <span className="pc-doc__bar" data-none={value ? undefined : none.toLowerCase()} style={value ? { background: value } : undefined} />
      </button>
      {open && (
        <div ref={pop} popover="manual" className="pick pc-doc__pop" role="dialog" aria-label={label} onMouseDown={keepSelection} onKeyDown={closeOnEscape(() => {
          setOpen(false);
          anchor.current?.focus();
        })}>
          <button type="button" className="pc-doc__none" aria-pressed={!value} onClick={() => pick(null)} autoFocus>
            <span className="pc-doc__swatch pc-doc__swatch--none" data-kind={none.toLowerCase()} aria-hidden="true" />
            {none}
          </button>
          <div className="pc-doc__swatches">
            {colors.map((c) => (
              <button key={c.hex} type="button" className="pc-doc__swatch" style={{ background: c.hex, color: inkOn(c.hex) }} aria-label={c.name} aria-pressed={value === c.hex} onClick={() => pick(c.hex)}>
                <Icon name="check" size={13} strokeWidth={2.6} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function LinkTool({
  href,
  disabled,
  open,
  setOpen,
  label,
  onApply,
  onRemove,
  onBack,
}: {
  href: string | null;
  disabled?: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  label: string;
  onApply: (href: string) => void;
  onRemove: () => void;
  onBack: () => void;
}) {
  const { anchor, pop } = usePopover(open, () => setOpen(false), false);
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(href ? href.replace(/^mailto:/, "") : "");
    requestAnimationFrame(() => input.current?.focus());
  }, [open, href]);

  const apply = () => {
    const el = input.current;
    if (!el) return;
    const link = linkFrom(draft);
    if (!link) {
      el.setCustomValidity(draft.trim() ? "Enter a web address, like ust.edu.ph, or an email address." : "Enter a web address or an email address.");
      el.reportValidity();
      return;
    }
    setOpen(false);
    onApply(link);
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="pc-doc__btn"
        aria-label="Link"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-pressed={!!href}
        data-tip={open ? undefined : label}
        disabled={disabled}
        onMouseDown={keepSelection}
        onClick={() => setOpen(!open)}
      >
        <Icon name="link" size={18} />
      </button>
      {open && (
        <div
          ref={pop}
          popover="manual"
          className="pick pc-doc__pop pc-doc__linkpop"
          role="dialog"
          aria-label={href ? "Edit link" : "Add a link"}
          onKeyDown={closeOnEscape(() => {
            setOpen(false);
            onBack();
          })}
        >
          <label className="input-group pc-doc__linkfield">
            <Icon name="link" size={15} />
            <span className="sr-only">Link address</span>
            <input
              ref={input}
              className="input input--sm"
              value={draft}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste or type a link"
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.setCustomValidity("");
              }}
              onKeyDown={(e) => {
                // Enter adds the link instead of submitting the post.
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                apply();
              }}
            />
          </label>
          <span className="pc-doc__linkactions">
            {href && (
              <button
                type="button"
                className="btn btn--sm pc-doc__unlink"
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              >
                <Icon name="unlink" size={15} /> Remove
              </button>
            )}
            <button type="button" className="btn btn--sm btn--dark" onClick={apply}>
              {href ? "Update" : "Add link"}
            </button>
          </span>
        </div>
      )}
    </>
  );
}
