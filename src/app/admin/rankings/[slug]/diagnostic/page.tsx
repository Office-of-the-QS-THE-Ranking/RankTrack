import { notFound } from "next/navigation";
import { Gate } from "@/components/hub/Gate";
import { rankingActions } from "@/lib/analytics/server/desk";
import { rankingBySlug } from "@/lib/reference";
import { reference } from "@/lib/governance/server/reference";
import { hub } from "@/lib/governance/server/hub";
import { Diagnostic } from "@/components/rankings/Diagnostic";
import { criticalIndicator } from "@/components/rankings/focus";

export async function generateStaticParams() {
  return (await reference()).rankings.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = rankingBySlug(await reference(), slug);
  return { title: r ? `${criticalIndicator(r)?.name ?? "Indicator"} diagnostic · ${r.short}` : "Diagnostic" };
}

async function Body({ slug }: { slug: string }) {
  // Rankings switched off in System Configuration are not tracked in the workspace.
  const ranking = (await hub()).ranking(slug);
  if (!ranking) notFound();
  return <Diagnostic ranking={ranking} actions={(await rankingActions()).filter((a) => a.ranking === slug)} />;
}

export default async function DiagnosticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Gate path="/admin/rankings" title="Diagnostic">
      <Body slug={slug} />
    </Gate>
  );
}
