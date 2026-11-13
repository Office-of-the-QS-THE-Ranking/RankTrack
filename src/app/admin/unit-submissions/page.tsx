import { Suspense } from "react";
import { pipeline } from "@/lib/reference";
import { reference } from "@/lib/governance/server/reference";
import { PageHeader } from "@/components/ui/primitives";
import { UnitSubmissions } from "@/components/contributions/UnitSubmissions";
import { Gate } from "@/components/hub/Gate";

export const metadata = { title: "Unit Submissions" };

export default async function UnitSubmissionsPage() {
  const steps = pipeline(await reference());
  return (
    <Gate path="/admin/unit-submissions" title="Unit Submissions">
      <PageHeader title="Unit Submissions" />
      <Suspense>
        <UnitSubmissions steps={steps} />
      </Suspense>
    </Gate>
  );
}
