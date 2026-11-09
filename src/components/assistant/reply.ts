/*
 * Where the chat gets its answers: /api/chat, which streams one line of JSON per event (lib/assistant/types.ts). A refusal
 * from the server (signed out, over a limit, no such model) is thrown with its message, for the chat to show as a toast.
 */
import type { ChatEvent, ChatSource } from "@/lib/assistant/types";

export type Turn = { id: number; from: "me" | "assistant"; text: string; sources?: ChatSource[]; internal?: boolean };

export async function* reply(history: readonly Turn[], signal: AbortSignal, { model }: { model?: string }): AsyncGenerator<ChatEvent> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, turns: history.map(({ from, text, internal }) => ({ from, text, ...(internal && { internal }) })) }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "Try again in a moment.");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += value;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as ChatEvent;
  }
}
