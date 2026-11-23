"use client";

/*
 * The Hub's runtime (components/hub/runtime): server actions, which re-authorize the session and write to Supabase,
 * and uploads straight to R2. Mounted once by the Hub's document (components/site/HubDocument.tsx); the portal demo
 * never imports this file.
 */
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { govern } from "@/app/actions/governance";
import { heartbeat, signOut } from "@/app/actions/session";
import {
  clearCookiesAndSignOut,
  exportMyData,
  loadDevices,
  loadLogs,
  loadOverview,
  loadPrivacy,
  saveNotificationPrefs,
  saveProfile,
  saveSessionPrefs,
  signOutDevice,
  signOutOtherDevices,
  switchActiveRole,
} from "@/app/actions/profile";
import { addReviewTerm, decideFinding, forgetReading, openReview, removeReviewTerm, reviewTerms, sendPages, startReading } from "@/app/actions/review";
import { uploadEvidence } from "@/components/contributions/evidence-upload";
import { HubRuntimeProvider, type HubRuntime } from "./runtime";

/* Loaded after the page: it is WebGL and physics, and nothing on the page waits for it. */
const Assistant = dynamic(() => import("@/components/assistant/Assistant"), { ssr: false });

const REAL: HubRuntime = {
  demo: false,
  govern,
  signOut,
  heartbeat,
  profile: {
    clearCookiesAndSignOut,
    exportMyData,
    loadDevices,
    loadLogs,
    loadOverview,
    loadPrivacy,
    saveNotificationPrefs,
    saveProfile,
    saveSessionPrefs,
    signOutDevice,
    switchActiveRole,
    signOutOtherDevices,
  },
  review: { addReviewTerm, decideFinding, forgetReading, openReview, removeReviewTerm, reviewTerms, sendPages, startReading },
  uploadEvidence,
  Assistant,
};

export function RealRuntime({ children }: { children: ReactNode }) {
  return <HubRuntimeProvider value={REAL}>{children}</HubRuntimeProvider>;
}
