import "server-only";

/*
 * What a contributor-workspace page needs: the signed-in viewer, the unit the workspace shows, and that unit's
 * records within the viewer's organizational scope (built by ../portal-build.ts).
 */
import { redirect } from "next/navigation";
import { portalContextFrom } from "../portal-build";
import { hub } from "./hub";
import { getViewer } from "./session";

export type { PortalContext } from "../portal-build";

export async function portalContext() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?next=/portal");
  return portalContextFrom(await hub(), viewer);
}
