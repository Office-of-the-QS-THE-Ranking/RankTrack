"use client";

/*
 * Where a workspace address leads. In the Hub every address is itself. The portal demo maps the real screens'
 * addresses (/portal/submit, /admin/unit-submissions…) onto its own (/portal/demo/…), and anything it doesn't
 * cover to null: the link is shown but goes nowhere, so a demo page never loads a real workspace route.
 * Components use WorkspaceLink and useWorkspaceRouter (below) in place of next/link and next/navigation's router.
 */
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, forwardRef, useContext, useMemo, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";

export type PathMap = (href: string) => string | null;

const identity: PathMap = (href) => href;
const Ctx = createContext<PathMap>(identity);
/** The real screen an address shows (the demo's /portal/demo/submit shows /portal/submit). */
const ScreenCtx = createContext<(pathname: string) => string>((p) => p);

export const NOT_IN_DEMO = "Demo: that page isn't part of the demo.";

export function WorkspacePaths({ map, screen, children }: { map: PathMap; screen: (pathname: string) => string; children: ReactNode }) {
  return (
    <Ctx.Provider value={map}>
      <ScreenCtx.Provider value={screen}>{children}</ScreenCtx.Provider>
    </Ctx.Provider>
  );
}

export const useWorkspacePaths = () => useContext(Ctx);

/** The address of the screen on show, as the Hub knows it, for breadcrumbs and the like. */
export function useScreenPathname() {
  const pathname = usePathname() ?? "/";
  return useContext(ScreenCtx)(pathname);
}

type LinkProps = ComponentProps<typeof NextLink>;

/** next/link, with the href passed through the workspace's paths. */
const WorkspaceLink = forwardRef<HTMLAnchorElement, LinkProps>(function WorkspaceLink({ href, ...props }, ref) {
  const map = useWorkspacePaths();
  if (map === identity) return <NextLink ref={ref} href={href} {...props} />;
  const raw = typeof href === "string" ? href : `${href.pathname ?? ""}${href.search ?? ""}${href.hash ?? ""}`;
  const to = map(raw);
  if (to !== null) return <NextLink ref={ref} href={to} {...props} />;
  const { prefetch: _p, replace: _r, scroll: _s, shallow: _sh, passHref: _ph, legacyBehavior: _lb, locale: _l, onNavigate: _n, ...rest } = props as LinkProps & Record<string, unknown>;
  return (
    <a
      ref={ref}
      {...(rest as ComponentProps<"a">)}
      role="link"
      aria-disabled="true"
      data-demo-off=""
      tabIndex={0}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        toast(NOT_IN_DEMO, "info");
      }}
    />
  );
});

export default WorkspaceLink;

/** next/navigation's router, with push and replace passed through the workspace's paths. */
export function useWorkspaceRouter() {
  const router = useRouter();
  const map = useWorkspacePaths();
  return useMemo(() => {
    if (map === identity) return router;
    const go = (fn: typeof router.push) => (href: string, opts?: Parameters<typeof router.push>[1]) => {
      const to = map(href);
      if (to === null) toast(NOT_IN_DEMO, "info");
      else fn(to, opts);
    };
    return { ...router, push: go(router.push), replace: go(router.replace), prefetch: (href: string) => (map(href) === null ? undefined : router.prefetch(map(href)!)) };
  }, [router, map]);
}
