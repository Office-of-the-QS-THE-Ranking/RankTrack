/*
 * Who may do what with a digital form (user, 2026-10-29). A form is held by the Office (no unit), by a unit (its
 * Coordinators run it, its Administrators read it), or by a Student, the Secretary of a student organization,
 * commission or council (their own Evaluation Form or Registration Form).
 *
 * - The Office's Proposal and Terminal Report forms are filled in as team copies, which Students build from the
 *   Student Portal once the Office publishes the form there. Nobody starts a copy from the form's own link.
 * - Surveys come from the Office or a unit; published to the Student Portal they are the Students' assignments.
 * - Evaluation Forms and Registration Forms are made by Students, Coordinators or the Office. They're fixed once
 *   published (no changes, no deleting), since their responses feed the Office's data from then on; the Office
 *   reads every unit's and Student's form once it's out of draft.
 * - A Student acts only on the forms they own; the Office never acts for a unit (as with evidence).
 *
 * The same answer serves the server, which enforces it (engine/forms.ts, actions/forms.ts, actions/form-copies.ts),
 * and the pages, which only show what's allowed. No server code, so pages can import it.
 */
import { ROLE } from "@/lib/governance/catalog";
import { descendants, has, type Grant } from "@/lib/governance/rbac";
import type { Action, OrgUnit } from "@/lib/governance/types";
import { FORM_KINDS } from "./kinds";
import type { FormKind, FormStatus } from "./types";

export type FormHolder = "office" | "unit" | "student";

/** Filled in as team copies that Students build from the Student Portal: one copy per project, with its own link. */
export const COPY_KINDS: readonly FormKind[] = ["proposal", "terminal-report"];

/** May be published to the Student Portal: copies to build there, or a survey to answer. */
export const PORTAL_KINDS: readonly FormKind[] = ["proposal", "terminal-report", "survey"];

/** Fixed once published: their responses feed the Office's data from then on. */
export const LOCK_KINDS: readonly FormKind[] = ["evaluation", "registration"];

/** What each holder may make: the Office any kind, a unit all but the proposals and terminal reports the Office issues, a Student evaluations and registrations. */
export const HOLDER_KINDS: Record<FormHolder, readonly FormKind[]> = {
  office: FORM_KINDS.map((k) => k.key),
  unit: ["survey", "registration", "application", "evaluation"],
  student: ["evaluation", "registration"],
};

type Held = { unitId?: string; ownerId?: string };
type Form = Held & { kind: FormKind; status: FormStatus };

export const holderOf = (f: Held): FormHolder => (f.ownerId ? "student" : f.unitId ? "unit" : "office");

/** Whether a kind's link builds team copies. */
export const buildsCopies = (kind: FormKind) => COPY_KINDS.includes(kind);

/** An Evaluation or Registration Form once published: fixed for good. */
export const isLocked = (f: Pick<Form, "kind" | "status">) => LOCK_KINDS.includes(f.kind) && f.status !== "draft";

/** Opening this draft publishes it for good (an Evaluation or Registration Form), so the page asks first. */
export const publishes = (f: Pick<Form, "kind" | "status">) => f.status === "draft" && LOCK_KINDS.includes(f.kind);

const student = (g: Grant) => g.roleId === ROLE.student;

/** `a` University-wide: the Office's Administrators. */
const office = (grants: Grant[], a: Action) => grants.some((g) => g.units === "all" && has(g.perms, "forms", a));

/** `a` on the unit's forms through a role held in it: its Coordinators and Administrators, never a Student. */
const inUnit = (grants: Grant[], a: Action, unitId: string) => grants.some((g) => g.units !== "all" && !student(g) && g.units.includes(unitId) && has(g.perms, "forms", a));

/** `a` as a Student, on their own forms. */
const asStudent = (grants: Grant[], a: Action) => grants.some((g) => student(g) && has(g.perms, "forms", a));

