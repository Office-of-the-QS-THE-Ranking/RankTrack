/*
 * Who an email goes to. A command asks for one the way it posts a notice (engine/core.ts notify and emailTo): to an
 * account, to "office", to "unit:<id>", or to one address. Here that becomes people: whoever would see the notice in
 * their bell, if their account is active and they take that kind of email. Whoever caused the event isn't emailed
 * about their own action when it goes to a group. Pure: it reads the state the command just changed.
 */
import { noticeVisible } from "@/lib/governance/engine";
import type { MailIntent } from "@/lib/governance/engine/core";
import { wantsNotice } from "@/lib/governance/notification-prefs";
import { actingGrants } from "@/lib/governance/rbac";
import type { GovernanceState } from "@/lib/governance/types";
import { isDirect, isRequired, type MailVars } from "./messages";

/** One email to one person, ready to be set in the layout and queued. */
export interface MailJob {
  templateId: string;
  /** The template's name, for the Email tab's list. */
  label: string;
  toEmail: string;
  toName?: string;
  /** The recipient's account, when they have one. */
  accountId?: string;
  /** The template's subject and body as the Office wrote them. */
  subject: string;
  body: string;
  vars: MailVars;
  href?: string;
  required: boolean;
  dedupe?: string;
}

/** The most people one event may email: a group this large gets the notice in the Hub only past the cap. */
export const MAX_RECIPIENTS = 200;

export function resolveMail(state: GovernanceState, intents: MailIntent[], actorId: string, day: string): MailJob[] {
  const jobs: MailJob[] = [];
  const seen = new Set<string>();
  for (const intent of intents) {
    const t = state.config.templates.find((x) => x.id === intent.templateId);
    if (!t?.enabled || t.channel === "In-app") continue;
    const base = { templateId: t.id, label: t.name, subject: t.subject, body: t.body, vars: intent.vars, href: intent.href, required: isRequired(t.id) };
    const add = (toEmail: string, toName: string | undefined, accountId: string | undefined) => {
      const email = toEmail.trim().toLowerCase();
      // one event reaches a person once, however many of their roles it was addressed to
      const key = `${t.id}|${email}|${intent.dedupe ?? JSON.stringify(intent.vars)}|${intent.href ?? ""}`;
      if (seen.has(key) || jobs.length >= MAX_RECIPIENTS) return;
      seen.add(key);
      jobs.push({ ...base, toEmail: email, toName, accountId, dedupe: intent.dedupe ? `${intent.dedupe}|${email}` : undefined });
    };
    if (typeof intent.to !== "string") {
      const address = intent.to;
      add(address.email, address.name, state.accounts.find((a) => a.email.toLowerCase() === address.email.toLowerCase())?.id);
      continue;
    }
    // a template that answers someone with no account never fans out to a group
    if (isDirect(t.id)) continue;
    const to = intent.to;
    const one = state.accounts.find((a) => a.id === to);
    if (one) {
      // sent to them by name: an invitation reaches a pending account, a suspension a suspended one
      if (one.status !== "Deactivated" && wantsNotice(one.notifyPrefs, t.id, "email")) add(one.email, one.name, one.id);
      continue;
    }
    for (const a of state.accounts) {
      if (a.status !== "Active" || a.id === actorId) continue;
      if (!wantsNotice(a.notifyPrefs, t.id, "email")) continue;
      if (!noticeVisible(to, a.id, actingGrants(a, state.units, day, state.config.rolePermissions))) continue;
      add(a.email, a.name, a.id);
    }
  }
  return jobs;
}
