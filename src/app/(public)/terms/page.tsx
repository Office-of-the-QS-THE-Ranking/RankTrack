import { PolicyPage } from "@/components/site/pages/PolicyPage";
import { policyContact } from "@/components/site/pages/policy-contact";
import { policyLead, termsSections } from "@/components/site/pages/policy-text";

export const metadata = { title: "Terms of use" };

export default async function PublicTerms() {
  return <PolicyPage title="Terms of use" lead={policyLead("The rules for using the UST Rankings Hub: its website, portal and AI assistant.")} sections={termsSections(await policyContact())} />;
}