export interface FormRights {
  /** Change its details and, while it's a draft, its questions. */
  edit: boolean;
  /** Delete it (a draft only). */
  remove: boolean;
  /** Open (publish) it, close it, reopen it. */
  status: boolean;
  /** Publish it to the Student Portal, or take it off. */
  portal: boolean;
  /** Make a draft with the same questions. */
  duplicate: boolean;
  /** Read its responses and analytics. */
  read: boolean;
  /** Record its sign-offs and the office's fields. */
  review: boolean;
  /** Download its responses. */
  export: boolean;
  /** Remove responses for good (test runs, duplicates). */
  clear: boolean;
}

export const NO_RIGHTS: FormRights = { edit: false, remove: false, status: false, portal: false, duplicate: false, read: false, review: false, export: false, clear: false };

/** What someone acting with `grants` (their active role) may do with a form. */
export function formRights(grants: Grant[], accountId: string, f: Form): FormRights {
  const draft = f.status === "draft";
  const locked = isLocked(f);
  // The Office sees a unit's or a Student's form once it's out of draft: from then on its responses are the Office's data too.
  const oversees = (a: Action) => !draft && office(grants, a);
  switch (holderOf(f)) {
    case "office": {
      const runs = office(grants, "edit");
      return {
        edit: runs && !locked,
        remove: draft && office(grants, "delete"),
        status: runs,
        portal: PORTAL_KINDS.includes(f.kind) && office(grants, "manage"),
        duplicate: office(grants, "create"),
        read: office(grants, "view"),
        review: office(grants, "approve"),
        export: office(grants, "export"),
        clear: office(grants, "delete"),
      };
    }
    case "unit": {
      const id = f.unitId!;
      const runs = inUnit(grants, "edit", id);
      return {
        edit: runs && !locked,
        remove: draft && inUnit(grants, "delete", id),
        status: runs || oversees("manage"),
        portal: f.kind === "survey" && inUnit(grants, "manage", id),
        duplicate: HOLDER_KINDS.unit.includes(f.kind) && inUnit(grants, "create", id),
        read: inUnit(grants, "view", id) || oversees("view"),
        review: inUnit(grants, "approve", id),
        export: inUnit(grants, "export", id) || oversees("export"),
        // A fixed form's responses are the Office's data: only the Office removes them.
        clear: (!LOCK_KINDS.includes(f.kind) && inUnit(grants, "delete", id)) || oversees("delete"),
      };
    }
    case "student": {
      const mine = accountId === f.ownerId && grants.some(student);
      return {
        edit: mine && !locked && asStudent(grants, "edit"),
        remove: mine && draft && asStudent(grants, "delete"),
        status: (mine && asStudent(grants, "edit")) || oversees("manage"),
        portal: false,
        duplicate: mine && asStudent(grants, "create"),
        read: mine || oversees("view"),
        review: false,
        export: (mine && asStudent(grants, "export")) || oversees("export"),
        clear: oversees("delete"),
      };
    }
  }
}

/** The kinds someone may make where `holder` keeps its forms; empty when they may make none there. */
export function creatable(grants: Grant[], holder: FormHolder, unitId?: string): FormKind[] {
  const may = holder === "office" ? office(grants, "create") : holder === "unit" ? !!unitId && inUnit(grants, "create", unitId) : asStudent(grants, "create");
  return may ? [...HOLDER_KINDS[holder]] : [];
}

/** Whether someone files as a Student right now: builds copies and answers assignments. */
export const filesForms = (grants: Grant[]) => asStudent(grants, "submit");

/**
 * Whether a form published to the Student Portal reaches a Student placed in `home` (their assignment's units):
 * the Office's reach every Student, a unit's the Students in it or beneath it.
 */
export function reaches(units: OrgUnit[], f: Held, home: string[]): boolean {
  if (f.ownerId) return false;
  if (!f.unitId) return true;
  const under = descendants(units, f.unitId);
  return home.some((u) => under.includes(u));
}
