/*
 * Draws the orb in WebGL2: a dark core under a shell of hex plates, all in the dashboard's rim colours. A band of light
 * sweeps down the sphere, lighting the plates and lifting them off it so the silhouette swells as it passes; a blow
 * sends a ripple of raised, lit plates out from where it landed, like a force field taking a hit. Over that go the
 * face's dot-matrix glow and the glass. While the chat is open the ball stays the same dark glass, with no face.
 * The eyes are not drawn here: they are the page's own crisp elements, on top of this canvas.
 */
import { shellVertices, STRIDE } from "./hexsphere";

export type OrbFrame = {
  time: number;
  /** How far the colours have flowed round the sphere, in turns of the spectrum. */
  flow: number;
  /** The shell's orientation, column-major. */
  rotation: Float32Array;
  /** The band's height on the sphere, in radii from its middle. */
  band: number;
  /** Up to four ripples: a direction in view space and their age in seconds, below zero when unused. */
  hits: Float32Array;
  /** How strong each ripple is, 0 to 1: a tap is not a slam. */
  hitGains: Float32Array;
  /** Where the pointer touches the sphere, and how near it is, 0 to 1. */
  pointer: [number, number, number];
  pointerNear: number;
  /** Where the face looks, in radii, y up. */
  face: [number, number];
  /** 0 idle, 1 while the chat is open: the face goes and the halo gathers. */
  active: number;
  /** 0 idle, 1 while it thinks: quicker colours and rising sparks. */
  think: number;
};

export type OrbRenderer = {
  draw(frame: OrbFrame): void;
  setSpectrum(colors: Float32Array): void;
  /** The colour of a plate at rest, 0 to 1 per channel. */
  setBase(color: readonly [number, number, number]): void;
  /** Match the canvas's pixels to its size on screen. */
  resize(): void;
  dispose(): void;
};

/* Density of the shell, and the share of each plate left as a dark seam. */
const FREQUENCY = 5;
const GAP = 0.15;
const SPARKS = 44;
/** Half the canvas's width, in the orb's radii: the room plates and sparks have to leave the sphere. */
const SPAN = 2;

/* GLSL leaves smoothstep with its edges reversed and pow of a negative number undefined: these say what is meant. */
const COMMON = /* glsl */ `#version 300 es
precision highp float;
float fall(float hi, float lo, float x) { return 1. - smoothstep(lo, hi, x); }
float sq(float x) { return x * x; }
`;

const SPECTRUM = /* glsl */ `
uniform vec3 uSpectrum[13];
vec3 spectrum(float u) {
  float x = fract(u) * 12.;
  int i = int(floor(x));
  return mix(uSpectrum[i], uSpectrum[i + 1], fract(x));
}
`;

const FACE_BOX = /* glsl */ `
float faceBox(vec2 p) {
  vec2 q = abs(p) - vec2(.66, .43) + .34;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - .34;
}
`;

const SHELL_VS = /* glsl */ `${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aCenter;
layout(location = 2) in vec3 aMeta;
uniform mat3 uRot;
uniform float uFit, uBand, uPointerNear;
uniform vec3 uBandAxis, uPointer;
uniform vec4 uHits[4];
uniform float uHitGains[4];
out vec3 vN;
out vec3 vC;
out vec2 vP;
out float vRim, vLayer, vLit, vHit, vNear, vSeed;
void main() {
  vec3 c = uRot * aCenter;
  vec3 p = uRot * aPos;
  float layer = aMeta.y;
  float lit = 0., hit = 0., near = 0.;
  if (layer < 1.5) {
    // Each plate catches the band a little early or late, so its edge is broken like the reference's.
    float h = dot(c, uBandAxis) + (aMeta.z - .5) * .17;
    float x = (h - uBand) / .31;
    lit = exp(-x * x);
    for (int i = 0; i < 4; i++) {
      float age = uHits[i].w;
      if (age < 0.) continue;
      float a = acos(clamp(dot(c, uHits[i].xyz), -1., 1.));
      float w = a - age * 3.8;
      hit += exp(-w * w * 22.) * exp(-age * 3.1) * uHitGains[i];
    }
    hit = min(hit, 1.);
    near = uPointerNear * smoothstep(.7, 1., dot(c, uPointer));
  }
  float rest = layer > 1.5 ? .966 : mix(.955, 1., layer);
  vec3 q = p * (rest + lit * .068 + hit * .12 + near * .025);
  float k = 1. / (1. - q.z * .15);
  gl_Position = vec4(q.xy * uFit * k, -q.z * .2, 1.);
  // The plate's own face: mostly flat, turned slightly toward each corner so it catches a soft edge of light.
  vN = uRot * normalize(mix(aCenter, aPos, .45));
  vC = c;
  vP = q.xy * k;
  vRim = aMeta.x;
  vLayer = layer;
  vLit = lit;
  vHit = hit;
  vNear = near;
  vSeed = aMeta.z;
}
`;

