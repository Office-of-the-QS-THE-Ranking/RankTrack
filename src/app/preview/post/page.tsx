import { SITE_BOOT } from "@/lib/boot-scripts";
import type { Metadata } from "next";
import { siteData } from "@/lib/governance/server/site";
import { siteFontVars } from "@/components/site/fonts";
import { InlineScript } from "@/components/site/InlineScript";
import { SiteMotion } from "@/components/site/SiteMotion";
import { PostPreviewView } from "@/components/site/impact/PostPreviewView";
import { PreviewStrip } from "@/components/site/impact/PreviewStrip";

export const metadata: Metadata = { title: "Preview", robots: { index: false } };


/** A post from the composer in the public page's layout alone, under a strip that marks the preview: no header, footer or loader. */
export default async function PostPreviewPage() {
  const { stories } = await siteData();
  return (
    <div className={`site site--preview ${siteFontVars}`} data-intro="done" suppressHydrationWarning>
      <InlineScript html={SITE_BOOT} />
      <PreviewStrip />
      <main id="main" className="w-main" tabIndex={-1}>
        <PostPreviewView stories={stories} />
      </main>
      <SiteMotion />
    </div>
  );
}
