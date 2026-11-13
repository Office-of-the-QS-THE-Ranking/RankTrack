import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { KnowledgeBase } from "@/components/knowledge-base/KnowledgeBase";

export const metadata = { title: "Knowledge Base" };

export default function KnowledgeBasePage() {
  return (
    <Gate path="/portal/knowledge-base" title="Knowledge Base">
      <PageHeader title="Knowledge Base" />
      <Suspense>
        <KnowledgeBase />
      </Suspense>
    </Gate>
  );
}
