/*
 * The portal's name, what it stands for, and the office lines shown under it. Change them here, not in pages.
 */

/** The portal's name, everywhere it is shown. */
export const PORTAL_NAME = "PRESTIGE Portal";

/** The portal's name without "Portal", for headings that set the two words apart. */
export const PORTAL_WORD = "PRESTIGE";

/** What PRESTIGE stands for. */
export const PORTAL_EXPANSION = "Performance & Rankings Evaluator of Sustainability, Transparency, & Intelligence for Global Excellence";

/** The office the portal sits under. */
export const RECTOR_OFFICE = "Office of the Rector";

/** The office that runs the portal. */
export const RANKINGS_OFFICE = "Office of QS/THE Rankings";

/** The office lines under the portal's name (sidebar, sign-in): they take turns, the first shown first. */
export const PORTAL_SUBTITLES = [RANKINGS_OFFICE, RECTOR_OFFICE] as const;

/** How long each office line shows before the next. */
export const PORTAL_SUBTITLE_MS = 10_000;
