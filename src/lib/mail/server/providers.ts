import "server-only";

/*
 * The providers behind one shape: hand a message to Resend, Brevo or SendGrid over their HTTPS APIs, or to any mail
 * server over SMTP (Google Workspace, Outlook, the University's own), and say how it went. A refusal is sorted three
 * ways, because each needs something different: the key or sender is wrong (stop and tell the Office), this one
 * message can't be delivered (give up on it), or the provider is busy or unreachable (try again later).
 */
import nodemailer from "nodemailer";
import type { Transport } from "./settings";

export interface Outgoing {
  to: { email: string; name?: string | null };
  subject: string;
  html: string;
  text: string;
  /** The message's id in the Hub's queue: providers that take one use it so a retry is never a second email. */
  ref: string;
}

export type Sent = { ok: true; ref: string | null } | { ok: false; kind: "auth" | "message" | "temporary"; error: string };

const TIMEOUT_MS = 15_000;

/** Mark the mail as a machine's, so mailboxes don't answer it with out-of-office replies. */
const HEADERS = { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" };

/** A display name safe in an address header. */
const displayName = (s: string) => s.replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

const short = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 280);

const kindOf = (status: number): "auth" | "message" | "temporary" => (status === 401 || status === 403 ? "auth" : status === 408 || status === 429 || status >= 500 ? "temporary" : "message");

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: Record<string, unknown>; headers: Headers } | { failed: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = { message: text.slice(0, 280) };
    }
    return { status: res.status, json, headers: res.headers };
  } catch (e) {
    return { failed: (e as Error).name === "TimeoutError" ? "The provider took too long to answer." : "The provider couldn't be reached." };
  }
}

async function resend(t: Transport, m: Outgoing): Promise<Sent> {
  const r = await post(
    "https://api.resend.com/emails",
    { Authorization: `Bearer ${t.secret}`, "Idempotency-Key": `hub-${m.ref}` },
    {
      from: `${displayName(t.from.name)} <${t.from.email}>`,
      to: [m.to.email],
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(t.replyTo && { reply_to: t.replyTo }),
      headers: HEADERS,
    },
  );
  if ("failed" in r) return { ok: false, kind: "temporary", error: r.failed };
  if (r.status >= 200 && r.status < 300) return { ok: true, ref: typeof r.json.id === "string" ? r.json.id : null };
  return { ok: false, kind: kindOf(r.status), error: short(r.json.message ?? r.json.name ?? `Resend answered ${r.status}.`) };
}

async function brevo(t: Transport, m: Outgoing): Promise<Sent> {
  const r = await post(
    "https://api.brevo.com/v3/smtp/email",
    { "api-key": t.secret },
    {
      sender: { name: displayName(t.from.name), email: t.from.email },
      to: [{ email: m.to.email, ...(m.to.name && { name: displayName(m.to.name) }) }],
      subject: m.subject,
      htmlContent: m.html,
      textContent: m.text,
      ...(t.replyTo && { replyTo: { email: t.replyTo } }),
      headers: { ...HEADERS, "X-Hub-Ref": m.ref },
    },
  );
  if ("failed" in r) return { ok: false, kind: "temporary", error: r.failed };
  if (r.status >= 200 && r.status < 300) return { ok: true, ref: typeof r.json.messageId === "string" ? r.json.messageId : null };
  return { ok: false, kind: kindOf(r.status), error: short(r.json.message ?? r.json.code ?? `Brevo answered ${r.status}.`) };
}

async function sendgrid(t: Transport, m: Outgoing): Promise<Sent> {
  const r = await post(
    "https://api.sendgrid.com/v3/mail/send",
    { Authorization: `Bearer ${t.secret}` },
    {
      personalizations: [{ to: [{ email: m.to.email, ...(m.to.name && { name: displayName(m.to.name) }) }] }],
      from: { email: t.from.email, name: displayName(t.from.name) },
      ...(t.replyTo && { reply_to: { email: t.replyTo } }),
      subject: m.subject,
      // SendGrid wants the plain part first.
      content: [
        { type: "text/plain", value: m.text },
        { type: "text/html", value: m.html },
      ],
      headers: HEADERS,
      custom_args: { hub_ref: m.ref },
    },
  );
  if ("failed" in r) return { ok: false, kind: "temporary", error: r.failed };
  if (r.status >= 200 && r.status < 300) return { ok: true, ref: r.headers.get("x-message-id") };
  const errors = Array.isArray(r.json.errors) ? (r.json.errors as { message?: unknown }[]) : [];
  return { ok: false, kind: kindOf(r.status), error: short(errors[0]?.message ?? `SendGrid answered ${r.status}.`) };
}

async function smtp(t: Transport, m: Outgoing): Promise<Sent> {
  if (!t.smtp) return { ok: false, kind: "auth", error: "The mail server's address is incomplete." };
  const transport = nodemailer.createTransport({
    host: t.smtp.host,
    port: t.smtp.port,
    // 465 is TLS from the first byte; the other ports must upgrade before the password is sent.
    secure: t.smtp.port === 465,
    requireTLS: t.smtp.port !== 465,
    auth: { user: t.smtp.user, pass: t.secret },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const info = await transport.sendMail({
      from: { name: displayName(t.from.name), address: t.from.email },
      to: m.to.name ? { name: displayName(m.to.name), address: m.to.email } : m.to.email,
      ...(t.replyTo && { replyTo: t.replyTo }),
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: { ...HEADERS, "X-Hub-Ref": m.ref },
    });
    if (info.rejected?.length) return { ok: false, kind: "message", error: "The mail server refused the address." };
    return { ok: true, ref: info.messageId ?? null };
  } catch (e) {
    const err = e as Error & { code?: string; responseCode?: number; response?: string };
    const code = err.responseCode ?? 0;
    if (err.code === "EAUTH" || code === 530 || code === 534 || code === 535) return { ok: false, kind: "auth", error: "The mail server refused the username or password." };
    if (code >= 500) return { ok: false, kind: [550, 551, 552, 553, 554].includes(code) ? "message" : "auth", error: short(err.response ?? err.message) };
    if (err.code === "ETLS") return { ok: false, kind: "auth", error: "The mail server didn't offer a secure connection on that port." };
    return { ok: false, kind: "temporary", error: err.code === "EDNS" || err.code === "ENOTFOUND" ? "The mail server's address couldn't be found." : short(err.response ?? "The mail server couldn't be reached.") };
  } finally {
    transport.close();
  }
}

/** Send one message. Never throws: every way it can go wrong comes back sorted. */
export async function deliver(t: Transport, m: Outgoing): Promise<Sent> {
  try {
    switch (t.provider) {
      case "resend":
        return await resend(t, m);
      case "brevo":
        return await brevo(t, m);
      case "sendgrid":
        return await sendgrid(t, m);
      case "smtp":
        return await smtp(t, m);
    }
  } catch (e) {
    console.error(`Mail (${t.provider}): ${(e as Error).message}`);
    return { ok: false, kind: "temporary", error: "The message couldn't be handed to the provider." };
  }
}
