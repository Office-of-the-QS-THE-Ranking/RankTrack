import { Gate } from "@/components/hub/Gate";
import { DocumentManager } from "@/components/publications/DocumentManager";
import { documentDesk } from "@/lib/governance/server/documents";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Research Articles" };

/** The unit's own research articles; each is published once the Rankings Office approves it. */
export default async function ResearchArticles() {
  const viewer = await getViewer();
  const desk = viewer && viewerCan(viewer, "posts", "view") ? await documentDesk(viewer, "article") : null;
  return (
    <Gate path="/portal/publications" title="Research Articles">
      {desk && <DocumentManager desk={desk} />}
    </Gate>
  );
}
