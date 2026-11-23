import { connection } from "next/server";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ReferenceProvider } from "@/components/reference/ReferenceProvider";
import { RealRuntime } from "@/components/hub/RealRuntime";
import { ButtonBusy } from "@/components/ui/ButtonBusy";
import { ButtonFx } from "@/components/ui/ButtonFx";
import { CursorFx } from "@/components/ui/CursorFx";
import { Toaster } from "@/components/ui/toast";
import { FieldErrors } from "@/components/ui/validation";
import { reference } from "@/lib/governance/server/reference";
import { sans, serif } from "@/app/fonts";
import "@/styles/all";

/**
 * The Hub's document: <html>, the reference data and the layers every page shares. The root layout of the Hub's
 * routes (app/(hub)/layout.tsx) and the global 404 both render it. The portal demo has its own (app/(demo)), which
 * never reads Supabase.
 */
export async function HubDocument({ children }: { children: React.ReactNode }) {
  // Every page renders per request: the Content Security Policy's nonce (src/proxy.ts) is new each time, and
  // Next.js can only stamp it on its scripts while rendering. The data underneath is held in memory (store,
  // reference data), so this costs a render, not a database round trip.
  await connection();
  const ref = await reference();
  return (
    // The public site marks <html> with "js" before hydration (SiteFrame), so its class may differ.
    <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <body>
        <ReferenceProvider value={ref}>
          <RealRuntime>{children}</RealRuntime>
        </ReferenceProvider>
        <Toaster />
        <FieldErrors />
        <CursorFx />
        <ButtonFx />
        <ButtonBusy />
        <SpeedInsights />
      </body>
    </html>
  );
}
