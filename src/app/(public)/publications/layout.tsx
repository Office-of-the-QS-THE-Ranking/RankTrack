import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { PublicationsMasthead } from "@/components/site/publications/PublicationsMasthead";
import { siteData } from "@/lib/governance/server/site";

/** Keep section navigation mounted while only the selected Publications page changes. */
export default async function PublicationsLayout({ children }: { children: ReactNode }) {
  const site = await siteData();
  if (!site.features.publications) notFound();
  const { stories, articles, reports } = site;
  const latestStory = stories.map((story) => story.postedAt ?? `${story.year}-01-01T00:00:00.000Z`).sort().at(-1);
  return (
    <>
      <PublicationsMasthead sections={{
        stories: { count: stories.length, lead: "Thomasian work that changed something measurable, and how other universities can adapt it.", latest: latestStory },
        research: { count: articles.length, lead: "Peer-reviewed work by Thomasian authors, with the journal, the DOI and the full text where it is open.", latest: articles[0]?.issued },
        reports: { count: reports.length, lead: "What the Office measures and learns: annual reports, ranking analyses and briefs, free to download.", latest: reports[0]?.issued },
      }} />
      {children}
    </>
  );
}
