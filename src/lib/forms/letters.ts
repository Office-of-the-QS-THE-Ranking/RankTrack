/*
 * What Digital Forms let people type: no emoji anywhere, and names in letters only. The inputs keep these out as
 * they're typed (controls.tsx); the server strips emoji from answers and refuses them in a form's own words, and
 * checks names again (modules.ts, schema.ts, engine/forms.ts). No server code, so pages can import it.
 */

/** Emoji and the pieces they're built from: pictographs, flags, skin tones, the emoji style mark, keycaps and joiners. */
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\uFE0F\u20E3\u200D]/gu;

export const hasEmoji = (s: string) => new RegExp(EMOJI.source, "u").test(s);

const EMOJI_RUN = new RegExp(`([ \\t]?)(?:${EMOJI.source})+([ \\t]?)`, "gu");

/** Text with its emoji taken out; an emoji between two spaces leaves one. */
export const noEmoji = (s: string) => s.replace(EMOJI_RUN, (_, a: string, b: string) => (a && b ? " " : a || b));

/** A name: letters of any alphabet (Ñ, É…) and spaces; no digits, symbols or emoji. */
const NAME = /^[\p{L}\p{M} ]*$/u;

export const isName = (s: string) => NAME.test(s);

/** A name as typed, with everything but letters and spaces taken out. */
export const lettersOnly = (s: string) => s.replace(/[^\p{L}\p{M} ]+/gu, "");
