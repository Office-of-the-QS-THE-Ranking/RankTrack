import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { managesAgenticControl } from "@/lib/assistant/server/chat";
import { agenticControlDesk } from "@/lib/assistant/server/desk";
import { firewallDesk } from "@/lib/firewall/server";
import { consoleData } from "@/lib/governance/server/console";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";
import { SectionView } from "./SectionView";
import { CommandControlConsole } from "./CommandControlConsole";
import { SECTIONS, firstSection, sectionHref, sectionInfo } from "./sections";
import { AgenticControl } from "./sections/AgenticControl";
import { Firewall } from "./sections/Firewall";

/* The Command & Control page and its subtabs, shared by the Office and contributor workspaces. */

export async function CommandControlLayout({ base, home, children }: { base: string; home: string; children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/signin?next=${base}`);
  if (!viewer.commandControl.length) redirect(home);
  return (
    <CommandControlConsole initial={await consoleData(viewer)} base={base}>
      {children}
    </CommandControlConsole>
  );
}

/** Command & Control itself has no page of its own: it opens on the first subtab the viewer may see. */
export async function CommandControlHome({ base, home }: { base: string; home: string }): Promise<ReactNode> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/signin?next=${base}`);
  const first = firstSection(viewer.commandControl);
  return redirect(first ? sectionHref(base, first.key) : home);
}

export const sectionParams = () => SECTIONS.map((s) => ({ section: s.key }));

export async function sectionMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: sectionInfo(section)?.title ?? "Command & Control" };
}

export async function CommandControlSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const info = sectionInfo(section);
  if (!info) notFound();
  if (info.key === "agentic-control") {
    const viewer = await getViewer();
    if (!viewer || !managesAgenticControl(viewer)) notFound();
    return <AgenticControl initial={await agenticControlDesk()} />;
  }
  if (info.key === "firewall") {
    const viewer = await getViewer();
    if (!viewer || !viewerCan(viewer, "security", "view")) notFound();
    return <Firewall initial={await firewallDesk(viewer)} />;
  }
  return <SectionView section={info.key} />;
}
