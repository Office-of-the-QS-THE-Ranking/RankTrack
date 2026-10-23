import { NextResponse, type NextRequest } from "next/server";
import { ACTING_COOKIE, getViewer } from "@/lib/governance/server/session";

/**
 * "Submit on behalf of a unit": University-wide contributors switch the contributor workspace to a unit,
 * then continue to the page they asked for. Anyone else is simply sent on.
 */
export async function GET(request: NextRequest) {
  const unit = request.nextUrl.searchParams.get("unit") ?? "";
  const next = request.nextUrl.searchParams.get("next") ?? "/portal";
  const target = /^\/portal(\/|$)/.test(next) ? next : "/portal";
  const viewer = await getViewer();
  const res = NextResponse.redirect(new URL(target, request.url));
  if (viewer?.portal.canSwitch && viewer.portal.units.some((u) => u.id === unit)) res.cookies.set(ACTING_COOKIE, unit, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
