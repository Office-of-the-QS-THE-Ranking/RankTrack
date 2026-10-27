import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { Knowledge } from "@/components/knowledge/Knowledge";

export const metadata = { title: "Knowledge Center" };

export default function KnowledgePage() {
  return (
    <Gate path="/portal/knowledge" title="Knowledge Center">
      <PageHeader title="Knowledge Center" />
      <Suspense>
        <Knowledge />
      </Suspense>
    </Gate>
  );
}
