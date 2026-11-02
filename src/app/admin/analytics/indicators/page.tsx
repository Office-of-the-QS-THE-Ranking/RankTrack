import { Gate } from "@/components/hub/Gate";
import { Indicators } from "@/components/analytics/Indicators";
import { EmptyState } from "@/components/analytics/parts";
import { PageHeader } from "@/components/ui/primitives";
import { indicatorsDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Indicators" };

async function Body({ edition }: { edition?: string }) {
  const desk = await indicatorsDesk((await getViewer())!, edition);
  return (
    <>
      <PageHeader title="Indicators" />
      {desk ? <Indicators desk={desk} /> : <EmptyState icon="layers" title="No editions yet">Import a methodology pack on the Methodology page.</EmptyState>}
    </>
  );
}

export default async function IndicatorsPage({ searchParams }: { searchParams: Promise<{ edition?: string }> }) {
  const { edition } = await searchParams;
  return (
    <Gate path="/admin/analytics/indicators" title="Indicators">
      <Body edition={edition} />
    </Gate>
  );
}
