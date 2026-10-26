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
  { key: "submissions", label: "New submissions", hint: "Evidence, data and proposals sent to the Office", templates: ["tpl-submitted"] },
  { key: "reviews", label: "Review results", hint: "Evidence accepted or sent back for revision", templates: ["tpl-accepted", "tpl-revision"] },
  { key: "requests", label: "Request decisions", hint: "Approval requests approved or rejected", templates: ["tpl-decision"] },
  { key: "published", label: "Publications", hint: "Stories and posts that reach the public website", templates: ["tpl-published"] },
  { key: "deadlines", label: "Deadline reminders", hint: "Data collection that is about to close", templates: ["tpl-deadline"] },
  { key: "account", label: "Account and security", hint: "Invitations, suspensions and privacy requests", templates: ["tpl-invite", "tpl-suspended"], required: true },
];

/** Stored per account: whether email is on, and the kind:channel pairs switched off. */
export interface NotifyPrefs {
  email?: boolean;
  off?: string[];
}

export const prefKey = (kind: string, channel: NotifyChannel) => `${kind}:${channel}`;

const VALID = new Set(NOTIFY_KINDS.filter((k) => !k.required).flatMap((k) => [prefKey(k.key, "hub"), prefKey(k.key, "email")]));

export const validPrefKey = (s: unknown): s is string => typeof s === "string" && VALID.has(s);

/** Whether a notification from this template should reach the person on this channel. */
export function wantsNotice(prefs: NotifyPrefs | undefined, templateId: string | undefined, channel: NotifyChannel) {
  if (channel === "email" && !prefs?.email) return false;
  const kind = templateId ? NOTIFY_KINDS.find((k) => k.templates.includes(templateId)) : undefined;
  if (!kind || kind.required) return true;
  return !prefs?.off?.includes(prefKey(kind.key, channel));
}
