"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { SearchIcon, type SearchIconHandle } from "@/components/animate-ui/icons/search";

const PLACEHOLDER_CYCLE_MS = 6000;

export function SearchField({ value, onChange, placeholder, label, examples, shortcuts = false }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; examples?: readonly string[]; shortcuts?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchIconRef = useRef<SearchIconHandle>(null);
  const guideId = useId();
  const [focused, setFocused] = useState(false);
  const [hint, setHint] = useState(placeholder);
  const reduceMotion = useReducedMotion();
  const animate = !!examples?.length && !value && reduceMotion === false;

  useEffect(() => {
    const icon = searchIconRef.current;
    if (!focused || reduceMotion !== false) {
      icon?.stopAnimation();
      return;
    }
    icon?.startAnimation();
    const timer = setInterval(() => icon?.startAnimation(), 4000);
    return () => {
      clearInterval(timer);
      icon?.stopAnimation();
    };
  }, [focused, reduceMotion]);

  useEffect(() => {
    if (!shortcuts) return;
    const focusSearch = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [role='textbox'], [contenteditable='true']"))) return;
      if (document.querySelector("dialog[open], [aria-modal='true']")) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [shortcuts]);

  useEffect(() => {
    if (!animate || !examples?.length) return;
    const hints = examples.filter((example) => example.length > 0);
    if (!hints.length) return;
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const beginCycle = () => {
      const text = hints[index];
      let length = 0;
      const typeMs = Math.min(85, 1200 / text.length);
      const eraseMs = Math.min(45, 600 / text.length);
      const gapMs = 350;
      // Typing, holding, erasing and the gap together take six seconds.
      const holdMs = PLACEHOLDER_CYCLE_MS - text.length * (typeMs + eraseMs) - gapMs;
      setHint("");
      const erase = () => {
        setHint(text.slice(0, --length));
        if (length > 0) timer = setTimeout(erase, eraseMs);
        else {
          index = (index + 1) % hints.length;
          timer = setTimeout(beginCycle, gapMs);
        }
      };
      const type = () => {
        setHint(text.slice(0, ++length));
        timer = length < text.length ? setTimeout(type, typeMs) : setTimeout(erase, holdMs + eraseMs);
      };
      timer = setTimeout(type, typeMs);
    };
    beginCycle();
    return () => clearTimeout(timer);
  }, [animate, examples]);

  return (
    <label className="adm-search">
      <SearchIcon ref={searchIconRef} size={16} className="adm-search__icon" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={animate ? hint : placeholder}
        aria-keyshortcuts={shortcuts ? "/" : undefined}
        aria-describedby={shortcuts ? guideId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(event) => {
          if (!shortcuts || event.key !== "Escape" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          if (value) onChange("");
          else event.currentTarget.blur();
        }}
      />
      {shortcuts && (
        <>
          <kbd className="adm-search__shortcut" aria-hidden="true">{focused ? "Esc" : "/"}</kbd>
          <span className="sr-only" id={guideId}>Press / to focus search. Press Escape to clear your search, or leave the empty field.</span>
        </>
      )}
    </label>
  );
}

