import { redirect } from "next/navigation";
import { workspaceSubnav, NAV } from "@/components/shell/nav";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

/** The Office's Workspace opens on the first page the viewer may use; the sidebar lists the rest. */
export default async function OfficeWorkspacePage() {
  const viewer = await getViewer();
  const pages = workspaceSubnav(NAV.office.flatMap((g) => g.items).find((i) => i.workspace)!.workspace!);
  redirect((pages.find((p) => viewer && viewerCan(viewer, p.need[0], p.need[1])) ?? pages[0]).href);
}
