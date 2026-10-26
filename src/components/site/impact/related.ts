import type { Story } from "@/lib/data";

/** Up to three other stories that share a goal or a theme. */
export const relatedStories = (stories: Story[], s: { slug: string; sdgs: number[]; themes: readonly string[] }) =>
  stories.filter((o) => o.slug !== s.slug && (o.sdgs.some((n) => s.sdgs.includes(n)) || o.themes.some((t) => s.themes.includes(t)))).slice(0, 3);
