import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { rebuildIndex } from "@/lib/assistant/server/index-builder";
import { checkAsSystem, remindAsSystem } from "@/lib/governance/server/deadline-check";
import { mailDaily } from "@/lib/mail/server/outbox";
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
 * analytics engine's reminders, escalations and weekly snapshots, then the Office's reminders of rankings about to
 * close, then the mail queue (what waited is sent, what is past its retention is deleted), then the assistant's index,
 * which takes whatever time is left and finishes tomorrow if it must. One failing doesn't stop the others.
 */
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const started = Date.now();
  const result = await checkAsSystem();
  const analytics = await analyticsDaily().catch((e: unknown) => {
    console.error(e);
    return { ok: false, message: "The analytics round failed." };
  });
  const reminders = await remindAsSystem().catch((e: unknown) => {
    console.error(e);
    return { ok: false, message: "The deadline reminders failed." };
  });
  const mail = await mailDaily().catch((e: unknown) => {
    console.error(e);
    return { ok: false, message: "The mail round failed." };
  });
  if (result.ok || analytics.ok) revalidatePath("/", "layout");
  const assistant = await rebuildIndex(Math.max(5_000, (maxDuration - 10) * 1000 - (Date.now() - started)));
  return Response.json({ ok: result.ok, message: result.message, analytics, reminders: reminders.message, mail: mail.message, assistant });
}
