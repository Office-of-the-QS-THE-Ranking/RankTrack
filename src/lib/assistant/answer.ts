/*
 * One model's answer, streamed. streamText reports a provider's failure as a part in the stream rather than throwing,
 * so a failure comes back here as a value the caller can act on: try the fallback, or tell the person.
 */
import { generateText, streamText, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { estimateTokens } from "./rules";

export interface AnswerResult {
  text: string;
  /** Whether any of it reached the person: once it has, trying another model would muddle the answer. */
  shown: boolean;
  inputTokens: number;
  outputTokens: number;
  stopped: boolean;
  error?: { status?: number; body: string; message: string };
}

/**
 * How long a model gets. A model on a free plan can stall for minutes before its first word (Gemini 3.8 Flash took 235
 * seconds when tried), and /api/chat has 60 seconds in all, so two attempts must fit: the chosen model and the backup.
 */
export const PATIENCE = { totalMs: 35_000, firstChunkMs: 18_000, chunkMs: 10_000 };

/** With a backup waiting there's no point sitting through a stall: the usual first word comes in about 2 seconds. */
export const PATIENCE_WITH_BACKUP = { ...PATIENCE, firstChunkMs: 8_000 };

/** Writing from Hub data on GLM 4.7 Flash: about 45 tokens a second, and it can pause 10 seconds first. */
export const PATIENCE_WITH_DATA = { totalMs: 45_000, firstChunkMs: 25_000, chunkMs: 20_000 };

const PLAN_MS = 12_000;

/**
 * Which lookups a question needs, as one call that reads nothing back: the model only ever sees the question and the tools'
 * descriptions. It must choose, since GLM 4.7 Flash otherwise skips them and invents an answer, and Gemini says it doesn't
 * have the data. Throws when the model can't, which the caller takes as no lookups.
 */
export async function planLookups(options: { model: LanguageModel; instructions: string; messages: ModelMessage[]; tools: ToolSet; signal: AbortSignal; providerOptions?: Record<string, Record<string, unknown>> }) {
  const { model, instructions, messages, tools, signal, providerOptions } = options;
  const { toolCalls, usage } = await generateText({
    model,
    instructions,
    messages,
    tools,
    toolChoice: "required",
    maxOutputTokens: 400,
    maxRetries: 1,
    abortSignal: AbortSignal.any([signal, AbortSignal.timeout(PLAN_MS)]),
    ...(providerOptions && { providerOptions: providerOptions as never }),
  });
  return { calls: toolCalls.map((c) => ({ name: c.toolName, input: c.input as unknown })), inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 };
}

const TIMED_OUT = { body: "", message: "The model took too long to answer." };

const readError = (error: unknown): NonNullable<AnswerResult["error"]> => {
  const e = error as { statusCode?: number; responseBody?: string; message?: string; cause?: unknown } | undefined;
  const inner = e?.statusCode === undefined && e?.cause ? (e.cause as typeof e) : e;
  return { status: inner?.statusCode, body: inner?.responseBody ?? inner?.message ?? "", message: inner?.message ?? "The model didn’t answer." };
};

export async function streamAnswer(options: {
  model: LanguageModel;
  instructions: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
  temperature?: number;
  providerOptions?: Record<string, Record<string, never> | Record<string, unknown>>;
  /** Overrides for how long to wait; tests use short ones. */
  patience?: typeof PATIENCE;
  onDelta: (text: string) => void;
}): Promise<AnswerResult> {
  const { model, instructions, messages, maxOutputTokens, signal, temperature, providerOptions, patience = PATIENCE, onDelta } = options;
  const sentChars = instructions.length + messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 0), 0);
  let text = "";
  let shown = false;
  let input: number | undefined;
  let output: number | undefined;
  let failure: AnswerResult["error"];

  const release = (delta: string) => {
    text += delta;
    shown = true;
    onDelta(delta);
  };

  try {
    const result = streamText({
      model,
      instructions,
      messages,
      maxOutputTokens,
      maxRetries: 1,
      abortSignal: signal,
      timeout: patience,
      ...(temperature !== undefined && { temperature }),
      ...(providerOptions && { providerOptions: providerOptions as never }),
      // The default logs the error object, which carries the request: someone's question and the passages.
      onError: () => {},
    });
    let finished = false;
    for await (const part of result.stream) {
      if (part.type === "text-delta") release(part.text);
      else if (part.type === "error") failure = readError(part.error);
      else if (part.type === "abort") failure ??= TIMED_OUT;
      else if (part.type === "finish") {
        finished = true;
        input = part.totalUsage.inputTokens;
        output = part.totalUsage.outputTokens;
      }
    }
    // A time limit can end the stream with no finish and no error. Silence isn't an answer.
    if (!finished) failure ??= TIMED_OUT;
  } catch (error) {
    if (!signal.aborted) failure = readError(error);
  }

  return {
    text,
    shown,
    inputTokens: input ?? Math.ceil(sentChars / 4),
    outputTokens: output ?? estimateTokens(text),
    stopped: signal.aborted,
    ...(failure && !signal.aborted && { error: failure }),
  };
}
