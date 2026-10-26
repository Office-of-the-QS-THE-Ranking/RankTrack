import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { clientHub } from "@/lib/governance/server/hub";
import { getSessionProblem, getViewer } from "@/lib/governance/server/session";

export const metadata: Metadata = {
  title: { default: "Contributor workspace", template: "%s · Contributor workspace · UST Rankings Hub" },
  robots: { index: false },
};

/** The contributor workspace shows the unit the account's role is scoped to. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) {
    const problem = await getSessionProblem();
    redirect(`/signin?next=/portal${problem ? `&ended=${problem}` : ""}`);
  }
  if (!viewer.workspaces.includes("portal")) redirect(viewer.workspaces.includes("office") ? "/admin" : "/signin?ended=no-access");
  return (
    <Shell variant="unit" viewer={viewer} hub={await clientHub(viewer, "unit")}>
      {children}
    </Shell>
  );
}
