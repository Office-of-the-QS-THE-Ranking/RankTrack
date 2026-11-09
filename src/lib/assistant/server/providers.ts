import "server-only";

/*
 * The four providers behind one shape: a sealed key, a chat model, a way to test a key, and the embeddings the index is
 * built with. Keys are pasted on the AI Assistant tab, kept encrypted, and never leave this server: no provider offers a
 * sign-in that links an account to another site. The browser only ever talks to /api/chat.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { EMBEDDING_DIMENSIONS, type ProviderId } from "../rules";

const EMBEDDING_MODEL = "@cf/baai/bge-m3";
const TIMEOUT_MS = 15_000;

function secret() {
  const value = process.env.HUB_VERIFY_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("HUB_VERIFY_SECRET (or SUPABASE_SECRET_KEY) is not set: provider keys can't be encrypted.");
  return createHmac("sha256", "hub-assistant-keys").update(value).digest();
}

export function sealKey(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret(), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function openKey(sealed: string | null | undefined) {
  if (!sealed) return null;
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", secret(), iv!);
    d.setAuthTag(tag!);
    return Buffer.concat([d.update(body!), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** How many characters a saved key has, without opening it: GCM's ciphertext is exactly as long as the text. */
export function sealedLength(sealed: string | null | undefined) {
  const body = sealed?.split(".")[2];
  return body ? Buffer.from(body, "base64url").length : 0;
}

/** Cloudflare's addresses name the account: the one pasted with the key, or the one R2 already uses. */
const cloudflareBase = (accountRef: string | null | undefined) => {
  const account = accountRef?.trim() || process.env.R2_ACCOUNT_ID?.trim();
  if (!account) throw new Error("Cloudflare needs an account ID.");
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1`;
};

export const accountKnown = () => !!process.env.R2_ACCOUNT_ID?.trim();

export function chatModel(provider: ProviderId, key: string, modelId: string, accountRef?: string | null): LanguageModel {
  switch (provider) {
    case "google":
      return createGoogle({ apiKey: key })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey: key })(modelId);
    case "openai":
      // Chat Completions rather than the default Responses API, which keeps conversations on OpenAI's side for 30 days.
      return createOpenAI({ apiKey: key }).chat(modelId);
    case "cloudflare":
      return createOpenAICompatible({ name: "cloudflare", baseURL: cloudflareBase(accountRef), apiKey: key, includeUsage: true })(modelId);
  }
}

/** What each provider's request needs beyond the shared ones. GPT-6 and later refuse a temperature; thinking would only cost Neurons here. */
export const callSettings = (provider: ProviderId): { temperature?: number; providerOptions?: Record<string, Record<string, unknown>> } => {
  if (provider === "openai") return {};
  if (provider === "cloudflare") return { temperature: 0.6, providerOptions: { cloudflare: { chat_template_kwargs: { enable_thinking: false } } } };
  return { temperature: 0.6 };
};

/** A question should embed in under a second. When one stalls, a quick second try beats a long wait. */
const QUESTION_TIMEOUT_MS = 6000;

const stalled = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || (e as { statusCode?: number }).statusCode === 429 || ((e as { statusCode?: number }).statusCode ?? 0) >= 500);

/** Embeddings for passages or a question, with one retry for a stall. Throws on anything but vectors of the size the index holds. */
export async function embed(texts: string[], key: string, accountRef: string | null | undefined, signal?: AbortSignal): Promise<number[][]> {
  try {
    return await embedOnce(texts, key, accountRef, signal);
  } catch (e) {
    if (signal?.aborted || !stalled(e)) throw e;
    return embedOnce(texts, key, accountRef, signal);
  }
}

async function embedOnce(texts: string[], key: string, accountRef: string | null | undefined, signal?: AbortSignal): Promise<number[][]> {
  const limit = AbortSignal.timeout(texts.length === 1 ? QUESTION_TIMEOUT_MS : TIMEOUT_MS);
  const res = await fetch(`${cloudflareBase(accountRef)}/embeddings`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: signal ? AbortSignal.any([signal, limit]) : limit,
  });
  if (!res.ok) {
    const error = new Error(`Cloudflare embeddings answered ${res.status}.`) as Error & { statusCode: number; responseBody: string };
    error.statusCode = res.status;
    error.responseBody = (await res.text().catch(() => "")).slice(0, 500);
    throw error;
  }
  const body = (await res.json()) as { data?: { embedding?: number[] }[] };
  const vectors = body.data?.map((d) => d.embedding ?? []) ?? [];
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error(`Cloudflare embeddings came back in an unexpected shape (${vectors.length} of ${texts.length}, ${vectors[0]?.length ?? 0} dimensions).`);
  }
  return vectors;
}

/** Ask the provider something free and small with the key, so a mistyped one is caught before it's saved. */
export async function testKey(provider: ProviderId, key: string, accountRef?: string | null): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    if (provider === "cloudflare") {
      await embed(["ok"], key, accountRef);
      return { ok: true };
    }
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const res =
      provider === "google"
        ? await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": key }, signal })
        : provider === "openai"
          ? await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` }, signal })
          : await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal });
    if (res.ok) return { ok: true };
    return { ok: false, message: res.status === 401 || res.status === 403 || res.status === 400 ? "The provider refused this key. Check it and try again." : `The provider answered ${res.status}. Try again in a moment.` };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) return { ok: false, message: "Cloudflare refused this token. It needs Workers AI Read and Edit." };
    if (status === 404) return { ok: false, message: "Cloudflare doesn’t know this account ID." };
    return { ok: false, message: "Couldn’t reach the provider. Try again in a moment." };
  }
}
