import { Gate } from "@/components/hub/Gate";
import { Imports } from "@/components/analytics/Imports";
import { PageHeader } from "@/components/ui/primitives";
import { importsDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Data imports" };

async function Body() {
  const desk = await importsDesk((await getViewer())!);
  return (
    <>
      <PageHeader title="Data imports" />
      <Imports desk={desk} />
    </>
  );
}

export default function ImportsPage() {
  return (
    <Gate path="/admin/analytics/imports" title="Data imports">
      <Body />
    </Gate>
  );
}
