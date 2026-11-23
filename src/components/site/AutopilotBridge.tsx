"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { startBridge } from "@/lib/autopilot-bridge";
import { framable } from "@/lib/framing";

/**
 * Lets a portfolio in PORTFOLIO_ORIGINS demo the site live inside its frame (lib/autopilot-bridge.ts). Mounted in
 * both root documents; it does nothing unless the page is framed by one of those origins, and it only opens pages
 * that may be framed (lib/framing.ts).
 */
export function AutopilotBridge({ origins }: { origins: string[] }) {
  const router = useRouter();
  const key = origins.join(" ");
  useEffect(
    () =>
      startBridge({
        origins: key ? key.split(" ") : [],
        // The public site's first-load screen (SiteFrame, SiteMotion).
        busy: () => Boolean(document.querySelector('.site[data-intro="load"]')),
        allow: framable,
        navigate: (path) => router.push(path),
      }),
    [key, router],
  );
  return null;
}
