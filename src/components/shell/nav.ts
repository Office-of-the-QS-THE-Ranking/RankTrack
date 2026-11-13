import type { Reference } from "@/lib/reference";
import type { IconName } from "@/components/ui/Icon";
import type { Action, ModuleKey } from "@/lib/governance/types";
import { PUBLICATION_SECTIONS } from "@/lib/publications";
import { workspaceViewLabel, workspaceViews, type WorkspaceView } from "@/lib/governance/workspace";

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
  /** Base path of the overview whose content tabs work across rankings (Scorecard, Positions, Data requests and so on). */
  overviewTabs?: string;
  /** Base path for the Publications sub-menu (Stories & News, Research Articles, Reports & Insights). */
  publicationsBase?: string;
  /** Base path for the Workspace sub-menu (its shelves, Digital Forms, Archives and the Knowledge Base), and the
      permission its shelves need. The row shows when any of its pages does. */
  workspace?: { base: string; office?: boolean; need: [ModuleKey, Action] };
  /** The permission the row needs. Rows the viewer cannot use are not shown. */
  need?: [ModuleKey, Action];
  /** The System Configuration feature the row depends on. */
  feature?: string;
  /** Shown only to people who administer something (any Command & Control section). */
  commandControl?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavLink[];
}

/* Main navigation from the proposal: Dashboard, Rankings, Unit Submissions, Publications, Recognition (a
   Dashboard tab in the office workspace), Workspace (with Build a Report), Knowledge Base, About the Office. Each has
   one job: the Dashboard summarises and links on, Rankings holds how the University scores (a ranking's page, plus an
   overview whose tabs work across rankings), Unit Submissions reviews what units send and, in its Units tab, who
   contributes, and Build a Report produces the documents. Rankings, Publications, Workspace and Command & Control open
   their own sets of tabs in the sidebar. A Coordinator's contributions are Submit evidence and their unit's
   Publications. Command & Control is shown to people who administer something. What the website's About page says is
   edited in the Knowledge Base's About the Office tab. A Student (the Secretary of a student organization, commission
   or council) has the Student Portal's pages only (forms submit is theirs alone): Dashboard, Assignments, Project
   Proposals, Evaluation Forms, Registrations, Terminal Reports. */
export const NAV: Record<Variant, NavGroup[]> = {
  public: [
    {
      items: [
        { href: "/", label: "Home", icon: "dashboard", exact: true },
        { href: "/rankings", label: "Rankings", icon: "rankings", rankingsBase: "/rankings" },
        { href: "/publications", label: "Publications", icon: "publications", publicationsBase: "/publications" },
        { href: "/recognition", label: "Recognition", icon: "recognition" },
        { href: "/knowledge-base", label: "Knowledge Base", icon: "knowledge" },
        { href: "/about", label: "About the Office", icon: "about" },
      ],
    },
  ],
  office: [
    {
      items: [
        { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true, need: ["dashboard", "view"] },
        { href: "/admin/rankings", label: "Rankings", icon: "rankings", rankingsBase: "/admin/rankings", overviewTabs: "/admin/rankings", need: ["rankings", "view"] },
        { href: "/admin/unit-submissions", label: "Unit Submissions", icon: "contributions", count: "review", need: ["evidence", "view"] },
        { href: "/admin/publications", label: "Publications", icon: "publications", need: ["posts", "view"], publicationsBase: "/admin/publications" },
        { href: "/admin/workspace", label: "Workspace", icon: "folder", workspace: { base: "/admin/workspace", office: true, need: ["knowledge", "edit"] } },
        { href: "/admin/knowledge-base", label: "Knowledge Base", icon: "knowledge", need: ["knowledge", "view"] },
        { href: "/admin/command-control", label: "Command & Control", icon: "sliders", commandControl: true },
      ],
    },
  ],
  unit: [
    {
      label: "Contributions",
      items: [
        { href: "/portal", label: "My dashboard", icon: "dashboard", exact: true },
        { href: "/portal/assignments", label: "Assignments", icon: "clipboard", need: ["forms", "submit"] },
        { href: "/portal/proposals", label: "Project Proposals", icon: "pen", need: ["forms", "submit"] },
        { href: "/portal/evaluations", label: "Evaluation Forms", icon: "data", need: ["forms", "submit"] },
        { href: "/portal/registrations", label: "Registrations", icon: "user-plus", need: ["forms", "submit"] },
        { href: "/portal/terminal-reports", label: "Terminal Reports", icon: "reports", need: ["forms", "submit"] },
        // Validation comments and each submission's history live in the Submit evidence table's records, so anyone
        // who reads the unit's evidence opens it; only contributors see its Submit evidence button.
        { href: "/portal/submit", label: "Submit evidence", icon: "upload", count: "revisions", need: ["evidence", "view"], feature: "submit-evidence" },
        // What the Office's data requests ask of the unit: values and evidence per indicator, and its activities.
        { href: "/portal/requests", label: "Data requests", icon: "inbox", need: ["data", "view"] },
        // The unit's own posts, articles and reports, each approved by the Rankings Office before it goes live.
        { href: "/portal/publications", label: "Publications", icon: "publications", need: ["posts", "view"], publicationsBase: "/portal/publications" },
      ],
    },
    {
      label: "Resources",
      items: [
        { href: "/portal/workspace", label: "Workspace", icon: "folder", workspace: { base: "/portal/workspace", need: ["evidence", "view"] } },
        { href: "/portal/knowledge-base", label: "Knowledge Base", icon: "knowledge", need: ["knowledge", "view"] },
      ],
    },
    {
      label: "Manage",
      items: [{ href: "/portal/command-control", label: "Command & Control", icon: "sliders", commandControl: true }],
    },
  ],
};

