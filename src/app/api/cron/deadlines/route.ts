import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { checkAsSystem } from "@/lib/governance/server/deadline-check";
import { analyticsDaily } from "@/lib/analytics/server/daily";

/** The check reads five sites one after another at worst; give it room. */
export const maxDuration = 60;

const authorized = (header: string | null) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * The daily round (vercel.json crons). Vercel Cron sends the project's CRON_SECRET as a bearer token; without it the
 * route does nothing. First the deadline check (what it finds waits for the Office on each ranking's page), then the
 * analytics engine's reminders, escalations and weekly snapshots. One failing doesn't stop the other.
 */
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const result = await checkAsSystem();
  const analytics = await analyticsDaily().catch((e: unknown) => {
    console.error(e);
    return { ok: false, message: "The analytics round failed." };
  });
  if (result.ok || analytics.ok) revalidatePath("/", "layout");
  return Response.json({ ok: result.ok, message: result.message, analytics });
}
