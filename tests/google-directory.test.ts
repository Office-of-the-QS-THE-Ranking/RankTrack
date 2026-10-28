import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* google_directory_tokens in memory: enough of the query builder for server/google-directory.ts. */
const table = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock("@/lib/supabase/server", () => ({
  adminDb: () => ({
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        table.set(row.email as string, { ...table.get(row.email as string), ...row });
        return { error: null };
      },
      delete: () => ({ eq: async (_: string, email: string) => table.delete(email) }),
      update: (change: Record<string, unknown>) => ({ eq: async (_: string, email: string) => table.set(email, { ...table.get(email), ...change }) }),
      select: () => ({ eq: (_: string, email: string) => ({ maybeSingle: async () => ({ data: table.get(email) ?? null }) }) }),
    }),
  }),
}));

import { DIRECTORY_SCOPE, keepDirectoryTokens, searchDirectoryAs } from "@/lib/governance/server/google-directory";

process.env.HUB_VERIFY_SECRET ??= "test-secret";
const PHOTO = "https://lh3.googleusercontent.com/a/ana=s100";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("searching the Workspace directory as the person asking", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    table.clear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("keeps tokens encrypted, then searches with them and keeps only matching University people", async () => {
    fetchMock.mockResolvedValueOnce(json({ scope: `openid email ${DIRECTORY_SCOPE}`, expires_in: "3599" }));
    await keepDirectoryTokens("Me@ust.edu.ph", "secret-access", "secret-refresh");
    const row = table.get("me@ust.edu.ph")!;
    expect(JSON.stringify(row)).not.toContain("secret-");

    fetchMock.mockResolvedValueOnce(
      json({
        people: [
          { names: [{ displayName: "Ana Dela Cruz", givenName: "Ana", familyName: "Dela Cruz" }], emailAddresses: [{ value: "Ana.DelaCruz@ust.edu.ph" }], photos: [{ url: PHOTO }] },
          { names: [{ displayName: "Anabel Cruz", givenName: "Anabel", familyName: "Cruz" }], emailAddresses: [{ value: "acruz@ust.edu.ph" }], photos: [{ url: PHOTO, default: true }] },
          { names: [{ displayName: "Ana Dela Cruz", givenName: "Ana", familyName: "Dela Cruz" }], emailAddresses: [{ value: "ana@gmail.com" }] },
        ],
      }),
    );
    const found = await searchDirectoryAs("me@ust.edu.ph", "dela", "ana", "ust.edu.ph");
    expect(found).toEqual([{ name: "Ana Dela Cruz", email: "ana.delacruz@ust.edu.ph", photo: PHOTO }]);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toContain("people:searchDirectoryPeople");
    expect(init.headers.authorization).toBe("Bearer secret-access");
  });

  it("forgets the tokens when the directory wasn't granted, and searches nothing without them", async () => {
    table.set("me@ust.edu.ph", { email: "me@ust.edu.ph" });
    fetchMock.mockResolvedValueOnce(json({ scope: "openid email", expires_in: "3599" }));
    await keepDirectoryTokens("me@ust.edu.ph", "access", undefined);
    expect(table.has("me@ust.edu.ph")).toBe(false);
    expect(await searchDirectoryAs("me@ust.edu.ph", "Cruz", "Ana", "ust.edu.ph")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renews a token that has run out with the refresh token, and forgets one Google has revoked", async () => {
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID = "client";
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET = "secret";
    fetchMock.mockResolvedValueOnce(json({ scope: DIRECTORY_SCOPE, expires_in: "3599" }));
    await keepDirectoryTokens("me@ust.edu.ph", "old", "refresh");
    table.get("me@ust.edu.ph")!.expires_at = new Date(Date.now() - 1000).toISOString();

    fetchMock.mockResolvedValueOnce(json({ access_token: "fresh", expires_in: 3599 })).mockResolvedValueOnce(json({ people: [] }));
    await searchDirectoryAs("me@ust.edu.ph", "Cruz", "Ana", "ust.edu.ph");
    expect(String(fetchMock.mock.calls[1]![1].body)).toContain("grant_type=refresh_token");
    expect(fetchMock.mock.calls[2]![1].headers.authorization).toBe("Bearer fresh");

    table.get("me@ust.edu.ph")!.expires_at = new Date(Date.now() - 1000).toISOString();
    fetchMock.mockResolvedValueOnce(json({ error: "invalid_grant" }, 400));
    expect(await searchDirectoryAs("me@ust.edu.ph", "Cruz", "Ana", "ust.edu.ph")).toEqual([]);
    expect(table.has("me@ust.edu.ph")).toBe(false);
  });
});