const SHELL_FS = /* glsl */ `${COMMON}
in vec3 vN;
in vec3 vC;
in vec2 vP;
in float vRim, vLayer, vLit, vHit, vNear, vSeed;
uniform float uActive, uFlow;
uniform vec2 uFace;
uniform vec3 uBase;
out vec4 o;
${SPECTRUM}
${FACE_BOX}
void main() {
  vec3 n = normalize(vN);
  float facing = max(n.z, 0.);
  float fresnel = pow(1. - facing, 2.6);
  // The dashboard's colours flow round the sphere, the whole sweep of the tiles' rim across the face we see. A plate
  // takes one colour whole, so the ball reads as tiles of it.
  vec3 tint = spectrum(atan(vC.x, vC.z) / 3.1416 + vC.y * .16 + uFlow);
  if (vLayer > 1.5) {
    // The core shows in the seams, darker than the plates so the hexagons still read.
    o = vec4(uBase * .6 + vec3(.011, .019, .031) * fresnel, 1.);
    return;
  }
  // At rest a plate is dark glass, its edge catching the colour toward the limb.
  vec3 c = uBase + tint * fresnel * (.46 + .24 * vSeed);
  vec3 h = normalize(vec3(-.32, .55, 1.));
  float gleam = pow(max(dot(n, h), 0.), 38.);
  c += vec3(.5, .62, .78) * gleam * .1;
  // Lit by the band: a shade of the colour at its edges, the colour itself in its middle, paler at the limb.
  float light = clamp(vLit + vHit * 1.1 + vNear * .34, 0., 1.);
  vec3 lit = mix(tint * .42, tint, smoothstep(.2, .72, light));
  lit = mix(lit, mix(tint, vec3(1.), .55), smoothstep(.8, 1., light) * .3 + fresnel * light * .34);
  c = mix(c, lit, smoothstep(.05, .5, light));
  c += lit * smoothstep(.72, 1., vRim) * smoothstep(.1, .6, light) * .2;
  // Its side walls are in shade.
  c *= mix(.3, 1., smoothstep(.2, .95, vLayer));
  // At rest plates dim in front of the face, so the eyes are never fighting the band.
  float behind = fall(.2, -.1, faceBox(vP - uFace));
  // It goes with the eyes, in the first third of the opening.
  c = mix(c, uBase, behind * .86 * fall(.3, 0., uActive));
  o = vec4(c, 1.);
}
`;

const QUAD_VS = /* glsl */ `${COMMON}
out vec2 vP;
uniform float uSpan;
void main() {
  vec2 q = vec2(float((gl_VertexID & 1) * 4 - 1), float((gl_VertexID & 2) * 2 - 1));
  vP = q * uSpan;
  gl_Position = vec4(q, 0., 1.);
}
`;

const GLASS_FS = /* glsl */ `${COMMON}
in vec2 vP;
uniform float uFlow, uBand, uActive, uDot, uPointerNear;
uniform vec2 uFace;
out vec4 o;
${SPECTRUM}
${FACE_BOX}
void main() {
  vec2 p = vP;
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  vec3 color = vec3(0.);
  float alpha = 0.;

  // The halo beyond the sphere: faint at rest, gathering where the band passes.
  float away = max(r - 1., 0.);
  float tide = exp(-sq((p.y - uBand) / .62));
  vec3 haloColor = spectrum(atan(p.y, p.x) / 3.1416 + uFlow);
  float halo = exp(-away * 5.2) * smoothstep(.96, 1.01, r) * (.09 + tide * .24 + uActive * .3 + uPointerNear * .06);
  color += haloColor * halo;
  alpha += halo;

  float inside = 1. - smoothstep(.975, .995, r);

  // The face: a soft pill of colour that breaks into dots toward its edge.
  vec2 f = p - uFace;
  float sd = faceBox(f);
  vec2 cell = mod(gl_FragCoord.xy, uDot) - uDot * .5;
  float dots = fall(uDot * .5, uDot * .2, length(cell));
  float grain = mix(dots, 1., fall(.0, -.2, sd));
  float pill = fall(.13, -.11, sd) * grain * inside;
  float across = f.x * .17 + f.y * .1 + .035 * sin(f.y * 3.1 - f.x * 1.5 + uFlow * 18.);
  vec3 face = spectrum(across + uFlow * 1.4) * (.8 + tide * .2);
  // The pill behind the eyes closes with them: gone in the first third of the opening, as the eyes fade.
  float shown = pill * .94 * fall(.3, 0., uActive);
  color += face * shown;
  alpha += shown;

  // The glass: a hairline rim of the colours, white where the light lands, and a soft reflection above.
  float rim = smoothstep(.945, .988, r) * (1. - smoothstep(.99, 1.006, r));
  float toLight = dot(dir, normalize(vec2(-.62, .78)));
  float awayLight = dot(dir, normalize(vec2(.66, -.75)));
  vec3 rimColor = spectrum(atan(p.y, p.x) / 3.1416 + uFlow);
  float clear = 1. - clamp(tide, 0., 1.) * .85;
  float rimA = rim * .34 * clear;
  color += rimColor * rimA;
  alpha += rimA;
  float glint = rim * smoothstep(.5, .98, toLight) * .72 * clear;
  color += vec3(.86, .94, 1.) * glint;
  alpha += glint;
  float far = rim * smoothstep(.45, .98, awayLight) * .55 * clear;
  color += rimColor * far;
  alpha += far;
  float sheen = exp(-(sq((p.x + .16) / .62) + sq((p.y - .66) / .2))) * inside * .075;
  color += vec3(.8, .9, 1.) * sheen;
  alpha += sheen * .6;

  o = vec4(color, clamp(alpha, 0., 1.));
}
`;

