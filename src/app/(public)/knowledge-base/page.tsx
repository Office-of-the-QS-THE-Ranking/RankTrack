import { KnowledgeBasePage } from "@/components/site/pages/KnowledgeBasePage";

import { notFound } from "next/navigation";
import { siteData } from "@/lib/governance/server/site";

export const metadata = {
  title: "Knowledge Base",
  description: "Ranking methodologies in plain language, a searchable indicator dictionary and the evidence standards UST applies.",
};

export default async function PublicKnowledgeBase() {
  // System Configuration can switch this public section off.
  if (!(await siteData()).features.knowledgeBase) notFound();
  return <KnowledgeBasePage />;
}
