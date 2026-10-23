import { Cinzel, Crimson_Pro, Source_Sans_3 } from "next/font/google";

/*
 * Web stand-ins for the typefaces in the UST Visual Identity Manual (2019), which are Adobe-licensed:
 *   Trajan Pro  → Cinzel        the University name in the logotype, all capitals, nowhere else
 *   Minion Pro  → Crimson Pro   unit names (capitals) and every heading on the site
 *   Myriad Pro  → Source Sans 3 running text, navigation and contact details
 * If the Office has an Adobe Fonts kit, swap the three families here; nothing else changes.
 */
export const logoFace = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", display: "swap" });

export const displayFace = Crimson_Pro({ subsets: ["latin", "latin-ext"], variable: "--font-crimson", display: "swap" });

export const textFace = Source_Sans_3({ subsets: ["latin", "latin-ext"], variable: "--font-source", display: "swap" });

export const siteFontVars = `${logoFace.variable} ${displayFace.variable} ${textFace.variable}`;
