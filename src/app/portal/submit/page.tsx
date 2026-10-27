import { Gate } from "@/components/hub/Gate";
import { MySubmissions } from "@/components/contributions/MySubmissions";
import { portalContext } from "@/lib/governance/server/portal";

export const metadata = { title: "Submit evidence" };

export default async function Submit() {
  const ctx = await portalContext();
  // What the unit has sent, newest first.
  const rows = ctx.evidence
    .filter((e) => e.status !== "Not yet submitted" && e.status !== "Not applicable")
    .sort((a, b) => b.submitted.localeCompare(a.submitted) || b.id.localeCompare(a.id));
  return (
    <Gate path="/portal/submit" title="Submit evidence">
      <MySubmissions rows={rows} canSubmit={ctx.can.submit && ctx.unit.status === "Active"} note={ctx.scopeNote} />
    </Gate>
  );
}
