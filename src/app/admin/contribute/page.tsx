import Link from "next/link";
import { Suspense } from "react";
import { PIPELINE } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Card, PageHeader } from "@/components/ui/primitives";
import { Funnel } from "@/components/charts/charts";
import { ValidationQueue } from "@/components/contribute/ValidationQueue";
import { Gate } from "@/components/hub/Gate";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Contributions and validation" };

export default async function Contribute() {
  const viewer = await getViewer();
  const onBehalf = !!viewer && viewer.workspaces.includes("portal") && viewerCan(viewer, "evidence", "submit");
  return (
    <Gate path="/admin/contribute" title="Contributions and validation">
      <PageHeader
        title="Contributions and validation"
        lede="Check each submission once for reporting period, quality and relevance, then map it to every indicator it can serve."
        actions={
          onBehalf && (
            <Link href="/portal/submit" className="btn btn--primary">
              <Icon name="upload" size={18} /> Submit on behalf of a unit
            </Link>
          )
        }
      />
      <Suspense>
        <ValidationQueue />
      </Suspense>
      <Card title="Contribution pipeline, this cycle" sub="From identified contribution to measured result and impact" icon="layers">
        <Funnel steps={PIPELINE} label="Contribution pipeline" />
      </Card>
    </Gate>
  );
}
