/**
 * What a person can choose to be notified about, and where: in the Hub (the bell) or by email. Each kind groups
 * the notification templates it covers. Account and security notices always reach the person.
 */

export type NotifyChannel = "hub" | "email";

export interface NotifyKind {
  key: string;
  label: string;
  hint: string;
  templates: string[];
  /** Always delivered; shown as on and locked. */
  required?: boolean;
}

export const NOTIFY_KINDS: NotifyKind[] = [
  { key: "submissions", label: "New submissions", hint: "Evidence, data and proposals sent to the Office, and the receipt for your own", templates: ["tpl-submitted", "tpl-receipt", "tpl-data-sent"] },
  { key: "reviews", label: "Review results", hint: "Evidence and data accepted or sent back for revision", templates: ["tpl-accepted", "tpl-revision", "tpl-data-returned", "tpl-data-thanks"] },
  { key: "requests", label: "Request decisions", hint: "Approval requests approved or rejected", templates: ["tpl-decision"] },
  { key: "published", label: "Publications", hint: "Stories and posts that reach the public website", templates: ["tpl-published"] },
  {
    key: "deadlines",
    label: "Deadlines",
    hint: "Data requests and their reminders, data collection about to close, and new dates found on the ranking bodies' websites",
    templates: ["tpl-deadline", "tpl-deadline-found", "tpl-data-request", "tpl-data-reminder", "tpl-data-escalated"],
  },
  {
    key: "account",
    label: "Account and security",
    hint: "Invitations, suspensions, privacy requests and receipts for what you send",
    templates: ["tpl-invite", "tpl-suspended", "tpl-access-received", "tpl-access-approved", "tpl-access-declined", "tpl-form-receipt"],
    required: true,
  },
];

/** Stored per account: email is on unless it was switched off (email: false), and the kind:channel pairs switched off. */
export interface NotifyPrefs {
  email?: boolean;
  off?: string[];
}

/** Whether the person takes notifications by email at all: yes, until they switch it off. */
export const emailOn = (prefs: NotifyPrefs | undefined) => prefs?.email !== false;

export const prefKey = (kind: string, channel: NotifyChannel) => `${kind}:${channel}`;

const VALID = new Set(NOTIFY_KINDS.filter((k) => !k.required).flatMap((k) => [prefKey(k.key, "hub"), prefKey(k.key, "email")]));

export const validPrefKey = (s: unknown): s is string => typeof s === "string" && VALID.has(s);

/** Whether a notification from this template should reach the person on this channel. */
export function wantsNotice(prefs: NotifyPrefs | undefined, templateId: string | undefined, channel: NotifyChannel) {
  const kind = templateId ? NOTIFY_KINDS.find((k) => k.templates.includes(templateId)) : undefined;
  if (kind?.required) return true;
  if (channel === "email" && !emailOn(prefs)) return false;
  if (!kind) return true;
  return !prefs?.off?.includes(prefKey(kind.key, channel));
}
