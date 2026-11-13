import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sharesData } from "@/lib/assistant/rules";
import type { ModelRecord, ProviderRecord } from "@/lib/assistant/server/setup";
import { jobModelProblem } from "@/lib/review/server/reviewer";
import { readBatch } from "@/lib/review/server/review";
import { READ_LIMITS } from "@/lib/review/types";

/*
 * The walls between the AI jobs (docs/evidence-review.md). The text read from evidence files is for the people who
 * review a submission and for the Reviewer job. The chat never gets it: not through its index, not through a lookup,
 * not through a model on a plan that shares data. These tests fail when someone wires one to the other.
 */

const root = path.resolve(import.meta.dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(root, rel)).isDirectory() ? sources(rel) : /\.tsx?$/.test(name) ? [rel] : [];
  });
}

const read = (file: string) => readFileSync(path.join(root, file), "utf8");

/** What only evidence review may touch: its tables, and the modules that read a file's text. */
const REVIEW_TEXT = /review_(files|pages|findings|terms)|review\/server\/(store|review|decide)"|lib\/review\/extract/;

describe("the chat can't reach what the Reviewer reads", () => {
  // Everything the chat is built from: what it indexes, what it looks up, how it answers, and its route and screens.
  const chat = [...sources("src/lib/assistant"), ...sources("src/app/api/chat"), ...sources("src/components/assistant")];

  it("no part of the assistant reads evidence text or the review tables", () => {
    expect(chat.length).toBeGreaterThan(10);
    const leaks = chat.filter((file) => REVIEW_TEXT.test(read(file)));
    expect(leaks).toEqual([]);
  });

  it("the assistant only knows the Reviewer as a job to configure", () => {
    const uses = chat.filter((file) => /lib\/review\//.test(read(file)));
    expect(uses).toEqual(["src/lib/assistant/server/desk.ts"]);
    expect(read("src/lib/assistant/server/desk.ts")).toMatch(/import \{ jobModelProblem, readJob \} from "@\/lib\/review\/server\/reviewer"/);
  });

  it("the index and the lookups name no review content", () => {
    for (const file of ["src/lib/assistant/server/sources.ts", "src/lib/assistant/server/data-tools.ts", "src/lib/assistant/hub-data.ts", "src/lib/assistant/server/index-builder.ts"]) expect(read(file)).not.toMatch(/review_|lib\/review/);
  });

  it("the review tables are closed to everyone but the Hub's server", () => {
    const sql = read("supabase/migrations/20261112015635_evidence_review.sql");
    for (const table of ["review_files", "review_pages", "review_terms", "review_findings", "assistant_jobs"]) expect(sql).toContain(`'${table}'`);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.%I from anon, authenticated/);
  });
});

describe("the Reviewer can't reach what the chat has", () => {
  const reviewer = read("src/lib/review/server/reviewer.ts");

  it("calls a model with no tools, no conversation and no Hub lookups", () => {
    expect(reviewer).not.toMatch(/tools\s*:|toolChoice|data-tools|hub-data|assistant_chunks|assistant_search|sources"/);
    expect(reviewer).toMatch(/messages: \[\{ role: "user", content: prompt \}\]/);
  });

  it("never logs a failed request, which would carry pages of evidence", () => {
    const caught = reviewer.slice(reviewer.indexOf("} catch (e) {", reviewer.indexOf("generateText({")));
    const logged = caught.slice(0, caught.indexOf("\n    }")).match(/console\.error\(.*\)/)?.[0] ?? "";
    expect(logged).toMatch(/statusCode/);
    expect(logged).not.toMatch(/message|responseBody|\$\{e\}|, e\)|\(e\)/);
  });

  it("keeps its usage apart from the chat's, as counts only", () => {
    expect(reviewer).toMatch(/job: "reviewer"/);
    expect(read("src/lib/assistant/server/setup.ts")).toMatch(/\.eq\("job", "assistant"\)/);
  });
});

