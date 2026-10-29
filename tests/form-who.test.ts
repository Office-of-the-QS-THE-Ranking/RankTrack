import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_WHO_COOKIE, FORM_WHO_GONE, formWhoFor } from "@/lib/governance/server/email-verify";

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), cookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => mocks.cookie(name) }) }));
vi.mock("@/lib/governance/server/session", () => ({ getViewer: mocks.viewer }));
vi.mock("@/lib/governance/server/store", () => ({ readState: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ adminDb: vi.fn() }));

import { formWho } from "@/lib/governance/server/form-copies";

process.env.HUB_VERIFY_SECRET ??= "test-secret";
const student = { id: "acc-student", email: "Secretary.Org@ust.edu.ph", name: "JUAN DELA CRUZ", avatar: "https://lh3.googleusercontent.com/a/student" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie.mockReturnValue(undefined);
});

describe("who a form's pages know the browser as", () => {
  it("is the Hub account signed in, even when another Google account was chosen on a form before", async () => {
    mocks.viewer.mockResolvedValue(student);
    mocks.cookie.mockImplementation((name: string) => (name === FORM_WHO_COOKIE ? { value: formWhoFor("someone.else@gmail.com", "Someone Else") } : undefined));
    expect(await formWho()).toEqual({ email: "secretary.org@ust.edu.ph", name: "JUAN DELA CRUZ", avatar: student.avatar, via: "hub" });
  });

  it("is the Google account chosen on a form when no one is signed in to the Hub", async () => {
    mocks.viewer.mockResolvedValue(null);
    mocks.cookie.mockImplementation((name: string) => (name === FORM_WHO_COOKIE ? { value: formWhoFor("Teammate@ust.edu.ph", "Team Mate") } : undefined));
    expect(await formWho()).toEqual({ email: "teammate@ust.edu.ph", name: "Team Mate", via: "google" });
  });

  it("is no one without either", async () => {
    mocks.viewer.mockResolvedValue(null);
    expect(await formWho()).toBeNull();
  });

  it("clears the form cookie the way a __Host- cookie must be replaced", () => {
    expect(FORM_WHO_GONE).toMatchObject({ path: "/", httpOnly: true, maxAge: 0 });
  });
});
