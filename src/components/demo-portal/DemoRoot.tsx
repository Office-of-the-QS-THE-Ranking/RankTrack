"use client";

/*
 * The portal demo's frame: one of the demo's fictional people signed in to the real Shell, with the governed data
 * built in this browser from fixtures (lib/demo-portal) by the same pure functions the Hub's server uses. Commands
 * run the Hub's engine on that copy; it lives in this tab's memory and is gone on reload. No cookie or session is
 * read, so a visitor signed in to the Hub still sees only sample data.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Shell } from "@/components/shell/Shell";
import { HubRuntimeProvider } from "@/components/hub/runtime";
import { WorkspacePaths } from "@/components/hub/paths";
import { useReference } from "@/components/reference/ReferenceProvider";
import { build, clientHubFrom, type Hub } from "@/lib/governance/hub-build";
import { buildViewer } from "@/lib/governance/viewer-build";
import type { Command } from "@/lib/governance/commands";
import type { GovernanceState } from "@/lib/governance/types";
import type { Viewer } from "@/lib/governance/viewer";
import { demoState } from "@/lib/demo-portal/state";
import { runDemo, type DemoBody } from "@/lib/demo-portal/engine";
import { demoRuntime } from "@/lib/demo-portal/runtime";
import { DEMO_BASE, DEMO_PAGES, demoPath, demoScreen } from "@/lib/demo-portal/paths";
import { DEMO_ROLES, defaultRole, roleByKey, type DemoRole } from "@/lib/demo-portal/roles";
import { DemoBanner } from "./DemoBanner";
import { DemoGuard } from "./DemoGuard";

interface DemoContext {
  h: Hub;
  viewer: Viewer;
  role: DemoRole;
}

const Ctx = createContext<DemoContext | null>(null);

export function useDemo(): DemoContext {
  const d = useContext(Ctx);
  if (!d) throw new Error("useDemo() needs DemoRoot.");
  return d;
}

const ROLE_KEY = "prestige-demo-role";

/* The visitor's chosen role, kept per tab (a convenience; the sample data itself is never stored). */
const listeners = new Set<() => void>();
const readRole = () => {
  try {
    return sessionStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
};
const writeRole = (key: string) => {
  try {
    sessionStorage.setItem(ROLE_KEY, key);
  } catch {}
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function DemoRoot({ children }: { children: ReactNode }) {
  const ref = useReference();
  const pathname = usePathname() ?? DEMO_BASE;
  const params = useSearchParams();
  const router = useRouter();
  const side = DEMO_PAGES[pathname.replace(/\/+$/, "")] ?? "unit";

  // ?as=director opens the demo in that role (for a portfolio's deep links); otherwise the last role picked here.
  const asked = params.get("as");
  useEffect(() => {
    if (roleByKey(asked)) writeRole(asked!);
  }, [asked]);
  const stored = useSyncExternalStore(subscribe, readRole, () => null);
  const picked = roleByKey(asked) ?? roleByKey(stored);
  // A role that doesn't fit the page (a Coordinator on the Office's dashboard) gives way to the page's own.
  const role = picked && picked.side === side ? picked : defaultRole(side);

  // The sample data, in memory only: a reload starts over.
  const [state, setState] = useState<GovernanceState>(() => demoState(ref));
  const live = useRef({ state, account: role.account });
  live.current = { state, account: role.account };

  const apply = useCallback(
    (cmd: Command | DemoBody) => {
      const { state: next, result } = runDemo(live.current.state, ref, live.current.account, cmd);
      if (next !== live.current.state) {
        live.current.state = next;
        setState(next);
      }
      return result;
    },
    [ref],
  );
  const runtime = useMemo(() => demoRuntime({ state: () => live.current.state, accountId: () => live.current.account, apply }), [apply]);

  const h = useMemo(() => build(state, ref), [state, ref]);
  const viewer = useMemo(() => {
    const account = state.accounts.find((a) => a.id === role.account)!;
    const session = state.sessions.find((s) => s.accountId === account.id)!;
    return buildViewer(state, account, session);
  }, [state, role.account]);
  const hub = useMemo(() => clientHubFrom(h, viewer, side), [h, viewer, side]);
  const demo = useMemo(() => ({ h, viewer, role }), [h, viewer, role]);

  const switchRole = (key: string) => {
    const next = roleByKey(key);
    if (!next) return;
    writeRole(next.key);
    router.push(next.home);
  };

  return (
    <HubRuntimeProvider value={runtime}>
      <WorkspacePaths map={demoPath} screen={demoScreen}>
        <Ctx.Provider value={demo}>
          <div className="demo-root">
            <DemoBanner role={role} roles={DEMO_ROLES} onRole={switchRole} />
            <DemoGuard />
            <Shell key={role.key} variant={side} viewer={viewer} hub={hub}>
              {children}
            </Shell>
          </div>
        </Ctx.Provider>
      </WorkspacePaths>
    </HubRuntimeProvider>
  );
}
