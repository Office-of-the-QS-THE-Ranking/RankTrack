import { Gate } from "@/components/hub/Gate";
import { DigitalForms } from "@/components/forms/DigitalForms";
import { filesForms } from "@/lib/forms/access";
import { formsDesk } from "@/lib/governance/server/forms";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Evaluation Forms" };

/** A Student's own Evaluation Forms, built with the Forms Builder; fixed once published, their responses reach the Office. */
export default async function EvaluationsPage() {
  const viewer = await getViewer();
  const desk = viewer && filesForms(viewer.grants) ? await formsDesk(viewer, { own: "evaluation" }) : null;
  return <Gate path="/portal/evaluations" title="Evaluation Forms">{desk && <DigitalForms desk={desk} kind="evaluation" title="Evaluation Forms" />}</Gate>;
}
