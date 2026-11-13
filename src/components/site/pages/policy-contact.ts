import "server-only";

import { hub } from "@/lib/governance/server/hub";
import { serverViews } from "@/lib/governance/server/views";
import type { PolicyContact } from "./policy-text";

/** Who the policy pages name, from the Office's profile and the privacy settings in Command & Control › Privacy & Security. */
export async function policyContact(): Promise<PolicyContact> {
  const [{ office }, h] = await Promise.all([serverViews(), hub()]);
  const { officer, email, breachHours } = h.state.security.privacy;
  return { officeName: office.name, officeEmail: office.email, officer, officerEmail: email, breachHours, address: [office.location, office.street, office.city].filter(Boolean).join(", ") };
}
