import { PolicyPage } from "@/components/site/pages/PolicyPage";
import { policyContact } from "@/components/site/pages/policy-contact";
import { PORTAL_NAME } from "@/lib/brand";
import { policyLead, termsSections } from "@/components/site/pages/policy-text";

export const metadata = { title: "Terms of use" };

export default async function PublicTerms() {
  return <PolicyPage title="Terms of use" lead={policyLead(`The rules for using the ${PORTAL_NAME}: its website, portal and AI assistant.`)} sections={termsSections(await policyContact())} />;
}
