import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { ProposeInnovation } from "@/components/contribute/ProposeInnovation";

export const metadata = { title: "Propose an innovation" };

export default function ProposeInnovationPage() {
  return (
    <Gate path="/portal/innovation" title="Propose an innovation">
      <PageHeader
        title="Propose an innovation"
        lede="Promising programmes enter the WURI innovation pipeline, where the Office helps develop the evidence for a future submission."
      />
      <ProposeInnovation />
    </Gate>
  );
}
