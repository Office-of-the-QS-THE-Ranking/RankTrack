import { redirect } from "next/navigation";

/** The Recognition wall moved into the Dashboard as a tab; older links land there. */
export default function Recognition() {
  redirect("/admin?view=recognition");
}
