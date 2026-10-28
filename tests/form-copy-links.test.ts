import { beforeEach, describe, expect, it, vi } from "vitest";
import { COPY_TOKEN } from "@/lib/forms/copies";

const mocks = vi.hoisted(() => ({ who: vi.fn(), state: vi.fn(), allow: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/governance/server/store", () => ({ readState: mocks.state }));
vi.mock("@/lib/governance/server/form-copies", () => ({ formWho: mocks.who }));
vi.mock("@/lib/governance/server/limits", () => ({ allow: mocks.allow }));
vi.mock("@/lib/supabase/server", () => ({ adminDb: () => ({ from: mocks.from }) }));
vi.mock("@/app/actions/session", () => ({ endSession: vi.fn() }));

import { regenerateFormCopyLink } from "@/app/actions/form-copies";

const code = "comdev-proposal";
const token = "a".repeat(22);
let row: Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state.mockResolvedValue({ records: { forms: [{ id: "form-1", code, copies: true }] } });
  mocks.who.mockResolvedValue({ email: "owner@ust.edu.ph", name: "Owner" });
  mocks.allow.mockResolvedValue(true);
  row = { form_id: "form-1", token, owner_email: "owner@ust.edu.ph", live: "previous-channel", presence: { guest: {} }, answers: { title: "Project" }, ref: "CDP-0001", label: "File", access: "private", members: ["member@ust.edu.ph"] };
  mocks.from.mockImplementation(() => {
    const filters: [string, unknown][] = [];
    let values: Record<string, unknown> = {};
    const query = {
      update: (v: Record<string, unknown>) => { values = v; return query; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      select: async () => {
        if (!filters.every(([key, value]) => row[key] === value)) return { data: [], error: null };
        Object.assign(row, values);
        return { data: [{ token: row.token }], error: null };
      },
    };
    return query;
  });
});

describe("replacing a copy's sharing link", () => {
  it("replaces the token and live channel while preserving answers, reference and access settings", async () => {
    const before = { ...row };
    const r = await regenerateFormCopyLink({ code, token });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.message);
    expect(COPY_TOKEN.test(r.token)).toBe(true);
    expect(r.token).not.toBe(token);
    expect(row).toEqual({ ...before, token: r.token, live: expect.any(String), presence: {} });
    expect(row.live).not.toBe(before.live);
  });

  it("rejects guests and signed-in collaborators who are not the owner", async () => {
    mocks.who.mockResolvedValue(null);
    expect((await regenerateFormCopyLink({ code, token })).ok).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.who.mockResolvedValue({ email: "member@ust.edu.ph" });
    expect((await regenerateFormCopyLink({ code, token })).ok).toBe(false);
    expect(row.token).toBe(token);
  });

  it("allows only one concurrent replacement of the same token", async () => {
    const results = await Promise.all([regenerateFormCopyLink({ code, token }), regenerateFormCopyLink({ code, token })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await regenerateFormCopyLink({ code, token })).ok).toBe(false);
  });

  it("rejects invalid tokens, wrong forms and rate-limited requests without changing the link", async () => {
    expect((await regenerateFormCopyLink({ code, token: "invalid" })).ok).toBe(false);
    expect((await regenerateFormCopyLink({ code: "another-form", token })).ok).toBe(false);
    mocks.allow.mockResolvedValue(false);
    expect((await regenerateFormCopyLink({ code, token })).ok).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(row.token).toBe(token);
  });

  it("reports a failed database update without claiming the link was replaced", async () => {
    mocks.from.mockImplementation(() => {
      const query = { update: () => query, eq: () => query, select: async () => ({ data: null, error: { message: "unavailable" } }) };
      return query;
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await regenerateFormCopyLink({ code, token })).ok).toBe(false);
      expect(row.token).toBe(token);
    } finally { log.mockRestore(); }
  });
});
