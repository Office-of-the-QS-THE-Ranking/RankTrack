/*
 * Automatic email, as the browser sees it: the providers the Office may connect, and what the Email tab shows. Keys
 * and message bodies never come this way.
 */

export type MailProvider = "resend" | "brevo" | "sendgrid" | "smtp";

export interface ProviderInfo {
  label: string;
  /** What the secret is called where the provider issues it. */
  secret: string;
  /** Where to get it, in a few words. */
  where: string;
  placeholder: string;
}

export const MAIL_PROVIDERS: Record<MailProvider, ProviderInfo> = {
  smtp: { label: "SMTP", secret: "Password", where: "Google Workspace or Outlook: an app password for the sending mailbox", placeholder: "App password" },
  resend: { label: "Resend", secret: "API key", where: "resend.com › API Keys", placeholder: "re_…" },
  brevo: { label: "Brevo", secret: "API key", where: "Brevo › SMTP & API › API Keys", placeholder: "xkeysib-…" },
  sendgrid: { label: "SendGrid", secret: "API key", where: "SendGrid › Settings › API Keys (Mail Send)", placeholder: "SG.…" },
};

export const MAIL_PROVIDER_IDS = Object.keys(MAIL_PROVIDERS) as MailProvider[];

export const isMailProvider = (v: unknown): v is MailProvider => typeof v === "string" && v in MAIL_PROVIDERS;

/** The ports a mail server takes submissions on: 465 wraps the connection in TLS, the others upgrade to it. */
export const SMTP_PORTS = [587, 465, 2525, 25] as const;

export type MailStatus = "queued" | "sending" | "sent" | "failed" | "skipped";

export type ConnectionStatus = "disconnected" | "ok" | "failing";

export interface MailConnection {
  /** The master switch: off, messages are recorded but never leave. */
  sending: boolean;
  provider: MailProvider | null;
  status: ConnectionStatus;
  statusAt: string | null;
  lastError: string | null;
  /** The last characters of the saved key, to tell which one it is. */
  secretHint: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  fromName: string;
  fromEmail: string | null;
  replyTo: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
  hourlyLimit: number;
  retentionDays: number;
}

export interface MailRow {
  id: string;
  at: string;
  templateId: string;
  label: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: MailStatus;
  attempts: number;
  sentAt: string | null;
  /** When it is tried again, while it waits. */
  nextAt: string | null;
  provider: string | null;
  providerRef: string | null;
  note: string | null;
}

export interface MailSummary {
  sent: number;
  waiting: number;
  failed: number;
  skipped: number;
  /** Manila days with messages, oldest first. */
  days: { day: string; sent: number; other: number }[];
}

export interface MailDesk {
  now: string;
  connection: MailConnection;
  summary: MailSummary;
  recent: MailRow[];
  /** The Hub's public address, which the arms in every message are loaded from. */
  origin: string | null;
  office: { email?: string; address?: string };
  /** The viewer's own address: where a test goes. */
  testTo: string;
  canEdit: boolean;
  canManage: boolean;
}

export type MailResult = { ok: true; message: string; data: MailDesk } | { ok: false; message: string };

/** What the Email tab's connect form sends. A blank secret keeps the saved one. */
export interface ConnectInput {
  provider: unknown;
  secret: unknown;
  smtpHost?: unknown;
  smtpPort?: unknown;
  smtpUser?: unknown;
  fromName: unknown;
  fromEmail: unknown;
  replyTo?: unknown;
}

export const STATUS_LABEL: Record<MailStatus, string> = { queued: "Waiting", sending: "Sending", sent: "Sent", failed: "Failed", skipped: "Not sent" };
