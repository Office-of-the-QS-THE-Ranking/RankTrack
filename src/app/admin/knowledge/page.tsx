import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { Knowledge } from "@/components/knowledge/Knowledge";

import { Gate } from "@/components/hub/Gate";

export const metadata = { title: "Knowledge Center" };

export default function KnowledgePage() {
  return (
    <Gate path="/admin/knowledge" title="Knowledge Center">
      <PageHeader
        title="Knowledge and Methodology Center"
        lede="Search one indicator and see every ranking it touches. Methodologies, evidence standards, calendars, templates and training sit beside it."
      />
      <Suspense>
        <Knowledge mode="internal" />
      </Suspense>
    </Gate>
  );
}
