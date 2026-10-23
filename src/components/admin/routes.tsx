import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { consoleData } from "@/lib/governance/server/console";
import { getViewer } from "@/lib/governance/server/session";
import { AdminSection } from "./AdminSection";
import { AdminWorkspace } from "./AdminWorkspace";
import { SECTIONS, sectionInfo } from "./sections";

/* The Administration page and its subtabs, shared by the Office and contributor workspaces. */

export async function AdministrationLayout({ base, home, children }: { base: string; home: string; children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/signin?next=${base}`);
  if (!viewer.admin.length) redirect(home);
  return (
    <AdminWorkspace initial={consoleData(viewer)} base={base}>
      {children}
    </AdminWorkspace>
  );
}

export const sectionParams = () => SECTIONS.filter((s) => s.key !== "overview").map((s) => ({ section: s.key }));

export async function sectionMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: sectionInfo(section)?.title ?? "Administration" };
}

export async function AdministrationSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const info = sectionInfo(section);
  if (!info || info.key === "overview") notFound();
  return <AdminSection section={info.key} />;
}
