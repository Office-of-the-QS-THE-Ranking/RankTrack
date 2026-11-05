/*
 * Where the chat gets its answers. No model is connected yet, so this says so, one word at a time, which exercises
 * every state the chat box and the orb have (thinking, streaming, stopped, done). The real version streams from
 * /api/chat and keeps this signature.
 */

export type Turn = { id: number; from: "me" | "assistant"; text: string };

/** The models someone can switch between in the chat. Premium tiers come with the real connection. */
export const MODELS = [
  { id: "claude", label: "Claude" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini", label: "Gemini" },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];
export const isModel = (v: unknown): v is ModelId => MODELS.some((m) => m.id === v);

const THINK_MS = 1400;
const WORD_MS = 55;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Stopped", "AbortError"));
      },
      { once: true },
    );
  });

export async function* reply(_history: readonly Turn[], signal: AbortSignal, { model }: { model: ModelId }): AsyncGenerator<string> {
  const label = MODELS.find((m) => m.id === model)?.label ?? "The model";
  const notConnected = `${label} isn’t connected yet. Only this chat window is ready so far.`;
  await wait(THINK_MS, signal);
  for (const word of notConnected.match(/\S+\s*/g) ?? []) {
    yield word;
    await wait(WORD_MS, signal);
  }
}
