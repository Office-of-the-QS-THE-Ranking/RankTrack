import { Gate } from "@/components/hub/Gate";
import { Assignments } from "@/components/students/Assignments";
import { filesForms } from "@/lib/forms/access";
import { getViewer } from "@/lib/governance/server/session";
import { assignmentsOf } from "@/lib/governance/server/student-portal";

export const metadata = { title: "Assignments" };

/** The surveys assigned to a Student through the Student Portal, and which they answered. */
export default async function AssignmentsPage() {
  const viewer = await getViewer();
  const items = viewer && filesForms(viewer.grants) ? await assignmentsOf(viewer) : null;
  return <Gate path="/portal/assignments" title="Assignments">{items && <Assignments items={items} />}</Gate>;
}
