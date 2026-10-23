import UnitPage from "../../[slug]/page";
import { UnitDetailsModal } from "@/components/units/UnitDetailsModal";

export default function UnitModalPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <UnitDetailsModal>
      <UnitPage params={params} />
    </UnitDetailsModal>
  );
}
