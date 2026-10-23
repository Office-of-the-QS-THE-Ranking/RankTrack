import { ImpactIndex } from "@/components/site/impact/ImpactIndex";

import { notFound } from "next/navigation";
import { siteData } from "@/lib/governance/server/site";

export const metadata = {
  title: "Impact and Innovation",
  description: "Thomasian practices with measurable outcomes, the people they served, and guidance for institutions that want to adapt them.",
};

export default function PublicImpact() {
  // System Configuration can switch this public section off.
  if (!siteData().features.impact) notFound();
  return <ImpactIndex />;
}
