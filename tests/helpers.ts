/* A governance state built in memory from the seed, with accounts and units the tests need. No database. */
import { actorFor, makeCtx, SYSTEM } from "@/lib/governance/engine";
import { createAccount, createUnit } from "@/lib/governance/engine/mutations";
import { buildSeed } from "@/lib/governance/seed";
import type { Account, GovernanceState, RoleId, Scope } from "@/lib/governance/types";
import type { Reference } from "@/lib/reference";

export const ref = { directory: [], rankings: [] } as unknown as Reference;

export function world() {
  const { audit: _audit, ...seed } = buildSeed(ref);
  void _audit;
  const state = { ...structuredClone(seed), auditHead: { seq: 0, hash: "0".repeat(64) }, recentAudit: [] } as GovernanceState;
  const sys = makeCtx(state, SYSTEM, ref);
  const university = state.units[0];
  const eng = createUnit(sys, { name: "Faculty of Engineering", code: "ENG", kind: "Faculty", parentId: university.id });
  const sci = createUnit(sys, { name: "College of Science", code: "SCI", kind: "Faculty", parentId: university.id });
  const person = (name: string, email: string, roleId: RoleId, unitId: string, external = false, scope?: Scope): Account => {
    const a = createAccount(sys, { name, email, title: "Test", unitId, roleId, external, scope });
    a.status = "Active";
    return a;
  };
  return { state, university, eng, sci, person, ctxFor: (a: Account) => makeCtx(state, actorFor(state, a), ref) };
}
