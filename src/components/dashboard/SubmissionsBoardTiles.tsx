import { rankingActions, requestsBrief } from "@/lib/analytics/server/desk";
import { ActionsTileView, RequestsTileView } from "./SubmissionsBoard";

/* The executive dashboard's two analytics tiles, loaded on the server and streamed in behind their Suspense fallbacks. */

export async function RequestsTile() {
  return <RequestsTileView brief={await requestsBrief()} />;
}

export async function ActionsTile({ warningDays }: { warningDays: number }) {
  return <ActionsTileView actions={await rankingActions()} warningDays={warningDays} />;
}
