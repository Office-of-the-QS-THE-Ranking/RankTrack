"use server";

/*
 * System Configuration › Email: the mail connection, the master switch, tests and retries. Seeing the tab needs System
 * configuration (view); the switch, tests and retries need edit; the provider, its key and the sender need manage.
 * Every change is audited, never with the key in it. A provider counts as connected only after it has accepted a
 * test message to the person connecting it.
 */
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { audit, BUSY, ENDED, fail } from "@/lib/analytics/server/guard";
import { PORTAL_NAME } from "@/lib/brand";
import { isEmail } from "@/lib/governance/engine/core";
import { allowAccount } from "@/lib/governance/server/limits";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { renderEmail } from "@/lib/mail/layout";
import { mailDesk } from "@/lib/mail/server/desk";
import { officeContact } from "@/lib/mail/server/office";
import { publicOrigin } from "@/lib/mail/server/origin";
import { drainMail, holdWaiting, retryFailed } from "@/lib/mail/server/outbox";
import { deliver } from "@/lib/mail/server/providers";
import { markConnection, openSecret, readMailSettings, sealSecret, transportOf, type Transport } from "@/lib/mail/server/settings";
import { isMailProvider, MAIL_PROVIDERS, SMTP_PORTS, type ConnectInput, type MailProvider, type MailResult } from "@/lib/mail/types";
import { adminDb } from "@/lib/supabase/server";

const SETTING = { type: "Setting", id: "mail", label: "Email" };
const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

async function who(level: "view" | "edit" | "manage"): Promise<Viewer | { ok: false; message: string }> {
  const viewer = await getViewer();
  if (!viewer) return ENDED;
  if (!viewerCan(viewer, "config", level)) return fail(level === "manage" ? "Only the Director and Ranking Specialists can change the email connection." : "Your role can’t change email settings.");
  if (level !== "view" && !(await allowAccount(viewer.id, "command"))) return BUSY;
  return viewer;
}
const isViewer = (v: Viewer | { ok: false; message: string }): v is Viewer => "grants" in v;

const done = async (viewer: Viewer, message: string): Promise<MailResult> => ({ ok: true, message, data: await mailDesk(viewer) });

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").trim().slice(0, max) : "");

export async function loadMail(): Promise<MailResult> {
  const viewer = await who("view");
  if (!isViewer(viewer)) return viewer;
  // Opening the tab is one of the moments the queue is worked: whatever was waiting on a retry goes out now.
  after(() => drainMail().catch((e: unknown) => console.error(e)));
  return { ok: true, message: "", data: await mailDesk(viewer) };
}

/** A test message to the person asking, sent straight through `transport`, and recorded in the list. */
async function sendTest(viewer: Viewer, transport: Transport) {
  const [origin, office] = await Promise.all([publicOrigin(), officeContact()]);
  const subject = `${PORTAL_NAME}: email is working`;
  const { html, text: body } = renderEmail(
    {
      preheader: "A test from System Configuration › Email.",
      eyebrow: "Test",
      heading: "Email is working",
      paragraphs: [`This is a test from System Configuration › Email. Receipts and notifications from the ${PORTAL_NAME} will look like this one.`],
      facts: [
        ["Sent through", MAIL_PROVIDERS[transport.provider].label],
        ["Sender", `${transport.from.name} <${transport.from.email}>`],
        ...(transport.replyTo ? ([["Replies go to", transport.replyTo]] as [string, string][]) : []),
      ],
      reason: `You are receiving this because you sent a test from the ${PORTAL_NAME}.`,
    },
    { origin, office },
  );
  const id = randomUUID();
  const result = await deliver(transport, { to: { email: viewer.email, name: viewer.name }, subject, html, text: body, ref: id });
  const now = new Date().toISOString();
  const { error } = await adminDb()
    .from("mail_outbox")
    .insert({
      id,
      template_id: "test",
      label: "Test message",
      to_email: viewer.email.toLowerCase(),
      to_name: viewer.name,
      account_id: viewer.id,
      subject,
      html,
      body_text: body,
      status: result.ok ? "sent" : "failed",
      attempts: 1,
      sent_at: result.ok ? now : null,
      provider: transport.provider,
      provider_ref: result.ok ? (result.ref?.slice(0, 200) ?? null) : null,
      last_error: result.ok ? null : result.error.slice(0, 300),
      required: true,
    });
  if (error) console.error(`Mail queue: ${error.message}`);
  return result;
}

