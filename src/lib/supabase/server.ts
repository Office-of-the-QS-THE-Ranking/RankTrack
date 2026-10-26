import "server-only";

/*
 * The two ways the Hub's server talks to Supabase: as the person signing in (Auth, through the request's
 * cookies), and as the Hub itself (the governance store, with the secret key; row-level security lets
 * nothing else read or write those tables).
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}

/** Supabase Auth for this request, keeping its PKCE verifier and session in cookies. Server Functions and Route Handlers only. */
export async function authClient() {
  const jar = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) jar.set(name, value, options);
      },
    },
  });
}

const g = globalThis as typeof globalThis & { __hubDb?: SupabaseClient };

/** The database as the Hub itself. The secret key never leaves the server. */
export function adminDb() {
  return (g.__hubDb ??= createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}
