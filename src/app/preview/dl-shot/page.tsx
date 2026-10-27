// TEMPORARY screenshot route for the deadline check. Delete before finishing.
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { clientHub, hub } from "@/lib/governance/server/hub";
import type { Viewer } from "@/lib/governance/viewer";
import { RankingView } from "@/components/rankings/RankingView";

const ALL = ["view", "create", "edit", "delete", "submit", "approve", "export", "manage"] as const;
const MODULES = ["dashboard", "rankings", "evidence", "data", "stories", "units", "posts", "reports", "knowledge", "config"] as const;
const perms = Object.fromEntries(MODULES.map((m) => [m, [...ALL]]));
const viewer = {
  id: "preview", name: "Preview Viewer", email: "preview@ust.edu.ph", title: "Rankings Office", initials: "PV", external: false,
  unitId: "office", unitName: "Office of QS/THE Rankings",
  roles: [{ id: "administrator", name: "Administrator", scope: "University-wide" }], roleName: "Administrator",
  grants: [{ assignmentId: "a", roleId: "administrator", roleName: "Administrator", perms, units: "all", scopeUnits: "all", bodies: "all", years: "all", datasets: "all", tier: 0 }],
  perms, workspaces: ["office"], portal: { unitId: "office", unitName: "Office" }, admin: [], flags: [], features: {}, dataGrants: [],
  session: { id: "s", startedAt: new Date().toISOString(), idleMinutes: 0, policyIdleMinutes: 0, warnMinutes: 2, absoluteHours: 12, stay: true, mfa: false },
  notify: { email: false, off: [] },
} as unknown as Viewer;

const now = new Date(Date.now() - 2 * 3600_000).toISOString();
const page = "https://support.qs.com/hc/en-gb/articles/15441557138716";

export default async function Page({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const slug = (await searchParams).slug ?? "qs-wur";
  const ranking = (await hub()).ranking(slug);
  if (!ranking) notFound();
  const base = await clientHub(viewer, "office");
  return (
    <Shell
      variant="office"
      viewer={viewer}
      hub={{
        ...base,
        deadlineDesk: {
          findings: [
            { id: "DF-0001", sourceId: "qs-cycle", slug: "qs-wur", target: "deadline", label: "Data collection closes", due: "2027-02-05", quote: "Institution Data · 15 September 2026 · 5 February 2027", url: page, foundAt: now, state: "New" },
            { id: "DF-0002", sourceId: "qs-cycle", slug: "qs-wur", target: "milestone", label: "Survey contacts, first window closes", due: "2026-11-27", quote: "Survey Contacts Submission window 1 · 15 September 2026 · 27 November 2026", url: page, foundAt: now, state: "New" },
          ],
          sources: [{ id: "qs-cycle", name: "QS help centre: Rankings Cycle", page, body: "QS", kind: "table", slugs: ["qs-wur", "qs-subject"], status: "Read", checkedAt: now, note: "QS Rankings Cycle 2028" }],
          entries: [{ id: "CAL-0001", slug: "qs-wur", label: "Survey contacts, second window closes", due: "2027-01-29", source: "Automatic", url: page, by: "Maria Santos", at: now }],
          origin: {},
        },
      }}
    >
      <RankingView ranking={ranking} />
    </Shell>
  );
}
