/*
 * Where the real screens' addresses lead in the portal demo. Each covered screen maps onto /portal/demo/…; every
 * other workspace or site address maps to null, so its link is shown but goes nowhere (components/hub/paths.tsx).
 */

export const DEMO_BASE = "/portal/demo";

const ROUTES: Record<string, string> = {
  "/portal": DEMO_BASE,
  "/portal/submit": `${DEMO_BASE}/submit`,
  "/admin": `${DEMO_BASE}/office`,
  "/admin/unit-submissions": `${DEMO_BASE}/unit-submissions`,
  "/admin/recognition": `${DEMO_BASE}/office?view=recognition`,
};

/** The demo's own pages, and which side of the Hub each belongs to. */
export const DEMO_PAGES: Record<string, "unit" | "office"> = {
  [DEMO_BASE]: "unit",
  [`${DEMO_BASE}/submit`]: "unit",
  [`${DEMO_BASE}/office`]: "office",
  [`${DEMO_BASE}/unit-submissions`]: "office",
};

export function demoPath(href: string): string | null {
  // Anchors, queries and other schemes stay as they are; the click guard (DemoGuard) stops anything off-site.
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const path = (cut < 0 ? href : href.slice(0, cut)).replace(/\/+$/, "") || "/";
  const rest = cut < 0 ? "" : href.slice(cut);
  if (path === DEMO_BASE || path.startsWith(`${DEMO_BASE}/`)) return href;
  const to = ROUTES[path];
  if (!to) return null;
  // "/admin/recognition" already carries its query.
  return to.includes("?") && rest.startsWith("?") ? `${to}&${rest.slice(1)}` : `${to}${rest}`;
}

/** The real screen a demo page shows: /portal/demo/submit is the Hub's /portal/submit. */
export function demoScreen(pathname: string): string {
  const path = pathname.replace(/\/+$/, "");
  const real = Object.entries(ROUTES).find(([, to]) => to === path)?.[0];
  return real ?? pathname;
}
