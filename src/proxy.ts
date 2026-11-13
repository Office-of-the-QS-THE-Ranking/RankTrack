import { createHash } from "node:crypto";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { BOOT_SCRIPTS } from "@/lib/boot-scripts";
import { firewall } from "@/lib/firewall/guard";

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

/**
 * `wasm`: the workspaces read evidence files in the reviewer's browser (lib/review/extract), and the PDF decoders and
 * the OCR engine are WebAssembly. 'wasm-unsafe-eval' lets WebAssembly compile; it doesn't allow eval of JavaScript.
 */
function policy(nonce: string, wasm: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${BOOT_HASHES} 'strict-dynamic'${wasm ? " 'wasm-unsafe-eval'" : ""}${DEV ? " 'unsafe-eval'" : ""}`,
    // React style attributes, Motion's animated styles and rich-text colours are inline styles.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://*.googleusercontent.com ${R2_PUBLIC}`.trim(),
    `media-src 'self' blob: ${R2_PUBLIC}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${R2_UPLOADS} ${SUPABASE} ${SUPABASE_LIVE} ${DEV ? "ws: wss:" : ""}`.replace(/\s+/g, " ").trim(),
    `form-action 'self' https://accounts.google.com ${SUPABASE}`.trim(),
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(DEV ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const refused = await firewall(request, event);
  if (refused) return refused;
  const { pathname, search } = request.nextUrl;
  const workspace = /^\/(admin|portal)(\/|$)/.test(pathname);
  if (workspace && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const to = new URL("/signin", request.url);
    to.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(to);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = policy(nonce, workspace);
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
  ],
};
