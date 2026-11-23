import { PORTAL_NAME } from "@/lib/brand";
import { redirect } from "next/navigation";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { featureOn } from "@/lib/governance/derive";
import { readState } from "@/lib/governance/server/store";
import { ExecutiveDashboard, dashboardViews } from "@/components/dashboard/ExecutiveDashboard";
import { ActionsTile, RequestsTile } from "@/components/dashboard/SubmissionsBoardTiles";

export const metadata = {
  title: {
    absolute: `Executive dashboard · Office workspace · ${PORTAL_NAME}`,
  },
};

export default async function ExecutiveDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const h = await hub();
  const viewer = await getViewer();
  const asked = (await searchParams).view;
  // The rankings overview moved to Rankings; older links land there.
  if (asked === "rankings") redirect("/admin/rankings/positions");
  // The Dashboard summarises and links on. The Recognition wall is a tab here while System Configuration keeps it on.
  const { view, views } = dashboardViews(featureOn(await readState(), "recognition-internal"), asked);

  return (
    <ExecutiveDashboard
      h={h}
      viewer={viewer}
      view={view}
      views={views}
      requests={<RequestsTile />}
      actions={<ActionsTile warningDays={h.dashboard.deadlineWarningDays} />}
    />
  );
}
