/*
 * The light round the screen while the chat is open: the dashboard tiles' glowing rim (.glow in components.css) at
 * the size of the window, in the same three layers (a soft bloom, the spectrum line, a white glint) and the same
 * colours, read from that rule. Falloff is worked out from each pixel's distance to the edge rather than blurred, so
 * the whole effect is one cheap shader however large the window.
 */

export type EdgeFrame = {
  time: number;
  /** 0 hidden, 1 fully lit. */
  level: number;
  /** How far the light has spread round the screen from the orb, 0 to about 1.3. */
  reveal: number;
  /** The orb's direction from the screen's centre, radians. */
  orbAngle: number;
  /** How lively it is: 0 calm, 1 thinking. */
  energy: number;
  /** A brief flare as it lights, 0 to 1. */
  flare: number;
  dark: boolean;
};

export type EdgeRenderer = {
  draw(frame: EdgeFrame): void;
  clear(): void;
  setSpectrum(colors: Float32Array): void;
  resize(): void;
  dispose(): void;
};

const VS = /* glsl */ `#version 300 es
void main() {
  vec2 q = vec2(float((gl_VertexID & 1) * 4 - 1), float((gl_VertexID & 2) * 2 - 1));
  gl_Position = vec4(q, 0., 1.);
}
`;

const FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform float uRatio, uTime, uLevel, uReveal, uOrb, uEnergy, uFlare, uDark;
uniform vec3 uSpectrum[13];
out vec4 o;

vec3 spectrum(float u) {
  float x = fract(u) * 12.;
  int i = int(floor(x));
  return mix(uSpectrum[i], uSpectrum[i + 1], fract(x));
}

const float PI = 3.14159265;
/* GLSL leaves smoothstep with its edges reversed and pow of a negative number undefined: these say what is meant. */
float fall(float hi, float lo, float x) { return 1. - smoothstep(lo, hi, x); }
float sq(float x) { return x * x; }

