import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { Knowledge } from "@/components/knowledge/Knowledge";

export const metadata = { title: "Knowledge Center" };

export default function KnowledgePage() {
  return (
    <Gate path="/portal/knowledge" title="Knowledge Center">
      <PageHeader
        title="Knowledge and Methodology Center"
        lede="Search one indicator and see every ranking it touches. Evidence standards, templates and training sit beside it."
      />
      <Suspense>
        <Knowledge mode="internal" />
      </Suspense>
    </Gate>
  );
}
