"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * A field's placeholder that types out each example, holds it, erases it and moves to the next, every `cycleMs`.
 * Returns `fallback` while not `active` (usually: the field has text) and for anyone who prefers reduced motion.
 * `examples` must be a stable array.
 */
export function useTypedPlaceholder(fallback: string, examples: readonly string[] | undefined, active: boolean, cycleMs: number) {
  const [hint, setHint] = useState(fallback);
  const reduceMotion = useReducedMotion();
  const animate = !!examples?.length && active && reduceMotion === false;

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
      // Typing, holding, erasing and the gap together take one cycle.
      const holdMs = cycleMs - text.length * (typeMs + eraseMs) - gapMs;
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
  }, [animate, examples, cycleMs]);

  return animate ? hint : fallback;
}
