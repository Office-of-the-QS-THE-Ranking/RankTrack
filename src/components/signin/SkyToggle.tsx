"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Sky } from "./sky";
import { skyOverride } from "./skyOverride";

/**
 * The sky button, an icon at the head of the policy bar (signin.css, "the sky button"): the sun by day and the
 * moon by night, the sky the page shows. A press flips to the other sky for as long as the page is open
 * (skyOverride), its icon turning in, and SceneMotion turns the scene; a reload brings back the sky outside.
 */
export function SkyToggle({ initial }: { initial: Sky }) {
  const sky = useSyncExternalStore(skyOverride.subscribe, skyOverride.sky, () => initial);
  const name = sky === "day" ? "Switch to night" : "Switch to day";
  return (
    <button type="button" className="signin__sky" onClick={() => skyOverride.flip()} aria-label={name} title={name}>
      <Icon name="sun" size={15} strokeWidth={1.8} className={sky === "day" ? "is-on" : undefined} />
      <Icon name="moon" size={15} strokeWidth={1.8} className={sky === "night" ? "is-on" : undefined} />
    </button>
  );
}
