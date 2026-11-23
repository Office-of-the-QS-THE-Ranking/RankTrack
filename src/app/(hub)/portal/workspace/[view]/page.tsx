import { notFound, redirect } from "next/navigation";
import { Gate } from "@/components/hub/Gate";
import { DigitalForms } from "@/components/forms/DigitalForms";
import { Workspace } from "@/components/workspace/Workspace";
import { WorkingDocs } from "@/components/workspace/WorkingDocs";
import { formsDesk } from "@/lib/governance/server/forms";
import { getViewer } from "@/lib/governance/server/session";
import { workingDesk, workspaceDesk } from "@/lib/governance/server/workspace";
import { viewerCan } from "@/lib/governance/viewer";
import { workspaceViewLabel, workspaceViews, type WorkspaceView } from "@/lib/governance/workspace";

type Props = { params: Promise<{ view: string }> };

const viewOf = (v: string) => workspaceViews(false).find((x) => x === v) as WorkspaceView | undefined;

export async function generateMetadata({ params }: Props) {
  const view = viewOf((await params).view);
  return { title: view ? workspaceViewLabel(view) : "Workspace" };
}

/** One page of the unit's Workspace, as the sidebar opens it: a shelf, Digital Forms, or Archives. */
export default async function WorkspaceShelfPage({ params }: Props) {
  const asked = (await params).view;
  // Templates & Forms became Digital Forms.
  if (asked === "templates") redirect("/portal/workspace/forms");
  const view = viewOf(asked);
  if (!view) notFound();
  const viewer = await getViewer();
  const unitId = viewer ? (viewer.portal.programId ?? viewer.portal.unitId) : "";
  const sees = !!viewer && viewerCan(viewer, "evidence", "view", { unitId });
  // Working Documents are links; Digital Forms are forms with their responses; the rest hold uploaded files.
  const working = sees && view === "working" ? await workingDesk(viewer) : null;
  const forms = sees && view === "forms" ? await formsDesk(viewer, "unit") : null;
  const desk = sees && view !== "working" && view !== "forms" ? await workspaceDesk(viewer) : null;
  return (
    <Gate path={`/portal/workspace/${view}`} title="Workspace">
      {working && <WorkingDocs desk={working} />}
      {forms && <DigitalForms desk={forms} />}
      {desk && view !== "forms" && <Workspace key={view} desk={desk} view={view} />}
    </Gate>
  );
}