const SPARK_VS = /* glsl */ `${COMMON}
uniform float uTime, uThink, uFit, uPx;
out vec4 vColor;
${SPECTRUM}
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float id = float(gl_VertexID);
  float s1 = hash(id * 1.37 + .1), s2 = hash(id * 2.11 + .7), s3 = hash(id * 3.7 + .3);
  float life = fract(uTime * (.3 + .28 * s1) + s2);
  float x = (s3 - .5) * 1.5 * (1. - life * .4) + sin(uTime * 1.3 + id) * .05;
  float y = .28 + life * 1.62;
  gl_Position = vec4(vec2(x, y) * uFit, 0., 1.);
  gl_PointSize = uPx * (.8 + 1.3 * s1) * (1. - life * .55);
  float fade = smoothstep(0., .16, life) * (1. - smoothstep(.5, 1., life)) * uThink;
  vec3 c = spectrum(s3 + uTime * .05);
  vColor = vec4(c * fade, fade);
}
`;

const SPARK_FS = /* glsl */ `${COMMON}
in vec4 vColor;
out vec4 o;
void main() {
  float d = length(gl_PointCoord - .5);
  o = vColor * fall(.5, .28, d);
}
`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create a shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "A shader failed to compile.");
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "A shader failed to link.");
  return program;
}

function uniforms<K extends string>(gl: WebGL2RenderingContext, program: WebGLProgram, names: readonly K[]) {
  const out = {} as Record<K, WebGLUniformLocation | null>;
  for (const name of names) out[name] = gl.getUniformLocation(program, name);
  return out;
}

const SHELL_UNIFORMS = ["uRot", "uFit", "uBand", "uBandAxis", "uPointer", "uPointerNear", "uHits", "uHitGains", "uFlow", "uActive", "uFace", "uBase", "uSpectrum"] as const;
const GLASS_UNIFORMS = ["uSpan", "uFlow", "uBand", "uActive", "uDot", "uFace", "uPointerNear", "uSpectrum"] as const;
const SPARK_UNIFORMS = ["uTime", "uThink", "uFit", "uPx", "uSpectrum"] as const;

