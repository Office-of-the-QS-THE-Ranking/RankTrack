import "server-only";

import { reference } from "@/lib/governance/server/reference";

/** The Office's mailbox and street address for an email's footer; nothing when the reference data can't be read. */
export async function officeContact(): Promise<{ email?: string; address?: string }> {
  try {
    const { office } = await reference();
    const address = [office.street, office.city].map((s) => s?.trim()).filter(Boolean).join(", ");
    return { ...(office.email && { email: office.email }), ...(address && { address }) };
  } catch {
    return {};
  }
}
