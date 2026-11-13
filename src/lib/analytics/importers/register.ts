/*
 * An activity register workbook (SIMBAHAYAN's format): one sheet per kind of activity and academic year
 * (“Service Learning 2025-2026”), with Academic Unit, Proponent, Project Title, Target Community, Project Proposal
 * and Terminal Report columns, plus a list of target communities and their MOUs. Units are matched through the
 * aliases the Office keeps (AB → Faculty of Arts and Letters).
 */
import { cleanUrl } from "../links";
import { cellText, findHeader, headerKey } from "../tabular/text";
import type { Sheet } from "../tabular/xlsx";
import type { ActivityKind } from "../types";

export interface RegisterActivity {
  unitLabel: string;
  unit?: string;
  kind: ActivityKind;
  year: string;
  title: string;
  proponent: string;
  community: string;
  proposalRef?: string;
  reportRef?: string;
  reported: boolean;
}

export interface RegisterRead {
  activities: RegisterActivity[];
  partners: { name: string; mou?: string }[];
  /** Unit labels no alias matched. */
  unknownUnits: string[];
  sheets: string[];
}

const KINDS: [RegExp, ActivityKind][] = [
  [/service\s*learning/i, "Service learning"],
  [/community\s*dev/i, "Community development"],
  [/advocacy/i, "Advocacy"],
  [/outreach/i, "Outreach"],
  [/event/i, "Event"],
];

const kindOf = (name: string): ActivityKind | null => KINDS.find(([re]) => re.test(name))?.[1] ?? null;

/** “Service Learning 2025-2026” → 2025-2026; “Ad2425” → 2024-2025. */
export function yearOf(name: string): string | null {
  const full = /(20\d{2})\s*[-–]\s*(20\d{2})/.exec(name);
  if (full && Number(full[2]) === Number(full[1]) + 1) return `${full[1]}-${full[2]}`;
  const short = /(\d{2})(\d{2})\s*$/.exec(name.trim());
  if (short && Number(short[2]) === Number(short[1]) + 1) return `20${short[1]}-20${short[2]}`;
  return null;
}

export function readRegister(sheets: Sheet[], aliases: Record<string, string>): RegisterRead {
  const alias = new Map(Object.entries(aliases).map(([k, v]) => [headerKey(k), v]));
  const activities: RegisterActivity[] = [];
  const unknown = new Set<string>();
  const used: string[] = [];
  for (const sheet of sheets) {
    const kind = kindOf(sheet.name);
    const year = yearOf(sheet.name);
    if (!kind || !year) continue;
    const head = findHeader(sheet.rows, ["Academic Unit", "Project Title"]);
    if (!head) continue;
    used.push(sheet.name);
    const header = (sheet.rows[head.row] ?? []).map((c) => headerKey(cellText(c)));
    const col = (k: string) => header.indexOf(headerKey(k));
    const cProp = col("Proponent");
    const cComm = col("Target Community");
    const cProposal = col("Project Proposal");
    const cReport = col("Terminal Report");
    for (const row of sheet.rows.slice(head.row + 1)) {
      const title = cellText(row[head.cols["Project Title"]]).replace(/\s+/g, " ");
      const unitLabel = cellText(row[head.cols["Academic Unit"]]).replace(/\s+/g, " ");
      if (!title || !unitLabel || /^total$/i.test(unitLabel)) continue;
      const unit = alias.get(headerKey(unitLabel));
      if (!unit) unknown.add(unitLabel);
      const report = cReport >= 0 ? cellText(row[cReport]) : "";
      activities.push({
        unitLabel,
        ...(unit && { unit }),
        kind,
        year,
        title: title.slice(0, 300),
        proponent: cProp >= 0 ? cellText(row[cProp]).slice(0, 200) : "",
        community: cComm >= 0 ? cellText(row[cComm]).replace(/\s+/g, " ").slice(0, 400) : "",
        ...(cProposal >= 0 && cellText(row[cProposal]) && { proposalRef: cellText(row[cProposal]).slice(0, 300) }),
        ...(report && { reportRef: report.slice(0, 300) }),
        reported: !!report && !/^(none|n\/?a|-)$/i.test(report),
      });
    }
  }
  const partners: RegisterRead["partners"] = [];
  for (const sheet of sheets.filter((s) => /target\s*community/i.test(s.name))) {
    const head = findHeader(sheet.rows, ["Community Target"]);
    if (!head) continue;
    const header = (sheet.rows[head.row] ?? []).map((c) => headerKey(cellText(c)));
    const cMou = header.findIndex((h) => h.startsWith("mou"));
    for (const row of sheet.rows.slice(head.row + 1)) {
      const name = cellText(row[head.cols["Community Target"]]).replace(/\s+/g, " ");
      if (!name) continue;
      const mou = cMou >= 0 ? cleanUrl(cellText(row[cMou])) : null;
      partners.push({ name: name.slice(0, 300), ...(mou && { mou }) });
    }
  }
  return { activities, partners, unknownUnits: [...unknown].sort(), sheets: used };
}
