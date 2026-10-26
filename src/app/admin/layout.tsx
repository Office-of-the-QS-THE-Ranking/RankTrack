import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { clientHub } from "@/lib/governance/server/hub";
import { getSessionProblem, getViewer } from "@/lib/governance/server/session";

export const metadata: Metadata = {
  title: { default: "Executive dashboard", template: "%s · Office workspace · UST Rankings Hub" },
  robots: { index: false },
};

/** The Office workspace opens only for a signed-in account whose roles include the executive dashboard. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) {
    const problem = await getSessionProblem();
    redirect(`/signin?next=/admin${problem ? `&ended=${problem}` : ""}`);
  }
  if (!viewer.workspaces.includes("office")) redirect(viewer.workspaces.includes("portal") ? "/portal" : "/signin?ended=no-access");
  return (
    <Shell variant="office" viewer={viewer} hub={await clientHub(viewer, "office")}>
      {children}
    </Shell>
  );
}
