import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { BOOT_SCRIPTS } from "@/lib/boot-scripts";

/*
 * In front of every page: a Content Security Policy with a fresh nonce per request (Next.js applies it to its own
 * scripts; the Hub's two inline boot scripts are allowed by hash), and a first gate for the workspaces. The gate
 * only turns away requests that carry no session cookie at all; every page and action still checks the session
 * itself (getViewer, Gate), so this is defence in depth, not the check.
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

/** Hosts the browser talks to: R2 for uploads (presigned PUTs) and the public bucket, Supabase and Google for sign-in. */
const R2_UPLOADS = process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "";
const R2_PUBLIC = origin(process.env.R2_PUBLIC_URL);
const SUPABASE = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);

function policy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${BOOT_HASHES} 'strict-dynamic'${DEV ? " 'unsafe-eval'" : ""}`,
    // React style attributes, Motion's animated styles and rich-text colours are inline styles.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://*.googleusercontent.com ${R2_PUBLIC}`.trim(),
    `media-src 'self' blob: ${R2_PUBLIC}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${R2_UPLOADS} ${DEV ? "ws: wss:" : ""}`.trim(),
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

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const workspace = /^\/(admin|portal)(\/|$)/.test(pathname);
  if (workspace && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const to = new URL("/signin", request.url);
    to.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(to);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = policy(nonce);
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
      // Pages and Server Functions; not build assets, images, media or files with an extension.
      source: "/((?!_next/static|_next/image|media/|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|avif|gif|svg|ico|woff2?|txt|xml|webmanifest)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
