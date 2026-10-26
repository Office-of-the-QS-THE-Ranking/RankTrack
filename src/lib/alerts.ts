import "server-only";

/*
 * Operational alerts: failures someone should hear about before users report them (a save to the governance
 * store, a recovery point, the public media copies, the audit anchor, unhandled request errors). Each is one JSON
 * line in the server log, which any log drain can search, and, when HUB_ALERT_WEBHOOK is set, a message to that
 * webhook (Slack, Google Chat and Discord accept the same post). The same event is sent at most once every ten
 * minutes per server instance. Alerts carry no cookies, headers or personal data.
 */

const WEBHOOK = process.env.HUB_ALERT_WEBHOOK?.trim();
const QUIET_MS = 10 * 60_000;
const g = globalThis as typeof globalThis & { __hubAlerts?: Map<string, number> };
const sent = (g.__hubAlerts ??= new Map());

export type AlertEvent = "store-save" | "recovery-point" | "media-sync" | "audit-anchor" | "reference-data" | "request-error";

export async function alert(event: AlertEvent, message: string, detail: Record<string, string | number | undefined> = {}) {
  console.error(JSON.stringify({ level: "error", alert: event, message, ...detail, at: new Date().toISOString() }));
  if (!WEBHOOK) return;
  const key = `${event}|${message}`;
  const last = sent.get(key) ?? 0;
  if (Date.now() - last < QUIET_MS) return;
  sent.set(key, Date.now());
  const text = `UST Rankings Hub · ${event}: ${message}${Object.keys(detail).length ? `\n${Object.entries(detail).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n")}` : ""}`;
  try {
    await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text.slice(0, 1900) }), signal: AbortSignal.timeout(5000) });
  } catch (e) {
    console.error(`Alert webhook failed: ${(e as Error).message}`);
  }
}
