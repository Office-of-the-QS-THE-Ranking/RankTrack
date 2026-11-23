import type { Metadata } from "next";
import { HubDocument } from "@/components/site/HubDocument";
import { NotFoundContent } from "@/components/site/NotFoundContent";
import { SiteFrame } from "@/components/site/SiteFrame";
import { PORTAL_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Page not found · ${PORTAL_NAME}`,
  robots: { index: false },
};

/**
 * Addresses no route matches. The Hub has two root layouts (app/(hub) and the portal demo's app/(demo)), so the 404
 * for an unmatched address is composed here, in the Hub's own document, exactly as app/(hub)/not-found.tsx draws it.
 */
export default function GlobalNotFound() {
  return (
    <HubDocument>
      <SiteFrame loader={false}>
        <NotFoundContent />
      </SiteFrame>
    </HubDocument>
  );
}
