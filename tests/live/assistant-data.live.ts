/*
 * Real questions about the Hub's live data, on real models, through the real chat and permission checks:
 * `npx vitest run --config vitest.live.config.ts tests/live/assistant-data`. Run it after changing the data tools or their
 * instructions. It uses the saved keys, reads live data, and writes nothing: no usage rows, notices or provider changes.
 * Figures change, so the checks hold what must always be true, and the answers are printed for a person to read.
 */
import { expect, it, vi } from "vitest";
import { ROLE, roleOf } from "@/lib/governance/catalog";
import type { RoleId } from "@/lib/governance/types";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/assistant/server/notices", () => ({ markFailed: async () => {}, checkSpend: async () => {}, tellManagers: async () => {}, managerIds: () => [], AI_TAB: "", FAILURE_REASON: {} }));
vi.mock("@/lib/supabase/server", async (orig) => {
  const real = await orig<typeof import("@/lib/supabase/server")>();
  return {
    ...real,
    adminDb: () =>
      new Proxy(real.adminDb(), {
        get(target, prop) {
          if (prop !== "from") {
            const value = Reflect.get(target, prop);
            return typeof value === "function" ? value.bind(target) : value;
          }
          return (table: string) => {
            const query = target.from(table as never);
            return table === "assistant_usage" ? new Proxy(query, { get: (q, p) => (p === "insert" ? async () => ({ error: null }) : Reflect.get(q, p)) }) : query;
          };
        },
      }),
  };
});

const CHOSEN = process.env.ASSISTANT_LIVE_CHOSEN ?? "gemini-3.5-flash-lite";
const GAP_MS = 2500;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const person = (roleId: RoleId, units: "all" | string[], unitId: string, unitName: string, workspaces: string[]) => {
  const role = roleOf(roleId)!;
  const perms = units === "all" ? role.universityPermissions! : role.permissions;
  return { id: "__assistant_live_test", name: "Live Test", email: "live-test@invalid", unitId, unitName, roles: [], workspaces, portal: { unitId, unitName }, features: {}, flags: [], grants: [{ roleId, tier: role.tier, perms, units, scopeUnits: units }] } as never;
};

const admin = person(ROLE.admin, "all", "rankings-office", "Rankings Office", ["office", "portal"]);
const coordinator = person(ROLE.coordinator, ["cics"], "cics", "College of Information and Computing Sciences", ["portal"]);
const student = person(ROLE.student, ["rankings-office"], "rankings-office", "", ["portal"]);

type Asked = { name: string; who: never; q: string; history?: { from: "me" | "assistant"; text: string; internal?: boolean }[]; lookup: boolean; lacks?: RegExp; has?: RegExp };
const INVENTED = /Harvard|School of Economics and Management|#\s?\d{2,}/;

const ASKED: Asked[] = [
  { name: "the question that started this", who: admin, q: "Whats the leading college/faculty in ranking submission?", lookup: true, lacks: INVENTED },
  { name: "offices", who: admin, q: "Which university office has sent the most data so far?", lookup: true, lacks: /Harvard|Faculty of|College of/, has: /SIMBAHAYAN|Community Development/i },
  { name: "overall", who: admin, q: "How are we doing across all the rankings right now?", lookup: true },
  { name: "compare years", who: admin, q: "Compare THE Impact 2026 with THE Impact 2027.", lookup: true },
  { name: "why", who: admin, q: "Why is our THE Impact 2027 readiness so low? What is causing it?", lookup: true },
  { name: "what to fix", who: admin, q: "What should we fix first in UI GreenMetric to gain the most points?", lookup: true },
  { name: "activities", who: admin, q: "How many service learning activities do we have per academic year?", lookup: true, lacks: /\b383\b/, has: /\b76\b[\s\S]*\b32\b|\b32\b[\s\S]*\b76\b/ },
  { name: "published results", who: admin, q: "What is our QS by Subject rank for Medicine, and how does it compare with our peers?", lookup: true, has: /701/ },
  { name: "follow-up after withheld answer", who: admin, q: "and which group is weakest?", history: [{ from: "me", text: "How is THE Impact 2027 doing?" }, { from: "assistant", text: "Readiness is low, with few answers in.", internal: true }], lookup: true },
  { name: "general question stays general", who: admin, q: "Explain what a z-score is in one sentence.", lookup: false },
  { name: "a poem needs no lookup", who: admin, q: "Write a two-line poem about the sea.", lookup: false },
  { name: "own unit", who: coordinator, q: "How is our unit doing with its submissions?", lookup: true },
  { name: "the standings a coordinator can see", who: coordinator, q: "Which college is leading in submissions?", lookup: true, lacks: INVENTED },
  { name: "another unit's submissions", who: coordinator, q: "Show me the submissions of the Faculty of Engineering, with their titles.", lookup: true },
  { name: "a student can't read it", who: student, q: "Which college is leading in submissions?", lookup: false, lacks: INVENTED },
];

it.runIf(process.env.SUPABASE_SECRET_KEY)(
  "questions about live data are answered from it",
  async () => {
    const { prepare, runChat } = await import("@/lib/assistant/server/chat");
    const problems: string[] = [];
    for (const a of ASKED) {
      const prepared = await prepare(a.who, CHOSEN);
      if (!prepared.ok) throw new Error(prepared.message);
      const events: { t: string; text?: string; message?: string; sources?: { title: string }[]; internal?: boolean }[] = [];
      const started = Date.now();
      await runChat(a.who, prepared, [...(a.history ?? []), { from: "me", text: a.q }], new AbortController().signal, (e) => events.push(e as never));
      const replaced = events.filter((e) => e.t === "replace").at(-1);
      const after = replaced ? events.slice(events.lastIndexOf(replaced) + 1) : events;
      const text = `${replaced?.text ?? ""}${after.filter((e) => e.t === "delta").map((e) => e.text).join("")}`;
      const sources = events.find((e) => e.t === "sources");
      const looked = !!sources?.internal;
      const notices = events.filter((e) => e.t === "notice" || e.t === "error").map((e) => e.text ?? e.message);
      console.log(`\n--- ${a.name} (${Date.now() - started} ms)\nQ: ${a.q}\nread live data: ${looked} | sources: ${sources?.sources?.map((s) => s.title).join("; ") || "none"}${notices.length ? `\nnotices: ${notices.join(" | ")}` : ""}\n${text}`);
      if (looked !== a.lookup) problems.push(`${a.name}: expected live data ${a.lookup}, got ${looked}`);
      if (a.lacks?.test(text)) problems.push(`${a.name}: invented something`);
      if (a.has && !a.has.test(text)) problems.push(`${a.name}: missing what the data says`);
      if (!text.trim()) problems.push(`${a.name}: no answer`);
      await wait(GAP_MS);
    }
    console.log(`\n${problems.length ? problems.join("\n") : "all held"}`);
    expect(problems).toEqual([]);
  },
);
