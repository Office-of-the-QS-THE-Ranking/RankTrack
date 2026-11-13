/*
 * About the Office: the parts of the public /about page, in its order, and the draft the Knowledge Base's About
 * tab edits. `anchor` is the section's id on the public page. The ranking portfolio is not edited: it lists the
 * rankings System Configuration tracks and publishes.
 */
import type { IconName } from "@/components/ui/Icon";
import type { Office } from "./reference";

export type AboutPart = "purpose" | "vision" | "portfolio" | "deliverables" | "team" | "coordination" | "policies" | "contact" | "faq";

export const ABOUT_PARTS: { key: AboutPart; label: string; anchor: string; icon: IconName; editable: boolean }[] = [
  { key: "purpose", label: "Purpose", anchor: "mission", icon: "target", editable: true },
  { key: "vision", label: "Vision and mission", anchor: "vision", icon: "eye", editable: true },
  { key: "portfolio", label: "Ranking portfolio", anchor: "portfolio", icon: "rankings", editable: false },
  { key: "deliverables", label: "Deliverables", anchor: "deliverables", icon: "send", editable: true },
  { key: "team", label: "Team", anchor: "team", icon: "users", editable: true },
  { key: "coordination", label: "Reporting and coordination", anchor: "governance", icon: "governance", editable: true },
  { key: "policies", label: "Policies", anchor: "policies", icon: "shield", editable: true },
  { key: "contact", label: "Contact", anchor: "contact", icon: "mail", editable: true },
  { key: "faq", label: "FAQs", anchor: "faq", icon: "help", editable: true },
];

export interface Item {
  title: string;
  body?: string;
  person?: string;
  owners?: string;
  timing?: string;
  anchor?: string;
}

export interface AboutDraft {
  summary: string;
  purpose: string;
  functions: Item[];
  vision: string;
  mission: string;
  objectives: Item[];
  deliverables: Item[];
  team: Item[];
  workplan: Item[];
  reportsTo: string;
  coordination: Item[];
  policies: Item[];
  name: string;
  location: string;
  landmark: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  faq: Item[];
}

export const draftOf = (o: Office): AboutDraft => ({
  summary: o.summary,
  purpose: o.purpose,
  functions: o.functions.map((title) => ({ title })),
  vision: o.vision,
  mission: o.mission,
  objectives: o.objectives.map((x) => ({ title: x.title, body: x.text })),
  deliverables: o.deliverables.map((x) => ({ title: x.title, body: x.text })),
  team: o.team.map((x) => ({ title: x.role, person: x.who, body: x.focus })),
  workplan: o.workplan.map((x) => ({ title: x.title, owners: x.owners, timing: x.timing })),
  reportsTo: o.reportsTo,
  coordination: o.coordination.map((x) => ({ title: x.title, body: x.text })),
  policies: o.policies.map((x) => ({ title: x.title, body: x.text, anchor: x.anchor })),
  name: o.name,
  location: o.location,
  landmark: o.landmark,
  phone: o.phone,
  email: o.email,
  street: o.street,
  city: o.city,
  faq: o.faq.map((x) => ({ title: x.q, body: x.a })),
});