/** A renderer for the canvas, or null where WebGL2 is unavailable (the page then draws a plain glass ball in CSS). */
export function createOrbRenderer(canvas: HTMLCanvasElement): OrbRenderer | null {
  // A machine with no real graphics chip would run this on its processor and slow the whole page: it gets the CSS ball.
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, powerPreference: "low-power", failIfMajorPerformanceCaveat: true });
  if (!gl) return null;

  let spectrum: Float32Array | null = null;
  let base: readonly [number, number, number] = [0, 0, 0];
  let state: ReturnType<typeof build> | null = null;
  let lost = false;

  function build(ctx: WebGL2RenderingContext) {
    const shell = compile(ctx, SHELL_VS, SHELL_FS);
    const glass = compile(ctx, QUAD_VS, GLASS_FS);
    const spark = compile(ctx, SPARK_VS, SPARK_FS);
    const vertices = shellVertices(FREQUENCY, GAP);
    const vao = ctx.createVertexArray();
    const buffer = ctx.createBuffer();
    ctx.bindVertexArray(vao);
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
    ctx.bufferData(ctx.ARRAY_BUFFER, vertices, ctx.STATIC_DRAW);
    const bytes = STRIDE * 4;
    ctx.enableVertexAttribArray(0);
    ctx.vertexAttribPointer(0, 3, ctx.FLOAT, false, bytes, 0);
    ctx.enableVertexAttribArray(1);
    ctx.vertexAttribPointer(1, 3, ctx.FLOAT, false, bytes, 12);
    ctx.enableVertexAttribArray(2);
    ctx.vertexAttribPointer(2, 3, ctx.FLOAT, false, bytes, 24);
    const empty = ctx.createVertexArray();
    ctx.bindVertexArray(null);
    ctx.clearColor(0, 0, 0, 0);
    ctx.enable(ctx.CULL_FACE);
    return {
      shell,
      glass,
      spark,
      vao,
      empty,
      buffer,
      count: vertices.length / STRIDE,
      u: { shell: uniforms(ctx, shell, SHELL_UNIFORMS), glass: uniforms(ctx, glass, GLASS_UNIFORMS), spark: uniforms(ctx, spark, SPARK_UNIFORMS) },
    };
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

  function pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, 2.5);
  }

  function resize() {
    const ratio = pixelRatio();
    const w = Math.round(canvas.clientWidth * ratio);
    const h = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!lost) gl!.viewport(0, 0, w, h);
  }

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
    setBase(color) {
      base = color;
    },
    resize,
    draw(f) {
      if (lost || !state || !spectrum) return;
      const ctx = gl!;
      const { u } = state;
      const fit = 1 / SPAN;
      ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);

      // The band leans a little and drifts, so no two sweeps look quite alike.
      const lean = Math.sin(f.time * 0.7) * 0.14;
      const nod = Math.cos(f.time * 0.5) * 0.12;
      const axisLength = Math.hypot(lean, 1, nod);
      const axis = [lean / axisLength, 1 / axisLength, nod / axisLength] as const;

      ctx.enable(ctx.DEPTH_TEST);
      ctx.depthMask(true);
      ctx.disable(ctx.BLEND);
      ctx.useProgram(state.shell);
      ctx.uniformMatrix3fv(u.shell.uRot, false, f.rotation);
      ctx.uniform1f(u.shell.uFit, fit);
      ctx.uniform1f(u.shell.uBand, f.band);
      ctx.uniform3f(u.shell.uBandAxis, axis[0], axis[1], axis[2]);
      ctx.uniform3f(u.shell.uPointer, f.pointer[0], f.pointer[1], f.pointer[2]);
      ctx.uniform1f(u.shell.uPointerNear, f.pointerNear);
      ctx.uniform4fv(u.shell.uHits, f.hits);
      ctx.uniform1fv(u.shell.uHitGains, f.hitGains);
      ctx.uniform1f(u.shell.uFlow, f.flow);
      ctx.uniform1f(u.shell.uActive, f.active);
      ctx.uniform2f(u.shell.uFace, f.face[0], f.face[1]);
      ctx.uniform3f(u.shell.uBase, base[0], base[1], base[2]);
      ctx.uniform3fv(u.shell.uSpectrum, spectrum);
      ctx.bindVertexArray(state.vao);
      ctx.drawArrays(ctx.TRIANGLES, 0, state.count);

      ctx.disable(ctx.DEPTH_TEST);
      ctx.depthMask(false);
      ctx.enable(ctx.BLEND);
      ctx.blendFunc(ctx.ONE, ctx.ONE_MINUS_SRC_ALPHA);
      ctx.useProgram(state.glass);
      ctx.uniform1f(u.glass.uSpan, SPAN);
      ctx.uniform1f(u.glass.uFlow, f.flow);
      ctx.uniform1f(u.glass.uBand, f.band);
      ctx.uniform1f(u.glass.uActive, f.active);
      ctx.uniform1f(u.glass.uPointerNear, f.pointerNear);
      // The dots stay two CSS pixels apart, whatever the screen's density.
      ctx.uniform1f(u.glass.uDot, Math.max(2, Math.round(2 * pixelRatio())));
      ctx.uniform2f(u.glass.uFace, f.face[0], f.face[1]);
      ctx.uniform3fv(u.glass.uSpectrum, spectrum);
      ctx.bindVertexArray(state.empty);
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);

      if (f.think > 0.01) {
        ctx.useProgram(state.spark);
        ctx.uniform1f(u.spark.uTime, f.time);
        ctx.uniform1f(u.spark.uThink, f.think);
        ctx.uniform1f(u.spark.uFit, fit);
        ctx.uniform1f(u.spark.uPx, 1.7 * pixelRatio());
        ctx.uniform3fv(u.spark.uSpectrum, spectrum);
        ctx.drawArrays(ctx.POINTS, 0, SPARKS);
      }
      ctx.bindVertexArray(null);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (state && !lost) {
        gl!.deleteProgram(state.shell);
        gl!.deleteProgram(state.glass);
        gl!.deleteProgram(state.spark);
        gl!.deleteBuffer(state.buffer);
        gl!.deleteVertexArray(state.vao);
        gl!.deleteVertexArray(state.empty);
      }
      state = null;
    },
  };
}
