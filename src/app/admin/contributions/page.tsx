import { Suspense } from "react";
import { pipeline } from "@/lib/reference";
import { reference } from "@/lib/governance/server/reference";
import { PageHeader } from "@/components/ui/primitives";
import { ValidationQueue } from "@/components/contributions/ValidationQueue";
import { Gate } from "@/components/hub/Gate";

export const metadata = { title: "Contributions and validation" };

export default async function Contributions() {
  const steps = pipeline(await reference());
  return (
    <Gate path="/admin/contributions" title="Contributions and validation">
      <PageHeader title="Contributions and validation" />
      <Suspense>
        <ValidationQueue steps={steps} />
      </Suspense>
    </Gate>
  );
}
