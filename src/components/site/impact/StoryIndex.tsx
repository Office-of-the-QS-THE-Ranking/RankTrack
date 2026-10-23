"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { IMPACT_THEMES, SDG_COLORS, SDG_NAMES, inkOn, type ImpactTheme, type Story } from "@/lib/data";

type Theme = "All" | ImpactTheme;

/**
 * The published stories as an index: one row per practice, filtered by theme with tabs. On a desktop
 * the row under the pointer shows its picture in the gold-ringed circle beside the list.
 */
export function StoryIndex({ stories: PUBLISHED_STORIES }: { stories: Story[] }) {
  const [theme, setTheme] = useState<Theme>("All");
  const [shownSlug, setShownSlug] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const options = useMemo(
    () =>
      [{ value: "All" as Theme, label: "All stories", count: PUBLISHED_STORIES.length }].concat(
        IMPACT_THEMES.map((t) => ({ value: t as Theme, label: t, count: PUBLISHED_STORIES.filter((s) => s.themes.includes(t)).length })).filter(
          (o) => o.count > 0,
        ),
      ),
    [PUBLISHED_STORIES],
  );
  const shown = theme === "All" ? PUBLISHED_STORIES : PUBLISHED_STORIES.filter((s) => s.themes.includes(theme));
  const current = shown.find((s) => s.slug === shownSlug) ?? shown[0];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + options.length) % options.length;
    setTheme(options[n].value);
    tabRefs.current[n]?.focus();
  };

  return (
    <div className="w-stories">
      <div className="w-themes" role="tablist" aria-label="Themes" data-reveal>
        {options.map((o, i) => (
          <button
            key={o.value}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`theme-${i}`}
            aria-selected={theme === o.value}
            aria-controls="story-panel"
            tabIndex={theme === o.value ? 0 : -1}
            className="w-theme"
            onClick={() => setTheme(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.label} <span className="w-theme__n">{o.count}</span>
          </button>
        ))}
      </div>

      <div className="w-index" id="story-panel" role="tabpanel" aria-labelledby={`theme-${options.findIndex((o) => o.value === theme)}`}>
        <ul className="w-index__list">
          {shown.map((s, i) => (
            <li key={s.slug} data-reveal style={{ ["--d" as string]: `${Math.min(i, 3) * 70}ms` }}>
              <Link
                href={`/impact/${s.slug}`}
                className={`w-index__row${current?.slug === s.slug ? " is-on" : ""}`}
                onMouseEnter={() => setShownSlug(s.slug)}
                onFocus={() => setShownSlug(s.slug)}
              >
                <span className="w-index__inline">
                  <Image src={s.images[0]} alt="" fill sizes="(max-width: 900px) 100vw, 1px" />
                </span>
                <span className="w-index__title">{s.title}</span>
                <span className="w-index__unit">
                  {s.unit}. {s.kind}, {s.year}.
                </span>
                <span className="w-index__fig">
                  <b className="w-figure">{s.outcomeFigure}</b> {s.outcomeLabel}
                </span>
                <span className="w-index__sdgs" aria-label={`SDGs ${s.sdgs.join(", ")}`}>
                  {s.sdgs.map((n) => (
                    <i
                      key={n}
                      title={`SDG ${n}: ${SDG_NAMES[n]}`}
                      style={{ background: SDG_COLORS[n], color: inkOn(SDG_COLORS[n]) } as CSSProperties}
                    >
                      {n}
                    </i>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="w-index__frame" aria-hidden="true" data-reveal="disc">
          <div className="w-index__disc">
            {shown.map((s) => (
              <Image key={s.slug} src={s.images[0]} alt="" fill sizes="40vw" className={current?.slug === s.slug ? "is-on" : undefined} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
