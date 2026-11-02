import { notFound } from "next/navigation";
import { rankingBySlug } from "@/lib/reference";
import { reference } from "@/lib/governance/server/reference";
import { hub } from "@/lib/governance/server/hub";
import { RankingView } from "@/components/rankings/RankingView";
import { freshSummaries } from "@/lib/analytics/server/summary";

export async function generateStaticParams() {
  return (await reference()).rankings.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: rankingBySlug(await reference(), slug)?.short ?? "Ranking" };
}

export default async function RankingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // The analytics engine's figures first, so the ranking's readiness below is its latest.
  const summaries = await freshSummaries();
  // Rankings switched off in System Configuration are not tracked in the workspace.
  const ranking = (await hub()).ranking(slug);
  if (!ranking) notFound();
  return <RankingView ranking={ranking} analytics={summaries.get(slug)} />;
}
