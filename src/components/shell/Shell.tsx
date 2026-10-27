"use client";

import { THEME_BOOT, THEME_KEY } from "@/lib/boot-scripts";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { formatAsOf } from "@/lib/data";
import { familyOf } from "@/lib/reference";
import { useReference } from "@/components/reference/ReferenceProvider";
import type { HubData } from "@/lib/governance/hub-types";
import { feature, viewerCan, type Viewer } from "@/lib/governance/viewer";
import { signOut } from "@/app/actions/session";
import { Face } from "@/components/ui/Face";
import { Icon } from "@/components/ui/Icon";
import { InlineScript } from "@/components/site/InlineScript";
import { HubProvider, useGovern } from "@/components/hub/HubProvider";
import { IdleGuard } from "@/components/hub/IdleGuard";
import { NAV, isActive, publicationsSubnav, publicPathFor, rankingSubnav, type NavGroup, type Variant } from "./nav";
import { SearchPalette } from "./SearchPalette";
import { NavIcon } from "./NavIcon";
import { HeaderBreadcrumbs } from "./HeaderBreadcrumbs";
import { ProfileSettings } from "./ProfileSettings";
import { SECTIONS as ADMIN_SECTIONS, sectionHref } from "@/components/admin/sections";
import { Select } from "@/components/ui/pickers";

type Theme = "light" | "dark";
// Applies the saved (or system) appearance before the first paint, so dark mode never flashes light.
const WIPE_MS = 620;
const FADE_MS = 500;

function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const root = document.documentElement;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {}
    const initial: Theme =
      saved === "light" || saved === "dark" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.dataset.theme = initial;
    setTheme(initial);
    // The public site has its own fixed appearance: drop the attribute when the workspace closes.
    return () => {
      clearTimeout(fadeTimer.current);
      root.classList.remove("theme-wipe", "theme-fade");
      delete root.dataset.theme;
    };
  }, []);
  // The new appearance spreads out from the button as a circle. Reduced motion gets the browser's
  // plain cross-fade; browsers without View Transitions ease the colours over instead.
  const toggle = (from?: HTMLElement | null) => {
    const root = document.documentElement;
    const apply = (cls?: string) => {
      const next: Theme = root.dataset.theme === "dark" ? "light" : "dark";
      if (cls) root.classList.add(cls);
      root.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {}
      flushSync(() => setTheme(next));
    };
    if (typeof document.startViewTransition !== "function") {
      clearTimeout(fadeTimer.current);
      apply("theme-fade");
      fadeTimer.current = setTimeout(() => root.classList.remove("theme-fade"), FADE_MS);
      return;
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(() => apply());
      return;
    }
    const r = from?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 : innerWidth / 2;
    const y = r ? r.top + r.height / 2 : 0;
    const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const wipe = document.startViewTransition(() => apply("theme-wipe"));
    wipe.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
          { duration: WIPE_MS, easing: "cubic-bezier(0.32, 0.72, 0, 1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {});
    wipe.finished.finally(() => root.classList.remove("theme-wipe"));
  };
  return [theme, toggle] as const;
}

const DATE_FMT = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const TIME_FMT = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" });

/** Today's date and the time, ticking on the minute. Rendered after mount so server and client agree. */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return (
    <span className="top__clock" aria-hidden={now ? undefined : true}>
      {now && (
        <time dateTime={now.toISOString()}>
          <span className="top__clock-date">{DATE_FMT.format(now)}</span>
          <span className="top__clock-time num">{TIME_FMT.format(now)}</span>
        </time>
      )}
    </span>
  );
}

