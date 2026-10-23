import { KnowledgePage } from "@/components/site/pages/KnowledgePage";

import { notFound } from "next/navigation";
import { siteData } from "@/lib/governance/server/site";

export const metadata = {
  title: "Knowledge Center",
  description: "Ranking methodologies in plain language, a searchable indicator dictionary and the evidence standards UST applies.",
};

export default function PublicKnowledge() {
  // System Configuration can switch this public section off.
  if (!siteData().features.knowledge) notFound();
  return <KnowledgePage />;
}
