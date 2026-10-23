/**
 * The night sky behind the header, its panels, the phone menu and the footer: three layers of
 * box-shadow stars that drift left at different speeds and twinkle out of step. Positions come from a
 * seeded generator so server and client render the same stars. Each layer repeats its stars one
 * field-width over, so the drift loops seamlessly.
 */
const STAR_FIELD = 2000;
const STAR_LAYERS = [
  { count: 64, size: 1, seed: 7 },
  { count: 30, size: 1.5, seed: 19 },
  { count: 12, size: 2, seed: 43 },
];

function starShadows(count: number, seed: number, height: number) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand() * STAR_FIELD);
    const y = Math.round(rand() * height);
    const a = (0.4 + rand() * 0.5).toFixed(2);
    out.push(`${x}px ${y}px rgb(224 235 255 / ${a})`, `${x + STAR_FIELD}px ${y}px rgb(224 235 255 / ${a})`);
  }
  return out.join(", ");
}

const layer = (size: number, stars: string) => ({ width: size, height: size, boxShadow: stars }); // taste-skill-ignore: each shadow is a star, not an elevation

/** "bar": a 100px strip for the header bar. "field": 1000px of sky for panels, the menu and the footer. */
const SKIES = {
  bar: STAR_LAYERS.map((l) => layer(l.size, starShadows(l.count, l.seed, 100))),
  field: STAR_LAYERS.map((l) => layer(l.size, starShadows(l.count * 3, l.seed + 101, 1000))),
};

export function Stars({ sky = "bar", className }: { sky?: keyof typeof SKIES; className?: string }) {
  return (
    <div className={`w-stars${className ? ` ${className}` : ""}`} aria-hidden="true">
      {SKIES[sky].map((style, i) => (
        <span key={i} className="w-stars__layer" style={style} />
      ))}
    </div>
  );
}
