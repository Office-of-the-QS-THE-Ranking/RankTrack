import { Suspense } from "react";
import { notFound } from "next/navigation";
import { rankingBySlug } from "@/lib/reference";
import { reference } from "@/lib/governance/server/reference";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import type { Viewer } from "@/lib/governance/viewer";
import { Gate } from "@/components/hub/Gate";
import { Indicators } from "@/components/analytics/Indicators";
import { Methodology } from "@/components/analytics/Methodology";
import { RankingView } from "@/components/rankings/RankingView";
import { PanelSkeleton } from "@/components/shell/PageSkeleton";
import { indicatorsDesk, methodologyDesk, rankingDesk } from "@/lib/analytics/server/desk";
import { freshSummaries } from "@/lib/analytics/server/summary";

export async function generateStaticParams() {
  return (await reference()).rankings.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: rankingBySlug(await reference(), slug)?.short ?? "Ranking" };
}

async function IndicatorsTab({ viewer, slug, edition }: { viewer: Viewer; slug: string; edition?: string }) {
  const desk = await indicatorsDesk(viewer, slug, edition);
  return desk && <Indicators desk={desk} />;
}

async function MethodologyTab({ viewer, slug, edition }: { viewer: Viewer; slug: string; edition?: string }) {
  return <Methodology desk={await methodologyDesk(viewer, slug, edition)} />;
}

async function Body({ slug, edition }: { slug: string; edition?: string }) {
  const viewer = (await getViewer())!;
  // The analytics engine's figures first, so the ranking's readiness below is its latest.
  const summaries = await freshSummaries();
  // Rankings switched off in System Configuration are not tracked in the workspace.
  const ranking = (await hub()).ranking(slug);
  if (!ranking) notFound();
  const desk = await rankingDesk(viewer, slug);
  return (
    <RankingView
      ranking={ranking}
      analytics={summaries.get(slug)}
      desk={desk}
      indicators={
        desk.editions.length > 0 && (
          <Suspense fallback={<PanelSkeleton />}>
            <IndicatorsTab viewer={viewer} slug={slug} edition={edition} />
          </Suspense>
        )
      }
      methodology={
        desk.can.manage && (
          <Suspense fallback={<PanelSkeleton />}>
            <MethodologyTab viewer={viewer} slug={slug} edition={edition} />
          </Suspense>
        )
      }
    />
  );
}

/* Scoring data is on this page, so it asks for what the Rankings row in the navigation asks for. */
export default async function RankingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ edition?: string }> }) {
  const [{ slug }, { edition }] = await Promise.all([params, searchParams]);
  return (
    <Gate path="/admin/rankings" title="Rankings">
      <Body slug={slug} edition={edition} />
    </Gate>
  );
}
