import { Gate } from "@/components/hub/Gate";
import { RankingsOverview } from "@/components/rankings/Overview";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Positions" };

async function Body() {
  const [h, viewer] = await Promise.all([hub(), getViewer()]);
  return (
    <div className="ov-rankings">
      <RankingsOverview mode="internal" embedded rankings={h.rankings} evidence={h.evidence.filter((e) => viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }))} />
    </div>
  );
}

export default function PositionsPage() {
  return (
    <Gate path="/admin/rankings/positions" title="Positions">
      <Body />
    </Gate>
  );
}
