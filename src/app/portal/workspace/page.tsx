import { redirect } from "next/navigation";
import { workspaceSubnav, NAV } from "@/components/shell/nav";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

/** The Workspace opens on the first page the viewer may use (the Knowledge Center for someone without the shelves); the sidebar lists the rest. */
export default async function WorkspacePage() {
  const viewer = await getViewer();
  const target = viewer ? { unitId: viewer.portal.programId ?? viewer.portal.unitId } : {};
  const pages = workspaceSubnav(NAV.unit.flatMap((g) => g.items).find((i) => i.workspace)!.workspace!);
  redirect((pages.find((p) => viewer && viewerCan(viewer, p.need[0], p.need[1], target)) ?? pages[0]).href);
}
