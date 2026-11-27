import "server-only";

/*
 * The mail connection: which provider, the sender, and the key. The key is pasted on System Configuration › Email,
 * kept encrypted (AES-256-GCM, sealed with HUB_VERIFY_SECRET or SUPABASE_SECRET_KEY, as the assistant's keys are)
 * and opened only here, on the way to the provider. Change that secret and the saved key can't be opened: connect
 * the provider again.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { PORTAL_NAME } from "@/lib/brand";
import type { Database } from "@/lib/supabase/database.types";
import { adminDb } from "@/lib/supabase/server";
import { isMailProvider, type ConnectionStatus, type MailConnection, type MailProvider } from "../types";

export type SettingsRow = Database["public"]["Tables"]["mail_settings"]["Row"];

function secret() {
  const value = process.env.HUB_VERIFY_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("HUB_VERIFY_SECRET (or SUPABASE_SECRET_KEY) is not set: the mail key can't be encrypted.");
  return createHmac("sha256", "hub-mail-keys").update(value).digest();
}

export function sealSecret(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret(), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(sealed: string | null | undefined) {
  if (!sealed) return null;
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", secret(), iv!);
    d.setAuthTag(tag!);
    return Buffer.concat([d.update(body!), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Everything a provider needs to send: who it is, the opened key, and the sender. */
export interface Transport {
  provider: MailProvider;
  secret: string;
  smtp?: { host: string; port: number; user: string };
  from: { name: string; email: string };
  replyTo?: string;
}

export async function readMailSettings(): Promise<SettingsRow | null> {
  const { data, error } = await adminDb().from("mail_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Mail settings: ${error.message}`);
  return data;
}

/** The saved connection, opened, or why there is none to send with. */
export function transportOf(row: SettingsRow | null): Transport | { problem: string } {
  if (!row || !isMailProvider(row.provider) || !row.from_email) return { problem: "No email provider is connected." };
  const key = openSecret(row.secret_sealed);
  if (!key) return { problem: "The saved email key can't be opened. Connect the provider again." };
  if (row.provider === "smtp" && (!row.smtp_host || !row.smtp_port || !row.smtp_user)) return { problem: "The mail server's address is incomplete." };
  return {
    provider: row.provider,
    secret: key,
    ...(row.provider === "smtp" && { smtp: { host: row.smtp_host!, port: row.smtp_port!, user: row.smtp_user! } }),
    from: { name: row.from_name || PORTAL_NAME, email: row.from_email },
    ...(row.reply_to && { replyTo: row.reply_to }),
  };
}

/** Why nothing may be sent right now, or null when the Hub is connected and sending is on. */
export function holdReason(row: SettingsRow | null): string | null {
  const transport = transportOf(row);
  if ("problem" in transport) return transport.problem;
  if (!row?.sending) return "Sending is switched off.";
  return null;
}

/** The connection as the Email tab shows it: never the key. */
export function connectionOf(row: SettingsRow | null): MailConnection {
  const provider = row && isMailProvider(row.provider) ? row.provider : null;
  return {
    sending: !!row?.sending,
    provider,
    status: (provider ? (row?.status as ConnectionStatus) : "disconnected") ?? "disconnected",
    statusAt: row?.status_at ?? null,
    lastError: row?.last_error ?? null,
    secretHint: row?.secret_hint ?? null,
    smtpHost: row?.smtp_host ?? null,
    smtpPort: row?.smtp_port ?? null,
    smtpUser: row?.smtp_user ?? null,
    fromName: row?.from_name ?? PORTAL_NAME,
    fromEmail: row?.from_email ?? null,
    replyTo: row?.reply_to ?? null,
    connectedBy: row?.connected_by ?? null,
    connectedAt: row?.connected_at ?? null,
    hourlyLimit: row?.hourly_limit ?? 30,
    retentionDays: row?.retention_days ?? 90,
  };
}

/** Record how the provider answered: ok once a message is accepted, failing when it refuses the key or the sender. */
export async function markConnection(status: "ok" | "failing", error?: string) {
  const { error: failed } = await adminDb()
    .from("mail_settings")
    .update({ status, status_at: new Date().toISOString(), last_error: status === "ok" ? null : (error ?? "The provider refused the message.").slice(0, 300) })
    .eq("id", 1)
    .neq("status", "disconnected");
  if (failed) console.error(`Mail settings: ${failed.message}`);
}
