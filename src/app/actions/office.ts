"use server";

/*
 * Knowledge Base › About the Office: the Office's own profile, which the public /about page shows. Saving needs
 * Knowledge Base (edit). One save replaces the fields and lists of one part of the page, in one transaction
 * (office_save), is audited, and drops the cached reference data so the website shows it on the next load.
 */
import { revalidatePath } from "next/cache";
import { allowed, audit, fail, isViewer, type Result } from "@/lib/analytics/server/guard";
import { forgetReference } from "@/lib/governance/server/reference";
import { ABOUT_PARTS, type AboutDraft, type AboutPart } from "@/lib/office-about";
import { adminDb } from "@/lib/supabase/server";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "policy";

type Row = { title: string; body?: string; person?: string; owners?: string; timing?: string; anchor?: string };

function rows<T>(v: unknown, map: (x: Record<string, unknown>) => T | null, max = 30): T[] | string {
  if (!Array.isArray(v)) return "Something was missing. Reload and try again.";
  if (v.length > max) return `Keep it to ${max} items.`;
  const out: T[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const r = map(x as Record<string, unknown>);
    if (r) out.push(r);
  }
  return out;
}

export async function saveAbout(part: AboutPart, draft: AboutDraft): Promise<Result> {
  const viewer = await allowed(["knowledge", "edit"]);
  if (!isViewer(viewer)) return viewer;
  const meta = ABOUT_PARTS.find((p) => p.key === part);
  if (!meta || !meta.editable) return fail("That part can’t be edited here.");

  const profile: Record<string, string> = {};
  const sections: Record<string, Row[]> = {};
  const need = (key: string, value: unknown, max: number, label: string) => {
    const v = text(value, max);
    if (!v) throw new Error(`Fill in ${label}.`);
    profile[key] = v;
  };
  const list = (section: string, value: unknown, map: (x: Record<string, unknown>) => Row | null) => {
    const r = rows(value, map);
    if (typeof r === "string") throw new Error(r);
    sections[section] = r;
  };
  const pair = (titleMax: number, bodyMax: number) => (x: Record<string, unknown>) => {
    const title = text(x.title, titleMax);
    const body = text(x.body, bodyMax);
    if (!title && !body) return null;
    if (!title) throw new Error("Every item needs a title.");
    return { title, body };
  };

  try {
    switch (part) {
      case "purpose":
        need("summary", draft.summary, 600, "the summary");
        need("purpose", draft.purpose, 600, "the purpose");
        list("function", draft.functions, (x) => {
          const title = text(x.title, 300);
          return title ? { title } : null;
        });
        break;
      case "vision":
        need("vision", draft.vision, 600, "the vision");
        need("mission", draft.mission, 800, "the mission");
        list("objective", draft.objectives, pair(120, 600));
        break;
      case "deliverables":
        list("deliverable", draft.deliverables, pair(120, 600));
        break;
      case "team":
        list("team", draft.team, (x) => {
          const title = text(x.title, 120);
          const person = text(x.person, 120);
          const body = text(x.body, 400);
          if (!title && !person && !body) return null;
          if (!title) throw new Error("Every team member needs a role.");
          return { title, person, body };
        });
        list("workplan", draft.workplan, (x) => {
          const title = text(x.title, 160);
          const owners = text(x.owners, 300);
          const timing = text(x.timing, 160);
          if (!title && !owners && !timing) return null;
          if (!title) throw new Error("Every responsibility needs a title.");
          return { title, owners, timing };
        });
        break;
      case "coordination":
        need("reports_to", draft.reportsTo, 160, "who the Office reports to");
        list("coordination", draft.coordination, pair(120, 500));
        break;
      case "policies": {
        const seen = new Set<string>();
        list("policy", draft.policies, (x) => {
          const r = pair(120, 1600)(x);
          if (!r) return null;
          let anchor = text(x.anchor, 40) || slug(r.title);
          if (!/^[a-z0-9-]{1,40}$/.test(anchor)) anchor = slug(r.title);
          while (seen.has(anchor)) anchor = `${anchor.slice(0, 36)}-${seen.size}`;
          seen.add(anchor);
          return { ...r, anchor };
        });
        break;
      }
      case "contact":
        need("name", draft.name, 160, "the Office’s name");
        need("location", draft.location, 200, "the room");
        need("landmark", draft.landmark, 200, "the landmark");
        need("phone", draft.phone, 80, "the phone number");
        need("email", draft.email, 160, "the email address");
        need("street", draft.street, 200, "the street");
        need("city", draft.city, 200, "the city");
        if (!EMAIL.test(profile.email)) throw new Error("Enter an email address, like name@ust.edu.ph.");
        break;
      case "faq":
        list("faq", draft.faq, pair(240, 1200));
        break;
    }
  } catch (e) {
    return fail((e as Error).message);
  }

  const { error } = await adminDb().rpc("office_save", { profile, sections });
  if (error) return fail("Couldn’t save. Try again.");
  forgetReference();
  await audit(viewer, "office.about", { type: "Office", id: part, label: `About the Office: ${meta.label}` }, `Updated ${meta.label}.`, [], "Configuration");
  revalidatePath("/", "layout");
  return { ok: true, message: `${meta.label} saved. The website shows it within a minute.` };
}
