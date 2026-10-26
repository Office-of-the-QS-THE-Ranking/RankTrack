"use client";

/*
 * The Hub's reference data (lib/reference.ts) for client components. The root layout reads it from Supabase on
 * the server and mounts this provider once; client components read it with useReference().
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { views, type Reference, type Views } from "@/lib/reference";

const Ctx = createContext<Reference | null>(null);

export function ReferenceProvider({ value, children }: { value: Reference; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReference(): Reference {
  const ref = useContext(Ctx);
  if (!ref) throw new Error("useReference() needs the ReferenceProvider the root layout mounts.");
  return ref;
}

/** The reference data, or null where it may be missing: the error pages, which also show when it failed to load. */
export function useOptionalReference(): Reference | null {
  return useContext(Ctx);
}

/** The reference data's lists, maps and dashboard figures (lib/reference.ts `views`). */
export function useViews(): Views {
  const ref = useReference();
  return useMemo(() => views(ref), [ref]);
}
