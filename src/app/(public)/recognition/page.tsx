import { RecognitionPage } from "@/components/site/pages/RecognitionPage";

import { notFound } from "next/navigation";
import { siteData } from "@/lib/governance/server/site";

export const metadata = {
  title: "Recognition",
  description: "The people and units behind UST's results, recognised for evidence quality, outcomes and collaboration.",
};

export default function PublicRecognition() {
  // System Configuration can switch this public section off.
  if (!siteData().features.recognition) notFound();
  return <RecognitionPage />;
}
