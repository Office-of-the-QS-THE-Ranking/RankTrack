import "server-only";

/* The reference data's lists, maps and dashboard figures for server components (lib/reference.ts `views`). */
import { cache } from "react";
import { views } from "@/lib/reference";
import { reference } from "./reference";

export const serverViews = cache(async () => views(await reference()));
