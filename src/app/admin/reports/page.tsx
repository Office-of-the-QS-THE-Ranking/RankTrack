import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { ReportDesk } from "@/components/reports/ReportDesk";
import { reportActions } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Reports" };

/** The action plan report is the rankings' action items, so it reaches only people who can read Rankings. */
async function Body() {
  const viewer = await getViewer();
  if (!viewer || !viewerCan(viewer, "reports", "view")) return null;
  const actions = viewerCan(viewer, "rankings", "view") ? await reportActions() : [];
  return (
    <>
      <PageHeader title="Reports" />
      <Suspense>
        <ReportDesk actions={actions} />
      </Suspense>
    </>
  );
}

export default function Reports() {
  return (
    <Gate path="/admin/reports" title="Reports">
      <Body />
    </Gate>
  );
}
