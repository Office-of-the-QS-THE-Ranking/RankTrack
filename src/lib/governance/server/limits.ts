import "server-only";

/*
 * Rate limits for the Hub's actions, shared by every server instance through Supabase (hub_rate_hit,
 * supabase/migrations/20261026120000_rate_limits_and_post_views.sql). Clients are told apart by a hash of their
 * address, so no address is stored.
 */
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { adminDb } from "@/lib/supabase/server";

/**
 * The request header that carries the client's address, set (and overwritten) by the proxy in front of the Hub:
 * Vercel's x-real-ip by default there, HUB_CLIENT_IP_HEADER elsewhere (cf-connecting-ip behind Cloudflare, for
 * one). A header the client itself can send is never trusted.
 */
const TRUSTED = (process.env.HUB_CLIENT_IP_HEADER ?? (process.env.VERCEL ? "x-real-ip" : "")).toLowerCase();
let warned = false;

/** A stable, anonymous key for the client making this request. */
export async function clientKey() {
  const h = await headers();
  let address = TRUSTED ? h.get(TRUSTED)?.split(",")[0]?.trim() : undefined;
  if (!address) {
    // Without a trusted header, the nearest proxy's entry: the last one in X-Forwarded-For, which it appended.
    address = h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    if (!warned && process.env.NODE_ENV === "production") {
      warned = true;
      console.warn("Rate limits: set HUB_CLIENT_IP_HEADER to the header your proxy sets with the client's address; clients are told apart less reliably without it.");
    }
  }
  return createHash("sha256").update(`hub-client|${address}`).digest("base64url").slice(0, 22);
}

/**
 * Count one hit against `key` and say whether it is within `max` per `windowSeconds`; with `count` false, only
 * check. If the counter can't be reached, `failOpen` decides: views and everyday actions go ahead (a database
 * hiccup shouldn't lock everyone out), while the unauthenticated forms that limits protect from abuse stop.
 */
export async function allow(key: string, windowSeconds: number, max: number, count = true, failOpen = true) {
  const { data, error } = await adminDb().rpc("hub_rate_hit", { p_key: key, p_window_seconds: windowSeconds, p_max: max, p_count: count });
  if (error) {
    console.error(`Rate limit ${key}: ${error.message}`);
    return failOpen;
  }
  return data === true;
}

/** What one signed-in account may do per minute: commands, uploads, exports. Far above what a person clicks. */
const PER_MINUTE = { command: 120, upload: 30, export: 10 } as const;

export function allowAccount(accountId: string, kind: keyof typeof PER_MINUTE) {
  return allow(`account:${kind}:${accountId}`, 60, PER_MINUTE[kind]);
}
