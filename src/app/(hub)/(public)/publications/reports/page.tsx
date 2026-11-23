import { notFound } from "next/navigation";
import { ReportsIndex } from "@/components/site/publications/ReportsIndex";
import { siteData } from "@/lib/governance/server/site";

export const metadata = {
  title: "Reports & Insights",
  description: "Annual reports, ranking analyses and briefs from the Office of QS/THE Rankings.",
};

export default async function ReportsAndInsights() {
  // System Configuration can switch Publications off.
  if (!(await siteData()).features.publications) notFound();
  return <ReportsIndex />;
}
