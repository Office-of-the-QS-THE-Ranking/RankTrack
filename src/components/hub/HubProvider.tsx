"use client";

/*
 * The signed-in viewer and the governed data, for client components in the workspaces. Both come from
 * the server on every render of the workspace layout; changes go back through `useGovern`, which the
 * server re-authorizes and audits before every page re-renders.
 */
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { govern } from "@/app/actions/governance";
import type { Ranking } from "@/lib/data";
import { useReference } from "@/components/reference/ReferenceProvider";
import type { Command, CommandResult } from "@/lib/governance/commands";
import type { HubData } from "@/lib/governance/hub-types";
import type { Target } from "@/lib/governance/rbac";
import type { Action, ModuleKey } from "@/lib/governance/types";
import { feature, flag, viewerCan, type Viewer } from "@/lib/governance/viewer";

interface HubContext {
  viewer: Viewer | null;
  hub: HubData | null;
  variant: "office" | "unit" | "public";
}

const Ctx = createContext<HubContext>({ viewer: null, hub: null, variant: "public" });

export function HubProvider({ viewer, hub, variant, children }: HubContext & { children: ReactNode }) {
  const value = useMemo(() => ({ viewer, hub, variant }), [viewer, hub, variant]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useViewer = () => useContext(Ctx).viewer;
export const useHub = () => useContext(Ctx).hub;
export const useVariant = () => useContext(Ctx).variant;

export function useCan() {
  const viewer = useViewer();
  return useCallback((m: ModuleKey, a: Action, t?: Target) => viewerCan(viewer, m, a, t), [viewer]);
}

export function useFlag(id: string) {
  return flag(useViewer(), id);
}

export function useFeature(id: string) {
  return feature(useViewer(), id);
}

/** Rankings tracked in the workspaces, with configured deadlines. Outside a workspace: all of them. */
export function useRankings(): Ranking[] {
  const hub = useHub();
  const { rankings } = useReference();
  return useMemo(() => {
    if (!hub) return rankings;
    return rankings.filter((r) => hub.activeSlugs.includes(r.slug)).map((r) => (hub.deadlines[r.slug] && hub.deadlines[r.slug] !== r.deadline ? { ...r, deadline: hub.deadlines[r.slug] } : r));
  }, [hub, rankings]);
}

/** Send a command to the server. The page re-renders with the new state when it returns. */
export function useGovern() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (cmd: Command): Promise<CommandResult> => {
      setBusy(true);
      try {
        const result = await govern(cmd);
        if (!result.ok && /session has ended/i.test(result.message)) start(() => router.refresh());
        return result;
      } catch {
        return { ok: false, message: "The server could not be reached. Check your connection and try again." };
      } finally {
        setBusy(false);
      }
    },
    [router],
  );
  return { run, pending: pending || busy };
}
