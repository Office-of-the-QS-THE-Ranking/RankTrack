import { notFound } from "next/navigation";
import { RANKINGS, rankingBySlug } from "@/lib/data";
import { hub } from "@/lib/governance/server/hub";
import { Diagnostic } from "@/components/rankings/Diagnostic";
import { criticalIndicator } from "@/components/rankings/focus";

export function generateStaticParams() {
  return RANKINGS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = rankingBySlug(slug);
  return { title: r ? `${criticalIndicator(r)?.name ?? "Indicator"} diagnostic · ${r.short}` : "Diagnostic" };
}

export default async function DiagnosticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Rankings switched off in System Configuration are not tracked in the workspace.
  const ranking = (await hub()).ranking(slug);
  if (!ranking || !rankingBySlug(slug)) notFound();
  return <Diagnostic ranking={ranking} />;
}
