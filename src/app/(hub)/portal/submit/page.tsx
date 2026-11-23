import { Gate } from "@/components/hub/Gate";
import { MySubmissions } from "@/components/contributions/MySubmissions";
import { submittedRows } from "@/lib/governance/portal-build";
import { portalContext } from "@/lib/governance/server/portal";

export const metadata = { title: "Submit evidence" };

export default async function Submit() {
  const ctx = await portalContext();
  return (
    <Gate path="/portal/submit" title="Submit evidence">
      <MySubmissions rows={submittedRows(ctx)} canSubmit={ctx.can.submit && ctx.unit.status === "Active"} note={ctx.scopeNote} />
    </Gate>
  );
}
