import type { Command } from "@/lib/governance/commands";
import { runtime } from "./index";

export const govern = (cmd: Command) => runtime().govern(cmd);
