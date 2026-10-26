import { PageHeader } from "@/components/ui/primitives";
import { InfoTooltip } from "@/components/ui/interactive";
import { Gate } from "@/components/hub/Gate";
import { UnitParticipation } from "@/components/units/UnitParticipation";
import { hub } from "@/lib/governance/server/hub";

export const metadata = { title: "Units" };

export default async function Units() {
  const h = await hub();
  return (
    <Gate path="/admin/units" title="Unit participation">
      <PageHeader
        title={
          <span className="row" style={{ gap: 8 }}>
            Unit participation
            <InfoTooltip label="Unit participation guidance">
              <span style={{ display: "block", width: 320, maxWidth: "calc(100vw - 56px)", fontWeight: 400 }}>
                Submissions shows units alphabetically with their completion and review status. Rankings shows each category’s leaderboard, ordered by validated evidence, rankings served and completion.
              </span>
            </InfoTooltip>
          </span>
        }
      />
      <UnitParticipation units={h.units} />
    </Gate>
  );
}
