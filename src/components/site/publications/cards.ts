import type { Story } from "@/lib/data";
import { excerpt, readingMinutes } from "@/lib/governance/posts";
import type { Photo } from "@/lib/site";

/** A story as the newsroom lists it: only what a card shows, so the index never ships whole post bodies. */
export interface StoryCard {
  slug: string;
  title: string;
  unit: string;
  /** The first theme, or the story's kind when it has none. */
  section: string;
  themes: string[];
  sdgs: number[];
  /** ISO time it reached the website; stories from before posting dates carry their year's first day. */
  date: string;
  dek: string;
  minutes: number;
  image: { src: string; alt: string } | null;
  /** A measured result for stories told in the proposal's format; posts have none. */
  figure?: { value: string; label: string };
}

export function storyCard(s: Story, photos: Record<string, Photo> = {}): StoryCard {
  const p = s.post;
  const cover = p ? (p.thumbnail ?? p.photos[0] ?? null) : null;
  const src = cover?.src ?? s.images[0];
  const alt = cover?.alt ?? Object.values(photos).find((ph) => ph.src === src)?.alt ?? "";
  const told = [s.challenge, s.response, s.implementation, s.outcome, s.beneficiaries, s.replication, s.lessons].join(" ");
  return {
    slug: s.slug,
    title: s.title,
    unit: s.unit,
    section: s.themes[0] ?? s.kind,
    themes: [...s.themes],
    sdgs: s.sdgs,
    date: s.postedAt ?? `${s.year}-01-01T00:00:00.000Z`,
    dek: p ? p.subtitle || excerpt(p.body, 180) : [s.challenge, s.outcome].filter(Boolean).join(" "),
    minutes: readingMinutes(p ? p.body : told),
    image: src ? { src, alt } : null,
    figure: !p && s.outcomeFigure && s.outcomeFigure !== "—" ? { value: s.outcomeFigure, label: s.outcomeLabel } : undefined,
  };
}

/** Newest first. */
export const byDate = (a: StoryCard, b: StoryCard) => b.date.localeCompare(a.date);