export async function connectMail(input: ConnectInput): Promise<MailResult> {
  const viewer = await who("manage");
  if (!isViewer(viewer)) return viewer;
  if (!isMailProvider(input.provider)) return fail("Choose a provider.");
  const provider: MailProvider = input.provider;
  const fromName = text(input.fromName, 80);
  const fromEmail = text(input.fromEmail, 254).toLowerCase();
  const replyTo = text(input.replyTo, 254).toLowerCase();
  if (fromName.length < 2) return fail("Enter the name messages are sent under.");
  if (!isEmail(fromEmail)) return fail("Enter the address messages are sent from, like rankings@ust.edu.ph.");
  if (replyTo && !isEmail(replyTo)) return fail("Enter the address replies go to, or leave it empty.");

  let smtp: { host: string; port: number; user: string } | undefined;
  if (provider === "smtp") {
    const host = text(input.smtpHost, 253).toLowerCase();
    const port = Number(input.smtpPort);
    const user = text(input.smtpUser, 254);
    if (!HOST.test(host)) return fail("Enter the mail server’s name, like smtp.gmail.com.");
    if (!(SMTP_PORTS as readonly number[]).includes(port)) return fail("Choose the mail server’s port.");
    if (!user || /\s/.test(user)) return fail("Enter the username the mail server signs in with.");
    smtp = { host, port, user };
  }

  // A blank key keeps the saved one, so the sender can be changed without pasting the key again.
  const saved = await readMailSettings();
  const typed = typeof input.secret === "string" ? input.secret.trim() : "";
  const kept = !typed && saved?.provider === provider ? openSecret(saved.secret_sealed) : null;
  const secret = typed || kept || "";
  const label = MAIL_PROVIDERS[provider];
  if (!secret) return fail(`Paste the ${label.secret.toLowerCase()}.`);
  if (secret.length < 8 || secret.length > 512 || /[\r\n]/.test(secret) || (provider !== "smtp" && /\s/.test(secret))) return fail(`Paste the whole ${label.secret.toLowerCase()}${provider === "smtp" ? "" : ", with no spaces"}.`);

  const transport: Transport = { provider, secret, ...(smtp && { smtp }), from: { name: fromName, email: fromEmail }, ...(replyTo && { replyTo }) };
  const tested = await sendTest(viewer, transport);
  if (!tested.ok) return fail(`${label.label} didn’t accept a test message: ${tested.error}`);

  const now = new Date().toISOString();
  const { error } = await adminDb()
    .from("mail_settings")
    .update({
      provider,
      secret_sealed: sealSecret(secret),
      secret_hint: secret.slice(-4),
      smtp_host: smtp?.host ?? null,
      smtp_port: smtp?.port ?? null,
      smtp_user: smtp?.user ?? null,
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo || null,
      status: "ok",
      status_at: now,
      last_error: null,
      connected_by: viewer.name,
      connected_at: now,
      updated_at: now,
      updated_by: viewer.name,
    })
    .eq("id", 1);
  if (error) return fail("The test went through, but the connection couldn’t be saved. Try again.");
  await audit(viewer, "mail.connect", SETTING, `${label.label} · from ${fromEmail}${replyTo ? ` · replies to ${replyTo}` : ""}`, [], "Configuration");
  return done(viewer, `${label.label} connected. A test was sent to ${viewer.email}.`);
}

export async function disconnectMail(): Promise<MailResult> {
  const viewer = await who("manage");
  if (!isViewer(viewer)) return viewer;
  const now = new Date().toISOString();
  const { error } = await adminDb()
    .from("mail_settings")
    .update({ provider: null, secret_sealed: null, secret_hint: null, smtp_host: null, smtp_port: null, smtp_user: null, sending: false, status: "disconnected", status_at: now, last_error: null, updated_at: now, updated_by: viewer.name })
    .eq("id", 1);
  if (error) return fail("Couldn’t disconnect it. Try again.");
  const held = await holdWaiting("The provider was disconnected.");
  await audit(viewer, "mail.disconnect", SETTING, `Key removed${held ? ` · ${held} waiting ${held === 1 ? "message" : "messages"} not sent` : ""}`, [], "Configuration");
  return done(viewer, "Disconnected. The key is gone from the Hub.");
}

