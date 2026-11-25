import { Suspense } from "react";
import { DemoRoot } from "@/components/demo-portal/DemoRoot";

/** The demo's workspace pages, in its frame: one of the fictional people signed in to the real Shell (DemoRoot). */
export default function DemoWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <DemoRoot>{children}</DemoRoot>
    </Suspense>
  );
}