/** "2 h ago", "Yesterday", "8 Oct": notification times relative to now. */
function ago(iso: string, now: number) {
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * The active-tab pill: drawn once inside its parent and slid to whichever element matches `selector`.
 * It glides when `route` changes; layout changes (`layout`, scrolling, resizing) move it instantly.
 */
function Glide({ selector, route, layout, className }: { selector: string; route: string; layout?: unknown; className: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const lastRoute = useRef<string | null>(null);

  useLayoutEffect(() => {
    const pill = ref.current;
    const host = pill?.parentElement;
    if (!pill || !host) return;

    const place = (animate: boolean) => {
      const el = host.querySelector<HTMLElement>(selector);
      const wasHidden = pill.style.opacity !== "1";
      if (!el || !el.getClientRects().length) {
        pill.style.transition = "";
        pill.style.opacity = "0";
        return;
      }
      const h = host.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      // Hide the pill while its link is scrolled out of the list, rather than drawing it over the header.
      const list = el.closest(".side__scroll")?.getBoundingClientRect();
      const offscreen = !!list && (r.bottom <= list.top || r.top >= list.bottom);
      // A pill that was hidden fades in where it lands instead of sliding from its old spot.
      pill.style.transition = wasHidden ? "opacity 240ms ease 180ms" : animate ? "" : "none";
      // Aim for where the link rests, not where its tab set is mid-slide.
      const pane = el.closest<HTMLElement>(".side__pane");
      const slide = pane ? new DOMMatrixReadOnly(getComputedStyle(pane).transform).m41 : 0;
      pill.style.transform = `translate3d(${r.left - h.left - slide}px, ${r.top - h.top}px, 0)`;
      pill.style.width = `${r.width}px`;
      pill.style.height = `${r.height}px`;
      pill.style.opacity = offscreen ? "0" : "1";
      host.classList.add("has-glide");
    };

    place(lastRoute.current !== null && lastRoute.current !== route);
    lastRoute.current = route;

    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(false));
    };
    // A ResizeObserver reports once as soon as it starts observing; skip that, or it cuts the slide short.
    let primed = false;
    const ro = new ResizeObserver(() => {
      if (primed) sync();
      primed = true;
    });
    ro.observe(host);
    host.querySelectorAll(selector).forEach((el) => ro.observe(el));
    host.addEventListener("scroll", sync, true);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      host.removeEventListener("scroll", sync, true);
    };
  }, [selector, route, layout]);

  return <span ref={ref} className={className} aria-hidden="true" />;
}