describe("which model may do a job", () => {
  const model = (provider: ModelRecord["provider"]): ModelRecord => ({ id: "m", provider, label: "M", input_usd: 1, output_usd: 1, enabled: true, access: "everyone", daily_limit: null, is_default: false });
  const provider = (id: ProviderRecord["id"], plan: ProviderRecord["plan"], over: Partial<ProviderRecord> = {}): ProviderRecord => ({ id, key_sealed: "x", key_hint: "xxxx", plan, account_ref: null, status: "ok", status_at: null, monthly_budget_usd: null, low_credit_usd: 2, connected_by: null, connected_at: null, bought: 0, spentTotal: 0, spentMonth: 0, ...over });

  it("refuses a plan that shares what it is sent, whatever else holds", () => {
    expect(sharesData("google", "free")).toBe(true);
    expect(jobModelProblem(model("google"), provider("google", "free"))).toMatch(/shares/);
    expect(jobModelProblem(model("google"), provider("google", "free", { status: "disconnected" }))).toMatch(/shares/);
    expect(jobModelProblem(model("google"), provider("google", "paid"))).toBeNull();
    expect(jobModelProblem(model("anthropic"), provider("anthropic", "paid"))).toBeNull();
  });

  it("refuses a provider that is disconnected or past its budget, and a model that isn't listed", () => {
    expect(jobModelProblem(model("openai"), provider("openai", "paid", { status: "no_credit" }))).toMatch(/connected/);
    expect(jobModelProblem(model("openai"), provider("openai", "paid", { monthly_budget_usd: 5, spentMonth: 5 }))).toMatch(/budget/);
    expect(jobModelProblem(undefined, undefined)).toMatch(/list/);
  });

  it("is checked on every run and when the setting is saved", () => {
    expect(read("src/lib/review/server/reviewer.ts")).toMatch(/problem: jobModelProblem\(model, provider\)/);
    expect(read("src/app/actions/agentic-control.ts")).toMatch(/sharesData\(model\.provider/);
  });
});

describe("who may read a submission's files as text", () => {
  it("every review action goes through the same gate as deciding the submission", () => {
    const actions = read("src/app/actions/review.ts");
    const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(exported).toEqual(expect.arrayContaining(["openReview", "startReading", "sendPages", "decideFinding", "forgetReading"]));
    for (const name of ["openReview", "startReading", "sendPages", "recheckReview", "forgetReading", "decideFinding"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`)).split("\nexport async function ")[1] ?? actions.slice(actions.indexOf(`export async function ${name}`));
      expect(actions.slice(actions.indexOf(`export async function ${name}`), actions.indexOf(`export async function ${name}`) + 400)).toMatch(/await gate\(/);
      expect(body).toBeDefined();
    }
    const gate = read("src/lib/review/server/review.ts");
    expect(gate).toMatch(/viewerCan\(viewer, "evidence", "approve", targetOf\(e\)\)/);
    expect(gate).toMatch(/another reviewer reads it/);
    expect(read("src/app/api/review/check/route.ts")).toMatch(/await reviewable\(viewer, body\.evidenceId\)/);
  });

  it("only the people who decide a submission see its Review tab", () => {
    expect(read("src/components/contributions/ContributionRecord.tsx")).toMatch(/decide \? \[\.\.\.SUBMISSION_TABS, "Review"\] : SUBMISSION_TABS/);
  });
});

describe("pages a browser sends", () => {
  it("are kept only when they are real pages within the limits", () => {
    expect(readBatch([{ n: 1, text: "Hello\u0000 world", ocr: true }])).toEqual([{ n: 1, text: "Hello world", ocr: true }]);
    expect(readBatch([{ n: 0, text: "x" }])).toBeTypeOf("string");
    expect(readBatch([{ n: READ_LIMITS.pages + 1, text: "x" }])).toBeTypeOf("string");
    expect(readBatch([{ n: 1, text: "a" }, { n: 1, text: "b" }])).toBeTypeOf("string");
    expect(readBatch([{ n: 1, text: 5 }])).toBeTypeOf("string");
    expect(readBatch("pages")).toBeTypeOf("string");
    const long = readBatch([{ n: 2, text: "y".repeat(READ_LIMITS.pageChars + 500) }]);
    expect(Array.isArray(long) && long[0].text.length).toBe(READ_LIMITS.pageChars);
  });
});
