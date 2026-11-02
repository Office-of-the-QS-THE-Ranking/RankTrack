import { Gate } from "@/components/hub/Gate";
import { Methodology } from "@/components/analytics/Methodology";
import { PageHeader } from "@/components/ui/primitives";
import { methodologyDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Methodology" };

async function Body({ edition }: { edition?: string }) {
  const desk = await methodologyDesk((await getViewer())!, edition);
  return (
    <>
      <PageHeader title="Methodology" />
      <Methodology desk={desk} />
    </>
  );
}

export default async function MethodologyPage({ searchParams }: { searchParams: Promise<{ edition?: string }> }) {
  const { edition } = await searchParams;
  return (
    <Gate path="/admin/analytics/methodology" title="Methodology">
      <Body edition={edition} />
    </Gate>
  );
}
