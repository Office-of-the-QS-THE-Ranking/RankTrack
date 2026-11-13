import Link from "next/link";
import { PORTAL_NAME } from "@/lib/brand";
import { redirect } from "next/navigation";
import { formatAsOf } from "@/lib/data";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { featureOn } from "@/lib/governance/derive";
import { readState } from "@/lib/governance/server/store";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { DashboardViewSwitch, type DashboardView } from "@/components/dashboard/DashboardViewSwitch";
import { DashboardViewPanel } from "@/components/dashboard/DashboardViewPanel";
import { SubmissionsBoard } from "@/components/dashboard/SubmissionsBoard";
import { OfficeWelcome } from "@/components/dashboard/Welcome";
import { RecognitionWall } from "@/components/recognition/RecognitionWall";

export const metadata = {
  title: {
    absolute: `Executive dashboard · Office workspace · ${PORTAL_NAME}`,
  },
};

export default async function ExecutiveDashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const h = await hub();
  const viewer = await getViewer();
  // The Dashboard summarises and links on. The Recognition wall is a tab here while System Configuration keeps it on.
  const views: DashboardView[] = ["submissions"];
  if (featureOn(await readState(), "recognition-internal")) views.push("recognition");
  const asked = (await searchParams).view;
  // The rankings overview moved to Rankings; older links land there.
  if (asked === "rankings") redirect("/admin/rankings/positions");
  const view = views.find((v) => v === asked) ?? "submissions";

  return (
    <div className="ov">
      <header className="ov__head">
        <div className="ov__title-row">
          <h1 className="ov__title">Dashboard</h1>
          <InfoTooltip>As of {formatAsOf(h.site.asOf)}</InfoTooltip>
        </div>
        <DashboardViewSwitch view={view} views={views} />
        <div className="ov__actions">
          <Link href="/admin/workspace/build-a-report" className="btn btn--sm">
            <Icon name="download" size={16} /> Report
          </Link>
        </div>
      </header>

      <OfficeWelcome h={h} viewer={viewer} />

      <DashboardViewPanel view={view} views={views}>
        {view === "recognition" ? (
          <RecognitionWall mode="internal" embedded />
        ) : (
          <SubmissionsBoard h={h} viewer={viewer} />
        )}
      </DashboardViewPanel>
    </div>
  );
}
