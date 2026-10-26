import "server-only";

import { headers } from "next/headers";

/**
 * Vercel's own address for this deployment, from its system variables (never from the request): the production
 * domain on production, the branch's address on a preview.
 */
function vercelOrigin() {
  const env = process.env;
  const host = env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL : (env.VERCEL_BRANCH_URL ?? env.VERCEL_URL);
  return host ? `https://${host}` : undefined;
}

/**
 * Where Google sends people back: HUB_SITE_URL, else Vercel's address for the deployment, so a forged Host header
 * can never pick the address an authorization code is delivered to; the request's own origin in development.
 */
export async function siteOrigin() {
  const configured = process.env.HUB_SITE_URL?.trim() || vercelOrigin();
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production") throw new Error("HUB_SITE_URL is not set: Google sign-in needs the Hub's public address.");
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
