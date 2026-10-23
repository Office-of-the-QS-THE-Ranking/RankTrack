import { skyAt, type Sky } from "./sky";

/**
 * The viewer's flip of the sky, in the browser and only while the page is open: kept nowhere, so a reload
 * brings back the sky outside. The sky button (SkyToggle) flips it and SceneMotion turns the scene to it. It
 * ends itself whenever it would only repeat the sky outside: when the viewer flips back to it, or the sun
 * rises or sets to meet it (SceneMotion).
 */
let held: Sky | null = null;
/** Why the listeners hear: the viewer flipped the sky, or the sky was looked at again (settle). */
type Cause = "flip" | "settle";
const listeners = new Set<(cause: Cause) => void>();
const tell = (cause: Cause) => {
  for (const listener of listeners) listener(cause);
};

/** The sky outside, by the viewer's own clock. */
const outside = (): Sky => skyAt(Date.now(), -new Date().getTimezoneOffset());

export const skyOverride = {
  /** The sky to show: the one flipped to, or else the sky outside. */
  sky: (): Sky => held ?? outside(),
  /** Flip to the other sky; back at the sky outside, the flip ends. */
  flip() {
    const next: Sky = skyOverride.sky() === "day" ? "night" : "day";
    held = next === outside() ? null : next;
    tell("flip");
  },
  /** End the flip if the sky outside has come round to it; say so either way, so the button shows the sky. */
  settle() {
    if (held === outside()) held = null;
    tell("settle");
  },
  subscribe(listener: (cause: Cause) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
