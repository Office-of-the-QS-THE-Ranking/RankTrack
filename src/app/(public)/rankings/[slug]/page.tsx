import { notFound } from "next/navigation";
import { RANKINGS } from "@/lib/data";
import { siteData } from "@/lib/governance/server/site";
import { RankingDetail } from "@/components/site/rankings/RankingDetail";

export function generateStaticParams() {
  return RANKINGS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = siteData().ranking(slug);
  return r ? { title: r.name, description: `${r.publicNote} ${r.measures}.` } : { title: "Ranking" };
}

export default async function PublicRankingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Only rankings System Configuration shows publicly, with a Public results dataset, have a page.
  const ranking = siteData().ranking(slug);
  if (!ranking) notFound();
  return <RankingDetail ranking={ranking} />;
}
