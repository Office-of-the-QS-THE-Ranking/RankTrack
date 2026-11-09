"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { SearchIcon, type SearchIconHandle } from "@/components/animate-ui/icons/search";
import { useTypedPlaceholder } from "./use-typed-placeholder";

const PLACEHOLDER_CYCLE_MS = 6000;

export function SearchField({ value, onChange, placeholder, label, examples, shortcuts = false }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; examples?: readonly string[]; shortcuts?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchIconRef = useRef<SearchIconHandle>(null);
  const guideId = useId();
  const [focused, setFocused] = useState(false);
  const reduceMotion = useReducedMotion();
  const hint = useTypedPlaceholder(placeholder, examples, !value, PLACEHOLDER_CYCLE_MS);

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

  return (
    <label className="adm-search">
      <SearchIcon ref={searchIconRef} size={16} className="adm-search__icon" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={hint}
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

