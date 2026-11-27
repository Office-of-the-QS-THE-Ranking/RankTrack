/* Web Analytics: the Hub's own cookieless page analytics (Command & Control › Firewall › Analytics). */

export type WaRange = "24h" | "7d" | "30d" | "90d";
export type WaArea = "site" | "portal" | "form" | "signin";
export type WaAreaFilter = "all" | WaArea;
export type WaDevice = "desktop" | "mobile" | "tablet";

export interface WaSettings {
  enabled: boolean;
  retentionDays: number;
  /** Count visits on development servers too (they share the production database). */
  devEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface WaRow {
  key: string;
  visitors: number;
  n: number;
  last?: string;
}

export interface WaPoint {
  t: string;
  visitors: number;
  pageviews: number;
  /** Visitors who arrived in this step, and how many of them saw one page and left. */
  arrived: number;
  bounced: number;
}

export interface WaSummary {
  visitors: number;
  pageviews: number;
  bounced: number;
  prevVisitors: number;
  prevPageviews: number;
  prevBounced: number;
  /** Visitors with a page view in the last 5 minutes. */
  online: number;
  series: WaPoint[];
  pages: WaRow[];
  routes: WaRow[];
  hosts: WaRow[];
  referrers: WaRow[];
  /** Visitors who came straight in, or from no site the browser would name. */
  direct: number;
  utm: WaRow[];
  countries: WaRow[];
  devices: WaRow[];
  browsers: WaRow[];
  os: WaRow[];
  events: WaRow[];
}

export interface WaEvent {
  id: number;
  at: string;
  name: string;
  path: string;
  area: WaArea;
  country: string | null;
  device: WaDevice | null;
  props: Record<string, string | number | boolean> | null;
}

export interface WaView {
  range: WaRange;
  area: WaAreaFilter;
}

export interface WaDesk {
  view: WaView;
  from: string;
  step: number;
  now: string;
  summary: WaSummary;
  recent: WaEvent[];
  settings: WaSettings;
  /** Why nothing is recorded on this server (null when it is), and whether the host sends locations. */
  source: { off: "development" | "no-database" | null; geo: boolean };
  canEdit: boolean;
  canManage: boolean;
}

export const RANGES: Record<WaRange, { ms: number; step: number; label: string; short: string }> = {
  "24h": { ms: 86_400_000, step: 3_600_000, label: "Last 24 hours", short: "24H" },
  "7d": { ms: 7 * 86_400_000, step: 86_400_000, label: "Last 7 days", short: "7D" },
  "30d": { ms: 30 * 86_400_000, step: 86_400_000, label: "Last 30 days", short: "30D" },
  "90d": { ms: 90 * 86_400_000, step: 7 * 86_400_000, label: "Last 90 days", short: "90D" },
};

export const AREAS: Record<WaAreaFilter, string> = { all: "All", site: "Public site", portal: "Portals", form: "Forms", signin: "Sign-in" };
