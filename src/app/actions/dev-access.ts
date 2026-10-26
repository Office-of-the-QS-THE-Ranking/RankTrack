"use server";

/* The floating developer settings (development only): read and save the access profile used at sign-in. */
import { revalidatePath } from "next/cache";
import { ROLES } from "@/lib/governance/catalog";
import { DEV, readProfile, writeProfile, type DevProfile } from "@/lib/governance/server/dev-access";
import { readState } from "@/lib/governance/server/store";
import { adminDb } from "@/lib/supabase/server";

export async function loadDevAccess() {
  if (!DEV) return null;
  const s = await readState();
  return {
    profile: await readProfile(),
    roles: ROLES.map((r) => ({ id: r.id, name: r.name })),
    units: s.units.filter((u) => u.status === "Active").map((u) => ({ id: u.id, name: u.name })),
  };
}

export async function saveDevAccess(p: DevProfile): Promise<{ ok: boolean; message: string }> {
  if (!DEV) return { ok: false, message: "Developer settings are off. They work only under next dev with HUB_DEV_ACCESS=on." };
  const email = p.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, message: "Enter a valid Google address." };
  if (!p.roleIds.length) return { ok: false, message: "Choose at least one role." };
  await writeProfile({ enabled: !!p.enabled, email, roleIds: p.roleIds, unitId: p.unitId, scope: p.scope === "unit" ? "unit" : "university", superAdmin: p.superAdmin !== false });
  // Supabase Auth admits only addresses with access (the sign-in gate); let the test address through before its account exists.
  // One address at a time: an address the panel let through before is taken off the list.
  await adminDb().from("hub_auth_allow").delete().eq("reason", "Developer settings").neq("email", email);
  const { error } = await adminDb().from("hub_auth_allow").upsert({ email, reason: "Developer settings" });
  if (error) return { ok: false, message: `Saved, but Supabase Auth may refuse ${email}: ${error.message}` };
  // the Super admin switch takes effect at once: refresh what the workspaces say needs approval
  revalidatePath("/", "layout");
  const shortcut = p.superAdmin === false ? " Super admin is off: approval workflows apply now." : "";
  return { ok: true, message: `${p.enabled ? "Developer settings saved. Roles apply at your next sign-in." : "Developer settings saved; roles aren't applied at sign-in."}${shortcut}` };
}
