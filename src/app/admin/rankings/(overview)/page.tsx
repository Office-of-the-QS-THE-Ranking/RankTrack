import { Gate } from "@/components/hub/Gate";
import { Scorecard } from "@/components/analytics/Scorecard";
import { scorecardDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Rankings" };

async function Body() {
  return <Scorecard desk={await scorecardDesk((await getViewer())!)} />;
}

/** The overview's first tab: each edition the Office is collecting for, its open data requests and its action items. */
export default function RankingsPage() {
  return (
    <Gate path="/admin/rankings" title="Rankings">
      <Body />
    </Gate>
  );
}
