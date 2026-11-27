/*
 * Firewall › Analytics polls here (GET ?range=&area=). It answers only to people who can view Privacy
 * and security, and the firewall doesn't record these polls (lib/firewall/guard.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";
import { webAnalyticsDesk } from "@/lib/web-analytics/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || !viewerCan(viewer, "security", "view")) return NextResponse.json({ error: "Not allowed." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const p = request.nextUrl.searchParams;
  const desk = await webAnalyticsDesk(viewer, { range: p.get("range") as never, area: p.get("area") as never });
  return NextResponse.json(desk, { headers: { "Cache-Control": "no-store" } });
}
