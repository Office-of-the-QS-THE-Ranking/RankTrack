import type { Metadata, Viewport } from "next";
import { HubDocument } from "@/components/site/HubDocument";
import { PORTAL_EXPANSION, PORTAL_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  metadataBase: new URL("https://rankings.ust.edu.ph"),
  title: {
    default: PORTAL_NAME,
    template: `%s · ${PORTAL_NAME}`,
  },
  description:
    `${PORTAL_NAME}: ${PORTAL_EXPANSION}. Where the University of Santo Tomas stands in eight global rankings, the evidence behind each result, and the Thomasian practices other institutions can adapt.`,
  applicationName: PORTAL_NAME,
  openGraph: {
    type: "website",
    siteName: PORTAL_NAME,
    title: PORTAL_NAME,
    description: "From Thomasian contributions to global impact: eight global rankings, the evidence behind them and replicable practices.",
    locale: "en_PH",
  },
};

export const viewport: Viewport = {
  themeColor: "#121110",
  colorScheme: "light",
};

/** The root layout of the Hub's own routes. The portal demo (app/(demo)) has a root layout of its own. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <HubDocument>{children}</HubDocument>;
}
