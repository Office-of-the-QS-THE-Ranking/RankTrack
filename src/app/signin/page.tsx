import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { CardBeam } from "@/components/signin/CardBeam";
import { SignInFlow, type ChooserAccount } from "@/components/signin/SignInFlow";
import { SignInScene } from "@/components/signin/SignInScene";
import { MANILA, SKY_BOOT, SKY_THEME, skyAt } from "@/components/signin/sky";
import { SkyToggle } from "@/components/signin/SkyToggle";
import { logoFace } from "@/components/site/fonts";
import { InlineScript } from "@/components/site/InlineScript";
import { workspacesOf } from "@/lib/governance/derive";
import { grantsFor, initials, today } from "@/lib/governance/rbac";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** The browser's bar takes the colour of the sky the page opens on (SKY_BOOT corrects it for other time zones). */
export function generateViewport(): Viewport {
  const sky = skyAt(Date.now(), MANILA);
  return { themeColor: SKY_THEME[sky], colorScheme: sky === "day" ? "light" : "dark" };
}

/**
 * Sign-in, on a scene after the Office's own title slide (SignInScene), by day or by night as the sun stands
 * (sky.ts), which the sky button in the policy bar flips until the page reloads: the University's name and the
 * Hub's name with its second line in gold at the upper left, the form on gilt-edged glass at the right below
 * them (dark by night, light by day), and the unit at its foot. The server picks the sky by Manila's clock and
 * the script at the head of the page re-picks it by the viewer's own before anything paints.
 */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; ended?: string }> }) {
  const { next, ended } = await searchParams;
  const sky = skyAt(Date.now(), MANILA);
  const viewer = await getViewer();
  const state = readState();
  const day = today();
  const unitName = (id: string) => state.units.find((u) => u.id === id)?.name ?? id;
  const accounts: ChooserAccount[] = state.accounts
    .map((a) => {
      const grants = grantsFor(a, state.roles, state.units, day);
      const ws = workspacesOf(grants);
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        title: a.title,
        unit: unitName(a.unitId),
        roles: [...new Set(grants.map((g) => g.roleName))],
        status: a.status,
        external: !!a.external,
        workspace: ws.includes("office") ? ("office" as const) : ws.includes("portal") ? ("portal" as const) : ("none" as const),
        initials: initials(a.name),
        tier: grants.reduce((n, g) => Math.max(n, g.tier), 0),
      };
    })
    .sort((a, b) => a.unit.localeCompare(b.unit) || a.name.localeCompare(b.name));
  const units = state.units
    .filter((u) => u.status === "Active" && u.kind !== "University")
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <main className={`signin ${logoFace.variable}`} data-sky={sky} suppressHydrationWarning>
      <InlineScript html={SKY_BOOT} />
      <SignInScene sky={sky} />
      <div className="signin__col">
        <div className="signin__brand">
          <Link href="/" className="signin__university">
            <span className="signin__seals" aria-hidden="true">
              <Image className="signin__seal signin__seal--night" src="/brand/ust-seal-reverse.png" alt="" width={640} height={634} sizes="60px" loading="eager" />
              <Image className="signin__seal signin__seal--day" src="/brand/ust-seal.png" alt="" width={640} height={634} sizes="60px" loading="eager" />
            </span>
            <span className="signin__university-words">
              <span className="signin__university-title">The Pontifical and Royal</span>
              <span className="signin__university-name">University of Santo Tomas</span>
              <span className="signin__university-title">The Catholic University of the Philippines</span>
            </span>
          </Link>
          <p className="signin__display">
            <span className="signin__row">
              <span>Global Rankings</span>
            </span>{" "}
            <span className="signin__row signin__row--gold">
              <span>and Impact Hub</span>
            </span>
          </p>
        </div>
        <section className="signin__card" aria-label="Sign in">
          <CardBeam />
          <SignInFlow
            accounts={accounts}
            next={next}
            ended={ended}
            units={units}
            current={viewer ? { name: viewer.name, role: viewer.roleName, workspaces: viewer.workspaces } : null}
          />
        </section>
        <footer className="signin__foot">
          <p className="signin__unit">Office of the QS/THE Rankings</p>
        </footer>
      </div>
      <div className="signin__legal">
        <SkyToggle initial={sky} />
        <nav className="signin__policies" aria-label="Policies">
          <Link href="/privacy">Data privacy</Link>
          <Link href="/terms">Terms of use</Link>
          <Link href="/cookies">Cookie policy</Link>
        </nav>
      </div>
    </main>
  );
}
