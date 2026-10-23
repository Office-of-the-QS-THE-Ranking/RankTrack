import { UnitDashboard } from "@/components/units/UnitDashboard";
import { SharedResources } from "@/components/units/SharedResources";
import { flag } from "@/lib/governance/viewer";
import { portalContext } from "@/lib/governance/server/portal";
import { getViewer } from "@/lib/governance/server/session";

export async function generateMetadata() {
  const viewer = await getViewer();
  return { title: { absolute: `My dashboard · ${viewer?.portal.unitName ?? "Contributor workspace"} · UST Rankings Hub` } };
}

export default async function ContributorDashboard() {
  const ctx = await portalContext();
  if (ctx.viewer.external) return <SharedResources />;
  return (
    <UnitDashboard
      unit={ctx.unit}
      mode="portal"
      evidence={ctx.evidence}
      rankings={ctx.hub.rankings}
      requirements={ctx.requirements}
      canSubmit={ctx.can.submit}
      insights={flag(ctx.viewer, "reuse-insights")}
      scopeNote={ctx.scopeNote}
    />
  );
}
