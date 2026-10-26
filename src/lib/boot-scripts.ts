/*
 * The Hub's only inline scripts, run before the first paint. They live here, apart from the components that
 * render them, because the Content Security Policy (src/proxy.ts) allows exactly these by their SHA-256: change
 * one and its hash changes with it; any other inline script is refused.
 */

export const THEME_KEY = "hub-theme";

/** The public website: scripting is available, so the reveal animations can start hidden. */
export const SITE_BOOT = `document.documentElement.classList.add("js");`;

/** The workspaces: the saved or system theme, set before paint so a dark page never flashes light. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export const BOOT_SCRIPTS = [SITE_BOOT, THEME_BOOT];