/* The ranking pages, by group, limited to the rankings System Configuration tracks. */
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

const WORKSPACE_ICONS: Record<WorkspaceView, IconName> = { working: "folder", library: "publications", forms: "clipboard", archive: "archive" };

export interface SubLink {
  href: string;
  label: string;
  icon: IconName;
  need: [ModuleKey, Action];
  /** The System Configuration feature the page depends on. */
  feature?: string;
}

/* The Rankings overview's content tabs, which work across rankings rather than on one: each edition's scorecard, where
   the University stands, the Office's data requests, the activity register, peer benchmarks and data imports. A
   ranking's own indicators, plan and methodology are tabs on its page. */
export const rankingOverviewTabs = (base: string): SubLink[] => [
  { href: base, label: "Scorecard", icon: "grid", need: ["rankings", "view"] },
  { href: `${base}/positions`, label: "Positions", icon: "rankings", need: ["rankings", "view"] },
  { href: `${base}/data-requests`, label: "Data requests", icon: "send", need: ["rankings", "view"] },
  { href: `${base}/activities`, label: "Activities", icon: "collaboration", need: ["rankings", "view"] },
  { href: `${base}/benchmarks`, label: "Benchmarks", icon: "trend-up", need: ["rankings", "view"] },
  { href: `${base}/imports`, label: "Data imports", icon: "upload", need: ["rankings", "manage"] },
];

/* The Workspace pages: its shelves, Digital Forms, Archives, then (in the Office's) Build a Report. Each keeps its
   own permission. The Knowledge Base is a main tab of its own. */
export const workspaceSubnav = ({ base, office = false, need }: NonNullable<NavLink["workspace"]>): SubLink[] => [
  ...workspaceViews(office).map((v) => ({ href: `${base}/${v}`, label: workspaceViewLabel(v), icon: WORKSPACE_ICONS[v], need })),
  ...(office ? [{ href: `${base}/build-a-report`, label: "Build a Report", icon: "reports" as IconName, need: ["reports", "view"] as [ModuleKey, Action], feature: "reports" }] : []),
];

/** Where the Knowledge Base lives on each side. */
export const knowledgeBaseHref = (variant: Variant) => (variant === "office" ? "/admin/knowledge-base" : variant === "unit" ? "/portal/knowledge-base" : "/knowledge-base");

/** Every page the navigation guards, the Workspace's own pages included, for the server-side Gate. */
export const navPages = (variant: Variant): Pick<NavLink, "href" | "need" | "feature">[] =>
  NAV[variant].flatMap((g) => g.items.flatMap((i) => [i, ...(i.workspace ? workspaceSubnav(i.workspace) : []), ...(i.overviewTabs ? rankingOverviewTabs(i.overviewTabs).filter((t) => t.href !== i.href) : [])]));

/** Whether a path is one of the Rankings overview's tabs, rather than a ranking's own page. */
export const isOverviewTab = (base: string, path: string) => rankingOverviewTabs(base).some((t) => t.href === path);

/* Public/Internal view switch keeps the reader on the equivalent page. */
export function publicPathFor(path: string): string {
  if (isOverviewTab("/admin/rankings", path)) return "/rankings";
  const m = path.match(/^\/admin\/rankings\/([^/]+)/);
  if (m) return `/rankings/${m[1]}`;
  if (path.startsWith("/admin/rankings")) return "/rankings";
  const pub = path.match(/^\/(?:admin|portal)\/publications\/(stories|research|reports)/);
  if (pub) return `/publications/${pub[1]}`;
  if (/^\/(admin|portal)\/knowledge-base/.test(path)) return "/knowledge-base";
  if (/^\/(admin|portal)\/about/.test(path)) return "/about";
  for (const seg of ["publications", "recognition"]) {
    if (path.startsWith(`/admin/${seg}`) || path.startsWith(`/portal/${seg}`)) return `/${seg}`;
  }
  return "/";
}

export const isActive = (pathname: string, href: string, exact?: boolean) =>
  exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