void main() {
  vec2 half_ = uSize * .5;
  vec2 p = gl_FragCoord.xy / uRatio - half_;
  float corner = 14.;
  vec2 q = abs(p) - half_ + corner;
  // Distance in from the screen's edge, in CSS pixels.
  float d = max(corner - length(max(q, 0.)) - min(max(q.x, q.y), 0.), 0.);
  float reach = 75. + uFlare * 60.;
  if (d > reach) {
    o = vec4(0.);
    return;
  }

  // The angle round the screen, equal per side. Everything below uses whole multiples of it, so it meets itself.
  float th = atan(p.y / half_.y, p.x / half_.x);
  float t = uTime;

  float swell = .5 + .5 * sin(2. * th + t * .52 + 1.3 * sin(3. * th - t * .37));
  float swell2 = .5 + .5 * sin(5. * th - t * (.74 + uEnergy * .9) + 1.1 * sin(2. * th + t * .29));
  float shape = mix(swell, swell2, .32 + uEnergy * .18);
  // On white the colour has nothing to glow against and reads wider than it is: it is drawn slimmer there.
  float slim = uDark > .5 ? 1. : .74;
  float width = mix(2., 7., shape * shape) * (.74 + uEnergy * .5 + uFlare * .75) * slim;

  // Light spreads both ways round from the orb, and is strongest on the part of the edge facing it.
  float from = abs(mod(th - uOrb + PI, 2. * PI) - PI) / PI;
  float shown = fall(uReveal, uReveal - .22, from);
  float front = exp(-sq((from - uReveal + .1) / .1)) * (1. - smoothstep(.85, 1.2, uReveal));
  float facing = exp(-sq(from / .17));

  float hue = th / (2. * PI) * 2. + t * (.028 + uEnergy * .03) + .05 * sin(3. * th + t * .41);
  vec3 c = spectrum(hue);

  float bloom = exp(-pow(d / width, 1.55));
  float mist = exp(-pow(d / (width * 1.3), 1.35)) * (.08 + uFlare * .12) * slim;
  float line = fall(2.6, .5, d);
  float glint = fall(1.5, 0., d) * (.2 + .8 * swell2 * swell2 + facing * .6);

  float strength = .62 + shape * .38 + facing * .55 + front * .9 + uFlare * .35;
  // Kept quiet: a hint of colour round the screen, not a frame.
  float a = ((bloom * .86 * strength + mist) * shown + line * shown * .95) * .8;

  c = mix(c, vec3(1.), (front * .28 + glint * .75 * shown) * fall(9., 0., d));

  a = clamp(a * uLevel, 0., 1.);
  // Dither: a soft gradient over a whole screen would otherwise show bands.
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  a = clamp(a + (noise - .5) / 200. * step(.002, a), 0., 1.);
  o = vec4(c * a, a);
}
`;

const NAMES = ["uSize", "uRatio", "uTime", "uLevel", "uReveal", "uOrb", "uEnergy", "uFlare", "uDark", "uSpectrum"] as const;

export function createEdgeRenderer(canvas: HTMLCanvasElement): EdgeRenderer | null {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true });
  if (!gl) return null;

  let spectrum: Float32Array | null = null;
  let lost = false;
  let state: ReturnType<typeof build> | null = null;
  let ratio = 1;

  function build(ctx: WebGL2RenderingContext) {
    const program = ctx.createProgram();
    for (const [type, source] of [[ctx.VERTEX_SHADER, VS], [ctx.FRAGMENT_SHADER, FS]] as const) {
      const shader = ctx.createShader(type);
      if (!shader) throw new Error("Could not create a shader.");
      ctx.shaderSource(shader, source);
      ctx.compileShader(shader);
      if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(shader) ?? "A shader failed to compile.");
      ctx.attachShader(program, shader);
      ctx.deleteShader(shader);
    }
    ctx.linkProgram(program);
    if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) throw new Error(ctx.getProgramInfoLog(program) ?? "A shader failed to link.");
    const u = {} as Record<(typeof NAMES)[number], WebGLUniformLocation | null>;
    for (const name of NAMES) u[name] = ctx.getUniformLocation(program, name);
    const vao = ctx.createVertexArray();
    ctx.clearColor(0, 0, 0, 0);
    return { program, u, vao };
  }

  function resize() {
    // The glow is soft, and the hairline is at the very edge: 1.5x is sharp enough and much cheaper than a retina canvas.
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * ratio);
    const h = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!lost) gl!.viewport(0, 0, w, h);
  }

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    state = null;
  };
  const onRestored = () => {
    lost = false;
    state = build(gl);
    resize();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  try {
    state = build(gl);
  } catch (error) {
    console.error(error);
    return null;
  }
  resize();

  return {
    setSpectrum(colors) {
      spectrum = colors;
    },
    resize,
    clear() {
      if (lost) return;
      gl!.clear(gl!.COLOR_BUFFER_BIT);
    },
    draw(f) {
      if (lost || !state || !spectrum) return;
      const ctx = gl!;
      const { u } = state;
      ctx.clear(ctx.COLOR_BUFFER_BIT);
      ctx.useProgram(state.program);
      ctx.uniform2f(u.uSize, canvas.width / ratio, canvas.height / ratio);
      ctx.uniform1f(u.uRatio, ratio);
      ctx.uniform1f(u.uTime, f.time);
      ctx.uniform1f(u.uLevel, f.level);
      ctx.uniform1f(u.uReveal, f.reveal);
      ctx.uniform1f(u.uOrb, f.orbAngle);
      ctx.uniform1f(u.uEnergy, f.energy);
      ctx.uniform1f(u.uFlare, f.flare);
      ctx.uniform1f(u.uDark, f.dark ? 1 : 0);
      ctx.uniform3fv(u.uSpectrum, spectrum);
      ctx.bindVertexArray(state.vao);
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);
      ctx.bindVertexArray(null);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (state && !lost) {
        gl!.deleteProgram(state.program);
        gl!.deleteVertexArray(state.vao);
      }
      state = null;
    },
  };
}
