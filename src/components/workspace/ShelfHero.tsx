"use client";

/*
 * The Workspace pages' shared pieces: each page's night header (its name, filter chips and art), documents drawn
 * as one (a gridded sheet with a folded corner and a riveted plate naming its type), and the Cards/Table switch.
 * Styles in styles/shelf.css.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export type ShelfLayout = "files" | "table";

/** Cards or table, remembered per browser under `key`. */
export function useShelfLayout(key = "ws-shelf-layout") {
  const [layout, setLayout] = useState<ShelfLayout>("files");
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "table") setLayout("table");
    } catch {}
  }, [key]);
  const choose = (next: ShelfLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(key, next);
    } catch {}
  };
  return [layout, choose] as const;
}

/** The two icon buttons for the controls row. */
export function LayoutSwitch({ layout, onChange, noun = "files" }: { layout: ShelfLayout; onChange: (l: ShelfLayout) => void; noun?: string }) {
  return (
    <>
      <button type="button" className="btn content-tabs__action content-tabs__action--icon" aria-label={`Show ${noun} as cards`} aria-pressed={layout === "files"} onClick={() => onChange("files")}>
        <Icon name="grid" size={16} />
      </button>
      <button type="button" className="btn content-tabs__action content-tabs__action--icon" aria-label={`Show ${noun} as a table`} aria-pressed={layout === "table"} onClick={() => onChange("table")}>
        <Icon name="list" size={16} />
      </button>
    </>
  );
}

/** Colours a drawn document takes: file families, and archived grey. */
export type DocTone = "pdf" | "doc" | "sheet" | "archived";

/** A document drawn as one: gridded sheet, folded corner, a frosted riveted plate with its type. */
export function DocArt({ kind, label, size = "md" }: { kind: DocTone; label: string; size?: "sm" | "md" }) {
  return (
    <span className={`shelf-doc shelf-doc--${kind} shelf-doc--${size}`} aria-hidden="true">
      <span className="shelf-doc__sheet" />
      <span className="shelf-doc__fold" />
      <span className="shelf-doc__plate">
        <i data-long={label.length > 6 ? "" : undefined}>{label}</i>
      </span>
    </span>
  );
}

/** A chip on a page's header: a filter when the header has `onPick`, a plain count otherwise. */
export type HeroChip = { key: string; label: string; count: number; tone?: string };

/**
 * A page's night header: its name, chips (filters, or counts), and its art on the right. `tone` sets the glow:
 * blue for Digital Forms, green for Working Documents, violet for the Resource Library, amber for Archives.
 */
export function ShelfHero({
  title,
  tone,
  chips = [],
  total,
  picked = null,
  onPick,
  filterLabel = "Filter",
  art,
}: {
  title: string;
  tone?: "working" | "library" | "archive";
  chips?: HeroChip[];
  /** The All chip's count, shown before the filters. */
  total?: number;
  picked?: string | null;
  onPick?: (key: string | null) => void;
  filterLabel?: string;
  art: ReactNode;
}) {
  const dot = (c: HeroChip) => c.tone && <span className="shelf-chip__dot" aria-hidden="true" />;
  return (
    <header className={`shelf-hero${tone ? ` shelf-hero--${tone}` : ""}`}>
      <span className="shelf-hero__arc" aria-hidden="true" />
      <div className="shelf-hero__text">
        <h1 className="shelf-hero__title">{title}</h1>
        {chips.length > 0 &&
          (onPick ? (
            <div className="shelf-hero__kinds" role="group" aria-label={filterLabel}>
              <button type="button" className="shelf-chip" aria-pressed={picked === null} onClick={() => onPick(null)}>
                All <b>{total}</b>
              </button>
              {chips.map((c) => (
                <button key={c.key} type="button" className={`shelf-chip${c.tone ? ` shelf-chip--${c.tone}` : ""}`} aria-pressed={picked === c.key} onClick={() => onPick(picked === c.key ? null : c.key)}>
                  {dot(c)}
                  {c.label} <b>{c.count}</b>
                </button>
              ))}
            </div>
          ) : (
            <ul className="shelf-hero__kinds">
              {chips.map((c) => (
                <li key={c.key} className={`shelf-chip shelf-chip--stat${c.tone ? ` shelf-chip--${c.tone}` : ""}`}>
                  {dot(c)}
                  {c.label} <b>{c.count}</b>
                </li>
              ))}
            </ul>
          ))}
      </div>
      <div className="shelf-hero__fan" aria-hidden="true">
        {art}
      </div>
    </header>
  );
}
