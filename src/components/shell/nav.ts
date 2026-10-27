import type { Reference } from "@/lib/reference";
import type { IconName } from "@/components/ui/Icon";
import type { Action, ModuleKey } from "@/lib/governance/types";
import { PUBLICATION_SECTIONS } from "@/lib/publications";

export type Variant = "public" | "office" | "unit";

export interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  /** Which live count the row shows, filled in by the shell from governed data. */
  count?: "review" | "revisions";
  /** Base path for the ranking sub-menu (THE / QS / UI GreenMetric / WURI groups). */
  rankingsBase?: string;
  /** Base path for the Publications sub-menu (Stories & News, Research Articles, Reports & Insights). */
  publicationsBase?: string;
  /** The permission the row needs. Rows the viewer cannot use are not shown. */
  need?: [ModuleKey, Action];
  /** The System Configuration feature the row depends on. */
  feature?: string;
  /** Shown only to people who administer something (any Administration section). */
  admin?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavLink[];
}

/* Main navigation from the proposal: Dashboard, Rankings, Contributions, Publications, Recognition,
   Knowledge Center, Reports, About the Office. Rankings, Publications and Administration open their own
   sets of tabs in the sidebar. Administration is shown to people who administer something; About the
   Office sits apart at the foot. */
export const NAV: Record<Variant, NavGroup[]> = {
  public: [
    {
      items: [
        { href: "/", label: "Home", icon: "dashboard", exact: true },
        { href: "/rankings", label: "Rankings", icon: "rankings", rankingsBase: "/rankings" },
        { href: "/publications", label: "Publications", icon: "publications", publicationsBase: "/publications" },
        { href: "/recognition", label: "Recognition", icon: "recognition" },
        { href: "/knowledge", label: "Knowledge Center", icon: "knowledge" },
        { href: "/about", label: "About the Office", icon: "about" },
      ],
    },
  ],
  office: [
    {
      items: [
        { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true, need: ["dashboard", "view"] },
        { href: "/admin/rankings", label: "Rankings", icon: "rankings", rankingsBase: "/admin/rankings", need: ["rankings", "view"] },
        { href: "/admin/contributions", label: "Contributions", icon: "contributions", count: "review", need: ["evidence", "view"] },
        { href: "/admin/units", label: "Units", icon: "units", need: ["units", "view"] },
        { href: "/admin/publications", label: "Publications", icon: "publications", need: ["posts", "view"], publicationsBase: "/admin/publications" },
        { href: "/admin/recognition", label: "Recognition", icon: "recognition", feature: "recognition-internal" },
        { href: "/admin/knowledge", label: "Knowledge Center", icon: "knowledge", need: ["knowledge", "view"] },
        { href: "/admin/reports", label: "Reports", icon: "reports", need: ["reports", "view"], feature: "reports" },
        { href: "/admin/administration", label: "Administration", icon: "sliders", admin: true },
        { href: "/admin/about", label: "About the Office", icon: "about" },
      ],
    },
  ],
  unit: [
    {
      label: "Contributions",
      items: [
        { href: "/portal", label: "My dashboard", icon: "dashboard", exact: true },
        { href: "/portal/submit", label: "Submit evidence", icon: "upload", need: ["evidence", "submit"], feature: "submit-evidence" },
        { href: "/portal/story", label: "Propose a story", icon: "pen", need: ["stories", "create"], feature: "story-proposals" },
        { href: "/portal/innovation", label: "Propose an innovation", icon: "innovation", need: ["stories", "create"], feature: "innovation-proposals" },
        { href: "/portal/feedback", label: "Validation comments", icon: "comment", count: "revisions", need: ["evidence", "edit"] },
        { href: "/portal/history", label: "Submission history", icon: "history", need: ["evidence", "view"] },
        { href: "/portal/assistance", label: "Request assistance", icon: "help", feature: "assistance" },
      ],
    },
    {
      label: "Resources",
      items: [{ href: "/portal/knowledge", label: "Knowledge Center", icon: "knowledge", need: ["knowledge", "view"] }],
    },
    {
      label: "Manage",
      items: [{ href: "/portal/administration", label: "Administration", icon: "sliders", admin: true }],
    },
  ],
};

/* The ranking pages, by group, limited to the rankings System Configuration tracks. The overview is a
   view of the dashboard, so it has no entry here. */
export const rankingSubnav = (ref: Reference, base: string, active?: string[]) =>
  ref.groups.map((g) => ({
    group: g.label,
    items: g.slugs
      .filter((s) => !active || active.includes(s))
      .flatMap((s) => {
        const r = ref.rankings.find((x) => x.slug === s);
        return r ? [{ href: `${base}/${s}`, label: r.short, family: r.family }] : [];
      }),
  })).filter((g) => g.items.length);

/* The Publications pages, under the workspace's or the website's base. */
export const publicationsSubnav = (base: string) =>
  PUBLICATION_SECTIONS.map((s) => ({ href: `${base}/${s.key}`, label: s.label, icon: s.icon }));

/* Public/Internal view switch keeps the reader on the equivalent page. */
export function publicPathFor(path: string): string {
  const m = path.match(/^\/admin\/rankings\/([^/]+)/);
  if (m) return `/rankings/${m[1]}`;
  if (path.startsWith("/admin/rankings")) return "/rankings";
  const pub = path.match(/^\/admin\/publications\/(stories|research|reports)/);
  if (pub) return `/publications/${pub[1]}`;
  for (const seg of ["publications", "recognition", "knowledge", "about"]) {
    if (path.startsWith(`/admin/${seg}`) || path.startsWith(`/portal/${seg}`)) return `/${seg}`;
  }
  return "/";
}

export function internalPathFor(path: string): string {
  const m = path.match(/^\/rankings\/([^/]+)/);
  if (m) return `/admin/rankings/${m[1]}`;
  if (path.startsWith("/rankings")) return "/admin/rankings";
  const pub = path.match(/^\/publications\/(stories|research|reports)/);
  if (pub) return `/admin/publications/${pub[1]}`;
  for (const seg of ["publications", "recognition", "knowledge", "about"]) {
    if (path.startsWith(`/${seg}`)) return `/admin/${seg}`;
  }
  return "/admin";
}

export const isActive = (pathname: string, href: string, exact?: boolean) =>
  exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
