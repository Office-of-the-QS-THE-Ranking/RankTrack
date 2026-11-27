/*
 * Send a custom event to Web Analytics from any client component: track("Downloaded report", { ranking: "THE" }).
 * Names up to 60 characters; up to 8 properties of short text, numbers or true/false. Nothing is sent to anyone but
 * the Hub, and nothing is recorded while Web Analytics is off.
 */
export type TrackProps = Record<string, string | number | boolean>;

export function send(body: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.("/api/pulse", new Blob([data], { type: "application/json" }))) return;
  } catch {
    /* Fall back to fetch. */
  }
  void fetch("/api/pulse", { method: "POST", body: data, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "omit" }).catch(() => undefined);
}

export function track(name: string, props?: TrackProps) {
  if (typeof window === "undefined") return;
  send({ t: "event", n: name, d: props, p: location.pathname });
}
