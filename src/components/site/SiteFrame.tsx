import type { ReactNode } from "react";
import { siteFontVars } from "./fonts";
import { InlineScript } from "./InlineScript";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { SiteLoader } from "./SiteLoader";
import { SiteMotion } from "./SiteMotion";
import { SmoothScroll } from "./SmoothScroll";
import { governedMenus } from "./menu";
import { publicHub, siteData } from "@/lib/governance/server/site";

/* Mark scripting as available before the first paint. Every full load gets the complete intro. */
const BOOT = `document.documentElement.classList.add("js");`;

/** The public website: its own header, footer and loader, outside the dashboard shell. */
export async function SiteFrame({ children, loader = true }: { children: ReactNode; loader?: boolean }) {
  // What the public may see is decided in Administration: menus, search, and a site-wide notice.
  const site = await siteData();
  const menus = governedMenus({ publicSlugs: site.rankings.map((r) => r.slug), stories: site.stories, features: site.features });
  return (
    <div className={`site ${siteFontVars}`} id="top" data-intro={loader ? "load" : "done"} suppressHydrationWarning>
      <InlineScript html={BOOT} />
      {loader && <SiteLoader />}
      <a className="w-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader menus={menus} hub={(await publicHub())} />
      <div className="w-nav-backdrop" aria-hidden="true" />
      <main id="main" className="w-main" tabIndex={-1}>
        {site.notice && (
          <p className="w-notice" role="status">
            {site.notice}
          </p>
        )}
        {children}
      </main>
      <SiteFooter />
      <SiteMotion />
      <SmoothScroll />
    </div>
  );
}
