"use client";

import type { MouseEvent } from "react";
import { formatDate, type EvidenceItem } from "@/lib/data";
import type { HubUnit } from "@/lib/governance/hub-types";
import { useReference } from "@/components/reference/ReferenceProvider";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { Status, Swatch, cx } from "@/components/ui/primitives";
import { Mark, MiniTrack } from "./parts";

const SUBMITTED_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
const SUBMITTED_TIME = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Manila" });

/** The rankings a contribution counts toward, by name ("QS WUR", "THE Impact"), each once. */
const headsOf = (mapped: string[]) => [...new Set(mapped.map((m) => m.split(" · ")[0]))];

export const rowId = (id: string) => `cv-row-${id}`;
export const openId = (id: string) => `cv-open-${id}`;

/**
 * Every submitted contribution as a row: what it is, its unit, where it counts, when it came in and where it
 * stands. Anywhere on a row opens the record; `current` marks the one last opened.
 */
export function SubmissionsTable({
  rows,
  unitOf,
  current,
  onOpen,
}: {
  rows: EvidenceItem[];
  unitOf: (e: EvidenceItem) => HubUnit | undefined;
  current?: string;
  onOpen: (id: string) => void;
}) {
  const ref = useReference();
  const familyOf = (head: string) => ref.rankings.find((r) => r.short === head)?.family;
  const rowClick = (e: MouseEvent, id: string) => {
    if (e.button !== 0 || (e.target as Element).closest("a, button, input, label")) return;
    if (window.getSelection()?.toString()) return;
    onOpen(id);
  };

  return (
    <Tile id="cv-table-h" className="cv-ttile">
      <h2 id="cv-table-h" className="sr-only">
        Submissions
      </h2>
      <div className="table-wrap">
        <table className="table table--hover table--stack cv-table">
          <thead>
            <tr>
              <th>Contribution</th>
              <th>Counts toward</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const heads = headsOf(i.mappedTo);
              return (
                <tr key={i.id} id={rowId(i.id)} className={cx("cv-row", current === i.id && "is-current")} onClick={(e) => rowClick(e, i.id)}>
                  <td>
                    <div className="cv-cell">
                      <Mark unit={unitOf(i)} name={i.unit} />
                      <div className="cv-cell__text">
                        <button type="button" id={openId(i.id)} className="cv-row__open" onClick={() => onOpen(i.id)}>
                          {i.title}
                        </button>
                        <span className="table__sub">{i.unit}</span>
                      </div>
                    </div>
                  </td>
                  <td data-label="Counts toward">
                    {heads.length ? (
                      <span className="cv-tchips">
                        {heads.slice(0, 2).map((h) => {
                          const family = familyOf(h);
                          return (
                            <span key={h} className="cv-tchip">
                              {family && <Swatch family={family} />}
                              {h}
                            </span>
                          );
                        })}
                        {heads.length > 2 && (
                          <span className="cv-tchip cv-tchip--more" title={heads.slice(2).join(", ")}>
                            +{heads.length - 2}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td data-label="Submitted" className="nowrap">
                    <time dateTime={i.submittedAt ?? i.submitted}>
                      {i.submittedAt ? SUBMITTED_DATE.format(new Date(i.submittedAt)) : formatDate(i.submitted, { day: "numeric", month: "short", year: "numeric" })}
                      <span className="table__sub">
                        {i.submittedAt ? `${SUBMITTED_TIME.format(new Date(i.submittedAt))} PHT` : "Time not recorded"}
                      </span>
                    </time>
                  </td>
                  <td data-label="Status">
                    <span className="cv-tstatus">
                      <Status status={i.status} />
                      <MiniTrack stage={i.stage} status={i.status} />
                    </span>
                  </td>
                  <td className="r cv-row__end">
                    <Icon name="chevron" size={16} className="cv-row__go" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tile>
  );
}
