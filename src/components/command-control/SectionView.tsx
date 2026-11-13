"use client";

import type { ReactNode } from "react";
import type { SectionKey } from "./sections";
import { Accounts } from "./sections/Accounts";
import { Roles } from "./sections/Roles";
import { Directory } from "./sections/Directory";
import { Governance } from "./sections/Governance";
import { Security } from "./sections/Security";
import { Audit } from "./sections/Audit";
import { ProcessPipelines } from "./sections/ProcessPipelines";
import { Config } from "./sections/Config";
import { Backup } from "./sections/Backup";

/** Agentic Control and Firewall load their own data on the server (routes.tsx). */
const VIEWS: Record<Exclude<SectionKey, "agentic-control" | "firewall">, () => ReactNode> = {
  accounts: () => <Accounts />,
  roles: () => <Roles />,
  directory: () => <Directory />,
  governance: () => <Governance />,
  security: () => <Security />,
  audit: () => <Audit />,
  "process-pipelines": () => <ProcessPipelines />,
  config: () => <Config />,
  backup: () => <Backup />,
};

/** One Command & Control subtab. The surrounding layout checks the viewer's role for it. */
export function SectionView({ section }: { section: Exclude<SectionKey, "agentic-control" | "firewall"> }) {
  return VIEWS[section]();
}
