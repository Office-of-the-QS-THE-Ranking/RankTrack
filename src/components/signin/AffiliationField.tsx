"use client";

import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { listedAffiliation, suggestAffiliations, requestText } from "@/lib/governance/access-requests";
import { Icon } from "@/components/ui/Icon";

/** The part of a suggestion the answer matched, in gold. */
function marked(text: string, answer: string): ReactNode {
  const q = answer.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/**
 * The request form's affiliation (signin.css, "the affiliation"): a field to type in, with the listed
 * affiliations suggested below it as the requester types. It follows the ARIA combobox pattern: the arrows move
 * through the suggestions, Enter takes the one marked, Escape closes the list; nothing is marked until the
 * arrows are used, so Enter keeps what was typed. An answer that matches none stays as typed and is filed under
 * Others, which the list's last row and, once the list closes, a tag on the field say. A listed answer is
 * highlighted in the list; the field's X clears either kind of answer. The list opens upward near the screen's foot.
 */
export function AffiliationField({ value, onChange, onFocusChange, required }: { value: string; onChange: (v: string) => void; onFocusChange?: (focused: boolean) => void; required?: boolean }) {
  const id = useId();
  const listId = `${id}-list`;
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const replaceSelection = useRef(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const typed = value.trim();
  const listed = listedAffiliation(value);
  const suggestions = useMemo(() => suggestAffiliations(value), [value]);
  // what the list offers: the suggestions, and the answer itself when it isn't one of them
  const rows = useMemo(() => [...suggestions.map((s) => ({ value: s, others: false })), ...(typed && !listed ? [{ value: typed, others: true }] : [])], [suggestions, typed, listed]);

  const show = () => {
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const take = (v: string) => {
    onChange(requestText(v, true));
    replaceSelection.current = !!listedAffiliation(v);
    close();
  };
  const selectForReplacement = () => {
    if (replaceSelection.current) field.current?.select();
  };

  // Use the top layer so the sidebar's stacking contexts cannot put the footer over the list.
  useLayoutEffect(() => {
    const input = field.current;
    const menu = list.current;
    if (!open || !input || !menu) return;
    menu.showPopover();
    const place = () => {
      const box = input.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? document.documentElement.clientWidth;
      const left = viewport?.offsetLeft ?? 0;
      const footer = input.closest(".signin__card")?.querySelector(".signin__foot")?.getBoundingClientRect();
      const bottom = Math.min(top + height - 8, footer && footer.top >= box.bottom ? footer.top - 8 : Infinity);
      const below = Math.max(0, bottom - box.bottom - 6);
      const above = Math.max(0, box.top - top - 14);
      menu.style.width = `${Math.min(box.width, width - 16)}px`;
      const up = Math.min(248, menu.scrollHeight) > below && above > below;
      menu.style.maxHeight = `${Math.min(248, up ? above : below)}px`;
      menu.style.left = `${Math.max(left + 8, Math.min(box.left, left + width - menu.offsetWidth - 8))}px`;
      menu.style.top = `${up ? box.top - 6 - menu.offsetHeight : box.bottom + 6}px`;
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menu.contains(event.target)) return;
      place();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target) && event.target !== input) close();
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", onPointerDown);
      if (menu.matches(":popover-open")) menu.hidePopover();
    };
  }, [open, rows.length]);

  // Scroll only the options, keeping the page and input in place during keyboard navigation.
  useEffect(() => {
    const menu = list.current;
    const option = active >= 0 ? menu?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-${active}`)}`) : null;
    if (!menu || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < menu.scrollTop) menu.scrollTop = top;
    else if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
  }, [active, id]);

  return (
    <div className="field si__combo">
      <label className="field__label" htmlFor={id}>
        Institution Affiliation
      </label>
      <div className="si__combo-box">
        <input
          ref={field}
          id={id}
          name="affiliation"
          title=""
          className={`input${!open && typed && !listed ? " has-tag" : ""}`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
          autoComplete="organization"
          placeholder="START TYPING, E.G. QS OR PAASCU"
          value={value}
          required={required}
          onChange={(e) => {
            replaceSelection.current = false;
            onChange(requestText(e.target.value, true));
            setActive(-1);
            if (!open) show();
          }}
          onFocus={() => {
            onFocusChange?.(true);
            replaceSelection.current = !!listed;
            show();
          }}
          onClick={() => {
            if (listed) replaceSelection.current = true;
            show();
          }}
          onBeforeInput={selectForReplacement}
          onPaste={selectForReplacement}
          onCompositionStart={selectForReplacement}
          onBlur={() => {
            close();
            onFocusChange?.(false);
          }}
          onKeyDown={(e) => {
            // Replace a confirmed choice on the first edit; keep navigation keys unchanged.
            if (e.key === "Backspace" || e.key === "Delete" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) {
              selectForReplacement();
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) return show();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (rows.length ? (i + step + rows.length) % rows.length : -1));
            } else if (e.key === "Enter" && open) {
              // take the marked suggestion, or keep what was typed; either way the form isn't sent yet
              e.preventDefault();
              if (active >= 0 && rows[active]) take(rows[active].value);
              else close();
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              close();
            }
          }}
        />
        {!open && typed && !listed && <span className="si__combo-tag">Others</span>}
        {typed && (
          <button
            type="button"
            className="si__combo-clear"
            aria-label="Clear affiliation"
            title="Clear affiliation"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              field.current?.focus();
              replaceSelection.current = false;
              setActive(-1);
              show();
            }}
          >
            <Icon name="close" size={15} />
          </button>
        )}
        {open && rows.length > 0 && (
          <ul ref={list} id={listId} role="listbox" popover="manual" aria-label="Affiliations" className="si__combo-list">
            {rows.map((r, i) => (
              <li
                key={r.others ? "others" : r.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`si__combo-option${r.others ? " si__combo-option--others" : ""}${r.value === listed ? " is-selected" : ""}`}
                // keep the focus in the field, so choosing doesn't close the list first
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => take(r.value)}
              >
                {r.others ? (
                  <>
                    <span>
                      Use “<b>{r.value}</b>”
                    </span>
                    <span className="si__combo-tag">Others</span>
                  </>
                ) : (
                  <>
                    <span>{marked(r.value, value)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
