import { audit } from "@/lib/analytics/server/guard";
import { allow } from "@/lib/governance/server/limits";
import { getViewer } from "@/lib/governance/server/session";
import { checkFile } from "@/lib/review/server/decide";
import { reviewable, reviewDesk } from "@/lib/review/server/review";
import { REVIEWER_LIMITS } from "@/lib/review/reviewer";

/** One model call, and a second to the job's backup if the first fails. */
export const maxDuration = 60;

const MAX_BODY = 2000;

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Next checks a Server Action's origin but not a route handler's, and this one spends money (see api/chat). */
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

/**
 * The Reviewer's check of one file's open suggestions (lib/review/server/reviewer.ts). The request names a submission
 * and a file, never text: the pages come from what the Hub already holds, for someone who reviews that submission.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return answer(403, { ok: false, message: "This request came from outside the Hub." });
  if (!request.headers.get("content-type")?.includes("application/json")) return answer(415, { ok: false, message: "Send the request as JSON." });
  const viewer = await getViewer();
  if (!viewer) return answer(401, { ok: false, message: "Your session has ended. Sign in again to continue." });

  const raw = await request.text();
  let body: { evidenceId?: unknown; src?: unknown };
  try {
    if (raw.length > MAX_BODY) throw new Error("too long");
    body = JSON.parse(raw) as typeof body;
  } catch {
    return answer(400, { ok: false, message: "That request couldn’t be read." });
  }

  const found = await reviewable(viewer, body.evidenceId);
  if (typeof found === "string") return answer(403, { ok: false, message: found });
  // A check costs money, so a counter that can't be reached stops it rather than waving it through.
  if (!(await allow(`reviewer:${viewer.id}`, 60, REVIEWER_LIMITS.perMinute, true, false))) return answer(429, { ok: false, message: "That’s a lot of checks in a short time. Wait a minute and try again." });

  try {
    const result = await checkFile(viewer, found.e, body.src);
    if (!result.ok) return answer(200, result);
    await audit(viewer, "review.ai", { type: "Evidence", id: found.e.id, label: found.e.title.slice(0, 160) }, `${result.model} checked ${result.checked} suggestions`);
    return answer(200, { ok: true, message: result.message, data: await reviewDesk(viewer, found.e, found.state) });
  } catch (e) {
    console.error(`Reviewer: ${e instanceof Error ? e.message : e}`);
    return answer(200, { ok: false, message: "The AI check couldn’t run. Try again in a moment." });
  }
}
