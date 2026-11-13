/* The Hub's firewall: settings, rules, recorded requests and what the Firewall page shows. */

export type FirewallMode = "off" | "log" | "on";
export type RuleKind = "ip" | "country" | "path" | "agent";
export type RuleAction = "block" | "allow" | "log";
/** What happened to a request. "log" is flagged: a log rule matched, or a rule would have blocked while monitoring. */
export type RequestAction = "allow" | "log" | "block" | "rate_limit" | "lockdown";
export type FirewallRange = "1h" | "24h" | "7d" | "30d";
export type RequestFilter = "all" | "allowed" | "denied" | "flagged";

export interface FirewallSettings {
  mode: FirewallMode;
  lockdown: boolean;
  rateLimit: number;
  blockScanners: boolean;
  retentionDays: number;
  /** Run on development servers too (they share the production database). */
  devEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

/** What a proxy holds: the settings and the rules in force. */
export interface ActiveRule {
  id: string;
  kind: RuleKind;
  value: string;
  action: RuleAction;
}

export interface FirewallConfig {
  settings: Pick<FirewallSettings, "mode" | "lockdown" | "rateLimit" | "blockScanners" | "devEnabled">;
  rules: ActiveRule[];
}

export interface FirewallRule extends ActiveRule {
  name: string;
  enabled: boolean;
  expiresAt: string | null;
  note: string | null;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface FirewallRequest {
  id: number;
  at: string;
  ip: string;
  country: string | null;
  city: string | null;
  method: string;
  host: string | null;
  path: string;
  agent: string | null;
  referrer: string | null;
  session: boolean;
  action: RequestAction;
  ruleId: string | null;
  reason: string | null;
}

export interface TopRow {
  key: string;
  n: number;
  denied: number;
  country?: string | null;
  last?: string;
  agent?: string | null;
}

export interface FirewallSummary {
  total: number;
  denied: number;
  flagged: number;
  ips: number;
  countries: number;
  sessions: number;
  series: { t: string; allowed: number; denied: number; flagged: number }[];
  topIps: TopRow[];
  topPaths: TopRow[];
  topCountries: TopRow[];
  topAgents: TopRow[];
  reasons: { key: string; action: RequestAction; n: number }[];
}

export interface FirewallView {
  range: FirewallRange;
  filter: RequestFilter;
  q: string;
}

export interface FirewallDesk {
  view: FirewallView;
  /** Start of the range and the chart's step, in ms. */
  from: string;
  step: number;
  now: string;
  summary: FirewallSummary;
  requests: FirewallRequest[];
  rules: FirewallRule[];
  settings: FirewallSettings;
  /** The person looking, as the firewall sees them. */
  you: { ip: string; country: string | null };
  /** Whether the host tells the Hub the real client address and location, and why the firewall isn't running on this server (null when it is; lib/firewall/guard.ts). */
  source: { ipHeader: string | null; geo: boolean; off: "switched-off" | "development" | "no-database" | null; dev: boolean };
  canEdit: boolean;
  canManage: boolean;
}

export const DENIED: RequestAction[] = ["block", "rate_limit", "lockdown"];
export const RANGES: Record<FirewallRange, { ms: number; step: number; label: string }> = {
  "1h": { ms: 3_600_000, step: 300_000, label: "Last hour" },
  "24h": { ms: 86_400_000, step: 3_600_000, label: "Last 24 hours" },
  "7d": { ms: 7 * 86_400_000, step: 6 * 3_600_000, label: "Last 7 days" },
  "30d": { ms: 30 * 86_400_000, step: 86_400_000, label: "Last 30 days" },
};
