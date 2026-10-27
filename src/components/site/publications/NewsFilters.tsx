"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DateField, Select } from "@/components/ui/pickers";
import { Icon } from "@/components/ui/Icon";
import { SdgPicker } from "@/components/publications/ComposerPanels";
import { useViews } from "@/components/reference/ReferenceProvider";

export type PublicationFilters = { sdgs: number[]; year: string; from: string; to: string };
export const EMPTY_FILTERS: PublicationFilters = { sdgs: [], year: "", from: "", to: "" };

const PUBLICATION_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });

/** A publication's calendar day in the site's timezone, including timestamps near midnight UTC. */
export function publicationDay(date: string) {
  return PUBLICATION_DAY.format(new Date(date));
}

export function NewsFilters({ value, years, onApply, onClose }: {
  value: PublicationFilters;
  years: string[];
  onApply: (value: PublicationFilters) => void;
  onClose: () => void;
}) {
  const { sdgNames } = useViews();
  const [draft, setDraft] = useState(value);
  const dialog = useRef<HTMLDialogElement>(null);
  const outside = useRef(false);
  const id = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const previous = document.documentElement.style.overflow;
    node.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => { node.close(); document.documentElement.style.overflow = previous; };
  }, []);
  return (
    <dialog ref={dialog} className="w-news-filters" aria-labelledby={`${id}-title`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onPointerDown={(event) => { outside.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        if (outside.current && event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) onClose();
      }}>
      <form onSubmit={(event) => { event.preventDefault(); onApply(draft); onClose(); }}>
        <header className="w-news-filters__head">
          <div><h2 id={`${id}-title`}>Filter stories</h2><p>Choose one or more goals and when the story was published.</p></div>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Close filters" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="w-news-filters__body">
          <fieldset className="w-news-filters__goals">
            <legend>Sustainable Development Goals</legend>
            <button type="button" className="btn btn--sm w-news-filters__all-goals" aria-pressed={!draft.sdgs.length} onClick={() => setDraft({ ...draft, sdgs: [] })}>All goals</button>
            <SdgPicker compact value={draft.sdgs} onToggle={(goal) => setDraft((current) => ({ ...current, sdgs: current.sdgs.includes(goal) ? current.sdgs.filter((n) => n !== goal) : [...current.sdgs, goal].sort((a, b) => a - b) }))} />
            {draft.sdgs.length > 0 && (
              <p className="w-news-filters__selection" aria-live="polite">
                {draft.sdgs.map((goal) => `SDG ${goal}: ${sdgNames[goal]}`).join(" · ")}
              </p>
            )}
          </fieldset>
          <fieldset className="w-news-filters__publication">
            <legend>Publication date</legend>
            <label className="w-news-filters__field">Year
              <Select className="select" value={draft.year} onChange={(year) => setDraft({ ...draft, year, from: "", to: "" })} aria-label="Publication year">
                <option value="">All years</option>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </Select>
            </label>
            <label className="w-news-filters__field">From
              <DateField className="input" value={draft.from} max={draft.to || undefined} onChange={(from) => setDraft({ ...draft, from, year: "" })} aria-label="Published from" />
            </label>
            <label className="w-news-filters__field">To
              <DateField className="input" value={draft.to} min={draft.from || undefined} onChange={(to) => setDraft({ ...draft, to, year: "" })} aria-label="Published through" />
            </label>
          </fieldset>
        </div>
        <footer className="w-news-filters__foot">
          <button type="button" className="btn btn--ghost" onClick={() => setDraft({ ...EMPTY_FILTERS })}>Clear filters</button>
          <button type="submit" className="btn btn--dark">Apply filters</button>
        </footer>
      </form>
    </dialog>
  );
}
