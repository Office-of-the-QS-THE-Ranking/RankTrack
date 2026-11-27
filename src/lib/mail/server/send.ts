import "server-only";

/*
 * Email from a template for something that happens outside the governance store's commands (a form response, which
 * lives in its own table). The template is still the Office's: switched off, or set to in-app only, nothing is sent.
 */
import { readState } from "@/lib/governance/server/store";
import { today } from "@/lib/governance/rbac";
import { resolveMail } from "../recipients";
import type { MailVars } from "../messages";
import { dispatchMail } from "./outbox";

export async function mailTemplate(templateId: string, to: { email: string; name?: string }[], vars: MailVars, href?: string, dedupe?: string) {
  try {
    const seen = new Set<string>();
    const people = to.filter((t) => t.email && !seen.has(t.email.toLowerCase()) && seen.add(t.email.toLowerCase()));
    if (!people.length) return;
    const state = await readState();
    dispatchMail(
      resolveMail(
        state,
        people.map((t) => ({ to: { email: t.email.toLowerCase(), name: t.name }, templateId, vars, href, dedupe })),
        "system",
        today(),
      ),
    );
  } catch (e) {
    // A receipt that can't be queued never fails what it is the receipt for.
    console.error(`Mail (${templateId}): ${(e as Error).message}`);
  }
}
