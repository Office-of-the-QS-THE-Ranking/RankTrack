import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { SubmitWizard } from "@/components/contribute/SubmitWizard";

export const metadata = { title: "Submit evidence" };

export default function Submit() {
  return (
    <Gate path="/portal/submit" title="Submit evidence">
      <PageHeader
        title="Submit evidence"
        lede="Nine short steps. Submit once: the Hub shows every ranking that can reuse it, and your unit is credited each time."
      />
      <SubmitWizard />
    </Gate>
  );
}
