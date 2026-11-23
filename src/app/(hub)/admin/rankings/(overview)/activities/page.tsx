import { Gate } from "@/components/hub/Gate";
import { Activities } from "@/components/analytics/Activities";
import { activitiesDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Activities" };

async function Body() {
  const desk = await activitiesDesk((await getViewer())!);
  return <Activities desk={desk} />;
}

export default function ActivitiesPage() {
  return (
    <Gate path="/admin/rankings/activities" title="Activities">
      <Body />
    </Gate>
  );
}
