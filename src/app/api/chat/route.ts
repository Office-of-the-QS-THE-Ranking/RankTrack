import { LIMITS, readHistory } from "@/lib/assistant/rules";
import { prepare, runChat } from "@/lib/assistant/server/chat";
import type { ChatEvent } from "@/lib/assistant/types";
import { allow } from "@/lib/governance/server/limits";
import { getViewer } from "@/lib/governance/server/session";

/** A long answer from a slow model, with room for one fallback. */
export const maxDuration = 60;

/** The largest body worth reading: a full conversation at the chat's limits, and then some. */
const MAX_BODY = 64_000;

const refuse = (status: number, message: string) => Response.json({ message }, { status, headers: { "cache-control": "no-store" } });

/**
 * Next checks a Server Action's origin but not a route handler's, and this one spends money. The browser sets these
 * headers itself and a page can't forge them, so another site can't make a signed-in person's browser ask anything.
 */
function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** One question to the assistant, answered as lines of JSON (lib/assistant/types.ts). The proxy gates only pages, so this checks for itself. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuse(403, "This request came from outside the Hub.");
  if (!request.headers.get("content-type")?.includes("application/json")) return refuse(415, "Send the question as JSON.");

  const viewer = await getViewer();
  if (!viewer) return refuse(401, "Your session has ended. Sign in again to continue.");

  // Unlike everyday actions, a question costs money, so a counter that can't be reached stops it rather than waving it through.
  if (!(await allow(`assistant:${viewer.id}`, 60, LIMITS.perMinute, true, false))) return refuse(429, "That’s a lot of questions in a short time. Wait a minute and try again.");

  const raw = await request.text();
  if (raw.length > MAX_BODY) return refuse(413, "That conversation is too long. Start a new chat.");
  let body: { turns?: unknown; model?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return refuse(400, "That question couldn’t be read.");
  }
  const turns = readHistory(body.turns);
  if (!turns) return refuse(400, "That question couldn’t be read. Keep it under 4,000 characters.");

  let prepared;
  try {
    prepared = await prepare(viewer, body.model);
  } catch (e) {
    console.error(`Assistant: ${e instanceof Error ? e.message : e}`);
    return refuse(503, "The assistant isn’t available right now. Try again in a moment.");
  }
  if (!prepared.ok) return refuse(prepared.status, prepared.message);
  const ready = prepared;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await runChat(viewer, ready, turns, request.signal, send);
        send({ t: "done" });
      } catch (e) {
        console.error(`Assistant: ${e instanceof Error ? e.message : e}`);
        send({ t: "error", message: "The assistant couldn’t answer. Try again in a moment." });
      } finally {
        open = false;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
