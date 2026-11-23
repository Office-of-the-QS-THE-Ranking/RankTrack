import { Gate } from "@/components/hub/Gate";
import { Imports } from "@/components/analytics/Imports";
import { importsDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Data imports" };

async function Body() {
  const desk = await importsDesk((await getViewer())!);
  return <Imports desk={desk} />;
}

export default function ImportsPage() {
  return (
    <Gate path="/admin/rankings/imports" title="Data imports">
      <Body />
    </Gate>
  );
}
