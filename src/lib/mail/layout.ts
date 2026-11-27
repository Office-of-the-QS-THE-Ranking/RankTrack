/*
 * The Hub's email, as one layout every message shares: the onyx masthead with the University's arms and the portal's
 * name in gilt italic, a gold rule, the message on paper, and a quiet footer saying why it came. Built for mail
 * clients, not browsers: tables for structure, every style inline, system fonts (Georgia for the display face, Arial
 * for text, as the portal's own stand-ins), and nothing that needs a script. A plain-text copy goes out with it.
 *
 * Everything shown is escaped here, so a name, a title or a reviewer's note can never become markup. This file is
 * pure: the server renders with it, and the Email tab's preview renders the same thing in the browser.
 */
import { PORTAL_EXPANSION, PORTAL_NAME, PORTAL_WORD, RANKINGS_OFFICE } from "@/lib/brand";

export type StepState = "done" | "now" | "next";

export interface EmailContent {
  /** The line mail clients show after the subject. */
  preheader: string;
  /** What kind of message this is, in a word or two: Receipt, Invitation, Review result. */
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  /** The code to keep: an access request's or a submission's reference. */
  reference?: { label: string; value: string };
  facts?: [label: string, value: string][];
  /** Where the request stands, as a short track. */
  steps?: { label: string; state: StepState }[];
  /** Someone's own words (a reviewer's note, a reason), set apart from the Hub's. */
  note?: { label: string; text: string };
  cta?: { label: string; href: string };
  /** Why this person got the message. */
  reason: string;
  /** The person has an account, so the footer says where they choose which emails they get. */
  settings?: boolean;
}

export interface EmailFrame {
  /** The Hub's public address, for the arms. Without one the masthead is set in type alone. */
  origin: string | null;
  /** The Office's mailbox and street address, when known. */
  office?: { email?: string; address?: string };
}

/* The palette: the sign-in page's onyx and gilt, UST Gold, and the public site's paper and ink. */
const C = {
  page: "#f3efe6",
  onyx: "#0f0e0c",
  gold: "#fcbf15",
  gilt: "#f3c95a",
  ivory: "#fbf6ea",
  onOnyx: "#b9b2a3",
  paper: "#ffffff",
  ink: "#1d1d1f",
  text: "#3a3a3c",
  muted: "#6e6e73",
  goldDeep: "#7a5800",
  well: "#faf7f0",
  line: "#e8e1d0",
  track: "#e4ddcc",
};

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "Arial, Helvetica, sans-serif";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text as HTML text or an attribute value. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Text with its line breaks kept. */
const lines = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

