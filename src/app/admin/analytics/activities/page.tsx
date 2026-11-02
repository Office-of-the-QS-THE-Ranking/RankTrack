import { Gate } from "@/components/hub/Gate";
import { Activities } from "@/components/analytics/Activities";
import { PageHeader } from "@/components/ui/primitives";
import { activitiesDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Activities" };

async function Body() {
  const desk = await activitiesDesk((await getViewer())!);
  return (
    <>
      <PageHeader title="Activities" />
      <Activities desk={desk} />
    </>
  );
}

export default function ActivitiesPage() {
  return (
    <Gate path="/admin/analytics/activities" title="Activities">
      <Body />
    </Gate>
  );
}
