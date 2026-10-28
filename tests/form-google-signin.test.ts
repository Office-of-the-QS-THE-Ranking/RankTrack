import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { STATE_COOKIE, FORM_WHO_COOKIE, formWhoOf, statePack, stateUnpack } from "@/lib/governance/server/email-verify";

const mocks = vi.hoisted(() => ({
  oauth: vi.fn(), exchange: vi.fn(), signOut: vi.fn(), deleteUser: vi.fn(),
  from: vi.fn(), readState: vi.fn(), allow: vi.fn(), keep: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  authClient: async () => ({ auth: { signInWithOAuth: mocks.oauth, exchangeCodeForSession: mocks.exchange, signOut: mocks.signOut } }),
  adminDb: () => ({ from: mocks.from, auth: { admin: { deleteUser: mocks.deleteUser } } }),
}));
vi.mock("@/lib/governance/server/store", () => ({ readState: mocks.readState }));
vi.mock("@/lib/governance/server/limits", () => ({ allow: mocks.allow, clientKey: async () => "test-client" }));
vi.mock("@/lib/governance/server/origin", () => ({ siteOrigin: async () => "https://hub.example" }));
vi.mock("@/lib/governance/server/google-directory", async (real) => ({ ...(await real<object>()), keepDirectoryTokens: mocks.keep }));

import { GET } from "@/app/auth/verify-email/route";
import { finishVerification } from "@/app/auth/callback/verify";

process.env.HUB_VERIFY_SECRET ??= "test-secret";
const back = "/f/comdev-proposal";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.allow.mockResolvedValue(true);
  mocks.oauth.mockResolvedValue({ data: { url: "https://accounts.google.com/choose" }, error: null });
  mocks.readState.mockResolvedValue({ accounts: [], security: { sso: { domains: ["ust.edu.ph"] } } });
});

describe("Google form sign-in without a typed email", () => {
  it("opens account selection without an email hint, domain restriction or temporary email pass, asking for the directory", async () => {
    const res = await GET(new NextRequest(`https://hub.example/auth/verify-email?back=${back}`));
    expect(res.headers.get("location")).toBe("https://accounts.google.com/choose");
    expect(mocks.oauth).toHaveBeenCalledWith({ provider: "google", options: {
      redirectTo: "https://hub.example/auth/callback", scopes: "https://www.googleapis.com/auth/directory.readonly", queryParams: { prompt: "select_account", access_type: "offline" },
    } });
    expect(stateUnpack(res.cookies.get(STATE_COOKIE)?.value)).toMatchObject({ email: "", back });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("still requires a typed email for the separate access-request verification", async () => {
    const res = await GET(new NextRequest("https://hub.example/auth/verify-email"));
    expect(res.headers.get("location")).toBe("https://hub.example/signin?verified=not-ust");
    expect(mocks.oauth).not.toHaveBeenCalled();
  });

  it("does not accept an external return address as a form sign-in", async () => {
    await GET(new NextRequest("https://hub.example/auth/verify-email?back=https://evil.example"));
    expect(mocks.oauth).not.toHaveBeenCalled();
  });

  it("uses Google's selected email and name, ends the Auth session and cleans up an unregistered identity", async () => {
    mocks.exchange.mockResolvedValue({ data: { user: {
      id: "google-user", email: "Visitor@gmail.com", user_metadata: { full_name: "Form Visitor" },
      identities: [{ provider: "google", identity_data: { picture: "https://lh3.googleusercontent.com/a/visitor" } }],
    } }, error: null });
    const req = new NextRequest("https://hub.example/auth/callback?code=proof");
    req.cookies.set(STATE_COOKIE, statePack("state", "nonce", "", back));
    const res = await finishVerification(req);
    expect(res.headers.get("location")).toBe(`https://hub.example${back}?signin=ok`);
    expect(formWhoOf(res.cookies.get(FORM_WHO_COOKIE)?.value)).toEqual({ email: "visitor@gmail.com", name: "Form Visitor", avatar: "https://lh3.googleusercontent.com/a/visitor" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.deleteUser).toHaveBeenCalledWith("google-user");
    // a personal Google account's tokens aren't kept: there's no University directory to search
    expect(mocks.keep).not.toHaveBeenCalled();
  });

  it("keeps a University account's Google tokens for searching the directory as them", async () => {
    mocks.exchange.mockResolvedValue({ data: {
      session: { provider_token: "access", provider_refresh_token: "refresh" },
      user: { id: "ust-user", email: "Ana.Cruz@ust.edu.ph", user_metadata: { full_name: "Ana Cruz", custom_claims: { hd: "ust.edu.ph" } }, identities: [{ provider: "google", identity_data: {} }] },
    }, error: null });
    const req = new NextRequest("https://hub.example/auth/callback?code=proof");
    req.cookies.set(STATE_COOKIE, statePack("state", "nonce", "", back));
    const res = await finishVerification(req);
    expect(res.headers.get("location")).toBe(`https://hub.example${back}?signin=ok`);
    expect(mocks.keep).toHaveBeenCalledWith("ana.cruz@ust.edu.ph", "access", "refresh");
  });

  it("rejects a callback whose signed state was forged", async () => {
    const req = new NextRequest("https://hub.example/auth/callback?code=proof");
    req.cookies.set(STATE_COOKIE, `${statePack("state", "nonce", "", back)}forged`);
    const res = await finishVerification(req);
    expect(res.cookies.get(FORM_WHO_COOKIE)).toBeUndefined();
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("rejects identities without Google authentication", async () => {
    mocks.exchange.mockResolvedValue({ data: { user: {
      id: "other-user", email: "visitor@gmail.com", user_metadata: {}, identities: [{ provider: "email" }],
    } }, error: null });
    const req = new NextRequest("https://hub.example/auth/callback?code=proof");
    req.cookies.set(STATE_COOKIE, statePack("state", "nonce", "", back));
    const res = await finishVerification(req);
    expect(res.headers.get("location")).toBe(`https://hub.example${back}?signin=google`);
    expect(res.cookies.get(FORM_WHO_COOKIE)).toBeUndefined();
  });
});
