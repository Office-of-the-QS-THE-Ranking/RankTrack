import "server-only";

/* What System Configuration › Email shows: the connection (never the key), a month of figures, and the latest messages. */
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { adminDb } from "@/lib/supabase/server";
import type { MailDesk, MailRow, MailStatus, MailSummary } from "../types";
import { officeContact } from "./office";
import { publicOrigin } from "./origin";
import { connectionOf, readMailSettings } from "./settings";

const RECENT = 60;
const COLUMNS = "id, created_at, template_id, label, to_email, to_name, subject, status, attempts, sent_at, next_attempt_at, provider, provider_ref, last_error";

const EMPTY: MailSummary = { sent: 0, waiting: 0, failed: 0, skipped: 0, days: [] };

function summaryOf(json: unknown): MailSummary {
  const j = (json ?? {}) as Partial<Record<keyof MailSummary, unknown>>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  const days = Array.isArray(j.days) ? (j.days as { day?: unknown; sent?: unknown; other?: unknown }[]) : [];
  return { sent: n(j.sent), waiting: n(j.waiting), failed: n(j.failed), skipped: n(j.skipped), days: days.map((d) => ({ day: String(d.day ?? ""), sent: n(d.sent), other: n(d.other) })) };
}

export async function mailDesk(viewer: Viewer): Promise<MailDesk> {
  const db = adminDb();
  const [settings, summary, recent, origin, office] = await Promise.all([
    readMailSettings(),
    db.rpc("mail_summary", { p_days: 30 }),
    db.from("mail_outbox").select(COLUMNS).order("created_at", { ascending: false }).limit(RECENT),
    publicOrigin(),
    officeContact(),
  ]);
  if (summary.error) console.error(`Mail summary: ${summary.error.message}`);
  if (recent.error) console.error(`Mail queue: ${recent.error.message}`);
  const rows: MailRow[] = (recent.data ?? []).map((r) => ({
    id: r.id,
    at: r.created_at,
    templateId: r.template_id,
    label: r.label,
    toEmail: r.to_email,
    toName: r.to_name,
    subject: r.subject,
    status: r.status as MailStatus,
    attempts: r.attempts,
    sentAt: r.sent_at,
    nextAt: r.status === "queued" ? r.next_attempt_at : null,
    provider: r.provider,
    providerRef: r.provider_ref,
    note: r.last_error,
  }));
  return {
    now: new Date().toISOString(),
    connection: connectionOf(settings),
    summary: summary.error ? EMPTY : summaryOf(summary.data),
    recent: rows,
    origin,
    office,
    testTo: viewer.email,
    canEdit: viewerCan(viewer, "config", "edit"),
    canManage: viewerCan(viewer, "config", "manage"),
  };
}
