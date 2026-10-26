"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/Icon";
import { SearchPalette } from "@/components/shell/SearchPalette";
import { Lockup, UNIVERSITY } from "./Lockup";
import { allMenus, isExternal, type Menu, type MenuLink } from "./menu";
import { useReference } from "@/components/reference/ReferenceProvider";
import { HubProvider } from "@/components/hub/HubProvider";
import type { HubData } from "@/lib/governance/hub-types";
import { Stars } from "./Stars";

const within = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** The words a link's group heading stands in for ("THE " before "Impact Rankings"), for screen readers. */
const hiddenPrefix = (l: MenuLink) => (l.name && l.name !== l.label && l.name.endsWith(l.label) ? l.name.slice(0, -l.label.length) : "");

function ScrollProgress() {
  const barRef = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const root = document.documentElement;
      const distance = root.scrollHeight - root.clientHeight;
      const progress = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return <span ref={barRef} className="w-scroll-progress" aria-hidden="true" />;
}

/** Pages of this site go through the router; the ranking bodies' own sites are plain links, marked as such. */
function MenuAnchor({
  href,
  className,
  onPick,
  style,
  children,
}: {
  href: string;
  className: string;
  onPick?: () => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const props = {
    className,
    style,
    onClick: onPick,
  };
  return isExternal(href) ? (
    <a href={href} {...props}>
      {children}
      <span className="sr-only"> (official website)</span>
    </a>
  ) : (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

/** The one action of a panel: its words, then a gold disc carrying the arrow (gold as a fill under black). */
function MenuCta({ href, label, onPick }: { href: string; label: string; onPick?: () => void }) {
  return (
    <MenuAnchor href={href} className="w-cta" onPick={onPick}>
      <span>{label}</span>
      <span className="w-cta__disc" aria-hidden="true">
        <Icon name={isExternal(href) ? "arrow-up-right" : "arrow"} size={16} />
      </span>
    </MenuAnchor>
  );
}

/** A subtab's mark: its icon in a rounded square, or, for a story, its photograph in the same square. */
function SubMark({ link }: { link: MenuLink }) {
  const photo = !link.icon && link.preview?.photo;
  return (
    <span className={`w-msub__mark${photo ? " w-msub__mark--photo" : ""}`} aria-hidden="true">
      {photo ? (
        <Image src={photo.src} alt="" fill sizes="40px" style={{ objectPosition: photo.pos }} />
      ) : (
        <Icon name={link.icon ?? "arrow"} size={18} />
      )}
    </span>
  );
}

function MenuPanel({ menu, onPick }: { menu: Menu; onPick: () => void }) {
  const single = menu.groups.length === 1;
  let index = 0;

  return (
    <>
      <div className="w-rkpanel__in w-wrap">
        <div className={`w-mlists${single ? " w-mlists--single" : ""}`} style={{ "--groups": menu.groups.length } as CSSProperties}>
          {menu.groups.map((g, gi) => (
            <div className="w-mgroup" key={g.label ?? gi}>
              {g.label && (
                <p className="w-mgroup__label">
                  {g.color && <i style={{ background: g.color }} />}
                  {g.label}
                </p>
              )}
              <ul className="w-msubs">
                {g.links.map((l) => (
                  <li key={l.href} style={{ "--i": index++ } as CSSProperties}>
                    <MenuAnchor href={l.href} className="w-msub" onPick={onPick}>
                      <SubMark link={l} />
                      <span className="w-msub__text">
                        <span className="w-msub__label">
                          {hiddenPrefix(l) && <span className="sr-only">{hiddenPrefix(l)}</span>}
                          {l.label}
                          {isExternal(l.href) && <Icon name="arrow-up-right" size={12} className="w-msub__ext" />}
                        </span>
                        {l.note && <span className="w-msub__note">{l.note}</span>}
                      </span>
                    </MenuAnchor>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="w-mstrip">
        <div className="w-mstrip__in w-wrap">
          <p>{menu.strip.text}</p>
          <div className="w-mstrip__links">
            <MenuAnchor href={menu.strip.link.href} className="w-mstrip__link w-mstrip__link--quiet" onPick={onPick}>
              {menu.strip.link.label}
            </MenuAnchor>
            <MenuAnchor href={menu.href} className="w-mstrip__link" onPick={onPick}>
              {menu.cta}
              <Icon name="arrow" size={15} />
            </MenuAnchor>
          </div>
        </div>
      </div>
    </>
  );
}

/** The pill behind the open tab, gliding from tab to tab. */
function TabHighlight({ panel, pathname }: { panel: string | null; pathname: string }) {
  const highlightRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const highlight = highlightRef.current;
    const nav = highlight?.parentElement;
    if (!highlight || !nav) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const target = nav.querySelector<HTMLElement>('.w-tab[aria-expanded="true"]') ?? nav.querySelector<HTMLElement>(".w-tab:focus-visible");
      if (!target || !target.offsetWidth) {
        highlight.style.opacity = "0";
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const tabRect = target.getBoundingClientRect();
      const first = highlight.style.opacity !== "1";
      // From rest, the pill appears where the tab is instead of sliding in from the last one.
      if (first) highlight.style.transition = "none";
      highlight.style.width = `${tabRect.width}px`;
      highlight.style.transform = `translateX(${tabRect.left - navRect.left}px)`;
      if (first) {
        void highlight.offsetWidth;
        highlight.style.transition = "";
      }
      highlight.style.opacity = "1";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(nav);
    nav.querySelectorAll(".w-tab").forEach((tab) => observer.observe(tab));
    nav.addEventListener("focusin", schedule);
    nav.addEventListener("focusout", schedule);
    return () => {
      observer.disconnect();
      nav.removeEventListener("focusin", schedule);
      nav.removeEventListener("focusout", schedule);
      cancelAnimationFrame(frame);
    };
  }, [panel, pathname]);

  return <span className="w-tab-highlight" ref={highlightRef} aria-hidden="true" />;
}

export function SiteHeader({ menus, hub = null }: { menus?: Menu[]; hub?: HubData | null }) {
  // The panels and search follow governance: the server passes the menus and index the public may see.
  const ref = useReference();
  const MENUS = menus ?? allMenus(ref);
  const pathname = usePathname() ?? "/";
  const [panel, setPanel] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [search, setSearch] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const intent = useRef(0);
  const closeSearch = useCallback(() => setSearch(false), []);
  const closePanel = useCallback(() => setPanel(null), []);
  const closeSheet = useCallback(() => sheetRef.current?.close(), []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let frame = 0;
    let previousY = window.scrollY;
    let direction = 0;
    let distance = 0;
    let cursorNearTop = false;
    let hidden = false;
    setHeaderHidden(false);

    const show = () => {
      if (hidden) {
        hidden = false;
        setHeaderHidden(false);
      }
      distance = 0;
    };
    const update = () => {
      frame = 0;
      const root = document.documentElement;
      const y = Math.max(0, Math.min(window.scrollY, root.scrollHeight - root.clientHeight));
      const delta = y - previousY;
      previousY = y;
      const hero = pathname === "/" ? document.getElementById("hero") : null;
      const inLandingHero = hero !== null && hero.getBoundingClientRect().bottom > header.offsetHeight;
      if (inLandingHero || y <= 112 || panel || closing || search || sheetRef.current?.open || cursorNearTop || header.querySelector(":focus-visible")) {
        show();
        return;
      }
      if (!delta) return;
      const nextDirection = Math.sign(delta);
      if (nextDirection !== direction) distance = 0;
      direction = nextDirection;
      distance += Math.abs(delta);
      if (direction < 0 && distance >= 8) show();
      else if (direction > 0 && distance >= 24 && !hidden) {
        hidden = true;
        setHeaderHidden(true);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onPointer = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cursorNearTop = event.clientY <= header.offsetHeight + 20;
      if (cursorNearTop) show();
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    header.addEventListener("focusin", show);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("pointermove", onPointer);
      header.removeEventListener("focusin", show);
    };
  }, [panel, closing, search, pathname]);

  // A closed panel stays drawn for its exit, so it lifts away instead of vanishing.
  const lastPanel = useRef<string | null>(null);
  useEffect(() => {
    const last = lastPanel.current;
    lastPanel.current = panel;
    if (panel || !last || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setClosing(null);
    setClosing(last);
    const t = window.setTimeout(() => setClosing(null), 260);
    return () => window.clearTimeout(t);
  }, [panel]);

  // A new page closes whatever was open.
  useEffect(() => {
    setPanel(null);
    sheetRef.current?.close();
  }, [pathname]);

  // The navigation panel closes on Escape and on a click anywhere outside the header.
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setPanel(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        headerRef.current?.querySelector<HTMLButtonElement>('.w-tab[aria-expanded="true"]')?.focus();
        setPanel(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  // Search from anywhere: ⌘K or Ctrl+K, or "/" outside a text field.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable=true]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        sheetRef.current?.close();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The panel's height follows its content, so moving between tabs glides instead of jumping.
  useLayoutEffect(() => {
    const el = panelRef.current;
    const body = bodyRef.current;
    if (!panel || !el || !body) return;
    const fit = () => el.style.setProperty("--panel-h", `${body.offsetHeight}px`);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    return () => observer.disconnect();
  }, [panel]);

  // A pointer resting on a tab opens its panel; one passing over the bar does not. Once open, tabs switch at once.
  const hoverTab = (href: string) => {
    window.clearTimeout(intent.current);
    if (panel) setPanel(href);
    else intent.current = window.setTimeout(() => setPanel(href), 90);
  };
  const leaveHeader = () => {
    window.clearTimeout(intent.current);
    intent.current = window.setTimeout(() => setPanel(null), 140);
  };
  useEffect(() => () => window.clearTimeout(intent.current), []);

  // Keyboard: Tab or ↓ from an open tab enters its panel; leaving the panel's last link moves on to the next tab.
  const tabKey = (e: KeyboardEvent<HTMLButtonElement>, href: string) => {
    if (panel !== href || e.shiftKey || (e.key !== "Tab" && e.key !== "ArrowDown")) return;
    const first = panelRef.current?.querySelector<HTMLElement>("a[href]");
    if (first) {
      e.preventDefault();
      first.focus();
    }
  };
  const panelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panelRef.current || !headerRef.current) return;
    const links = [...panelRef.current.querySelectorAll<HTMLElement>("a[href]")];
    const at = links.indexOf(document.activeElement as HTMLElement);
    const tabs = [...headerRef.current.querySelectorAll<HTMLElement>(".w-tab")];
    const open = tabs.find((t) => t.getAttribute("aria-expanded") === "true");
    if (!open) return;
    if (e.shiftKey && at === 0) {
      e.preventDefault();
      open.focus();
    } else if (!e.shiftKey && at === links.length - 1) {
      e.preventDefault();
      setPanel(null);
      (tabs[tabs.indexOf(open) + 1] ?? headerRef.current.querySelector<HTMLElement>(".w-find"))?.focus();
    }
  };

  const menu = MENUS.find((m) => m.href === (panel ?? closing));

  return (
    <>
      <div className="w-header-spacer" aria-hidden="true" />
      <header
        className={`w-header${panel ? " is-open" : ""}${menu ? " has-panel" : ""}${headerHidden ? " is-hidden" : ""}`}
        ref={headerRef}
        onPointerEnter={() => window.clearTimeout(intent.current)}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") leaveHeader();
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPanel(null);
        }}
      >
        <Stars />
        <ScrollProgress />
        <div className="w-header__bar w-wrap w-on-dark">
          <Link href="/" className="w-brand" aria-label={`${ref.office.name}, ${UNIVERSITY}: home`}>
            <Lockup unit={ref.office.name} reverse preload sizes="48px" />
          </Link>

          <nav className="w-nav" aria-label="Main">
            <TabHighlight panel={panel} pathname={pathname} />
            <ul className="w-nav__list">
              {MENUS.map((m) => {
                const on = within(pathname, m.href);
                return (
                  <li key={m.href}>
                    <button
                      type="button"
                      className={`w-tab${on ? " is-on" : ""}`}
                      aria-expanded={panel === m.href}
                      aria-controls="w-rk-panel"
                      onClick={(e) => {
                        window.clearTimeout(intent.current);
                        // A mouse that hovered the panel open would close it again with its click; keys and touch toggle.
                        const mouse = (e.nativeEvent as globalThis.PointerEvent).pointerType === "mouse";
                        setPanel((v) => (v === m.href && !mouse ? null : m.href));
                      }}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "mouse") hoverTab(m.href);
                      }}
                      onPointerLeave={() => {
                        if (!panel) window.clearTimeout(intent.current);
                      }}
                      onKeyDown={(e) => tabKey(e, m.href)}
                    >
                      {m.label}
                      {on && <span className="sr-only"> (current section)</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="w-header__actions">
            <button
              type="button"
              className="w-find"
              onClick={() => setSearch(true)}
              aria-label="Search rankings, indicators and stories"
              aria-haspopup="dialog"
              aria-keyshortcuts="Meta+K Control+K /"
            >
              <Icon name="search" size={18} />
              <span className="w-find__label" aria-hidden="true">
                Search
              </span>
              <kbd className="w-find__key" aria-hidden="true">
                /
              </kbd>
            </button>
            <button type="button" className="w-menubtn" aria-haspopup="dialog" onClick={() => sheetRef.current?.showModal()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 9h16M4 15h16" />
              </svg>
              Menu
            </button>
          </div>
        </div>

        <div
          className={`w-rkpanel${!panel && menu ? " is-closing" : ""}`}
          id="w-rk-panel"
          ref={panelRef}
          hidden={!menu}
          inert={!panel}
          onKeyDown={panelKey}
        >
          <Stars sky="field" />
          {menu && (
            <div className="w-rkpanel__body" ref={bodyRef} key={menu.href}>
              <MenuPanel menu={menu} onPick={closePanel} />
            </div>
          )}
        </div>

        <dialog
          className="w-sheet"
          ref={sheetRef}
          aria-label="Menu"
          onClick={(e) => {
            if (e.target === sheetRef.current) closeSheet();
          }}
        >
          <Stars sky="field" />
          <div className="w-sheet__top">
            <Link href="/" className="w-sheet__brand" aria-label={`${ref.office.name}, ${UNIVERSITY}: home`} onClick={closeSheet}>
              <Lockup unit={ref.office.name} reverse sizes="48px" />
            </Link>
            <button type="button" className="w-sheet__close" aria-label="Close the menu" onClick={closeSheet}>
              <Icon name="close" size={20} />
            </button>
          </div>

          <nav aria-label="Main" className="w-sheet__nav">
            <ul className="w-sheet__list">
              <li style={{ "--i": 0 } as CSSProperties}>
                <Link href="/" className="w-sheet__row" aria-current={pathname === "/" ? "page" : undefined} onClick={closeSheet}>
                  Home
                  {pathname === "/" && <i className="w-sheet__here" aria-hidden="true" />}
                </Link>
              </li>
              {MENUS.map((m, mi) => {
                const on = within(pathname, m.href);
                return (
                  <li key={m.href} style={{ "--i": mi + 1 } as CSSProperties}>
                    <details className="w-sheet__item" name="w-sheet-menu" open={on || undefined}>
                      <summary className="w-sheet__row">
                        {m.label}
                        {on && (
                          <>
                            <i className="w-sheet__here" aria-hidden="true" />
                            <span className="sr-only"> (current section)</span>
                          </>
                        )}
                        <span className="w-sheet__toggle" aria-hidden="true">
                          <Icon name="plus" size={18} />
                        </span>
                      </summary>
                      <div className="w-sheet__sub">
                        <MenuCta href={m.href} label={m.cta} onPick={closeSheet} />
                        {m.groups.map((g, gi) => (
                          <div className="w-sheet__group" key={g.label ?? gi}>
                            {g.label && (
                              <p className="w-mgroup__label">
                                {g.color && <i style={{ background: g.color }} />}
                                {g.label}
                              </p>
                            )}
                            <ul>
                              {g.links.map((l) => (
                                <li key={l.href}>
                                  <MenuAnchor href={l.href} className="w-sheet__link" onPick={closeSheet}>
                                    {hiddenPrefix(l) && <span className="sr-only">{hiddenPrefix(l)}</span>}
                                    {l.label}
                                    {isExternal(l.href) && <Icon name="arrow-up-right" size={14} className="w-sheet__ext" />}
                                  </MenuAnchor>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="w-sheet__actions" style={{ "--i": MENUS.length + 1 } as CSSProperties}>
            <button
              type="button"
              className="w-sheet__search"
              onClick={() => {
                closeSheet();
                setSearch(true);
              }}
            >
              <Icon name="search" size={18} />
              Search rankings and stories
            </button>
          </div>
          <p className="w-sheet__contact" style={{ "--i": MENUS.length + 2 } as CSSProperties}>
            Questions go to <a href={`mailto:${ref.office.email}`}>{ref.office.email}</a>
          </p>
        </dialog>

        <HubProvider viewer={null} hub={hub} variant="public">
          <SearchPalette variant="public" open={search} onClose={closeSearch} />
        </HubProvider>
      </header>
    </>
  );
}