export async function setMailSending(on: unknown): Promise<MailResult> {
  const viewer = await who("edit");
  if (!isViewer(viewer)) return viewer;
  if (typeof on !== "boolean") return fail("Choose on or off.");
  const saved = await readMailSettings();
  if (on) {
    const transport = transportOf(saved);
    if ("problem" in transport) return fail(`${transport.problem} Connect a provider first.`);
  }
  if (!!saved?.sending === on) return done(viewer, on ? "Sending is already on." : "Sending is already off.");
  const now = new Date().toISOString();
  const { error } = await adminDb().from("mail_settings").update({ sending: on, updated_at: now, updated_by: viewer.name }).eq("id", 1);
  if (error) return fail("Couldn’t save that. Try again.");
  const held = on ? 0 : await holdWaiting("Sending was switched off.");
  await audit(viewer, "mail.sending", SETTING, on ? "Sending on" : `Sending off${held ? ` · ${held} waiting ${held === 1 ? "message" : "messages"} not sent` : ""}`, [], "Configuration");
  return done(viewer, on ? "Sending is on." : "Sending is off. New messages are recorded, not sent.");
}

export async function sendMailTest(): Promise<MailResult> {
  const viewer = await who("edit");
  if (!isViewer(viewer)) return viewer;
  const transport = transportOf(await readMailSettings());
  if ("problem" in transport) return fail(`${transport.problem} Connect a provider first.`);
  const tested = await sendTest(viewer, transport);
  // A message this one address can't take says nothing about the connection; anything else does.
  if (tested.ok) await markConnection("ok");
  else if (tested.kind === "auth") await markConnection("failing", tested.error);
  if (!tested.ok) return { ok: false, message: `The test wasn’t accepted: ${tested.error}` };
  return done(viewer, `Test sent to ${viewer.email}.`);
}

/** Try again what was given up on: one message, or all of them. */
export async function retryMail(id?: unknown): Promise<MailResult> {
  const viewer = await who("edit");
  if (!isViewer(viewer)) return viewer;
  if (id !== undefined && (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) return fail("That message is no longer in the list.");
  const settings = await readMailSettings();
  const transport = transportOf(settings);
  if ("problem" in transport) return fail(`${transport.problem} Connect a provider first.`);
  if (!settings?.sending) return fail("Sending is switched off. Switch it on first.");
  const n = await retryFailed(typeof id === "string" ? id : undefined);
  if (!n) return fail("Nothing to try again.");
  const r = await drainMail();
  await audit(viewer, "mail.retry", SETTING, `${n} ${n === 1 ? "message" : "messages"} tried again · ${r.sent} sent`, [], "Configuration");
  return done(viewer, r.sent === n ? (n === 1 ? "Sent." : `${n} messages sent.`) : `${r.sent} of ${n} sent. The rest will be tried again.`);
}

export async function saveMailLimits(input: { hourlyLimit: unknown; retentionDays: unknown }): Promise<MailResult> {
  const viewer = await who("manage");
  if (!isViewer(viewer)) return viewer;
  const hourly = Number(input?.hourlyLimit);
  const days = Number(input?.retentionDays);
  if (!Number.isInteger(hourly) || hourly < 1 || hourly > 1000) return fail("Allow 1 to 1,000 messages an hour to one address.");
  if (!Number.isInteger(days) || days < 7 || days > 365) return fail("Keep messages for 7 to 365 days.");
  const now = new Date().toISOString();
  const { error } = await adminDb().from("mail_settings").update({ hourly_limit: hourly, retention_days: days, updated_at: now, updated_by: viewer.name }).eq("id", 1);
  if (error) return fail("Couldn’t save that. Try again.");
  await audit(viewer, "mail.limits", SETTING, `${hourly} an hour to one address · kept ${days} days`, [], "Configuration");
  return done(viewer, "Limits saved.");
}

/** One message as it was set, to show in the Email tab. */
export async function readMail(id: unknown): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  const viewer = await who("view");
  if (!isViewer(viewer)) return viewer;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return fail("That message is no longer in the list.");
  const { data, error } = await adminDb().from("mail_outbox").select("html").eq("id", id).maybeSingle();
  if (error || !data) return fail("That message is no longer in the list.");
  return { ok: true, html: data.html };
}
