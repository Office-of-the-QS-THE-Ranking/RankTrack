import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { BuildAReport } from "@/components/reports/BuildAReport";
import { reportActions } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Build a Report" };

/** The action plan report is the rankings' action items, so it reaches only people who can read Rankings. */
async function Body() {
  const viewer = await getViewer();
  if (!viewer || !viewerCan(viewer, "reports", "view")) return null;
  const actions = viewerCan(viewer, "rankings", "view") ? await reportActions() : [];
  return (
    <>
      <PageHeader title="Build a Report" />
      <Suspense>
        <BuildAReport actions={actions} />
      </Suspense>
    </>
  );
}

export default function BuildAReportPage() {
  return (
    <Gate path="/admin/workspace/build-a-report" title="Build a Report">
      <Body />
    </Gate>
  );
}
