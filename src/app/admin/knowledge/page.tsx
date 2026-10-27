import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { Knowledge } from "@/components/knowledge/Knowledge";

import { Gate } from "@/components/hub/Gate";

export const metadata = { title: "Knowledge Center" };

export default function KnowledgePage() {
  return (
    <Gate path="/admin/knowledge" title="Knowledge Center">
      <PageHeader title="Knowledge Center" />
      <Suspense>
        <Knowledge />
      </Suspense>
    </Gate>
  );
}
