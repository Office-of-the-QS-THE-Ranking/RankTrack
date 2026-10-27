import Link from "next/link";
import { formatAsOf } from "@/lib/data";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { DashboardViewSwitch } from "@/components/dashboard/DashboardViewSwitch";
import { DashboardViewPanel } from "@/components/dashboard/DashboardViewPanel";
import { SubmissionsBoard } from "@/components/dashboard/SubmissionsBoard";
import { OfficeWelcome } from "@/components/dashboard/Welcome";
import { RankingsOverview } from "@/components/rankings/Overview";

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
  const asked = (await searchParams).view;
  const view = asked === "rankings" || asked === "submissions" ? asked : h.dashboard.officeView;

  return (
    <div className="ov">
      <header className="ov__head">
        <div className="ov__title-row">
          <h1 className="ov__title">Dashboard</h1>
          <InfoTooltip>As of {formatAsOf(h.site.asOf)}</InfoTooltip>
        </div>
        <DashboardViewSwitch view={view} />
        <div className="ov__actions">
          <Link href="/admin/reports" className="btn btn--sm">
            <Icon name="download" size={16} /> Report
          </Link>
        </div>
      </header>

      <OfficeWelcome h={h} viewer={viewer} />

      <DashboardViewPanel view={view}>
        {view === "rankings" ? (
          <div className="ov-rankings">
            <RankingsOverview
              mode="internal"
              embedded
              rankings={h.rankings}
              evidence={h.evidence.filter((e) => viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }))}
            />
          </div>
        ) : (
          <SubmissionsBoard h={h} viewer={viewer} />
        )}
      </DashboardViewPanel>
    </div>
  );
}
