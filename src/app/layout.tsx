import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import { connection } from "next/server";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DevAccess } from "@/components/dev/DevAccess";
import { ReferenceProvider } from "@/components/reference/ReferenceProvider";
import { CursorFx } from "@/components/ui/CursorFx";
import { Toaster } from "@/components/ui/toast";
import { FieldErrors } from "@/components/ui/validation";
import { reference } from "@/lib/governance/server/reference";
import "@/styles/tokens.css";
import "@/styles/cursors.css";
import "@/styles/cursor-frames.css";
import "@/styles/base.css";
import "@/styles/components.css";
import "@/styles/charts.css";
import "@/styles/shell.css";
import "@/styles/views.css";
import "@/styles/portal.css";
import "@/styles/admin.css";
import "@/styles/posts.css";
import "@/styles/signin.css";
import "@/styles/overview.css";
import "@/styles/unit-profile.css";
import "@/styles/site.css";
import "@/styles/site-home.css";
import "@/styles/site-ascent.css";
import "@/styles/site-pages.css";
import "@/styles/site-post.css";
import "@/styles/portal-typography.css";
import "@/styles/dev.css";
import "@/styles/pickers.css";
import "@/styles/content-tabs.css";

/* Clean sans for dashboards; a refined serif used sparingly for major headings (proposal §1). */
const sans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://rankings.ust.edu.ph"),
  title: {
    default: "UST Global Rankings and Impact Hub",
    template: "%s · UST Global Rankings and Impact Hub",
  },
  description:
    "Where the University of Santo Tomas stands in eight global rankings, the evidence behind each result, and the Thomasian practices other institutions can adapt.",
  applicationName: "UST Global Rankings and Impact Hub",
  openGraph: {
    type: "website",
    siteName: "UST Global Rankings and Impact Hub",
    title: "UST Global Rankings and Impact Hub",
    description: "From Thomasian contributions to global impact: eight global rankings, the evidence behind them and replicable practices.",
    locale: "en_PH",
  },
};

export const viewport: Viewport = {
  themeColor: "#121110",
  colorScheme: "light",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request: the Content Security Policy's nonce (src/proxy.ts) is new each time, and
  // Next.js can only stamp it on its scripts while rendering. The data underneath is held in memory (store,
  // reference data), so this costs a render, not a database round trip.
  await connection();
  const ref = await reference();
  return (
    // The public site marks <html> with "js" before hydration (SiteFrame), so its class may differ.
    <html lang="en" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <body>
        <ReferenceProvider value={ref}>{children}</ReferenceProvider>
        <Toaster />
        <FieldErrors />
        <CursorFx />
        <SpeedInsights />
        {process.env.NODE_ENV === "development" && process.env.HUB_DEV_ACCESS === "on" && <DevAccess />}
      </body>
    </html>
  );
}
