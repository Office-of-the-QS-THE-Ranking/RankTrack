"use client";

import { ConsoleCtx, type ConsoleApi } from "@/components/command-control/ui";
import { Email } from "@/components/command-control/sections/ConfigEmail";
import type { NotificationTemplate } from "@/lib/governance/types";
import type { MailDesk, MailRow } from "@/lib/mail/types";

const now = "2026-11-14T14:10:00.000Z";
const row = (i: number, r: Partial<MailRow>): MailRow => ({ id: `00000000-0000-4000-8000-00000000000${i}`, at: new Date(Date.parse(now) - i * 47 * 60_000).toISOString(), templateId: "tpl-receipt", label: "Submission received", toEmail: "ana.reyes@ust.edu.ph", toName: "Ana Reyes", subject: "Received: Rainwater reuse", status: "sent", attempts: 1, sentAt: now, nextAt: null, provider: "smtp", providerRef: null, note: null, ...r });

const live: MailDesk = {
  now,
  connection: { sending: true, provider: "smtp", status: "ok", statusAt: now, lastError: null, secretHint: "mnop", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpUser: "rankings@ust.edu.ph", fromName: "PRESTIGE Portal", fromEmail: "rankings@ust.edu.ph", replyTo: "rankings.office@ust.edu.ph", connectedBy: "Maria Santos", connectedAt: "2026-11-12T02:00:00.000Z", hourlyLimit: 30, retentionDays: 90 },
  summary: { sent: 214, waiting: 2, failed: 1, skipped: 6, days: Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.parse("2026-10-16") + i * 86_400_000).toISOString().slice(0, 10), sent: [3, 5, 0, 0, 8, 12, 6, 9, 4, 0, 0, 11, 14, 7, 9, 13, 0, 0, 6, 10, 15, 9, 12, 2, 0, 8, 17, 11, 9, 14][i], other: 0 })) },
  recent: [
    row(0, { subject: "We received your access request", label: "Access request received", toName: "Lee Tan", toEmail: "lee.tan@qs.com", templateId: "tpl-access-received" }),
    row(1, { subject: "Received: Rainwater reuse" }),
    row(2, { subject: "New submission from Faculty of Engineering", label: "New submission", toName: "Ramon Cruz", status: "queued", attempts: 1, sentAt: null, nextAt: now, note: "The provider took too long to answer." }),
    row(3, { subject: "Revision requested: Flood-resilience design studio", label: "Revision requested", status: "failed", attempts: 5, sentAt: null, note: "The mail server refused the address." }),
    row(4, { subject: "QS World University Rankings closes in 7 days", label: "Deadline reminder", toName: "Maria Santos" }),
    row(5, { subject: "Your request was approved", label: "Request decision", status: "skipped", attempts: 0, sentAt: null, note: "This address reached its hourly limit." }),
    row(6, { subject: "You're invited to the PRESTIGE Portal", label: "Invitation", toName: "Dr. J. Santiago" }),
    row(7, { subject: "Accepted: Community health survey", label: "Evidence accepted" }),
  ],
  origin: "http://localhost:3000",
  office: { email: "rankings.office@ust.edu.ph", address: "España Boulevard, Sampaloc, Manila 1008, Philippines" },
  testTo: "director@ust.edu.ph",
  canEdit: true,
  canManage: true,
};
const fresh: MailDesk = { ...live, connection: { ...live.connection, sending: false, provider: null, status: "disconnected", secretHint: null, smtpHost: null, smtpPort: null, smtpUser: null, fromEmail: null, replyTo: null, connectedAt: null, connectedBy: null }, summary: { sent: 0, waiting: 0, failed: 0, skipped: 0, days: [] }, recent: [] };

export function PreviewMail({ templates, state }: { templates: NotificationTemplate[]; state: string }) {
  const api = { data: { config: { templates }, viewer: {} }, notify: () => {}, confirm: async () => null, run: async () => ({ ok: true, message: "" }), busy: false, go: () => {}, reload: async () => {} } as unknown as ConsoleApi;
  return (
    <div className="cmd" style={{ padding: 28, maxWidth: 1240, margin: "0 auto" }}>
      <ConsoleCtx.Provider value={api}>
        <div className="sc">
          <Email initial={state === "fresh" ? fresh : live} />
        </div>
      </ConsoleCtx.Provider>
    </div>
  );
}
