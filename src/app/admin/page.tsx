import Link from "next/link";
import { formatAsOf } from "@/lib/data";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { featureOn } from "@/lib/governance/derive";
import { readState } from "@/lib/governance/server/store";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { DashboardViewSwitch, type DashboardView } from "@/components/dashboard/DashboardViewSwitch";
import { DashboardViewPanel } from "@/components/dashboard/DashboardViewPanel";
import { SubmissionsBoard } from "@/components/dashboard/SubmissionsBoard";
import { OfficeWelcome } from "@/components/dashboard/Welcome";
import { RankingsOverview } from "@/components/rankings/Overview";
import { RecognitionWall } from "@/components/recognition/RecognitionWall";

export const metadata = {
  title: {
    absolute: "Executive dashboard · Office workspace · UST Rankings Hub",
  },
};

export default async function ExecutiveDashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const h = await hub();
  const viewer = await getViewer();
  // System Configuration sets which view opens first; the switch below still changes it.
  // The Recognition wall is a tab here while System Configuration keeps it switched on.
  const views: DashboardView[] = ["submissions", "rankings"];
  if (featureOn(await readState(), "recognition-internal")) views.push("recognition");
  const asked = (await searchParams).view as DashboardView | undefined;
  const view = asked && views.includes(asked) ? asked : h.dashboard.officeView;

  return (
    <div className="ov">
      <header className="ov__head">
        <div className="ov__title-row">
          <h1 className="ov__title">Dashboard</h1>
          <InfoTooltip>As of {formatAsOf(h.site.asOf)}</InfoTooltip>
        </div>
        <DashboardViewSwitch view={view} views={views} />
        <div className="ov__actions">
          <Link href="/admin/reports" className="btn btn--sm">
            <Icon name="download" size={16} /> Report
          </Link>
        </div>
      </header>

      <OfficeWelcome h={h} viewer={viewer} />

      <DashboardViewPanel view={view} views={views}>
        {view === "rankings" ? (
          <div className="ov-rankings">
            <RankingsOverview
              mode="internal"
              embedded
              rankings={h.rankings}
              evidence={h.evidence.filter((e) => viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }))}
            />
          </div>
        ) : view === "recognition" ? (
          <RecognitionWall mode="internal" embedded />
        ) : (
          <SubmissionsBoard h={h} viewer={viewer} />
        )}
      </DashboardViewPanel>
    </div>
  );
}
