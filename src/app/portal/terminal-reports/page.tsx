import { Gate } from "@/components/hub/Gate";
import { CopyDesk } from "@/components/students/CopyDesk";
import { filesForms } from "@/lib/forms/access";
import { getViewer } from "@/lib/governance/server/session";
import { copyDesk } from "@/lib/governance/server/student-portal";

export const metadata = { title: "Terminal Reports" };

/** A Student's terminal reports: copies of the terminal report forms the Office published to the Student Portal. */
export default async function TerminalReportsPage() {
  const viewer = await getViewer();
  const desk = viewer && filesForms(viewer.grants) ? await copyDesk(viewer, "terminal-report") : null;
  return <Gate path="/portal/terminal-reports" title="Terminal Reports">{desk && <CopyDesk desk={desk} />}</Gate>;
}
