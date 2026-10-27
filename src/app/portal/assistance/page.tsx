import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { RequestAssistance } from "@/components/contributions/RequestAssistance";

export const metadata = { title: "Request assistance" };

export default function AssistancePage() {
  return (
    <Gate path="/portal/assistance" title="Request assistance">
      <PageHeader title="Request assistance" lede="Ask the Office about a requirement, an evidence standard or a technical problem. You will hear back within two working days." />
      <RequestAssistance />
    </Gate>
  );
}
