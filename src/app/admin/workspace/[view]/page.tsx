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

const viewOf = (v: string) => workspaceViews(true).find((x) => x === v) as WorkspaceView | undefined;

export async function generateMetadata({ params }: Props) {
  const view = viewOf((await params).view);
  return { title: view ? workspaceViewLabel(view) : "Workspace" };
}

/** The Office's Working Documents, its Digital Forms, its shared library (which every unit's Workspace shows), or Archives. */
export default async function OfficeWorkspaceShelfPage({ params }: Props) {
  const asked = (await params).view;
  // Templates & Forms became Digital Forms.
  if (asked === "templates") redirect("/admin/workspace/forms");
  const view = viewOf(asked);
  if (!view) notFound();
  const viewer = await getViewer();
  const may = !!viewer && viewerCan(viewer, "knowledge", "edit");
  // The Office's Working Documents are links and its forms are Digital Forms; its other shelves hold the files every unit sees.
  const working = may && view === "working" ? await workingDesk(viewer, true) : null;
  const forms = may && view === "forms" ? await formsDesk(viewer, true) : null;
  const desk = may && view !== "working" && view !== "forms" ? await workspaceDesk(viewer, true) : null;
  return (
    <Gate path={`/admin/workspace/${view}`} title="Workspace">
      {working && <WorkingDocs desk={working} />}
      {forms && <DigitalForms desk={forms} />}
      {desk && view !== "forms" && <Workspace key={view} desk={desk} view={view} />}
    </Gate>
  );
}
