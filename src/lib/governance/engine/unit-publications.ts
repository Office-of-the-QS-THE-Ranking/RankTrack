/*
 * Publications from the units. A Coordinator writes posts, research articles and reports for their own unit, and
 * none of them reaches the public website until the Rankings Office reviews and approves it: sending one puts it
 * In review with no request of its own, waiting on the Office. The Office then publishes it (through the
 * publication workflow when that applies) or returns it to the unit with a note. A unit never changes a live or
 * waiting item; it moves a waiting one back to drafts first.
 */
import { reach } from "../rbac";
import type { Action } from "../types";
import { can, notify, unitById, type Ctx } from "./core";

/** The Rankings Office: it publishes, and reviews what the units send. */
export const publishes = (ctx: Ctx) => can(ctx, "posts", "approve");

/** The unit a unit's author writes for; undefined for the Office, whose items name a unit or none. */
export function authorUnit(ctx: Ctx): string | undefined {
  if (publishes(ctx)) return undefined;
  const units = reach(ctx.actor.grants, "posts", "create");
  if (units === "all") return undefined;
  const own = ctx.actor.account?.unitId;
  return own && units.includes(own) ? own : units[0];
}

/** What a unit's author is doing to an item: changing it, sending it, moving it back to drafts, or deleting it. */
export type UnitStep = "change" | "submit" | "withdraw" | "delete";

const NEEDS: Record<UnitStep, Action> = { change: "edit", submit: "submit", withdraw: "edit", delete: "delete" };

/**
 * Why a unit's author may not do this to the item, or null when they may: only their own unit's items, never a
 * live one, and a waiting one only to move it back to drafts or delete it. The Office's checks are the permission
 * alone.
 */
export function unitBlock(ctx: Ctx, item: { unitSlug?: string; status: string }, step: UnitStep, noun = "post"): string | null {
  if (publishes(ctx)) return null;
  if (!item.unitSlug || !can(ctx, "posts", NEEDS[step], { unitId: item.unitSlug })) return `This ${noun} belongs to another unit.`;
  if (item.status === "Published") return `This ${noun} is live. Ask the Rankings Office to change it.`;
  if (item.status === "In review" && (step === "change" || step === "submit")) return `This ${noun} is with the Rankings Office. Move it back to drafts to change it.`;
  return null;
}

/** A unit's item goes to the Office for review. */
export function sendToOffice(ctx: Ctx, item: { title: string; unitSlug?: string; status: string }, href: string) {
  item.status = "In review";
  const unit = item.unitSlug ? unitById(ctx, item.unitSlug)?.name ?? item.unitSlug : ctx.actor.name;
  notify(ctx, "office", "tpl-submitted", { unit, title: item.title }, href);
}

/** The Office hands a unit's item back with what to change. */
export function returnToUnit(ctx: Ctx, item: { title: string; unitSlug?: string }, note: string, href: string) {
  if (item.unitSlug) notify(ctx, `unit:${item.unitSlug}`, "tpl-revision", { title: item.title, comment: note }, href);
}

/** Waiting on the Office's review: in review, with no publication request of its own yet. */
export const awaitingOffice = (item: { status: string }, request: unknown) => item.status === "In review" && !request;
