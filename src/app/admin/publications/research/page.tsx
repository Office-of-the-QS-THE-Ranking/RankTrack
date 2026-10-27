import { Gate } from "@/components/hub/Gate";
import { DocumentManager } from "@/components/publications/DocumentManager";
import { documentDesk } from "@/lib/governance/server/documents";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Research Articles" };

export default async function ResearchArticles() {
  const viewer = await getViewer();
  const desk = viewer && viewerCan(viewer, "posts", "view") ? await documentDesk(viewer, "article") : null;
  return (
    <Gate path="/admin/publications" title="Research Articles">
      {desk && <DocumentManager desk={desk} />}
    </Gate>
  );
}
