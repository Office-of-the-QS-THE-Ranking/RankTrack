import { Gate } from "@/components/hub/Gate";
import { Requests } from "@/components/analytics/Requests";
import { PageHeader } from "@/components/ui/primitives";
import { requestsDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Data requests" };

async function Body() {
  const desk = await requestsDesk((await getViewer())!);
  return (
    <>
      <PageHeader title="Data requests" />
      <Requests desk={desk} />
    </>
  );
}

export default function RequestsPage() {
  return (
    <Gate path="/portal/requests" title="Data requests">
      <Body />
    </Gate>
  );
}
