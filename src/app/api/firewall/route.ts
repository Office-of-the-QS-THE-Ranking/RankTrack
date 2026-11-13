/*
 * The Firewall page's live view polls here (GET ?range=&filter=&q=). It answers only to people who can view Privacy
 * and security, and the firewall doesn't record these polls (lib/firewall/guard.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { firewallDesk } from "@/lib/firewall/server";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || !viewerCan(viewer, "security", "view")) return NextResponse.json({ error: "Not allowed." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const p = request.nextUrl.searchParams;
  const desk = await firewallDesk(viewer, { range: p.get("range") as never, filter: p.get("filter") as never, q: p.get("q") ?? "" });
  return NextResponse.json(desk, { headers: { "Cache-Control": "no-store" } });
}
