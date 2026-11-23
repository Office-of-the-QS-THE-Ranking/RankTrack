/*
 * The analytics engine's figures the demo's screens show (the Office's open actions and data requests, a unit's
 * actions). In the Hub they come from the analytics tables in Supabase; here they are SAMPLE DATA.
 */
import type { RankingAction, RequestsBrief } from "@/lib/analytics/desk-types";
import { demoDay } from "./clock";

const action = (id: string, ranking: string, text: string, owner: string, ownerName: string, due: number, status: RankingAction["status"], progress: number): RankingAction => ({
  id,
  ranking,
  edition: `${ranking}-sample`,
  editionLabel: "Sample edition",
  action: text,
  owner,
  ownerName,
  due: demoDay(due),
  status,
  progress,
  note: "Sample action.",
});

export function demoActions(): RankingAction[] {
  return [
    action("A-D1", "the-impact", "Collect outcome figures for SDG 14 programmes", "cce", "College of Coastal Engineering", 9, "On track", 40),
    action("A-D2", "qs-wur", "Confirm graduate employment survey method", "cce", "College of Coastal Engineering", 16, "Not started", 0),
    action("A-D3", "the-wur", "Reconcile research income with the finance office", "irs", "Institute for River Studies", 12, "At risk", 25),
    action("A-D4", "greenmetric", "Add transport policy evidence", "ocs", "Office for Campus Sustainability", 30, "Not started", 0),
    action("A-D5", "qs-sustainability", "Publish the governance statement", "rankings-office", "Office of Rankings (demo)", 44, "On track", 60),
    action("A-D6", "the-impact", "Partnership letters for SDG 17", "fcd", "Faculty of Civic Design", 21, "Complete", 100),
  ];
}

export const demoUnitActions = (unit: { slug: string; name: string }) => demoActions().filter((a) => a.owner === unit.slug && a.status !== "Complete");

export const demoRequestsBrief = (): RequestsBrief => ({ open: 2, requested: 24, sent: 15, overdue: 1 });
