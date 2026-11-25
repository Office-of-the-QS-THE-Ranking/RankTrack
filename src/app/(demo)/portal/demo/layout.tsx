import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { demoEnabled } from "@/lib/demo-portal/enabled";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/**
 * The portal demo: switched off (a 404) unless PORTAL_DEMO_ENABLED=true. The proxy refuses it first (src/proxy.ts).
 * Its sign-in (signin/) stands on its own; the workspace pages ((workspace)/) sit in the demo's frame.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!demoEnabled()) notFound();
  return children;
}