/** Only the Hub's own https (or, in development, http) addresses become links. */
const safeHref = (href: string) => (/^https?:\/\/[^\s"'<>]+$/i.test(href) ? href : null);

const row = (inner: string, style = "") => `<tr><td style="${style}">${inner}</td></tr>`;

function masthead(frame: EmailFrame) {
  const arms = frame.origin
    ? `<td width="52" valign="middle" style="padding-right:14px;"><img src="${esc(frame.origin)}/brand/ust-seal-reverse.png" width="52" height="52" alt="University of Santo Tomas" style="display:block;width:52px;height:52px;border:0;outline:none;"></td>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${arms}<td valign="middle">
<div style="font-family:${SERIF};font-size:25px;line-height:30px;color:${C.ivory};letter-spacing:0.01em;"><span style="font-style:italic;color:${C.gilt};">${esc(PORTAL_WORD)}</span> Portal</div>
<div style="font-family:${SANS};font-size:12px;line-height:18px;color:${C.onOnyx};padding-top:2px;"><span style="white-space:nowrap;">University of Santo Tomas</span> &nbsp;&middot;&nbsp; <span style="white-space:nowrap;">${esc(RANKINGS_OFFICE)}</span></div>
</td></tr></table>`;
}

function ticket(content: EmailContent) {
  const { reference, facts = [] } = content;
  if (!reference && !facts.length) return "";
  const head = reference
    ? `<tr><td class="em-rule" style="padding:18px 22px ${facts.length ? "16px" : "18px"} 22px;${facts.length ? `border-bottom:1px dashed ${C.line};` : ""}">
<div style="font-family:${SANS};font-size:12px;line-height:16px;color:${C.muted};">${esc(reference.label)}</div>
<div class="em-ink" style="font-family:${SERIF};font-size:30px;line-height:38px;color:${C.ink};letter-spacing:0.03em;">${esc(reference.value)}</div>
</td></tr>`
    : "";
  const rows = facts
    .map(
      ([label, value], i) =>
        `<tr><td valign="top" style="padding:${i ? 6 : 0}px 16px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};white-space:nowrap;">${esc(label)}</td><td class="em-ink" valign="top" align="right" style="padding:${i ? 6 : 0}px 0 0 0;font-family:${SANS};font-size:14px;line-height:20px;color:${C.ink};font-weight:bold;word-break:break-word;">${lines(value)}</td></tr>`,
    )
    .join("");
  const body = facts.length ? `<tr><td style="padding:16px 22px 18px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>` : "";
  return `<table class="em-well" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.well};border:1px solid ${C.line};border-radius:14px;border-collapse:separate;">${head}${body}</table>`;
}

function track(steps: NonNullable<EmailContent["steps"]>) {
  const width = Math.floor(100 / steps.length);
  const cells = steps
    .map((s, i) => {
      const on = s.state !== "next";
      return `<td width="${width}%" valign="top" style="padding:0 ${i === steps.length - 1 ? 0 : 6}px 0 0;">
<div${on ? "" : ' class="em-track"'} style="height:4px;line-height:4px;font-size:0;border-radius:4px;background-color:${on ? C.gold : C.track};">&nbsp;</div>
<div class="${on ? "em-ink" : "em-muted"}" style="padding-top:8px;font-family:${SANS};font-size:12px;line-height:16px;color:${on ? C.ink : C.muted};${s.state === "now" ? "font-weight:bold;" : ""}">${esc(s.label)}</div>
</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

function button(cta: { label: string; href: string }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="em-btn" align="center" bgcolor="${C.onyx}" style="background-color:${C.onyx};border-radius:999px;">
<a href="${esc(cta.href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;line-height:20px;font-weight:bold;color:${C.ivory};text-decoration:none;border-radius:999px;">${esc(cta.label)} &nbsp;&rarr;</a>
</td></tr></table>`;
}

/** The message as HTML and as plain text. */
export function renderEmail(content: EmailContent, frame: EmailFrame): { html: string; text: string } {
  const href = content.cta ? safeHref(content.cta.href) : null;
  const cta = content.cta && href ? { label: content.cta.label, href } : null;
  const settings = content.settings ? "To choose which emails you get, open your account in the Portal, then Notifications." : "";
  const paragraphs = content.paragraphs.map((p) => p.trim()).filter(Boolean);

  const blocks: string[] = [
    row(`<div class="em-gold" style="font-family:${SANS};font-size:13px;line-height:18px;font-weight:bold;color:${C.goldDeep};">${esc(content.eyebrow)}</div>`, "padding:0 0 10px 0;"),
    row(`<h1 class="em-ink" style="margin:0;font-family:${SERIF};font-size:30px;line-height:37px;font-weight:normal;color:${C.ink};letter-spacing:-0.01em;">${esc(content.heading)}</h1>`, "padding:0 0 18px 0;"),
    ...paragraphs.map((p) => row(`<p class="em-text" style="margin:0;font-family:${SANS};font-size:16px;line-height:26px;color:${C.text};">${lines(p)}</p>`, "padding:0 0 16px 0;")),
  ];
  if (content.note?.text.trim())
    blocks.push(
      row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ${C.gold};padding:2px 0 2px 16px;">
<div style="font-family:${SANS};font-size:12px;line-height:16px;color:${C.muted};padding-bottom:4px;">${esc(content.note.label)}</div>
<div class="em-ink" style="font-family:${SERIF};font-size:17px;line-height:26px;font-style:italic;color:${C.ink};">${lines(content.note.text.trim())}</div>
</td></tr></table>`,
        "padding:4px 0 20px 0;",
      ),
    );
  const stub = ticket(content);
  if (stub) blocks.push(row(stub, "padding:8px 0 24px 0;"));
  if (content.steps?.length) blocks.push(row(track(content.steps), "padding:0 0 28px 0;"));
  if (cta) {
    blocks.push(row(button(cta), "padding:4px 0 18px 0;"));
    blocks.push(
      row(
        `<p class="em-muted" style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted};">If the button does not open, paste this address into your browser:<br><a href="${esc(cta.href)}" target="_blank" class="em-gold" style="color:${C.goldDeep};text-decoration:underline;word-break:break-all;">${esc(cta.href)}</a></p>`,
        "padding:0 0 8px 0;",
      ),
    );
  }

  const office = [frame.office?.address, frame.office?.email].filter(Boolean) as string[];
  const footer = [
    `<p class="em-muted" style="margin:0 0 10px 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">${esc(content.reason)}${settings ? ` ${esc(settings)}` : ""}</p>`,
    `<p class="em-muted" style="margin:0 0 10px 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">This message was sent automatically.</p>`,
    `<p class="em-muted" style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted};"><span class="em-ink" style="color:${C.ink};font-weight:bold;">${esc(PORTAL_NAME)}</span><br>${esc(PORTAL_EXPANSION)}<br>${esc(RANKINGS_OFFICE)}, University of Santo Tomas${office.length ? `<br>${office.map(esc).join(" &nbsp;&middot;&nbsp; ")}` : ""}</p>`,
  ].join("");

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(content.heading)}</title>
<style>
  body { margin: 0; padding: 0; width: 100%; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
  img { -ms-interpolation-mode: bicubic; }
  a { color: ${C.goldDeep}; }
  @media (max-width: 620px) {
    .em-shell { width: 100% !important; }
    .em-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .em-outer { padding: 0 !important; }
    .em-card { border-radius: 0 !important; }
    h1 { font-size: 26px !important; line-height: 32px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .em-page, .em-outer { background-color: #0b0a09 !important; }
    .em-paper { background-color: #1a1917 !important; }
    .em-foot { background-color: #141312 !important; border-color: #2b2925 !important; }
    .em-well { background-color: #211f1c !important; border-color: #35322c !important; }
    .em-rule { border-color: #3d3a33 !important; }
    .em-track { background-color: #3d3a33 !important; }
    .em-ink { color: #f5f5f7 !important; }
    .em-text { color: #d6d3cc !important; }
    .em-muted { color: #a19c90 !important; }
    .em-gold { color: ${C.gilt} !important; }
    .em-btn { background-color: ${C.gold} !important; }
    .em-btn a { color: ${C.onyx} !important; }
  }
</style>
</head>
<body class="em-page" style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${esc(content.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>
<table class="em-page" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};">
<tr><td class="em-outer" align="center" style="padding:32px 16px;background-color:${C.page};">
<table class="em-shell em-card" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-radius:18px;overflow:hidden;border-collapse:separate;">
<tr><td class="em-pad" bgcolor="${C.onyx}" style="background-color:${C.onyx};padding:26px 36px;">${masthead(frame)}</td></tr>
<tr><td bgcolor="${C.gold}" style="background-color:${C.gold};height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>
<tr><td class="em-pad em-paper" bgcolor="${C.paper}" style="background-color:${C.paper};padding:36px 36px 28px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${blocks.join("")}</table>
</td></tr>
<tr><td class="em-pad em-foot" bgcolor="${C.well}" style="background-color:${C.well};border-top:1px solid ${C.line};padding:24px 36px 28px 36px;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `${PORTAL_NAME} · University of Santo Tomas`,
    "",
    content.heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(content.note?.text.trim() ? [`${content.note.label}: ${content.note.text.trim()}`, ""] : []),
    ...(content.reference ? [`${content.reference.label}: ${content.reference.value}`] : []),
    ...(content.facts ?? []).map(([label, value]) => `${label}: ${value}`),
    ...(content.reference || content.facts?.length ? [""] : []),
    ...(content.steps?.length ? [content.steps.map((s) => (s.state === "now" ? `[${s.label}]` : s.label)).join(" > "), ""] : []),
    ...(cta ? [`${cta.label}: ${cta.href}`, ""] : []),
    "--",
    content.reason,
    ...(settings ? [settings] : []),
    "This message was sent automatically.",
    `${RANKINGS_OFFICE}, University of Santo Tomas`,
    ...office,
  ].join("\n");

  return { html, text };
}
