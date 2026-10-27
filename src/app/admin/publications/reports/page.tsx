import { Gate } from "@/components/hub/Gate";
import { DocumentManager } from "@/components/publications/DocumentManager";
import { documentDesk } from "@/lib/governance/server/documents";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const metadata = { title: "Reports & Insights" };

export default async function ReportsAndInsights() {
  const viewer = await getViewer();
  const desk = viewer && viewerCan(viewer, "posts", "view") ? await documentDesk(viewer, "report") : null;
  return (
    <Gate path="/admin/publications" title="Reports & Insights">
      {desk && <DocumentManager desk={desk} />}
    </Gate>
  );
}
