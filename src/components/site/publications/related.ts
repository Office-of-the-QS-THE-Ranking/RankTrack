import type { Story } from "@/lib/data";

const newest = (a: Story, b: Story) => (b.postedAt ?? String(b.year)).localeCompare(a.postedAt ?? String(a.year));

/** Three other stories: those that share a goal or a theme first, then the newest of the rest. */
export const relatedStories = (stories: Story[], s: { slug: string; sdgs: number[]; themes: readonly string[] }) => {
  const others = stories.filter((o) => o.slug !== s.slug).sort(newest);
  const near = others.filter((o) => o.sdgs.some((n) => s.sdgs.includes(n)) || o.themes.some((t) => s.themes.includes(t)));
  return [...near, ...others.filter((o) => !near.includes(o))].slice(0, 3);
};
