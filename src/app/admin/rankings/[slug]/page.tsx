import { notFound } from "next/navigation";
import { RANKINGS, rankingBySlug } from "@/lib/data";
import { hub } from "@/lib/governance/server/hub";
import { RankingView } from "@/components/rankings/RankingView";

export function generateStaticParams() {
  return RANKINGS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: rankingBySlug(slug)?.short ?? "Ranking" };
}

export default async function RankingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Rankings switched off in System Configuration are not tracked in the workspace.
  const ranking = hub().ranking(slug);
  if (!ranking || !rankingBySlug(slug)) notFound();
  return <RankingView ranking={ranking} />;
}
