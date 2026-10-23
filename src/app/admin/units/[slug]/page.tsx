import { notFound } from "next/navigation";
import { UnitDashboard } from "@/components/units/UnitDashboard";
import { recordReach } from "@/lib/governance/derive";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { flag, viewerCan } from "@/lib/governance/viewer";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: hub().unit(slug)?.name ?? "Unit" };
}

/** A unit's page in the Office workspace, from the Organizational Directory; archived units keep theirs. */
export default async function UnitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = hub();
  const unit = h.unit(slug);
  if (!unit) notFound();
  const viewer = (await getViewer())!;
  const reach = recordReach(h.state.units, unit.slug);
  const evidence = h.evidence.filter((e) => reach.includes(e.unitSlug) && viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }));
  return (
    <UnitDashboard
      unit={unit}
      mode="admin"
      evidence={evidence}
      rankings={h.rankings}
      requirements={h.requirements(unit.slug)}
      canSubmit={viewer.portal.canSwitch && viewerCan(viewer, "evidence", "submit") && h.feature("submit-evidence")}
      insights={flag(viewer, "reuse-insights")}
    />
  );
}
