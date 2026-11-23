import { Instrument_Sans, Newsreader } from "next/font/google";

/* Clean sans for dashboards; a refined serif used sparingly for major headings (proposal §1). Shared by every root document. */
export const sans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument",
  display: "swap",
});

export const serif = Newsreader({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});
