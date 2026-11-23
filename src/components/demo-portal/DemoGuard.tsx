"use client";

/*
 * The portal demo's last line on navigation: a click on any link that would leave the demo (a real workspace page,
 * an uploaded file, the public site, another site) is stopped before Next.js or the browser follows it. Links the
 * screens draw through WorkspaceLink already point inside the demo; this catches the rest. Only the Exit demo link
 * (data-demo-exit) is let through. The proxy refuses the same requests on the server (src/proxy.ts).
 */
import { useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { DEMO_BASE } from "@/lib/demo-portal/paths";
import { NOT_IN_DEMO } from "@/components/hub/paths";

export function DemoGuard() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("data-demo-exit")) return;
      const raw = a.getAttribute("href") ?? "";
      if (raw.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      const inside = url.origin === location.origin && (url.pathname === DEMO_BASE || url.pathname.startsWith(`${DEMO_BASE}/`));
      if (inside) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      toast(url.pathname.startsWith("/media/") ? "Demo: files aren't kept, so there's nothing to open." : NOT_IN_DEMO, "info");
    };
    // Capture on window runs before React's own listener, so Next.js never starts the navigation.
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
