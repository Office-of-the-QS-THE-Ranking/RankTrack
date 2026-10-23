"use client";

import type { ReactNode } from "react";
import type { SectionKey } from "./sections";
import { Overview } from "./sections/Overview";
import { Accounts } from "./sections/Accounts";
import { Roles } from "./sections/Roles";
import { Directory } from "./sections/Directory";
import { Governance } from "./sections/Governance";
import { Security } from "./sections/Security";
import { Audit } from "./sections/Audit";
import { Workflows } from "./sections/Workflows";
import { Config } from "./sections/Config";
import { Backup } from "./sections/Backup";

const VIEWS: Record<SectionKey, () => ReactNode> = {
  overview: () => <Overview />,
  accounts: () => <Accounts />,
  roles: () => <Roles />,
  directory: () => <Directory />,
  governance: () => <Governance />,
  security: () => <Security />,
  audit: () => <Audit />,
  workflows: () => <Workflows />,
  config: () => <Config />,
  backup: () => <Backup />,
};

/** One Administration subtab. The surrounding layout checks the viewer's role for it. */
export function AdminSection({ section }: { section: SectionKey }) {
  return VIEWS[section]();
}
