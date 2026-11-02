/*
 * How each unit is doing with what the Office asked of it: requested, sent, validated, returned, overdue, sent on
 * time, reminders, whether it was escalated, and the points its contributions carry.
 */
import type { Campaign, EditionReport, Facts, ValueRow } from "./types";

export interface UnitStanding {
  unit: string;
  campaign: string;
  requested: number;
  submitted: number;
  validated: number;
  revisions: number;
  overdue: number;
  onTime: number;
  reminders: number;
  escalated: boolean;
  thanked: boolean;
  /** Claimed points of the indicators it contributed to, shared among their contributors. */
  points: number;
  lastAt?: string;
}

const endOf = (day: string) => `${day}T23:59:59.999+08:00`;

export function unitStandings(campaign: Campaign, facts: Facts, report: EditionReport | null, today: string): UnitStanding[] {
  return campaign.units.map((u) => {
    const rows = facts.values.filter((v: ValueRow) => v.edition === campaign.edition && v.unit === u.unit && u.codes.includes(v.code));
    const linked = new Set(facts.links.filter((l) => l.edition === campaign.edition && l.unit === u.unit).map((l) => l.code));
    const sent = new Set([...rows.filter((r) => r.status !== "Draft").map((r) => r.code), ...linked]);
    const submitted = u.codes.filter((c) => sent.has(c)).length;
    const validated = rows.filter((r) => r.status === "Validated").length;
    const revisions = rows.filter((r) => r.status === "Needs revision").length;
    const late = today > campaign.due;
    const onTime = rows.filter((r) => r.status !== "Draft" && r.at <= new Date(endOf(campaign.due)).toISOString()).length;
    const points = report
      ? u.codes.reduce((s, c) => {
          const r = report.indicators[c];
          if (!r?.points || !r.contributors.includes(u.unit)) return s;
          return s + r.points.claimed / Math.max(1, r.contributors.length);
        }, 0)
      : 0;
    const stamps = [...rows.map((r) => r.at), ...facts.links.filter((l) => l.unit === u.unit && l.edition === campaign.edition).map((l) => l.at)].sort();
    return {
      unit: u.unit,
      campaign: campaign.id,
      requested: u.codes.length,
      submitted,
      validated,
      revisions,
      overdue: late && campaign.status === "Open" ? u.codes.length - submitted : 0,
      onTime,
      reminders: u.reminders,
      escalated: !!u.escalatedAt,
      thanked: !!u.thankedAt,
      points: Math.round(points * 100) / 100,
      ...(stamps.length && { lastAt: stamps[stamps.length - 1] }),
    };
  });
}

/**
 * What a campaign's daily check does for each unit that hasn't sent everything: a reminder every `remindDays`
 * (the Ranking Specialist's follow-up), then, `escalateDays` after the due date, word to the Office so the Director
 * steps in. Once escalated, the reminders stop: the Director follows up in person.
 */
export function dueActions(campaign: Campaign, standings: UnitStanding[], now: Date): { unit: string; action: "remind" | "escalate" }[] {
  if (campaign.status !== "Open") return [];
  const dayMs = 86_400_000;
  const due = Date.parse(`${campaign.due}T23:59:59+08:00`);
  const opened = (now.getTime() - Date.parse(campaign.at)) / dayMs;
  const out: { unit: string; action: "remind" | "escalate" }[] = [];
  for (const s of standings) {
    const u = campaign.units.find((x) => x.unit === s.unit);
    if (!u || u.escalatedAt || s.submitted >= s.requested) continue;
    if ((now.getTime() - due) / dayMs >= campaign.escalateDays) {
      out.push({ unit: s.unit, action: "escalate" });
      continue;
    }
    const since = u.remindedAt ? (now.getTime() - Date.parse(u.remindedAt)) / dayMs : opened;
    if (opened >= 1 && since >= campaign.remindDays) out.push({ unit: s.unit, action: "remind" });
  }
  return out;
}
