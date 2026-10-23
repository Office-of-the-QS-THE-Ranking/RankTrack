import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/primitives";
import { InfoTooltip } from "@/components/ui/interactive";
import { ImpactLibrary } from "@/components/impact/ImpactLibrary";
import { Gate } from "@/components/hub/Gate";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Impact and Innovation" };

export default async function Impact() {
  const viewer = await getViewer();
  const propose = !!viewer && viewer.workspaces.includes("portal") && viewerCan(viewer, "stories", "create") && hub().feature("story-proposals");
  return (
    <Gate path="/admin/impact" title="Impact and Innovation">
      <PageHeader
        title={
          <span className="row" style={{ gap: 8 }}>
            Impact and Innovation
            <InfoTooltip label="Story structure and publication guidance">
              <span style={{ display: "block", width: 320, maxWidth: "calc(100vw - 56px)", fontWeight: 400 }}>
                Every story follows one structure: challenge, Thomasian response, implementation, measurable outcome, beneficiaries, SDG and ranking alignment, and replication guidance. Only stories approved through the publication workflow reach the public site.
              </span>
            </InfoTooltip>
          </span>
        }
        actions={
          <>
            <Link href="/impact" className="btn">
              <Icon name="eye" size={18} /> Public view
            </Link>
            {propose && (
              <Link href="/portal/story" className="btn btn--primary">
                <Icon name="pen" size={18} /> Propose a story
              </Link>
            )}
          </>
        }
      />
      <ImpactLibrary mode="internal" />
    </Gate>
  );
}
