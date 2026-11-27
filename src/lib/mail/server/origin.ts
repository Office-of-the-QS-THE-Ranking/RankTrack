import "server-only";

import { headers } from "next/headers";

/**
 * The Hub's public address, for the links and the arms in an email: HUB_SITE_URL, else Vercel's own address for the
 * deployment, never the request's Host header in production (a forged one would put someone else's address in a
 * message the Hub signs its name to). In development, the address the request came in on. Null when there is none
 * to be had (a script): the message then goes out with no button and the masthead in type.
 */
export async function publicOrigin(): Promise<string | null> {
  const env = process.env;
  const vercel = env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL : (env.VERCEL_BRANCH_URL ?? env.VERCEL_URL);
  const configured = env.HUB_SITE_URL?.trim() || (vercel ? `https://${vercel}` : "");
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return null;
    }
  }
  if (env.NODE_ENV === "production") return null;
  try {
    const h = await headers();
    const host = h.get("host");
    return h.get("origin") ?? (host ? `${h.get("x-forwarded-proto") ?? "http"}://${host}` : null);
  } catch {
    return null;
  }
}
