/*
 * What the firewall decides for one request, from the settings and rules in force. Pure, so it is tested on its own
 * (tests/firewall.test.ts) and the proxy only gathers the facts and acts on the answer.
 *
 * Order: an allow rule lets the request through whatever else applies (so the Office can never be locked out from an
 * address it trusts); then block rules; then the built-in scanner and probe checks; then the per-address rate limit;
 * then lockdown. While monitoring, anything that would be refused is recorded as flagged and let through.
 */
import { inRange, parseIp, parseRange } from "./ip";
import type { ActiveRule, FirewallConfig, RequestAction } from "./types";

export interface Facts {
  ip: string;
  country: string | null;
  path: string;
  agent: string;
  /** The request carries a Hub session cookie. */
  session: boolean;
  /** Requests from this address in the current minute, this one included. */
  perMinute: number;
}

export interface Decision {
  action: RequestAction;
  ruleId: string | null;
  reason: string | null;
  /** The response the visitor gets; null lets the request through. */
  respond: null | 403 | 429 | 503;
}

/** Paths the Hub never serves that scanners probe for. */
const PROBE = /^\/(?:\.(?:env|git|svn|hg|aws|ssh|htaccess|htpasswd|DS_Store)|wp-(?:admin|login|content|includes|config)|xmlrpc\.php|phpmyadmin|pma\/|myadmin|cgi-bin|vendor\/phpunit|boaform|HNAP1|actuator|server-status|solr\/|owa\/|autodiscover|telescope|_profiler|\.vscode|backup\.(?:sql|zip|tar)|dump\.sql)/i;
const SCRIPT_EXT = /\.(?:php\d?|asp|aspx|jsp|cgi|pl|env|ini|sql|bak)$/i;
/** User agents of vulnerability scanners and brute-force tools. */
const SCANNER = /(sqlmap|nikto|nmap|masscan|zgrab|wpscan|acunetix|nessus|openvas|dirbuster|gobuster|ffuf|nuclei|feroxbuster|whatweb|fimap|hydra|jaeles|arachni|netsparker|w3af|commix|xsstrike)/i;

/** Paths that stay open during lockdown: signing in, and the Hub's scheduled jobs. */
const LOCKDOWN_OPEN = /^\/(?:signin|auth|api\/auth|api\/cron)(?:\/|$)/;

export function scannerReason(path: string, agent: string): string | null {
  if (!agent.trim()) return "No user agent";
  const tool = agent.match(SCANNER);
  if (tool) return `Scanner: ${tool[1].toLowerCase()}`;
  if (PROBE.test(path)) return `Probe: ${path.slice(0, 40)}`;
  if (SCRIPT_EXT.test(path)) return `Probe: ${path.slice(path.lastIndexOf(".")).slice(0, 12)} file`;
  return null;
}

/** Whether a rule matches the request. Invalid rule values never match. */
export function matches(rule: ActiveRule, f: Pick<Facts, "ip" | "country" | "path" | "agent">): boolean {
  switch (rule.kind) {
    case "ip": {
      const range = parseRange(rule.value);
      const ip = parseIp(f.ip);
      return !!range && !!ip && inRange(ip, range);
    }
    case "country":
      return !!f.country && f.country.toUpperCase() === rule.value.toUpperCase();
    case "path": {
      const prefix = rule.value.startsWith("/") ? rule.value : `/${rule.value}`;
      return f.path.toLowerCase().startsWith(prefix.toLowerCase());
    }
    case "agent":
      return f.agent.toLowerCase().includes(rule.value.toLowerCase());
  }
}

export function decide(cfg: FirewallConfig, f: Facts): Decision {
  const { settings, rules } = cfg;
  const allow = rules.find((r) => r.action === "allow" && matches(r, f));
  if (allow) return { action: "allow", ruleId: allow.id, reason: "Allow rule", respond: null };

  let refusal: Decision | null = null;
  const block = rules.find((r) => r.action === "block" && matches(r, f));
  if (block) refusal = { action: "block", ruleId: block.id, reason: "Block rule", respond: 403 };
  if (!refusal && settings.blockScanners) {
    const why = scannerReason(f.path, f.agent);
    if (why) refusal = { action: "block", ruleId: null, reason: why, respond: 403 };
  }
  if (!refusal && settings.rateLimit > 0 && f.perMinute > settings.rateLimit) {
    refusal = { action: "rate_limit", ruleId: null, reason: `Over ${settings.rateLimit} a minute`, respond: 429 };
  }
  if (!refusal && settings.lockdown && !f.session && !LOCKDOWN_OPEN.test(f.path)) {
    refusal = { action: "lockdown", ruleId: null, reason: "Lockdown", respond: 503 };
  }

  if (refusal) {
    if (settings.mode === "on") return refusal;
    return { action: "log", ruleId: refusal.ruleId, reason: `Would ${refusal.action === "rate_limit" ? "rate-limit" : refusal.action === "lockdown" ? "lock out" : "block"}: ${refusal.reason}`, respond: null };
  }
  const flag = rules.find((r) => r.action === "log" && matches(r, f));
  if (flag) return { action: "log", ruleId: flag.id, reason: "Log rule", respond: null };
  return { action: "allow", ruleId: null, reason: null, respond: null };
}
