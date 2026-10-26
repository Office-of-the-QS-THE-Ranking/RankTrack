import { Suspense } from "react";
import { PIPELINE } from "@/lib/data";
import { Card, PageHeader } from "@/components/ui/primitives";
import { Funnel } from "@/components/charts/charts";
import { ValidationQueue } from "@/components/contribute/ValidationQueue";
import { Gate } from "@/components/hub/Gate";

export const metadata = { title: "Contributions and validation" };

export default function Contribute() {
  return (
    <Gate path="/admin/contribute" title="Contributions and validation">
      <PageHeader title="Contributions and validation" />
      <Suspense>
        <ValidationQueue />
      </Suspense>
      <Card title="Contribution pipeline, this cycle" sub="From identified contribution to measured result and impact" icon="layers">
        <Funnel steps={PIPELINE} label="Contribution pipeline" />
      </Card>
    </Gate>
  );
}
