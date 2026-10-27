"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EVIDENCE as STATIC_EVIDENCE, STORIES as STATIC_STORIES, type Ranking } from "@/lib/data";
import type { HubData } from "@/lib/governance/hub-types";
import { feature, viewerCan, type Viewer } from "@/lib/governance/viewer";
import { useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Stars } from "@/components/site/Stars";
import { NAV, publicationsSubnav, type Variant } from "./nav";
import { officeStoryPath, storyPath } from "@/lib/publications";
import { useViews } from "@/components/reference/ReferenceProvider";
import type { Views } from "@/lib/reference";

interface Entry {
  group: string;
  label: string;
  sub?: string;
  href: string;
  icon: IconName;
  /** the ranking family's colour, a dot beside the line about it (public site only) */
  color?: string;
}

interface Hit {
  entry: Entry;
  /** lower is better */
  score: number;
  /** where the typed words fall in the label, for highlighting */
  marks: [number, number][];
}

/** The last row: send the words to the indicator dictionary. It has no heading. */
const MORE = "Search";

const knowledgeHref = (variant: Variant) => (variant === "office" ? "/admin/knowledge" : variant === "unit" ? "/portal/knowledge" : "/knowledge");

/* The index follows governance: pages the viewer's role opens, rankings that are tracked, and only the
   evidence, units and stories the viewer can reach. Dictionary terms only when the Knowledge Center is
   one of those pages. */
function buildIndex(variant: Variant, hub: HubData | null, RANKINGS: Ranking[], viewer: Viewer | null, { dictionary, families }: Pick<Views, "dictionary" | "families">): Entry[] {
  const DICTIONARY = hub?.dictionary ?? dictionary;
  const EVIDENCE = hub?.evidence ?? STATIC_EVIDENCE;
  const STORIES = hub?.stories ?? STATIC_STORIES;
  const PUBLISHED_STORIES = STORIES.filter((s) => s.state === "Published");
  const UNITS = hub?.units.filter((u) => u.status === "Active") ?? [];
  const target = variant === "unit" && viewer ? { unitId: viewer.portal.programId ?? viewer.portal.unitId } : {};
  const pages: Entry[] = NAV[variant].flatMap((g) =>
    g.items
      .filter((i) => (!i.need || !viewer || viewerCan(viewer, i.need[0], i.need[1], target)) && (!i.feature || feature(viewer, i.feature)))
      .flatMap((i): Entry[] => [
        { group: "Pages", label: i.label, href: i.href, icon: i.icon },
        // Publications' sections are pages of their own.
        ...(i.publicationsBase ? publicationsSubnav(i.publicationsBase).map((c) => ({ group: "Pages", label: c.label, sub: i.label, href: c.href, icon: c.icon })) : []),
      ]),
  );
  const rankingBase = variant === "office" ? "/admin/rankings" : "/rankings";
  const rankings: Entry[] = RANKINGS.map((r) => ({
    group: "Rankings",
    label: r.name,
    sub: r.current ? `${r.short} · ${r.current}` : r.short,
    href: `${rankingBase}/${r.slug}`,
    icon: "rankings",
    color: families[r.family].color,
  }));
  const indicators: Entry[] = RANKINGS.flatMap((r) =>
    r.indicators.map((i) => ({
      group: "Indicators",
      label: i.name,
      sub: `${r.short} · weight ${i.weight}`,
      href: `${rankingBase}/${r.slug}${variant === "office" ? "#indicators" : "#measures"}`,
      icon: "target" as IconName,
      color: families[r.family].color,
    })),
  );
  const knowledge = knowledgeHref(variant);
  const terms: Entry[] = pages.some((p) => p.href === knowledge)
    ? DICTIONARY.map((d) => ({
        group: "Indicator dictionary",
        label: d.term,
        sub: d.links.map((l) => l.ranking).filter((v, i, a) => a.indexOf(v) === i).join(" · "),
        href: `${knowledge}?q=${encodeURIComponent(d.term)}`,
        icon: "knowledge",
      }))
    : [];
  const storyList = variant === "public" ? PUBLISHED_STORIES : STORIES;
  const stories: Entry[] = storyList.map((s) => ({
    group: "Stories & News",
    label: s.title,
    sub: s.unit,
    href: variant === "office" ? officeStoryPath(s.slug) : storyPath(s.slug),
    icon: "newspaper",
  }));
  if (variant === "public") return [...pages, ...rankings, ...indicators, ...stories, ...terms];

  const units: Entry[] =
    variant === "office"
      ? UNITS.map((u) => ({ group: "Units", label: u.name, sub: u.coordinator, href: `/admin/units/${u.slug}`, icon: "units" }))
      : [];
  const evidence: Entry[] = EVIDENCE.map((e) => ({
    group: "Evidence",
    label: e.title,
    sub: `${e.id} · ${e.status}`,
    href: variant === "office" ? `/admin/contributions?item=${e.id}` : `/portal/history#${e.id}`,
    icon: "evidence",
  }));
  return [...pages, ...rankings, ...indicators, ...units, ...evidence, ...(variant === "office" ? stories : []), ...terms];
}