function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        (ref.current?.querySelector("button") as HTMLButtonElement | null)?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/** Older links carry ?admin=<section>: send them to that Administration subtab. */
function AdminDeepLink({ base }: { base: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const want = params.get("admin");
  useEffect(() => {
    if (want) router.replace(want === "home" || want === "overview" ? base : `${base}/${want}`);
  }, [want, base, router]);
  return null;
}

export function Shell({ variant, viewer = null, hub = null, children }: { variant: Variant; viewer?: Viewer | null; hub?: HubData | null; children: ReactNode }) {
  return (
    <HubProvider viewer={viewer} hub={hub} variant={variant}>
      <ShellFrame variant={variant} viewer={viewer} hub={hub}>
        {children}
      </ShellFrame>
    </HubProvider>
  );
}

type Drill = "rankings" | "publications" | "admin" | null;

/** The set of tabs a group row opens. */
const drillOf = (item: NavGroup["items"][number]): Exclude<Drill, null> => (item.admin ? "admin" : item.publicationsBase ? "publications" : "rankings");

function ShellFrame({ variant, viewer, hub, children }: { variant: Variant; viewer: Viewer | null; hub: HubData | null; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  // The tab just clicked shows as current at once, while its page is still on the way; once the
  // address changes (or the reader goes elsewhere) the real pathname takes over again.
  const [going, setGoing] = useState<{ href: string; from: string } | null>(null);
  const at = going?.from === pathname ? going.href : pathname;
  const goTo = (href: string) => () => setGoing({ href, from: pathname });
  const [menu, setMenu] = useState(false);
  // The last row that opened a set of sub-tabs, so focus returns to it.
  const [opened, setOpened] = useState<Exclude<Drill, null>>("rankings");
  const [search, setSearch] = useState(false);
  const [bell, setBell] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const [cycle, setCycle] = useState(hub?.currentCycle ?? "");
  const [theme, toggleTheme] = useTheme();
  const { run } = useGovern();
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => setNowMs(Date.now()), [bell, hub]);
  // Desktop sidebar: full, or a narrow strip of icons. Remembered per browser.
  const [rail, setRail] = useState(false);
  useEffect(() => {
    try {
      setRail(localStorage.getItem("hub-sidebar") === "rail");
    } catch {}
  }, []);
  const toggleRail = () =>
    setRail((v) => {
      try {
        localStorage.setItem("hub-sidebar", v ? "full" : "rail");
      } catch {}
      return !v;
    });
  const menuBtn = useRef<HTMLButtonElement>(null);
  const closeBell = useCallback(() => setBell(false), []);
  const closeSearch = useCallback(() => setSearch(false), []);
  const bellRef = useClickAway(bell, closeBell);


  /* What this viewer may see: rows need their permission (within the viewer's unit in the contributor
     workspace) and their feature switched on in System Configuration; Administration needs an
     administration role. */
  const nav: NavGroup[] = useMemo(() => {
    const target = variant === "unit" && viewer ? { unitId: viewer.portal.programId ?? viewer.portal.unitId } : {};
    return NAV[variant]
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            (!item.need || !viewer || viewerCan(viewer, item.need[0], item.need[1], target)) &&
            (!item.feature || feature(viewer, item.feature)) &&
            (!item.admin || (!!viewer && viewer.admin.length > 0)),
        ),
      }))
      .filter((g) => g.items.length);
  }, [variant, viewer]);

  const counts = useMemo(
    () => ({
      review: hub?.evidence.filter((e) => e.status === "For review").length ?? 0,
      revisions: hub?.evidence.filter((e) => e.status === "Needs revision").length ?? 0,
    }),
    [hub],
  );

  const ref = useReference();
  const rankingsItem = nav.flatMap((g) => g.items).find((i) => i.rankingsBase);
  const subnav = useMemo(() => (rankingsItem?.rankingsBase ? rankingSubnav(ref, rankingsItem.rankingsBase, hub?.activeSlugs) : []), [ref, rankingsItem?.rankingsBase, hub?.activeSlugs]);
  const onRankings = !!rankingsItem?.rankingsBase && pathname.startsWith(rankingsItem.rankingsBase);
  // Publications opens its three sections in the sidebar, as Rankings does its pages.
  const publicationsItem = nav.flatMap((g) => g.items).find((i) => i.publicationsBase);
  const pubnav = useMemo(() => (publicationsItem?.publicationsBase ? publicationsSubnav(publicationsItem.publicationsBase) : []), [publicationsItem?.publicationsBase]);
  const onPublications = !!publicationsItem?.publicationsBase && isActive(pathname, publicationsItem.publicationsBase);
  // Administration is a tab for anyone who administers something; its sections replace the main tabs.
  const adminItem = nav.flatMap((g) => g.items).find((i) => i.admin);
  const adminSections = useMemo(() => ADMIN_SECTIONS.filter((sec) => !sec.module || !!viewer?.admin.includes(sec.module)), [viewer]);
  const onAdmin = !!adminItem && isActive(pathname, adminItem.href);
  const here: Drill = onRankings ? "rankings" : onPublications ? "publications" : onAdmin ? "admin" : null;
  // Which tab set the sidebar shows: the main sections, or the ranking pages, the Publications sections or
  // the Administration sections in their place. Rankings has no page of its own, so its row only switches sets.
  const [drill, setDrill] = useState<Drill>(here);
  const switched = useRef(false);
  const openDrill = (to: Exclude<Drill, null>) => {
    // The icon strip has no room for the names: widen the sidebar first.
    if (rail && matchMedia("(min-width: 1024px)").matches) toggleRail();
    switched.current = true;
    setDrill(to);
  };
  const closeDrill = () => {
    switched.current = true;
    setDrill(null);
  };

  useEffect(() => {
    setMenu(false);
    setBell(false);
    setProfileOpen(false);
    setDrill(here);
  }, [pathname, here]);

  // The icon strip always shows the main sections.
  useEffect(() => {
    if (rail) setDrill(null);
  }, [rail]);

  // Mobile drawer focus: into the navigation when it opens, back to the menu button when it closes
  // (after the main column stops being inert).
  const sideRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const firstInPane = () => sideRef.current?.querySelector<HTMLElement>(".side__pane.is-current :is(a, button)");
  useEffect(() => {
    if (menu) firstInPane()?.focus();
    else if (wasOpen.current) menuBtn.current?.focus();
    wasOpen.current = menu;
  }, [menu]);

  // When the reader switches sets, focus follows: to the back button, or back to the Rankings row.
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    if (drill) firstInPane()?.focus();
    else sideRef.current?.querySelector<HTMLElement>(".side__link--group[data-opened]")?.focus();
  }, [drill]);

  // Global search shortcuts: ⌘K / Ctrl+K anywhere, "/" outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (profileOpen) return;
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable=true]");
      if (document.querySelector(".adm-confirm[open]")) return;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === "Escape" && menu) setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, profileOpen]);

  const notes = hub?.notices ?? [];
  const unread = notes.filter((n) => n.unread).length;
  const publicHref = publicPathFor(pathname);
  const aboutLink = nav.flatMap((group) => group.items).find((item) => item.icon === "about");
  const viewLabel = variant === "public" ? "Public view" : variant === "office" ? "Office of QS/THE Rankings" : viewer ? `${viewer.portal.unitName}${viewer.portal.programName ? ` · ${viewer.portal.programName}` : ""}` : "Contributor workspace";
  const subtitle = viewer ? viewer.roleName : "";
  const years = viewer?.grants.some((g) => g.years === "all") ? "all" : [...new Set(viewer?.grants.flatMap((g) => (g.years === "all" ? [] : g.years)) ?? [])];
  const cycles = (hub?.cycles ?? []).filter((c) => c.status !== "Archived" && (years === "all" || years.includes(c.id)));
  const other = variant === "office" ? "portal" : "office";
  const canOther = !!viewer?.workspaces.includes(other);

  return (
    <div className={`app${menu ? " app--menu" : ""}${rail ? " app--rail" : ""}`}>
      {variant !== "public" && <InlineScript html={THEME_BOOT} />}
      <a className="skip" href="#content">
        Skip to content
      </a>

      {/* ---------- Left navigation ---------- */}
      <aside className="side" aria-label="Main" ref={sideRef}>
        {/* The whole right edge is a larger pointer target for the same toggle; keyboard and
            screen-reader users have the labelled button below, so this one stays out of the tab order. */}
        <button
          type="button"
          className="side__edge"
         
          aria-hidden="true"
          tabIndex={-1}
          onClick={toggleRail}
        />
        <div className="side__head">
          <Link
            href={variant === "public" ? "/" : variant === "office" ? "/admin" : "/portal"}
            className="side__brand"
            aria-label={rail ? `Rankings and Impact Hub, ${viewLabel}` : undefined}
          >
            <Image className="seal seal--light" src="/brand/ust-seal.png" alt="" width={48} height={48} priority />
            <Image className="seal seal--dark" src="/brand/ust-seal-reverse.png" alt="" width={48} height={48} priority />
            <span className="side__brandtext">
              <span className="side__name">Rankings and Impact Hub</span>
              <span className="side__view">{viewLabel}</span>
            </span>
          </Link>
          <button
            type="button"
            className="side__toggle"
            aria-expanded={!rail}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleRail}
          >
            <Icon name={rail ? "chevron" : "chevron-left"} size={16} strokeWidth={2} />
          </button>
        </div>

        <nav className="side__scroll" aria-label="Sections">
          <button
            type="button"
            className="side__search"
            data-tip="Search"
            onClick={() => { setMenu(false); setSearch(true); }}
            aria-label={variant === "public" ? "Search rankings, indicators, stories" : "Search indicators, evidence, units"}
            aria-haspopup="dialog"
          >
            <Icon name="search" size={18} />
            <span>Search</span>
            <span className="kbd" aria-hidden="true">⌘K</span>
          </button>
          <div className="side__panes">
            <div className={`side__pane${drill ? "" : " is-current"}`}>
              {nav.map((g, gi) => (
                <div key={g.label ?? gi}>
                  {g.label && <p className="side__label">{g.label}</p>}
                  <ul className="side__nav">
                    {g.items.filter((item) => item !== aboutLink).map((item) => {
                      const active = isActive(at, item.href, item.exact);
                      const count = item.count ? counts[item.count] : 0;
                      return (
                        <li key={item.href}>
                          <div className="side__item">
                            {item.rankingsBase || item.publicationsBase || item.admin ? (
                              <button
                                type="button"
                                className={`side__link side__link--group${active ? " is-active" : ""}`}
                                aria-expanded={drill === drillOf(item)}
                                aria-controls={`nav-${drillOf(item)}`}
                                data-opened={opened === drillOf(item) || undefined}
                                data-tip={item.label}
                                onClick={() => {
                                  const to = drillOf(item);
                                  setOpened(to);
                                  openDrill(to);
                                  // Administration opens its overview with the sections; Publications its first section.
                                  const landing = item.admin ? (onAdmin ? null : item.href) : item.publicationsBase && !onPublications ? pubnav[0]?.href : null;
                                  if (landing) {
                                    goTo(landing)();
                                    router.push(landing);
                                  }
                                }}
                              >
                                <NavIcon name={item.icon} active={active} />
                                <span className="truncate side__text">{item.label}</span>
                                <Icon name="chevron" size={16} className="side__chev" />
                              </button>
                            ) : (
                              <Link
                                href={item.href}
                                className={`side__link${active ? " is-active" : ""}`}
                                aria-current={pathname === item.href ? "page" : undefined}
                                data-tip={item.label}
                                onNavigate={goTo(item.href)}
                              >
                                <NavIcon name={item.icon} active={active} />
                                <span className="truncate side__text">{item.label}</span>
                                {count ? (
                                  <span className="count" aria-label={`${count} waiting`}>
                                    {count}
                                  </span>
                                ) : null}
                              </Link>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            {rankingsItem?.rankingsBase && (
              <div className={`side__pane side__pane--sub${drill === "rankings" ? " is-current" : ""}`} id="nav-rankings">
                {/* Two targets: back to the main sections, or to the rankings overview. */}
                <div className="side__crumbs">
                  <button type="button" className="side__back" onClick={closeDrill}>
                    <Icon name="chevron-left" size={16} strokeWidth={2} />
                    All sections
                  </button>
                  <span className="side__crumbsep" aria-hidden="true"><Icon name="chevron" size={14} /></span>
                  <Link
                    href={rankingsItem.href}
                    className="side__crumb"
                    aria-current={pathname === rankingsItem.href ? "page" : undefined}
                  >
                    {subnav.find((g) => g.items.some((c) => isActive(pathname, c.href)))?.group ?? rankingsItem.label}
                  </Link>
                </div>
                {subnav.map((entry) => (
                  <div key={entry.group} className={entry.items.length > 1 ? "side__tree" : undefined}>
                    {/* A one-page group needs no heading, only a break from the group above. */}
                    {entry.items.length > 1 ? <p className="side__label">{entry.group}</p> : <hr className="side__sep" />}
                    <ul className="side__nav">
                      {entry.items.map((c) => {
                        const active = isActive(at, c.href);
                        return (
                          <li key={c.href}>
                            <Link
                              href={c.href}
                              className={`side__link side__link--sub${active ? " is-active" : ""}`}
                              aria-current={isActive(pathname, c.href) ? "page" : undefined}
                              onNavigate={goTo(c.href)}
                            >
                              <span className="side__dot" aria-hidden="true">
                                <i style={{ background: familyOf(ref, c.family).band } as CSSProperties} />
                              </span>
                              <span className="truncate side__text">{c.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {publicationsItem?.publicationsBase && (
              <div className={`side__pane side__pane--sub${drill === "publications" ? " is-current" : ""}`} id="nav-publications">
                <div className="side__crumbs">
                  <button type="button" className="side__back" onClick={closeDrill}>
                    <Icon name="chevron-left" size={16} strokeWidth={2} />
                    All sections
                  </button>
                  <span className="side__crumbsep" aria-hidden="true"><Icon name="chevron" size={14} /></span>
                  <span className="side__crumb">{publicationsItem.label}</span>
                </div>
                <hr className="side__sep" />
                <ul className="side__nav">
                  {pubnav.map((c) => {
                    const active = isActive(at, c.href);
                    return (
                      <li key={c.href}>
                        <Link
                          href={c.href}
                          className={`side__link${active ? " is-active" : ""}`}
                          aria-current={isActive(pathname, c.href) ? "page" : undefined}
                          data-tip={c.label}
                          onNavigate={goTo(c.href)}
                        >
                          <NavIcon name={c.icon} active={active} />
                          <span className="truncate side__text">{c.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {adminItem && (
              <div className={`side__pane side__pane--sub${drill === "admin" ? " is-current" : ""}`} id="nav-admin">
                <div className="side__crumbs">
                  <button type="button" className="side__back" onClick={closeDrill}>
                    <Icon name="chevron-left" size={16} strokeWidth={2} />
                    All sections
                  </button>
                  <span className="side__crumbsep" aria-hidden="true"><Icon name="chevron" size={14} /></span>
                  <span className="side__crumb">{adminItem.label}</span>
                </div>
                <hr className="side__sep" />
                <ul className="side__nav">
                  {adminSections.map((sec) => {
                    const href = sectionHref(adminItem.href, sec.key);
                    const active = at === href;
                    return (
                      <li key={sec.key}>
                        <Link
                          href={href}
                          className={`side__link${active ? " is-active" : ""}`}
                          aria-current={pathname === href ? "page" : undefined}
                          data-tip={sec.title}
                          onNavigate={goTo(href)}
                        >
                          <NavIcon name={sec.icon} active={active} />
                          <span className="truncate side__text">{sec.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </nav>

        <div className="side__foot">
          <div className="side__mobile">
            {variant !== "public" && cycles.length > 0 && (
              <label className="field cycle-picker">
                <span className="side__label" style={{ padding: "0 0 4px" }}>
                  Reporting cycle
                </span>
                <Select className="select select--sm side__select cycle-picker__trigger" value={cycle} onChange={setCycle}>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      Cycle {c.id}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>
          {variant === "public" && (
            <div className="side__cta">
              <b>Contributing unit?</b>
              Sign in to submit evidence and see where your work counts.
              <Link href="/signin" className="btn btn--primary btn--sm btn--block">
                Sign in to contribute
              </Link>
            </div>
          )}
          {aboutLink && (
            <nav className="side__bottom" aria-label="More">
              <Link
                href={aboutLink.href}
                className={`side__link${isActive(at, aboutLink.href) ? " is-active" : ""}`}
                aria-current={pathname === aboutLink.href ? "page" : undefined}
                aria-label={aboutLink.label}
                data-tip={aboutLink.label}
                onNavigate={goTo(aboutLink.href)}
              >
                <NavIcon name={aboutLink.icon} active={isActive(at, aboutLink.href)} />
                <span className="truncate side__text">{aboutLink.label}</span>
              </Link>
            </nav>
          )}
        </div>
        {/* Switching sets counts as a move, so the pill carries over between the Rankings row and its pages. */}
        <Glide
          className="side__glide"
          selector=".side__pane.is-current .side__link.is-active, .side__bottom .side__link.is-active"
          route={`${at}|${drill}`}
          layout={`${rail}${menu}${nav.length}`}
        />
        {viewer && (
          <div className="side__profile">
            <button type="button" className="side__profile-button" data-tip={viewer.name} aria-expanded={profileOpen} aria-haspopup="dialog" onClick={() => setProfileOpen(true)} aria-label={`Account: ${viewer.name}`}>
              <span className="avatar" aria-hidden="true">
                <Face src={viewer.avatar}>{viewer.initials}</Face>
              </span>
              <span className="side__profile-info">
                <b>{viewer.name}</b>
                <span>{subtitle}</span>
              </span>
              <Icon name="chevron-down" size={16} />
            </button>
            <ProfileSettings
              viewer={viewer}
              open={profileOpen}
              onClose={closeProfile}
              theme={theme}
              onToggleTheme={toggleTheme}
              workspace={variant === "office" ? "office" : "portal"}
              links={[
                ...(canOther ? [{ href: other === "office" ? "/admin" : "/portal", label: other === "office" ? "Office workspace" : "Contributor workspace", icon: "swap" as const }] : []),
                { href: publicHref, label: "Public view", icon: "eye" as const },
              ]}
            />
          </div>
        )}
      </aside>
      <button className="side__scrim" aria-hidden="true" tabIndex={-1} onClick={() => setMenu(false)} />

      {/* ---------- Main column ---------- */}
      <div className="main" inert={menu || undefined}>
        {hub?.site.noticeOn && hub.site.notice && (
          <div className="sitenotice" role="status">
            <Icon name="info" size={16} />
            <span>{hub.site.notice}</span>
          </div>
        )}
        <header className="top">
          <button
            ref={menuBtn}
            type="button"
            className="iconbtn top__menu"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            <Icon name="menu" />
          </button>

          {variant !== "public" && (
            <Suspense fallback={null}>
              <HeaderBreadcrumbs variant={variant} />
            </Suspense>
          )}

          <span className="top__spacer" />


          {variant !== "public" && cycles.length > 0 && (
            <label className="top__cycle top__cycle-wide cycle-picker">
              <span className="sr-only">Reporting cycle</span>
              <Select className="select cycle-picker__trigger" value={cycle} onChange={setCycle}>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    Cycle {c.id}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {variant !== "public" && hub?.dashboard.showClock !== false && <Clock />}

          {variant !== "public" && (
            <div className="popwrap" ref={bellRef}>
              <button
                type="button"
                className="iconbtn"
                aria-expanded={bell}
                aria-haspopup="true"
                aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}
                onClick={() => setBell((v) => !v)}
              >
                <Icon name="bell" />
                {unread > 0 && <span className="iconbtn__dot">{unread}</span>}
              </button>
              {bell && (
                <div className="pop" role="region" aria-label="Notifications">
                  <div className="pop__head">
                    <span>Notifications</span>
                    {unread > 0 && (
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => void run({ type: "notice.read" })}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notes.length ? (
                    <ul>
                      {notes.map((n) => (
                        <li key={n.id}>
                          <Link href={n.href} className={`pop__item${n.unread ? " is-unread" : ""}`}>
                            <Icon name={n.unread ? "bell" : "check"} size={16} />
                            <span>
                              {n.text}
                              <small>{nowMs ? ago(n.at, nowMs) : ""}</small>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="pop__empty">Nothing new. Decisions, reviews and deadlines appear here.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {variant !== "public" && (
            <button
              type="button"
              className="iconbtn top__theme"
              aria-pressed={theme === "dark"}
              aria-label="Dark appearance"
              data-tip={theme === "dark" ? "Switch to light" : "Switch to dark"}
              onClick={(e) => toggleTheme(e.currentTarget)}
            >
              <Icon key={theme} name={theme === "dark" ? "sun" : "moon"} size={19} />
            </button>
          )}

          {!viewer && (
            <Link href="/signin" className="btn btn--dark btn--sm">
              Sign in
            </Link>
          )}
        </header>

        <main id="content" className="content" tabIndex={-1}>
          {children}
        </main>

        {variant === "public" && <Footer variant={variant} asOf={hub?.site.asOf} />}
      </div>

      <SearchPalette variant={variant} open={search} onClose={closeSearch} />
      {adminItem && (
        <Suspense fallback={null}>
          <AdminDeepLink base={adminItem.href} />
        </Suspense>
      )}
      {viewer && <IdleGuard idleMinutes={viewer.session.idleMinutes} warnMinutes={viewer.session.warnMinutes} />}
    </div>
  );
}

function Footer({ variant, asOf }: { variant: Variant; asOf?: string }) {
  const { office, credits } = useReference();
  const about = variant === "office" ? "/admin/about" : "/about";
  return (
    <footer className="foot">
      <div className="foot__in">
        <div className="foot__brand">
          <Image className="seal seal--light" src="/brand/ust-seal.png" alt="" width={48} height={48} />
          <Image className="seal seal--dark" src="/brand/ust-seal-reverse.png" alt="" width={48} height={48} />
          <div>
            <b>{office.name}</b>
            <p>University of Santo Tomas, {office.street}, {office.city}</p>
            <p>
              <a href={`mailto:${office.email}`}>{office.email}</a>
            </p>
          </div>
        </div>
        <nav className="foot__links" aria-label="Policies">
          <Link href={`${about}#privacy`}>Data privacy statement</Link>
          <Link href={`${about}#accessibility`}>Accessibility</Link>
          <Link href={`${about}#disclaimer`}>Methodology disclaimer</Link>
          <Link href={`${about}#contact`}>Contact the Office</Link>
        </nav>
        <div className="foot__legal">
          <span>
            {asOf && (
              <>
                Last dashboard update <span className="num">{formatAsOf(asOf)}</span> ·{" "}
              </>
            )}
            Results belong to the ranking bodies and are reported as published.
          </span>
          <span>© 2026 University of Santo Tomas</span>
          {variant === "public" && (
            <details className="foot__credits" style={{ flexBasis: "100%" }}>
              <summary>Photo credits</summary>
              <ul>
                {credits.map((c) => (
                  <li key={c.key}>
                    <a href={c.page}>{c.title}</a>, {c.creator}, {c.license}, via {c.via}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </footer>
  );
}
