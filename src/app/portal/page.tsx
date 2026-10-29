import { UnitDashboard } from "@/components/units/UnitDashboard";
import { SharedResources } from "@/components/units/SharedResources";
import { StudentDashboard } from "@/components/students/StudentDashboard";
import { filesForms } from "@/lib/forms/access";
import { portalContext } from "@/lib/governance/server/portal";
import { getViewer } from "@/lib/governance/server/session";
import { studentOverview } from "@/lib/governance/server/student-portal";

export async function generateMetadata() {
  const viewer = await getViewer();
  return { title: { absolute: `My dashboard · ${viewer?.portal.unitName ?? "Contributor workspace"} · UST Rankings Hub` } };
}

/** The contributor workspace's first page: a Student's dashboard (the Student Portal), a guest's shared resources, or the unit's. */
export default async function ContributorDashboard() {
  const viewer = await getViewer();
  if (viewer && filesForms(viewer.grants)) return <StudentDashboard viewer={viewer} data={await studentOverview(viewer)} />;
  const ctx = await portalContext();
  if (ctx.viewer.external) return <SharedResources />;
  return <UnitDashboard ctx={ctx} />;
}
