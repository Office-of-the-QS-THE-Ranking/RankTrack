import { notFound } from "next/navigation";
import { reference } from "@/lib/governance/server/reference";
import { siteData } from "@/lib/governance/server/site";
import { RankingDetail } from "@/components/site/rankings/RankingDetail";

export async function generateStaticParams() {
  return (await reference()).rankings.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = (await siteData()).ranking(slug);
  return r ? { title: r.name, description: `${r.publicNote} ${r.measures}.` } : { title: "Ranking" };
}

export default async function PublicRankingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Only rankings System Configuration shows publicly, with a Public results dataset, have a page.
  const ranking = (await siteData()).ranking(slug);
  if (!ranking) notFound();
  return <RankingDetail ranking={ranking} />;
}
