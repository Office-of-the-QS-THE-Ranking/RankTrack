import "server-only";

/*
 * The mail queue. A command that commits hands its emails here (governance/server/run.ts); each is set in the
 * layout and written to mail_outbox, and a worker sends what is due. Nothing is sent from inside a store
 * transaction, and nothing is sent twice: workers take messages through mail_claim, which hands each to one of them.
 *
 * A message the provider can't take right now waits and is tried again, a little later each time, then given up on.
 * The worker runs straight after messages are queued, when the Office opens the Email tab, and in the daily round;
 * so a message that had to wait goes out with the next one queued, or the next day at the latest.
 *
 * While sending is off, or no provider is connected, messages are recorded as not sent and never go out later:
 * a receipt that arrives a week late helps no one.
 */
import { after } from "next/server";
import { alert } from "@/lib/alerts";
import { adminDb } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { renderEmail } from "../layout";
import { composeEmail } from "../messages";
import type { MailJob } from "../recipients";
import { publicOrigin } from "./origin";
import { deliver } from "./providers";
import { holdReason, markConnection, readMailSettings, transportOf } from "./settings";
import { officeContact } from "./office";

/** How long a message waits before each further try, in seconds; after the last, it has failed. */
const BACKOFF = [60, 300, 1800, 7200, 43_200];
const BATCH = 10;

const g = globalThis as typeof globalThis & { __hubMailDrain?: Promise<DrainResult> | null };

export interface DrainResult {
  sent: number;
  failed: number;
  waiting: number;
}

/** Set each job in the layout and queue it. Returns how many were queued to send. */
export async function enqueueMail(jobs: MailJob[]): Promise<number> {
  if (!jobs.length) return 0;
  const [settings, origin, office] = await Promise.all([readMailSettings(), publicOrigin(), officeContact()]);
  const rows = jobs.map((job) => {
    const { subject, content } = composeEmail({ templateId: job.templateId, subject: job.subject, body: job.body, vars: job.vars, href: job.href, account: !!job.accountId }, origin);
    const { html, text } = renderEmail(content, { origin, office });
    return {
      template_id: job.templateId,
      label: job.label,
      to_email: job.toEmail,
      to_name: job.toName ?? null,
      account_id: job.accountId ?? null,
      subject,
      html,
      body_text: text,
      required: job.required,
      dedupe_key: job.dedupe ?? null,
    };
  });
  const hold = holdReason(settings);
  const { data, error } = await adminDb().rpc("mail_enqueue", { p_rows: rows as unknown as Json, ...(hold && { p_hold: hold }) });
  if (error) throw new Error(`Mail queue: ${error.message}`);
  return Number(data ?? 0);
}

/**
 * Queue a command's emails and send them, after the response: the person who clicked never waits on a mail
 * provider, and a provider that is down never fails their change.
 */
export function dispatchMail(jobs: MailJob[]) {
  if (!jobs.length) return;
  const work = async () => {
    try {
      if (await enqueueMail(jobs)) await drainMail();
    } catch (e) {
      void alert("mail", (e as Error).message);
    }
  };
  try {
    after(work);
  } catch {
    // Outside a request (a script, a test): nothing to wait for, so start now.
    void work();
  }
}

/** Send what is due, for at most `budgetMs`. One drain at a time on this server; others join it. */
export function drainMail(budgetMs = 20_000): Promise<DrainResult> {
  return (g.__hubMailDrain ??= drain(budgetMs).finally(() => {
    g.__hubMailDrain = null;
  }));
}

async function drain(budgetMs: number): Promise<DrainResult> {
  const out: DrainResult = { sent: 0, failed: 0, waiting: 0 };
  const settings = await readMailSettings();
  if (holdReason(settings)) return out;
  const transport = transportOf(settings);
  if ("problem" in transport) return out;
  const db = adminDb();
  const deadline = Date.now() + budgetMs;
  let healthy = settings?.status === "ok";
  while (Date.now() < deadline) {
    const { data: claimed, error } = await db.rpc("mail_claim", { p_limit: BATCH });
    if (error) throw new Error(`Mail queue: ${error.message}`);
    if (!claimed?.length) break;
    for (let i = 0; i < claimed.length; i++) {
      const row = claimed[i];
      const result = await deliver(transport, { to: { email: row.to_email, name: row.to_name }, subject: row.subject, html: row.html, text: row.body_text, ref: row.id });
      const now = new Date().toISOString();
      if (result.ok) {
        await db.from("mail_outbox").update({ status: "sent", sent_at: now, locked_at: null, provider: transport.provider, provider_ref: result.ref?.slice(0, 200) ?? null, last_error: null }).eq("id", row.id);
        out.sent++;
        if (!healthy) {
          await markConnection("ok");
          healthy = true;
        }
        continue;
      }
      // A message that can't be delivered has failed; anything else waits, a little longer each time.
      const wait = BACKOFF[row.attempts - 1];
      const final = result.kind === "message" || wait === undefined;
      await db
        .from("mail_outbox")
        .update({
          status: final ? "failed" : "queued",
          locked_at: null,
          provider: transport.provider,
          last_error: result.error.slice(0, 300),
          ...(!final && { next_attempt_at: new Date(Date.now() + wait * 1000).toISOString() }),
        })
        .eq("id", row.id);
      if (final) out.failed++;
      else out.waiting++;
      if (result.kind === "auth") {
        // The key or the sender is wrong: every message would be refused the same way. Stop, give back the
        // messages this worker still holds untried, and tell the Office.
        const rest = claimed.slice(i + 1).map((r) => r.id);
        if (rest.length) {
          await db.rpc("mail_release", { p_ids: rest });
          out.waiting += rest.length;
        }
        await markConnection("failing", result.error);
        void alert("mail", `The email provider refused the Hub's key or sender: ${result.error}`);
        return out;
      }
      if (Date.now() >= deadline) break;
    }
  }
  return out;
}

/** Put back messages that were given up on, to be tried again now. Returns how many. */
export async function retryFailed(id?: string): Promise<number> {
  let q = adminDb().from("mail_outbox").update({ status: "queued", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null, locked_at: null }).eq("status", "failed");
  if (id) q = q.eq("id", id);
  const { data, error } = await q.select("id");
  if (error) throw new Error(`Mail queue: ${error.message}`);
  return data?.length ?? 0;
}

/** Sending was switched off or the provider disconnected: what was waiting will not go out later. */
export async function holdWaiting(reason: string): Promise<number> {
  const { data, error } = await adminDb().from("mail_outbox").update({ status: "skipped", last_error: reason.slice(0, 300), locked_at: null }).in("status", ["queued", "sending"]).select("id");
  if (error) throw new Error(`Mail queue: ${error.message}`);
  return data?.length ?? 0;
}

/** The daily round: send what waited, then delete messages past their retention. */
export async function mailDaily(): Promise<{ ok: boolean; message: string }> {
  const r = await drainMail(15_000);
  const { data: gone, error } = await adminDb().rpc("mail_purge");
  if (error) return { ok: false, message: `Mail: ${error.message}` };
  return { ok: true, message: `Mail: ${r.sent} sent, ${r.failed} failed, ${r.waiting} waiting, ${Number(gone ?? 0)} old messages removed.` };
}
