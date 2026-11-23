/*
 * Who may show the Hub's pages inside an iframe. Only the public website and the portal demo can be framed, and only by
 * the sites listed in PORTFOLIO_ORIGINS. Everything else (the workspaces, sign-in, forms, APIs, media) refuses every
 * frame: frame-ancestors 'none' from src/proxy.ts and X-Frame-Options: DENY from next.config.ts.
 */

/** The public pages a portfolio may embed, by first path segment ("" is the home page), and the portal demo. */
const PUBLIC_SECTIONS = ["rankings", "publications", "knowledge-base", "recognition", "about", "privacy", "terms", "cookies"];
const DEMO = "portal/demo";

/** Whether a page may be framed by PORTFOLIO_ORIGINS. */
export function framable(pathname: string): boolean {
  const path = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (path === "") return true;
  return [...PUBLIC_SECTIONS, DEMO].some((s) => path === s || path.startsWith(`${s}/`));
}

/**
 * The next.config.ts header source for X-Frame-Options: DENY: every path except the home page, the public sections and
 * the portal demo. (`.+` leaves "/" out; the lookahead leaves out the sections.)
 */
export const FRAME_DENY_SOURCE = `/:path((?!(?:${[...PUBLIC_SECTIONS, DEMO].map((s) => s.replace(/\//g, "\\/")).join("|")})(?:/|$)).+)`;

/**
 * The origins in PORTFOLIO_ORIGINS (separated by commas or spaces) that may frame those pages: https origins, and
 * http://localhost on any port (for testing from a local portfolio). Anything else is ignored.
 */
export function portfolioOrigins(raw = process.env.PORTFOLIO_ORIGINS ?? ""): string[] {
  const out = raw.split(/[\s,]+/).flatMap((o) => {
    if (!o) return [];
    try {
      const u = new URL(o);
      return u.protocol === "https:" || (u.protocol === "http:" && u.hostname === "localhost") ? [u.origin] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(out)];
}

/** The frame-ancestors value for a page. */
export function frameAncestors(pathname: string, origins = portfolioOrigins()): string {
  if (!framable(pathname)) return "'none'";
  // The demo is meant to be embedded, so it may always frame itself; a public page is framable only once origins are set.
  const demo = pathname === `/${DEMO}` || pathname.startsWith(`/${DEMO}/`);
  if (!origins.length && !demo) return "'none'";
  return ["'self'", ...origins].join(" ");
}