/** Lower case without accents, so "tomas" finds "Tomás". One character stays one, so positions carry over to the label. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const startsWord = (text: string, at: number) => at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1]);

/** Where a word starts a word of the text, else where it first appears anywhere, else -1. */
function find(text: string, word: string) {
  const first = text.indexOf(word);
  for (let at = first; at !== -1; at = text.indexOf(word, at + 1)) if (startsWord(text, at)) return at;
  return first;
}

/* Every typed word must appear in the label or the line under it. A label that is the phrase, or starts
   with it, comes first; then words that start the label, start a word in it, sit inside one, and last
   words found only in the line under it. */
function match(entry: Entry, phrase: string, words: string[]): Hit | null {
  const label = fold(entry.label);
  const sub = fold(entry.sub ?? "");
  let score = label === phrase ? -3 : label.startsWith(phrase) ? -2 : label.includes(phrase) ? -1 : 0;
  const marks: [number, number][] = [];
  for (const w of words) {
    const at = find(label, w);
    if (at === -1) {
      if (!sub.includes(w)) return null;
      score += 3;
      continue;
    }
    score += at === 0 ? 0 : startsWord(label, at) ? 1 : 2;
    marks.push([at, at + w.length]);
  }
  return { entry, score, marks };
}

/** The label with the typed words marked. */
function Marked({ text, marks }: { text: string; marks: [number, number][] }) {
  if (!marks.length || fold(text).length !== text.length) return <>{text}</>;
  const spans = [...marks].sort((a, b) => a[0] - b[0]).reduce<[number, number][]>((out, [a, b]) => {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
    return out;
  }, []);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [a, b] of spans) {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={a} className="palette__hit">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

const EMPTY_HINT: Record<Variant, string> = {
  public: "Try a ranking such as “QS”, or an indicator such as “citations”.",
  office: "Try an indicator such as “citations”, or a unit name.",
  unit: "Try an indicator such as “citations”, or an evidence ID.",
};

export function SearchPalette({ variant, open, onClose }: { variant: Variant; open: boolean; onClose: () => void }) {
  const views = useViews();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const glideRef = useRef<HTMLSpanElement>(null);
  const downOnBackdrop = useRef(false);
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  // Rows rise in order as the dialog opens; rows that arrive while typing just appear.
  const [settled, setSettled] = useState(false);
  const hub = useHub();
  const viewer = useViewer();
  const rankings = useRankings();
  const index = useMemo(() => buildIndex(variant, hub, rankings, viewer, views), [variant, hub, rankings, viewer, views]);
  const knowledge = knowledgeHref(variant);
  const canBrowse = index.some((e) => e.group === "Pages" && e.href === knowledge);
  const phrase = fold(q.trim()).replace(/\s+/g, " ");

  /* Before anything is typed: the pages and the rankings, in menu order. Once a word is typed, the group
     holding the best match leads, and the best matches lead each group. */
  const { groups, results, found } = useMemo(() => {
    const words = phrase ? phrase.split(" ") : [];
    const hits: Hit[] = phrase
      ? index.map((e) => match(e, phrase, words)).filter((h): h is Hit => h !== null)
      : index.filter((e) => e.group === "Pages" || e.group === "Rankings").map((entry) => ({ entry, score: 0, marks: [] }));
    const byGroup = new Map<string, Hit[]>();
    for (const h of hits) byGroup.set(h.entry.group, [...(byGroup.get(h.entry.group) ?? []), h]);
    const cap = phrase ? 6 : 10;
    const sections = [...byGroup.entries()]
      .map(([name, list]) => ({ name, hits: list.sort((a, b) => a.score - b.score).slice(0, cap) }))
      .sort((a, b) => a.hits[0].score - b.hits[0].score);
    if (phrase && canBrowse) {
      const typed = q.trim().replace(/\s+/g, " ");
      sections.push({
        name: MORE,
        hits: [{ entry: { group: MORE, label: `Search the indicator dictionary for “${typed}”`, href: `${knowledge}?q=${encodeURIComponent(typed)}`, icon: "search" }, score: 0, marks: [] }],
      });
    }
    return { groups: sections, results: sections.flatMap((s) => s.hits.map((h) => h.entry)), found: hits.length };
  }, [phrase, q, index, knowledge, canBrowse]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQ("");
      setActive(0);
      setSettled(false);
      d.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
      const t = window.setTimeout(() => setSettled(true), 1000);
      return () => window.clearTimeout(t);
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const h = () => onClose();
    d.addEventListener("close", h);
    return () => d.removeEventListener("close", h);
  }, [onClose]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  // The lit row's ground glides from row to row, as the header's pill glides from tab to tab.
  // Declared after the effect that opens the dialog, so the rows have their size when it measures.
  useEffect(() => {
    const glide = glideRef.current;
    if (!glide) return;
    const row = open ? document.getElementById(`${listId}-opt-${active}`) : null;
    if (!row || !row.offsetHeight) {
      glide.style.opacity = "0";
      return;
    }
    // From rest, the ground appears under the row instead of sliding in from the last one.
    const first = glide.style.opacity !== "1";
    if (first) glide.style.transition = "none";
    glide.style.height = `${row.offsetHeight}px`;
    glide.style.transform = `translateY(${row.offsetTop}px)`;
    if (first) {
      void glide.offsetWidth;
      glide.style.transition = "";
    }
    glide.style.opacity = "1";
  }, [open, active, groups, listId]);

  const close = () => ref.current?.close();

  const go = (e?: Entry) => {
    if (!e) return;
    close();
    router.push(e.href);
  };

  let i = 0;
  return (
    <dialog
      ref={ref}
      className="palette"
      aria-label="Search"
      data-settled={settled || undefined}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        // Only a press that starts and ends outside closes it, so a text selection dragged out of the field does not.
        if (downOnBackdrop.current && e.target === ref.current) close();
      }}
    >
      {variant === "public" && <Stars sky="field" />}
      <div className="palette__field">
        <Icon name="search" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results.length ? `${listId}-opt-${active}` : undefined}
          aria-autocomplete="list"
          enterKeyHint="go"
          autoComplete="off"
          spellCheck={false}
          placeholder={variant === "public" ? "Search rankings, indicators and stories" : "Search indicators, evidence, units"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[active]);
            } else if (e.key === "Escape" && q) {
              // The first Escape clears the words; the next closes the dialog.
              e.preventDefault();
              setQ("");
            }
          }}
        />
        <button type="button" className="palette__close" aria-label="Close search" onClick={close}>
          <span className="kbd palette__esc">Esc</span>
          <Icon name="close" size={18} className="palette__x" />
        </button>
      </div>
      <div className="palette__results">
        <span className="palette__glide" ref={glideRef} aria-hidden="true" />
        {phrase && !found && (
          <div className="empty palette__empty">
            <span className="empty__icon">
              <Icon name="search" />
            </span>
            <p className="empty__title">No matches for “{q.trim()}”</p>
            <p>{EMPTY_HINT[variant]}</p>
          </div>
        )}
        <div id={listId} role="listbox" aria-label="Results">
          {groups.map((g) => (
            <div key={g.name} role="group" aria-label={g.name === MORE ? "More" : g.name} className="palette__section">
              {g.name !== MORE && (
                <p className="palette__group" aria-hidden="true" style={{ "--i": i } as CSSProperties}>
                  {g.name}
                </p>
              )}
              {g.hits.map(({ entry: r, marks }) => {
                const n = i++;
                return (
                  <div
                    key={r.group + r.href + r.label}
                    id={`${listId}-opt-${n}`}
                    role="option"
                    aria-selected={n === active}
                    className="palette__opt"
                    style={{ "--i": n } as CSSProperties}
                    onMouseMove={() => setActive(n)}
                    onClick={() => go(r)}
                  >
                    <span className="palette__opt-icon">
                      <Icon name={r.icon} size={variant === "public" ? 18 : 16} />
                    </span>
                    <span className="palette__opt-text">
                      <span className="truncate palette__opt-label">
                        <Marked text={r.label} marks={marks} />
                      </span>
                      {r.sub && (
                        <small className="truncate">
                          {r.color && <i className="palette__dot" style={{ background: r.color }} aria-hidden="true" />}
                          {r.sub}
                        </small>
                      )}
                    </span>
                    <Icon name="arrow" size={16} className="palette__go" />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only" role="status">
        {phrase ? `${found === 0 ? "No" : found} ${found === 1 ? "match" : "matches"}` : ""}
      </p>
      <div className="palette__foot">
        <span className="palette__keys" aria-hidden="true">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> to move
          </span>
          <span>
            <span className="kbd">↵</span> to open
          </span>
        </span>
        {canBrowse && (
          <Link href={knowledge} className="palette__browse" onClick={close}>
            Browse the indicator dictionary
            <Icon name="arrow" size={15} />
          </Link>
        )}
      </div>
    </dialog>
  );
}
