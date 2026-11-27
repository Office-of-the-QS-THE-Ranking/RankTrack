"use client";

/*
 * Web Analytics' page-view beacon, mounted once in src/app/layout.tsx. It sends one page view per route the visitor
 * lands on (soft navigations included), without cookies or storage, and records two events on its own: links to other
 * sites (Outbound link) and file downloads (Download). The server decides whether anything is kept (api/pulse).
 */
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { send, track } from "@/lib/web-analytics/track";

const FILE = /\.(?:pdf|docx?|xlsx?|pptx?|csv|zip|png|jpe?g|svg)$/i;

export function WebAnalytics() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    // The browser's referrer only describes how the visitor arrived, so it goes with the first page view alone.
    const first = last.current === null;
    last.current = pathname;
    if (navigator.webdriver) return;
    send({ t: "pageview", p: pathname, s: location.search, r: first ? document.referrer : "", w: window.innerWidth, tp: navigator.maxTouchPoints > 1 });
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (a.hasAttribute("download") || FILE.test(url.pathname)) {
        track("Download", { file: url.pathname.split("/").pop()?.slice(0, 80) ?? "file" });
      } else if (url.host !== location.host) {
        track("Outbound link", { to: url.hostname.replace(/^www\./, "") });
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
