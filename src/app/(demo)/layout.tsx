import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { ReferenceProvider } from "@/components/reference/ReferenceProvider";
import { AutopilotBridge } from "@/components/site/AutopilotBridge";
import { ButtonBusy } from "@/components/ui/ButtonBusy";
import { ButtonFx } from "@/components/ui/ButtonFx";
import { CursorFx } from "@/components/ui/CursorFx";
import { Toaster } from "@/components/ui/toast";
import { FieldErrors } from "@/components/ui/validation";
import { demoReference } from "@/lib/demo-portal/reference";
import { PORTAL_NAME } from "@/lib/brand";
import { portfolioOrigins } from "@/lib/framing";
import { sans, serif } from "@/app/fonts";
import "@/styles/all";
import "@/styles/demo-portal.css";

export const metadata: Metadata = {
  title: { default: `Demo · ${PORTAL_NAME}`, template: `%s · Demo · ${PORTAL_NAME}` },
  description: `A demo of the ${PORTAL_NAME} with fictional sample data. Nothing is saved.`,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  themeColor: "#121110",
  colorScheme: "light",
};

/**
 * The portal demo's own root document. It is separate from the Hub's (app/(hub)/layout.tsx) on purpose: it reads its
 * reference data from fixtures (lib/demo-portal), never from Supabase, mounts no page-analytics beacon, and holds no
 * session or cookie. tests/demo-isolation.test.ts keeps it that way.
 */
export default async function DemoDocument({ children }: { children: React.ReactNode }) {
  // Rendered per request, so the Content Security Policy's nonce (src/proxy.ts) reaches its scripts.
  await connection();
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <body>
        <ReferenceProvider value={demoReference()}>{children}</ReferenceProvider>
        <Toaster />
        <FieldErrors />
        <CursorFx />
        <ButtonFx />
        <ButtonBusy />
        <AutopilotBridge origins={portfolioOrigins()} />
      </body>
    </html>
  );
}
