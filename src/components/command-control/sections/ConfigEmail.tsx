"use client";

/*
 * System Configuration › Email: the Hub's automatic email. Delivery is the connection to a mail provider and the
 * master switch; the figures are a month of messages; Layout shows the email itself, set by the same code that sends
 * it (lib/mail/layout.ts), for any message the Office has written; Messages is the queue, newest first.
 * Built from the configuration page's own parts (Tile, sc-list, sc-mark, sc-knob). Styles: system-config.css (sc-mail-*).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { connectMail, disconnectMail, loadMail, readMail, retryMail, saveMailLimits, sendMailTest, setMailSending } from "@/app/actions/mail";
import { Tile } from "@/components/dashboard/Tile";
import { usePending } from "@/components/ui/ButtonBusy";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/interactive";
import { NumberField, Select } from "@/components/ui/pickers";
import type { NotificationTemplate } from "@/lib/governance/types";
import { renderEmail } from "@/lib/mail/layout";
import { composeEmail, isDirect, SAMPLE_HREF, SAMPLE_VARS } from "@/lib/mail/messages";
import { MAIL_PROVIDER_IDS, MAIL_PROVIDERS, SMTP_PORTS, STATUS_LABEL, type MailDesk, type MailProvider, type MailResult, type MailRow, type MailStatus } from "@/lib/mail/types";
import { Bars, Field, Hint, KV, Sheet, Switch, fmtAgo, fmtDate, useConsole } from "../ui";

type Width = "Desktop" | "Phone";

const TONE: Record<MailStatus, { tone: string; icon: IconName }> = {
  sent: { tone: "ok", icon: "check" },
  queued: { tone: "revise", icon: "clock" },
  sending: { tone: "revise", icon: "send" },
  failed: { tone: "danger", icon: "alert" },
  skipped: { tone: "missing", icon: "minus" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""}`;

/** The last 30 Manila days, oldest first, with what was sent on each. */
function monthOf(desk: MailDesk) {
  const by = new Map(desk.summary.days.map((d) => [d.day, d]));
  const end = Date.parse(desk.now) + 8 * 3_600_000;
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date(end - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { key: day, title: dayLabel(day), value: by.get(day)?.sent ?? 0 };
  });
}

/** A message as the layout sets it, with stand-in values: what the Office wrote, as its readers will see it. */
export function previewHtml(t: Pick<NotificationTemplate, "id" | "subject" | "body">, origin: string | null, office: MailDesk["office"] = {}) {
  const { content } = composeEmail({ templateId: t.id, subject: t.subject, body: t.body, vars: SAMPLE_VARS, href: SAMPLE_HREF[t.id] ?? "/portal", account: !isDirect(t.id) }, origin);
  return renderEmail(content, { origin, office }).html;
}

/** The Hub's address for a preview: the server's, else the one this page was opened on. */
export const previewOrigin = (origin?: string | null) => origin ?? (typeof window === "undefined" ? null : window.location.origin);

/**
 * An email, shown as a mail client would: in a frame of its own, where the page's styles can't reach it and nothing
 * in it can run. The frame grows to the message's height, so only the page scrolls.
 */
export function MailFrame({ html, title, width = "Desktop" }: { html: string; title: string; width?: Width }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(560);
  const fit = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (doc?.documentElement) setHeight(Math.max(240, Math.ceil(doc.documentElement.scrollHeight)));
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
  }, [fit, width, html]);
  return (
    <div className="sc-mail-stage" data-width={width}>
      <iframe ref={ref} className="sc-mail-frame" title={title} sandbox="allow-same-origin" srcDoc={html} style={{ height }} onLoad={fit} />
    </div>
  );
}

/* ---------- The tab ---------- */

