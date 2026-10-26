"use client";

/*
 * Development only: the developer settings' "Skip input checks" switch. While it is on, forms submit and
 * steps advance without valid inputs: <FieldErrors /> turns off native constraint checks, and forms with
 * their own checks ask `skipChecks()` or `useSkipChecks()`. It is kept in this browser and does nothing
 * outside `next dev`. Server actions still check what they receive.
 */
import { useSyncExternalStore } from "react";

const DEV = process.env.NODE_ENV === "development";
const KEY = "hub:dev-skip-checks";
const listeners = new Set<() => void>();

let on: boolean | null = null;
const read = () => {
  if (!DEV) return false;
  if (on === null) {
    try {
      on = localStorage.getItem(KEY) === "1";
    } catch {
      on = false;
    }
  }
  return on;
};

export const skipChecks = () => (typeof window === "undefined" ? false : read());

export function setSkipChecks(v: boolean) {
  if (!DEV) return;
  on = v;
  try {
    if (v) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useSkipChecks = () => useSyncExternalStore(subscribe, skipChecks, () => false);
