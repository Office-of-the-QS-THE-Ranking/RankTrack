import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { Feedback } from "@/components/contributions/Feedback";

export const metadata = { title: "Validation comments" };

export default function FeedbackPage() {
  return (
    <Gate path="/portal/feedback" title="Validation comments">
      <PageHeader
        title="Validation comments"
        lede="Reviewers say exactly what to change. Reply here and attach a corrected file; the item returns to the queue straight away."
      />
      <Feedback />
    </Gate>
  );
}
