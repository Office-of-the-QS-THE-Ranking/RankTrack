import { redirect } from "next/navigation";

/* About the Office left the sidebar (2026-11-13): it is the Knowledge Base's About the Office tab now. */
export default function About() {
  redirect("/admin/knowledge-base#about");
}
