"use client";

import { useEffect, useState } from "react";

/**
 * The page's own tabs: a row of its sections that stays under the header. The section in view is
 * marked with the gold dot, as in the header; on phones the row is left out and the page simply flows.
 */
export function PageTabs({ items, label }: { items: { id: string; label: string }[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const sections = items.map((i) => document.getElementById(i.id)).filter((s): s is HTMLElement => !!s);
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => seen.get(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-160px 0px -55% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav className="w-ptabs" aria-label={label}>
      <ul className="w-ptabs__list w-wrap">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className={`w-ptab${active === i.id ? " is-on" : ""}`} aria-current={active === i.id ? "location" : undefined}>
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
