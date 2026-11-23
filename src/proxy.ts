import { createHash } from "node:crypto";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { BOOT_SCRIPTS } from "@/lib/boot-scripts";
import { firewall } from "@/lib/firewall/guard";
import { demoEnabled } from "@/lib/demo-portal/enabled";
import { DEMO_BASE } from "@/lib/demo-portal/paths";
import { frameAncestors, portfolioOrigins } from "@/lib/framing";

/** Sites allowed to frame the public pages and the portal demo (lib/framing.ts). */
const PORTFOLIO_ORIGINS = portfolioOrigins();

/*
 * In front of every page: a Content Security Policy with a fresh nonce per request (Next.js applies it to its own
 * scripts; the Hub's two inline boot scripts are allowed by hash), and a first gate for the workspaces. The gate
 * only turns away requests that carry no session cookie at all; every page and action still checks the session
 * itself (getViewer, Gate), so this is defence in depth, not the check. Before either, the Hub's own firewall
 * (lib/firewall/guard.ts) checks and records the request, wherever the Hub is hosted.
 */

const DEV = process.env.NODE_ENV === "development";
const SESSION_COOKIES = ["__Host-hub_session", "hub_session"];

const sha = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;
const BOOT_HASHES = BOOT_SCRIPTS.map(sha).join(" ");

const origin = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
};

/** Hosts the browser talks to: R2 for uploads (presigned PUTs) and the public bucket, Supabase and Google for sign-in, Supabase Realtime. */
const R2_UPLOADS = process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "";
const R2_PUBLIC = origin(process.env.R2_PUBLIC_URL);
const SUPABASE = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
/** Supabase Realtime, for team copies of a digital form that update live. */
const SUPABASE_LIVE = SUPABASE.replace(/^https:/, "wss:");

const isDemo = (path: string) => path === DEMO_BASE || path.startsWith(`${DEMO_BASE}/`);

/** The page a request comes from, when it says (Referer; Next.js sends Next-Url with its own fetches). */
function fromPath(request: NextRequest) {
  const next = request.headers.get("next-url");
  if (next) return next.split("?")[0];
  try {
    const r = new URL(request.headers.get("referer") ?? "");
    return r.origin === request.nextUrl.origin ? r.pathname : "";
  } catch {
    return "";
  }
}

/**
 * What a demo page may never load: a real workspace page or its data (a prefetch would carry a signed-in visitor's
 * real records), uploaded media (R2), the Hub's APIs and forms.
 */
const offLimitsFromDemo = (path: string) => !isDemo(path) && /^\/(admin|portal|media|api|f)(\/|$)/.test(path);

/**
 * `wasm`: the workspaces read evidence files in the reviewer's browser (lib/review/extract), and the PDF decoders and
 * the OCR engine are WebAssembly. 'wasm-unsafe-eval' lets WebAssembly compile; it doesn't allow eval of JavaScript.
 */
function policy(nonce: string, wasm: boolean, demo: boolean, ancestors: string) {
  // The portal demo talks to nothing but the Hub itself: no Supabase, no R2, no Google. The browser enforces it.
  const r2Public = demo ? "" : R2_PUBLIC;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${BOOT_HASHES} 'strict-dynamic'${wasm ? " 'wasm-unsafe-eval'" : ""}${DEV ? " 'unsafe-eval'" : ""}`,
    // React style attributes, Motion's animated styles and rich-text colours are inline styles.
    "style-src 'self' 'unsafe-inline'",
    demo ? "img-src 'self' data: blob:" : `img-src 'self' data: blob: https://*.googleusercontent.com ${r2Public}`.trim(),
    `media-src 'self' blob: ${r2Public}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${demo ? "" : `${R2_UPLOADS} ${SUPABASE} ${SUPABASE_LIVE}`} ${DEV ? "ws: wss:" : ""}`.replace(/\s+/g, " ").trim(),
    demo ? "form-action 'self'" : `form-action 'self' https://accounts.google.com ${SUPABASE}`.trim(),
    "frame-src 'none'",
    `frame-ancestors ${ancestors}`,
    "object-src 'none'",
    "base-uri 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(DEV ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = request.nextUrl;
  // The portal demo is a sealed room: nothing it loads may be a real workspace route, file or API, whoever is signed in.
  if (isDemo(fromPath(request)) && offLimitsFromDemo(pathname)) return new NextResponse(null, { status: 404 });
  // Prefetches (and media) reach the proxy only for that check (see config below); they carry on untouched.
  if (request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch" || pathname.startsWith("/media/")) return NextResponse.next();

  const refused = await firewall(request, event);
  if (refused) return refused;
  const demo = isDemo(pathname);
  if (demo) {
    // Switched off: the demo doesn't exist (the global 404).
    if (!demoEnabled()) return NextResponse.rewrite(new URL("/__portal-demo-off", request.url));
    // The demo has no server actions; refuse any sent to its pages.
    if (request.method !== "GET" && request.method !== "HEAD") return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const workspace = !demo && /^\/(admin|portal)(\/|$)/.test(pathname);
  if (workspace && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const to = new URL("/signin", request.url);
    to.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(to);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // Only the public pages and the demo may be framed, and only by PORTFOLIO_ORIGINS (lib/framing.ts).
  const csp = policy(nonce, workspace, demo, frameAncestors(pathname, PORTFOLIO_ORIGINS));
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages and Server Functions; not build assets, images, media, the evidence reader's workers (their policy is
      // in next.config.ts) or files with an extension.
      source: "/((?!_next/static|_next/image|media/|ocr/|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|avif|gif|svg|ico|woff2?|txt|xml|webmanifest)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // Anything a portal demo page asks for, prefetches and media included, so the check above can refuse it.
    { source: "/:path*", has: [{ type: "header", key: "referer", value: ".*/portal/demo.*" }] },
    { source: "/:path*", has: [{ type: "header", key: "next-url", value: "/portal/demo.*" }] },
  ],
};
