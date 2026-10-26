import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CardBeam } from "@/components/signin/CardBeam";
import { FootClock } from "@/components/signin/FootClock";
import { GlassLens } from "@/components/signin/GlassLens";
import { SignInFlow } from "@/components/signin/SignInFlow";
import { SignInScene } from "@/components/signin/SignInScene";
import { logoFace } from "@/components/site/fonts";
import { normalizeReference } from "@/lib/governance/request-tracker";
import { getViewer } from "@/lib/governance/server/session";
import { safeNext } from "@/lib/governance/server/signin";
import pkg from "../../../package.json";

/** The release stage shown after the version (package.json) in the sidebar's foot. */
const STAGE = "Alpha";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** The browser's bar takes the colour of the night behind the page (signin.css). */
export const viewport: Viewport = { themeColor: "#050505", colorScheme: "dark" };

/**
 * Sign-in, on a night scene after the Office's own title slide (SignInScene): the University's name at the
 * upper left over the scene, and at the right a full-height sidebar of liquid glass with a gilt seam down its
 * edge. The sidebar holds, high in its height, a gold mark over the Hub's name in the serif, its second line in
 * gilt italic, and the form (SignInFlow); and at its foot the offices, the app's version and stage, and a live
 * date and clock. On phones the sidebar is a sheet under the scene.
 */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; ended?: string; error?: string; track?: string }> }) {
  const { next, ended, error, track } = await searchParams;
  const viewer = await getViewer();
  if (viewer) {
    const to = safeNext(next);
    if (to?.startsWith("/admin") && viewer.workspaces.includes("office")) redirect(to);
    if (to?.startsWith("/portal") && viewer.workspaces.includes("portal")) redirect(to);
    if (viewer.workspaces.includes("office")) redirect("/admin");
    if (viewer.workspaces.includes("portal")) redirect("/portal");
  }
  return (
    <main className={`signin ${logoFace.variable}`}>
      <SignInScene />
      <div className="signin__col">
        <Link href="/" className="signin__university">
          <Image className="signin__seal" src="/brand/ust-seal-reverse.png" alt="" aria-hidden="true" width={640} height={634} sizes="60px" loading="eager" />
          <span className="signin__university-words">
            <span className="signin__university-name">University of Santo Tomas</span>
            <span className="signin__university-title">Office of the QS/THE Rankings</span>
          </span>
        </Link>
      </div>
      <section className="signin__card" aria-label="Sign in">
        <GlassLens />
        <CardBeam />
        <div className="signin__side">
          <i className="signin__mark" aria-hidden="true" />
          <SignInFlow
            next={next}
            ended={ended}
            error={error}
            track={normalizeReference(track ?? "") || undefined}
          />
        </div>
        <footer className="signin__foot">
          <div className="signin__foot-col">
            <span className="signin__foot-lead">© {new Date().getFullYear()} University of Santo Tomas</span>
            <span>Office of the Rector</span>
            <span>Office of QS/THE Rankings</span>
          </div>
          <div className="signin__foot-col signin__foot-col--end">
            <span className="signin__version">
              Version {pkg.version} <span className="signin__stage">{STAGE}</span>
            </span>
            <FootClock />
          </div>
        </footer>
      </section>
      <nav className="signin__legal" aria-label="Policies">
        <Link href="/privacy">Data privacy</Link>
        <Link href="/terms">Terms of use</Link>
        <Link href="/cookies">Cookie policy</Link>
      </nav>
    </main>
  );
}
