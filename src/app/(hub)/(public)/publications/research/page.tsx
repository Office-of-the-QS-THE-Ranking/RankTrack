import { notFound } from "next/navigation";
import { ResearchIndex } from "@/components/site/publications/ResearchIndex";
import { siteData } from "@/lib/governance/server/site";

export const metadata = {
  title: "Research Articles",
  description: "Peer-reviewed research by Thomasian authors: journals, DOIs and full texts.",
};

export default async function ResearchArticles() {
  // System Configuration can switch Publications off.
  if (!(await siteData()).features.publications) notFound();
  return <ResearchIndex />;
}
