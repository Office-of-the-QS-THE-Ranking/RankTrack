// Cursor artwork (black; red over anything clickable; UST gold over the sidebar collapse area) drawn on a 32×32 grid and output at 26×26 CSS px. Black fill, white outline, soft shadow.
// Each shape is drawn twice: a white stroke pass, then the black fill on top, so
// overlapping parts share one clean outline.
const shadow = `<filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="0.9" flood-color="#000" flood-opacity="0.38"/></filter>`;

const two = (shapes, extra = "", fill = "#111113") => `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 32 32"><defs>${shadow}</defs><g filter="url(#s)"><g fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round">${shapes}</g><g fill="${fill}">${shapes}</g>${extra}</g></svg>`;

const arrow = `<path d="M4 4L21.5 11.2L12.8 12.8L11.2 21.5Z"/>`;


// Text bar: curved serifs at the arrowhead's weight rather than the system's hairline, scaled
// about its centre to the arrowhead's height (strokes widened to keep the weight).
const beam = (w, c) => `<path d="M11.5 5H13.5Q16 5 16 7.5Q16 5 18.5 5H20.5M16 7.5V24.5M11.5 27H13.5Q16 27 16 24.5Q16 27 18.5 27H20.5" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const text = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 32 32"><defs>${shadow}</defs><g filter="url(#s)"><g transform="translate(16 16) scale(0.8) translate(-16 -16)">${beam(6.5, "#fff")}${beam(3, "#111113")}</g></g></svg>`;

// Click pulse frames: the arrow scaled about its tip, so the hotspot stays put.
const scaled = (k) => `<g transform="translate(4 4) scale(${k}) translate(-4 -4)">${arrow}</g>`;

const badge = `<circle cx="22.5" cy="23" r="5.4" fill="#111113" stroke="#fff" stroke-width="1.5"/><circle cx="22.5" cy="23" r="3" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M20.4 25.1L24.6 20.9" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`;

// Pulse ladder (percent of full size); CursorFx steps through these on click.
export const PULSE = [86, 92, 104, 108];

export const cursors = {
  arrow: { svg: two(arrow), hot: [3, 3] },
  pointer: { svg: two(arrow, "", "#e5262d"), hot: [3, 3] },
  gold: { svg: two(arrow, "", "#f2b705"), hot: [3, 3] },
  text: { svg: text, hot: [13, 13] },
  "not-allowed": { svg: two(arrow, badge), hot: [3, 3] },
};

for (const k of PULSE) {
  cursors[`arrow-${k}`] = { svg: two(scaled(k / 100)), hot: [3, 3] };
  cursors[`pointer-${k}`] = { svg: two(scaled(k / 100), "", "#e5262d"), hot: [3, 3] };
  cursors[`gold-${k}`] = { svg: two(scaled(k / 100), "", "#f2b705"), hot: [3, 3] };
}