export function Email({ initial }: { initial?: MailDesk }) {
  const { data, notify } = useConsole();
  const [desk, setDesk] = useState<MailDesk | null>(initial ?? null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  usePending(busy);

  useEffect(() => {
    if (initial) return;
    let live = true;
    loadMail()
      .then((r) => {
        if (!live) return;
        if (r.ok) setDesk(r.data);
        else setFailed(r.message);
      })
      .catch(() => live && setFailed("Email settings couldn’t be loaded. Reload the page."));
    return () => {
      live = false;
    };
  }, [initial]);

  /** Run an action, show how it went, and take the fresh desk it returns. */
  const act = useCallback(
    async (work: () => Promise<MailResult>) => {
      setBusy(true);
      try {
        const r = await work();
        notify(r.message, r.ok ? "ok" : "error");
        if (r.ok) setDesk(r.data);
        return r.ok;
      } catch {
        notify("That couldn’t be done. Try again in a moment.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  if (!desk)
    return (
      <div className="sc-bento" aria-busy={!failed}>
        <Tile id="sc-mail-wait" title="Delivery" className="sc-mail-conn">
          <p className="ov-none">{failed || "Loading…"}</p>
        </Tile>
      </div>
    );

  return (
    <div className="sc-bento">
      <Delivery desk={desk} busy={busy} act={act} />
      <Figures desk={desk} />
      <Layout desk={desk} templates={data.config!.templates} />
      <Outbox desk={desk} busy={busy} act={act} />
    </div>
  );
}

type Act = (work: () => Promise<MailResult>) => Promise<boolean>;

/* ---------- Delivery ---------- */

function Delivery({ desk, busy, act }: { desk: MailDesk; busy: boolean; act: Act }) {
  const c = desk.connection;
  const [open, setOpen] = useState(false);
  const [limits, setLimits] = useState({ hourlyLimit: c.hourlyLimit, retentionDays: c.retentionDays });
  useEffect(() => setLimits({ hourlyLimit: c.hourlyLimit, retentionDays: c.retentionDays }), [c.hourlyLimit, c.retentionDays]);
  const connected = !!c.provider;
  const state: { tone: string; icon: IconName; line: string; sub: string } = !connected
    ? { tone: "missing", icon: "minus", line: "Not connected", sub: "Messages are recorded, not sent." }
    : c.status === "failing"
      ? { tone: "danger", icon: "alert", line: `${MAIL_PROVIDERS[c.provider!].label} refused the last message`, sub: c.lastError ?? "Check the key and the sender." }
      : c.sending
        ? { tone: "ok", icon: "check", line: `Sending through ${MAIL_PROVIDERS[c.provider!].label}`, sub: c.connectedAt ? `Connected ${fmtDate(c.connectedAt)}${c.connectedBy ? ` by ${c.connectedBy}` : ""}` : "" }
        : { tone: "revise", icon: "clock", line: `${MAIL_PROVIDERS[c.provider!].label} connected, sending off`, sub: "Messages are recorded, not sent." };
  const dirty = limits.hourlyLimit !== c.hourlyLimit || limits.retentionDays !== c.retentionDays;
  return (
    <Tile
      id="sc-mail-conn"
      title="Delivery"
      className="sc-mail-conn"
      aside={<Switch checked={c.sending} disabled={!desk.canEdit || busy || !connected} label={c.sending ? "Sending is on" : "Sending is off"} describe={connected ? undefined : "Connect a provider first"} onChange={(on) => void act(() => setMailSending(on))} />}
    >
      <div className="sc-mail-state">
        <span className="sc-mark" data-tone={state.tone}>
          <Icon name={state.icon} size={14} />
        </span>
        <span className="sc-mail-state__text">
          <b>{state.line}</b>
          {state.sub && <small>{state.sub}</small>}
        </span>
      </div>
      {connected && (
        <dl className="sc-mail-facts">
          <div>
            <dt>From</dt>
            <dd>
              {c.fromName} <span>{c.fromEmail}</span>
            </dd>
          </div>
          {c.replyTo && (
            <div>
              <dt>Replies to</dt>
              <dd>{c.replyTo}</dd>
            </div>
          )}
          <div>
            <dt>{c.provider === "smtp" ? "Server" : "Key"}</dt>
            <dd className="num">{c.provider === "smtp" ? `${c.smtpHost}:${c.smtpPort}` : `••••${c.secretHint ?? ""}`}</dd>
          </div>
        </dl>
      )}
      <div className="sc-mail-actions">
        {desk.canManage && (
          <button type="button" className={connected ? "btn btn--sm" : "btn btn--sm btn--dark"} onClick={() => setOpen(true)}>
            <Icon name="key" size={14} /> {connected ? "Change" : "Connect"}
          </button>
        )}
        {connected && desk.canEdit && (
          <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void act(sendMailTest)}>
            <Icon name="send" size={14} /> Send test
          </button>
        )}
      </div>
      <div className="sc-pair sc-mail-limits">
        <label className="sc-knob">
          <span>
            An hour, to one address <Hint text="More than this in an hour is recorded, not sent. Receipts and account notices always go." />
          </span>
          <NumberField className="input num" min={1} max={1000} suffix="emails" disabled={!desk.canManage} value={limits.hourlyLimit} onChange={(v) => setLimits({ ...limits, hourlyLimit: v })} aria-label="Emails an hour to one address" />
        </label>
        <label className="sc-knob">
          <span>
            Keep messages for <Hint text="Messages carry names and reasons, so they are deleted after this long." />
          </span>
          <NumberField className="input num" min={7} max={365} suffix="days" disabled={!desk.canManage} value={limits.retentionDays} onChange={(v) => setLimits({ ...limits, retentionDays: v })} aria-label="Days messages are kept" />
        </label>
      </div>
      {dirty && (
        <div className="sc-save">
          <button type="button" className="btn btn--sm" onClick={() => setLimits({ hourlyLimit: c.hourlyLimit, retentionDays: c.retentionDays })}>
            Discard
          </button>
          <button type="button" className="btn btn--sm btn--dark" disabled={busy} onClick={() => void act(() => saveMailLimits(limits))}>
            Save
          </button>
        </div>
      )}
      <Connect desk={desk} open={open} busy={busy} act={act} onClose={() => setOpen(false)} />
    </Tile>
  );
}

function Connect({ desk, open, busy, act, onClose }: { desk: MailDesk; open: boolean; busy: boolean; act: Act; onClose: () => void }) {
  const { confirm } = useConsole();
  const c = desk.connection;
  const formId = useId();
  const start = () => ({
    provider: (c.provider ?? "smtp") as MailProvider,
    secret: "",
    smtpHost: c.smtpHost ?? "smtp.gmail.com",
    smtpPort: c.smtpPort ?? 587,
    smtpUser: c.smtpUser ?? "",
    fromName: c.fromName,
    fromEmail: c.fromEmail ?? "",
    replyTo: c.replyTo ?? "",
  });
  const [f, setF] = useState(start);
  // Each opening starts from what is saved, never from a half-typed form or a key left in the field.
  useEffect(() => {
    if (open) setF(start());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const info = MAIL_PROVIDERS[f.provider];
  const keeps = c.provider === f.provider && !!c.secretHint;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={c.provider ? "Email connection" : "Connect email"}
      sub={`A test goes to ${desk.testTo} before anything is saved.`}
      footer={
        <>
          {c.provider && (
            <button
              type="button"
              className="btn btn--danger sc-mail-off"
              disabled={busy}
              onClick={async () => {
                const yes = await confirm({ title: "Disconnect email?", body: "The key is removed and nothing more is sent. Messages still waiting are not sent later.", confirm: "Disconnect", tone: "danger" });
                if (yes !== null && (await act(disconnectMail))) onClose();
              }}
            >
              Disconnect
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn--dark" disabled={busy}>
            {c.provider ? "Save and test" : "Connect"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="cmd-form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => connectMail(f))) onClose();
        }}
      >
        <Field label="Provider" hint={info.where} wide>
          <Select className="select" value={f.provider} onChange={(v) => setF({ ...f, provider: v as MailProvider, secret: "" })} aria-label="Provider">
            {MAIL_PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {MAIL_PROVIDERS[id].label}
              </option>
            ))}
          </Select>
        </Field>
        {f.provider === "smtp" && (
          <>
            <Field label="Mail server">
              <input className="input" required value={f.smtpHost} onChange={(e) => setF({ ...f, smtpHost: e.target.value })} placeholder="smtp.gmail.com" autoCapitalize="none" spellCheck={false} data-missing="Enter the mail server’s name, like smtp.gmail.com." />
            </Field>
            <Field label="Port">
              <Select className="select" value={String(f.smtpPort)} onChange={(v) => setF({ ...f, smtpPort: Number(v) })} aria-label="Port">
                {SMTP_PORTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Username" wide>
              <input className="input" required value={f.smtpUser} onChange={(e) => setF({ ...f, smtpUser: e.target.value })} placeholder="rankings@ust.edu.ph" autoComplete="off" autoCapitalize="none" spellCheck={false} data-missing="Enter the username the mail server signs in with." />
            </Field>
          </>
        )}
        <Field label={info.secret} wide>
          <input
            className="input"
            type="password"
            required={!keeps}
            value={f.secret}
            onChange={(e) => setF({ ...f, secret: e.target.value })}
            placeholder={keeps ? `Saved, ending ${c.secretHint}. Leave empty to keep it.` : info.placeholder}
            autoComplete="new-password"
            spellCheck={false}
            data-missing={`Paste the ${info.secret.toLowerCase()}.`}
          />
        </Field>
        <Field label="Sender name">
          <input className="input" required maxLength={80} value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} data-missing="Enter the name messages are sent under." />
        </Field>
        <Field label="From address">
          <input className="input" type="email" required value={f.fromEmail} onChange={(e) => setF({ ...f, fromEmail: e.target.value })} placeholder="rankings@ust.edu.ph" autoCapitalize="none" spellCheck={false} data-missing="Enter the address messages are sent from." />
        </Field>
        <Field label="Replies go to" hint="Optional" wide>
          <input className="input" type="email" value={f.replyTo} onChange={(e) => setF({ ...f, replyTo: e.target.value })} placeholder="rankings.office@ust.edu.ph" autoCapitalize="none" spellCheck={false} />
        </Field>
      </form>
    </Sheet>
  );
}

/* ---------- Figures ---------- */

function Figures({ desk }: { desk: MailDesk }) {
  const s = desk.summary;
  const month = useMemo(() => monthOf(desk), [desk]);
  const total = s.sent + s.waiting + s.failed + s.skipped;
  return (
    <Tile id="sc-mail-figs" title="Last 30 days" className="sc-mail-figs" aside={<span className="kb-aside">{total.toLocaleString("en-PH")} in all</span>}>
      <div className="sc-mail-nums">
        <p className="ov-value num">
          {s.sent.toLocaleString("en-PH")}
          <small>sent</small>
        </p>
        <span className="ov-stat">
          <b className="num">{s.waiting.toLocaleString("en-PH")}</b>
          <span>Waiting</span>
        </span>
        <span className="ov-stat" data-tone={s.failed ? "danger" : undefined}>
          <b className="num">{s.failed.toLocaleString("en-PH")}</b>
          <span>Failed</span>
        </span>
        <span className="ov-stat">
          <b className="num">{s.skipped.toLocaleString("en-PH")}</b>
          <span>Not sent</span>
        </span>
      </div>
      {total > 0 ? <Bars data={month} label="Emails sent a day" /> : <p className="ov-none">No messages yet.</p>}
    </Tile>
  );
}

/* ---------- Layout ---------- */

function Layout({ desk, templates }: { desk: MailDesk; templates: NotificationTemplate[] }) {
  const mailed = useMemo(() => {
    const list = templates.filter((t) => t.channel !== "In-app");
    return list.length ? list : templates;
  }, [templates]);
  const [id, setId] = useState(() => mailed.find((t) => t.id === "tpl-access-received")?.id ?? mailed[0]?.id ?? "");
  const [width, setWidth] = useState<Width>("Desktop");
  const t = mailed.find((x) => x.id === id) ?? mailed[0];
  const html = useMemo(() => (t ? previewHtml(t, previewOrigin(desk.origin), desk.office) : ""), [t, desk.origin, desk.office]);
  return (
    <Tile
      id="sc-mail-look"
      title="Layout"
      className="sc-mail-look"
      aside={
        <span className="sc-mail-pick">
          <Select className="select select--sm" value={t?.id ?? ""} onChange={setId} aria-label="Message to preview">
            {mailed.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          <Segmented options={["Desktop", "Phone"] as const} value={width} onChange={setWidth} label="Preview width" className="sc-seg" />
        </span>
      }
    >
      {t ? <MailFrame html={html} width={width} title={`Preview of ${t.name}`} /> : <p className="ov-none">No messages yet.</p>}
    </Tile>
  );
}

/* ---------- Messages ---------- */

function Outbox({ desk, busy, act }: { desk: MailDesk; busy: boolean; act: Act }) {
  const [sel, setSel] = useState<MailRow | null>(null);
  const [html, setHtml] = useState("");
  const failed = desk.recent.filter((r) => r.status === "failed").length;
  // the open message, as it stands after an action
  const row = sel && (desk.recent.find((r) => r.id === sel.id) ?? sel);

  useEffect(() => {
    if (!sel) return;
    let live = true;
    setHtml("");
    readMail(sel.id)
      .then((r) => live && r.ok && setHtml(r.html))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sel]);

  return (
    <Tile
      id="sc-mail-log"
      title="Messages"
      className="sc-mail-log"
      aside={
        failed > 0 && desk.canEdit ? (
          <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void act(() => retryMail())}>
            <Icon name="refresh" size={14} /> Retry {failed} failed
          </button>
        ) : (
          <span className="kb-aside">Newest first</span>
        )
      }
    >
      {desk.recent.length ? (
        <ul className="sc-list sc-mail-rows">
          {desk.recent.map((r) => (
            <li key={r.id}>
              <button type="button" className="sc-mail-row" onClick={() => setSel(r)} aria-haspopup="dialog">
                <span className="sc-mark" data-tone={TONE[r.status].tone} title={STATUS_LABEL[r.status]}>
                  <Icon name={TONE[r.status].icon} size={14} />
                </span>
                <span className="sc-mail-row__main">
                  <b>{r.subject}</b>
                  <small>
                    {r.toName ?? r.toEmail} · {r.label}
                  </small>
                </span>
                <span className="sc-list__when">{fmtAgo(r.at, desk.now)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ov-none">Nothing has been queued yet.</p>
      )}
      <Sheet
        open={!!row}
        onClose={() => setSel(null)}
        wide
        title={row?.subject ?? ""}
        sub={row ? `${STATUS_LABEL[row.status]} · ${row.label}` : undefined}
        footer={
          row?.status === "failed" &&
          desk.canEdit && (
            <button type="button" className="btn btn--dark" disabled={busy} onClick={() => void act(() => retryMail(row.id))}>
              <Icon name="refresh" size={15} /> Try again
            </button>
          )
        }
      >
        {row && (
          <>
            <KV
              rows={[
                ["To", row.toName ? `${row.toName} · ${row.toEmail}` : row.toEmail],
                ["Queued", fmtDate(row.at, true)],
                ...(row.sentAt ? ([["Sent", fmtDate(row.sentAt, true)]] as [string, string][]) : []),
                ...(row.nextAt && row.attempts > 0 ? ([["Next try", fmtDate(row.nextAt, true)]] as [string, string][]) : []),
                ...(row.provider ? ([["Through", MAIL_PROVIDERS[row.provider as MailProvider]?.label ?? row.provider]] as [string, string][]) : []),
                ...(row.note ? ([[row.status === "skipped" ? "Why not" : "Problem", row.note]] as [string, string][]) : []),
                ...(row.providerRef ? ([["Provider’s id", row.providerRef]] as [string, string][]) : []),
              ]}
            />
            {html && <MailFrame html={html} title={`Message: ${row.subject}`} />}
          </>
        )}
      </Sheet>
    </Tile>
  );
}
