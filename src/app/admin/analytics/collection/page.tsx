import { Gate } from "@/components/hub/Gate";
import { Collection } from "@/components/analytics/Collection";
import { PageHeader } from "@/components/ui/primitives";
import { collectionDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Data requests" };

async function Body() {
  const desk = await collectionDesk((await getViewer())!);
  return (
    <>
      <PageHeader title="Data requests" />
      <Collection desk={desk} />
    </>
  );
}

export default function CollectionPage() {
  return (
    <Gate path="/admin/analytics/collection" title="Data requests">
      <Body />
    </Gate>
  );
}
