import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { SubmitData } from "@/components/contribute/SubmitData";

export const metadata = { title: "Submit data" };

export default function SubmitDataPage() {
  return (
    <Gate path="/portal/data" title="Submit data">
      <PageHeader title="Submit data" lede="Enter the reporting-period values your unit owns. Each value needs its source so reviewers can confirm it." />
      <SubmitData />
    </Gate>
  );
}
