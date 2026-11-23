"use client";

/*
 * The workspace's runtime: everything a client component does that reaches the server (commands, sign-out, the
 * session heartbeat, profile settings, evidence uploads, the evidence reader) and the assistant. It is the write half
 * of the data-source boundary. The Hub's document mounts RealRuntime (server actions, Supabase, R2); the portal demo
 * mounts its own in-memory runtime (lib/demo-portal). Components import the delegates beside this file
 * (runtime/governance, runtime/session…), never "@/app/actions/…", so the demo's module graph holds no server action
 * at all (tests/demo-isolation.test.ts checks it).
 */
import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type * as Governance from "@/app/actions/governance";
import type * as Session from "@/app/actions/session";
import type * as Profile from "@/app/actions/profile";
import type * as Review from "@/app/actions/review";

export type UploadedEvidence = { name: string; sizeMB: number; src: string };

export type UploadEvidence = (
  files: File[],
  target: { unitSlug: string; evidenceId?: string },
  onProgress?: (fraction: number) => void,
) => Promise<{ ok: true; files: UploadedEvidence[] } | { ok: false; message: string }>;

export interface HubRuntime {
  /** True in the portal demo: nothing reaches a server, a database or storage. */
  demo: boolean;
  govern: typeof Governance.govern;
  signOut: () => Promise<void>;
  heartbeat: typeof Session.heartbeat;
  profile: Pick<
    typeof Profile,
    | "clearCookiesAndSignOut"
    | "exportMyData"
    | "loadDevices"
    | "loadLogs"
    | "loadOverview"
    | "loadPrivacy"
    | "saveNotificationPrefs"
    | "saveProfile"
    | "saveSessionPrefs"
    | "signOutDevice"
    | "switchActiveRole"
    | "signOutOtherDevices"
  >;
  review: Pick<typeof Review, "addReviewTerm" | "decideFinding" | "forgetReading" | "openReview" | "removeReviewTerm" | "reviewTerms" | "sendPages" | "startReading">;
  uploadEvidence: UploadEvidence;
  /** The assistant orb, or null where there is none (the demo). */
  Assistant: ComponentType<{ name: string }> | null;
}

const Ctx = createContext<HubRuntime | null>(null);
let current: HubRuntime | null = null;

export function HubRuntimeProvider({ value, children }: { value: HubRuntime; children: ReactNode }) {
  // Event handlers and effects call the delegates outside React; a page only ever has one runtime.
  current = value;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHubRuntime(): HubRuntime {
  const r = useContext(Ctx);
  if (!r) throw new Error("useHubRuntime() needs the HubRuntimeProvider a root document mounts.");
  return r;
}

/** The mounted runtime, for the delegates. */
export function runtime(): HubRuntime {
  if (!current) throw new Error("No HubRuntime is mounted.");
  return current;
}
