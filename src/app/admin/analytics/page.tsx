import { Gate } from "@/components/hub/Gate";
import { Scorecard } from "@/components/analytics/Scorecard";
import { PageHeader } from "@/components/ui/primitives";
import { scorecardDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Analytics" };

async function Body() {
  const desk = await scorecardDesk((await getViewer())!);
  return (
    <>
      <PageHeader title="Analytics" />
      <Scorecard desk={desk} />
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <Gate path="/admin/analytics" title="Analytics">
      <Body />
    </Gate>
  );
}
