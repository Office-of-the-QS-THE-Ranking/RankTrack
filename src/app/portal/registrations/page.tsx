import { Gate } from "@/components/hub/Gate";
import { DigitalForms } from "@/components/forms/DigitalForms";
import { filesForms } from "@/lib/forms/access";
import { formsDesk } from "@/lib/governance/server/forms";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Registrations" };

/** A Student's own Registration Forms, built with the Forms Builder; fixed once published, their responses reach the Office. */
export default async function RegistrationsPage() {
  const viewer = await getViewer();
  const desk = viewer && filesForms(viewer.grants) ? await formsDesk(viewer, { own: "registration" }) : null;
  return <Gate path="/portal/registrations" title="Registrations">{desk && <DigitalForms desk={desk} kind="registration" title="Registrations" />}</Gate>;
}
