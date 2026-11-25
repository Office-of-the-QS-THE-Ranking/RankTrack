import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { DemoSignIn } from "@/components/demo-portal/DemoSignIn";
import { FootClock } from "@/components/signin/FootClock";
import { SignInScene } from "@/components/signin/SignInScene";
import { logoFace } from "@/components/site/fonts";
import { OfficeSwap } from "@/components/ui/OfficeSwap";
import pkg from "../../../../../../package.json";

/** The release stage shown after the version, as on the real sign-in (app/(hub)/signin). */
const STAGE = "Alpha";

export const metadata: Metadata = { title: "Sign in" };

export const viewport: Viewport = { themeColor: "#050505", colorScheme: "dark" };

/**
 * The demo's way in: the real sign-in page (app/(hub)/signin) on its night scene, whose sign-in button opens the
 * demo's dashboard. It checks no account and starts no session, so a portfolio can show it live in its frame.
 */
export default function DemoSignInPage() {
  return (
    <main className={`signin ${logoFace.variable}`}>
      <SignInScene />
      <div className="signin__col">
        <Link href="/" className="signin__university">
          <Image className="signin__seal" src="/brand/ust-seal-reverse.png" alt="" aria-hidden="true" width={640} height={634} sizes="60px" loading="eager" />
          <span className="signin__university-words">
            <span className="signin__university-name">University of Santo Tomas</span>
            <OfficeSwap className="signin__university-title" />
          </span>
        </Link>
      </div>
      <section className="signin__card" aria-label="Sign in">
        <div className="signin__side">
          <DemoSignIn />
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
