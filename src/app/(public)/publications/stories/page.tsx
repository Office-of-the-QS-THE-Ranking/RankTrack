import { StoriesIndex } from "@/components/site/publications/StoriesIndex";

import { notFound } from "next/navigation";
import { siteData } from "@/lib/governance/server/site";

export const metadata = {
  title: "Stories & News",
  description: "Thomasian practices with measurable outcomes, the people they served, and guidance for institutions that want to adapt them.",
};

export default async function StoriesAndNews({ searchParams }: { searchParams: Promise<{ theme?: string; sdg?: string | string[]; year?: string; from?: string; to?: string }> }) {
  // System Configuration can switch Publications off.
  if (!(await siteData()).features.publications) notFound();
  const { theme, sdg, year, from, to } = await searchParams;
  const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : "";
  const publication = { year: typeof year === "string" && /^\d{4}$/.test(year) ? year : "", from: date(from), to: date(to) };
  const sdgs = [...new Set((Array.isArray(sdg) ? sdg : [sdg ?? ""]).flatMap((value) => value.split(",")).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 17))].sort((a, b) => a - b);
  return <StoriesIndex theme={typeof theme === "string" ? theme : undefined} sdgs={sdgs} publication={publication} />;
}
