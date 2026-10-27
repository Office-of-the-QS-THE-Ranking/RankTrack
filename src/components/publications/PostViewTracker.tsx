"use client";

import { useEffect } from "react";
import { recordPostView } from "@/app/actions/post-views";

const WINDOW_MS = 30 * 60_000;
const recent = new Map<string, number>();
const inFlight = new Map<string, Promise<boolean>>();

/** Count once per article per tab in 30 minutes, including when browser storage is unavailable. */
export function PostViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `hub-post-view:${slug}`;
    const count = async () => {
      if (document.visibilityState !== "visible") return;
      let last = recent.get(slug) ?? 0;
      try { last = Math.max(last, Number(sessionStorage.getItem(key)) || 0); } catch { /* Private browsing can block storage. */ }
      if (Date.now() - last < WINDOW_MS) return;
      let request = inFlight.get(slug);
      if (!request) {
        request = recordPostView(slug).catch(() => false);
        inFlight.set(slug, request);
      }
      if (await request) {
        const at = Date.now();
        recent.set(slug, at);
        try { sessionStorage.setItem(key, String(at)); } catch { /* The in-memory counter still deduplicates this visit. */ }
      }
      if (inFlight.get(slug) === request) inFlight.delete(slug);
    };
    void count();
    document.addEventListener("visibilitychange", count);
    return () => document.removeEventListener("visibilitychange", count);
  }, [slug]);
  return null;
}
