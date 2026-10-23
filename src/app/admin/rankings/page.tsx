import { redirect } from "next/navigation";

/* The rankings overview now lives on the executive dashboard as its second view. */
export default function RankingsOverviewPage() {
  redirect("/admin?view=rankings");
}
