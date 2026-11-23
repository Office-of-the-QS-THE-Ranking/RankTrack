import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DemoRoot } from "@/components/demo-portal/DemoRoot";
import { demoEnabled } from "@/lib/demo-portal/enabled";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/** The portal demo: switched off (a 404) unless PORTAL_DEMO_ENABLED=true. The proxy refuses it first (src/proxy.ts). */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!demoEnabled()) notFound();
  return (
    <Suspense>
      <DemoRoot>{children}</DemoRoot>
    </Suspense>
  );
}
