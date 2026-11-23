/*
 * The portal demo's HubRuntime (components/hub/runtime): the same calls the Hub's screens make, answered in the
 * browser. Commands run the real engine on the in-memory state (engine.ts); uploads keep each file's name and size
 * only; sign-out, exports and the evidence reader say they aren't part of the demo. Nothing here can reach a server.
 */
import type { HubRuntime, UploadEvidence } from "@/components/hub/runtime";
import { toast } from "@/components/ui/toast";
import { overviewActivity, overviewBadges, overviewStats } from "@/lib/governance/account-overview";
import type { Command, CommandResult } from "@/lib/governance/commands";
import { endOtherSessions, updateNotificationPrefs, updateProfile, updateSessionPrefs } from "@/lib/governance/engine/profile";
import type { GovernanceState } from "@/lib/governance/types";
import type { DemoBody } from "./engine";

export const NOTHING_SAVED = "Demo: nothing was saved.";
const OFF = (what: string) => ({ ok: false as const, message: `Demo: ${what} isn't part of the demo.` });

export interface DemoHandle {
  /** The latest state and the acting person. */
  state: () => GovernanceState;
  accountId: () => string;
  /** Run a command or engine body as that person, keeping the change in memory. */
  apply: (cmd: Command | DemoBody) => CommandResult;
}

/** A file kept by name and size only, under an address the engine accepts; nothing is uploaded. */
const keepOnlyNames: UploadEvidence = async (files, _target, onProgress) => {
  onProgress?.(1);
  return {
    ok: true,
    files: files.map((f) => {
      const ext = (/\.([a-z0-9]{2,5})$/i.exec(f.name)?.[1] ?? "bin").toLowerCase();
      return { name: f.name, sizeMB: Math.round((f.size / 1_048_576) * 10) / 10, src: `/media/evidence/${crypto.randomUUID()}.${ext}` };
    }),
  };
};

export function demoRuntime(d: DemoHandle): HubRuntime {
  const saved = (r: CommandResult) => {
    if (r.ok) toast(NOTHING_SAVED, "info");
    return r;
  };
  const mine = () => d.state().recentAudit.filter((e) => e.actorId === d.accountId());
  return {
    demo: true,
    govern: async (cmd) => saved(d.apply(cmd)),
    signOut: async () => {
      toast("Demo: there's no session to end. Use Exit demo to leave.", "info");
    },
    heartbeat: async () => ({ ok: true }),
    profile: {
      saveProfile: async (input) => saved(d.apply((ctx) => updateProfile(ctx, input))),
      saveSessionPrefs: async (input) => saved(d.apply((ctx) => updateSessionPrefs(ctx, input))),
      saveNotificationPrefs: async (input) => saved(d.apply((ctx) => updateNotificationPrefs(ctx, input))),
      switchActiveRole: async () => ({ ok: false, message: "Demo: switch roles with the role picker in the demo bar." }),
      signOutOtherDevices: async () => saved(d.apply((ctx) => endOtherSessions(ctx, `demo-session-${d.accountId()}`))),
      signOutDevice: async () => ({ ok: false, message: "Demo: there are no other devices." }),
      clearCookiesAndSignOut: async () => {
        toast("Demo: the demo keeps no cookies. Reload the page to start over.", "info");
      },
      exportMyData: async () => OFF("Exporting your data"),
      loadOverview: async () => {
        const events = mine().map((e) => ({ at: e.at, action: e.action, detail: e.detail ?? null }));
        const stats = overviewStats(events);
        const account = d.state().accounts.find((a) => a.id === d.accountId());
        return { ok: true, stats, badges: overviewBadges(stats), activity: overviewActivity(events), memberSince: account?.createdAt ?? new Date().toISOString(), lastLogin: account?.lastLogin };
      },
      loadDevices: async () => {
        const s = d.state().sessions.find((x) => x.accountId === d.accountId());
        return { ok: true, devices: s ? [{ id: s.id, device: "This browser (demo)", startedAt: s.createdAt, lastSeen: s.lastSeen, current: true, mfa: false }] : [] };
      },
      loadLogs: async () => ({ ok: true, logs: mine().reverse().map((e) => ({ seq: e.seq, at: e.at, action: e.action, label: e.resource.label, detail: e.detail, outcome: e.outcome })) }),
      loadPrivacy: async () => {
        const { privacy } = d.state().security;
        return { ok: true, officer: privacy.officer, email: privacy.email, noticeUpdated: privacy.noticeUpdated };
      },
    },
    review: {
      openReview: async () => OFF("The evidence reader"),
      startReading: async () => OFF("The evidence reader"),
      sendPages: async () => OFF("The evidence reader"),
      forgetReading: async () => OFF("The evidence reader"),
      decideFinding: async () => OFF("The evidence reader"),
      reviewTerms: async () => ({ ok: true, message: "", data: [] }),
      addReviewTerm: async () => OFF("Editing review terms"),
      removeReviewTerm: async () => OFF("Editing review terms"),
    },
    uploadEvidence: keepOnlyNames,
    Assistant: null,
  };
}
