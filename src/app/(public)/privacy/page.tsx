import { PolicyPage } from "@/components/site/pages/PolicyPage";
import { policyContact } from "@/components/site/pages/policy-contact";
import { PORTAL_NAME } from "@/lib/brand";
import { policyLead, privacySections } from "@/components/site/pages/policy-text";

export const metadata = { title: "Data privacy notice" };

export default async function PublicPrivacy() {
  return <PolicyPage title="Data privacy notice" lead={policyLead(`What personal data the ${PORTAL_NAME} collects, why, who sees it, and your rights.`)} sections={privacySections(await policyContact())} />;
}
