"use client";

/*
 * Pieces shared by Account Management and Roles & Permissions: the unit picker, the scope editor and
 * the permission matrix.
 */
import { Fragment, useMemo } from "react";
import { ACTIONS, MODULES } from "@/lib/governance/catalog";
import type { UnitRow } from "@/lib/governance/console-types";
import { has, unitPath } from "@/lib/governance/rbac";
import type { Action, BodyKey, ModuleKey, OrgUnit, PermissionSet, Scope } from "@/lib/governance/types";
import { Icon } from "@/components/ui/Icon";
import { Disclosure, Hint, plural, useConsole } from "./ui";

/** Where a unit sits, without the unit itself or the University root: "Faculty of Engineering › Department of Civil Engineering". */
export const parentPath = (units: OrgUnit[], id: string) => unitPath(units, id).split(" › ").slice(0, -1).join(" › ");

/** Units in tree order with their depth, for indented pickers. */
export function useUnitTree(filter: (u: UnitRow) => boolean = () => true) {
  const { data } = useConsole();
  return useMemo(() => {
    const out: { unit: UnitRow; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      data.units
        .filter((u) => u.parentId === parent)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((u) => {
          if (filter(u)) out.push({ unit: u, depth });
          walk(u.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.units]);
}

export function UnitSelect({ value, onChange, filter, placeholder = "Choose a unit", label, id }: { value: string; onChange: (id: string) => void; filter?: (u: UnitRow) => boolean; placeholder?: string; label: string; id?: string }) {
  const tree = useUnitTree(filter);
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{placeholder}</option>
      {tree.map(({ unit, depth }) => (
        <option key={unit.id} value={unit.id} disabled={unit.status !== "Active"}>
          {" ".repeat(depth)}
          {unit.name}
          {unit.status !== "Active" ? " (archived)" : ""}
        </option>
      ))}
    </select>
  );
}

const BODIES: BodyKey[] = ["THE", "QS", "UI", "WURI"];

/**
 * Organizational scope: which units an assignment reaches, plus optional limits by ranking body,
 * reporting cycle and dataset (folded away until needed).
 */
export function ScopeEditor({ value, onChange, allowUniversity, unitFilter }: { value: Scope; onChange: (s: Scope) => void; allowUniversity: boolean; unitFilter: (u: UnitRow) => boolean }) {
  const { data } = useConsole();
  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? id;
  const toggle = <T extends string>(list: "all" | T[], item: T): "all" | T[] => {
    const cur = list === "all" ? [] : list;
    return cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
  };
  const limits = [
    value.rankingBodies !== "all" && (value.rankingBodies.length ? value.rankingBodies.map((b) => (b === "UI" ? "GreenMetric" : b)).join(", ") : "No rankings"),
    value.years !== "all" && (value.years.length ? value.years.join(", ") : "No cycles"),
    value.datasets !== "all" && plural(value.datasets.length, "dataset"),
  ].filter(Boolean) as string[];
  return (
    <div className="adm-scope">
      <fieldset className="adm-scope__row">
        <legend>
          Units <Hint text="A unit includes everything beneath it." />
        </legend>
        {allowUniversity && (
          <label className="choice choice--inline">
            <input type="checkbox" checked={value.units === "all"} onChange={(e) => onChange({ ...value, units: e.target.checked ? "all" : [] })} />
            University-wide
          </label>
        )}
        {value.units !== "all" && (
          <>
            <div className="adm-chips">
              {value.units.map((u) => (
                <span key={u} className="adm-chip">
                  {unitName(u)}
                  <button type="button" aria-label={`Remove ${unitName(u)}`} onClick={() => onChange({ ...value, units: (value.units as string[]).filter((x) => x !== u) })}>
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
            </div>
            <UnitSelect
              label="Add a unit"
              value=""
              placeholder="Add a unit"
              filter={(u) => unitFilter(u) && !(value.units as string[]).includes(u.id)}
              onChange={(id) => id && onChange({ ...value, units: [...(value.units as string[]), id] })}
            />
          </>
        )}
      </fieldset>
      <Disclosure title="More limits" meta={limits.join(" · ") || "None"} open={limits.length > 0}>
        <fieldset className="adm-scope__row">
          <legend>Rankings</legend>
          <label className="choice choice--inline">
            <input type="checkbox" checked={value.rankingBodies === "all"} onChange={(e) => onChange({ ...value, rankingBodies: e.target.checked ? "all" : [] })} />
            All
          </label>
          {value.rankingBodies !== "all" &&
            BODIES.map((b) => (
              <label key={b} className="choice choice--inline">
                <input type="checkbox" checked={(value.rankingBodies as BodyKey[]).includes(b)} onChange={() => onChange({ ...value, rankingBodies: toggle(value.rankingBodies, b) })} />
                {b === "UI" ? "UI GreenMetric" : b}
              </label>
            ))}
        </fieldset>
        <fieldset className="adm-scope__row">
          <legend>Cycles</legend>
          <label className="choice choice--inline">
            <input type="checkbox" checked={value.years === "all"} onChange={(e) => onChange({ ...value, years: e.target.checked ? "all" : [] })} />
            All
          </label>
          {value.years !== "all" &&
            data.catalog.cycles.map((c) => (
              <label key={c} className="choice choice--inline">
                <input type="checkbox" checked={(value.years as string[]).includes(c)} onChange={() => onChange({ ...value, years: toggle(value.years, c) })} />
                {c}
              </label>
            ))}
        </fieldset>
        <fieldset className="adm-scope__row">
          <legend>Datasets</legend>
          <label className="choice choice--inline">
            <input type="checkbox" checked={value.datasets === "all"} onChange={(e) => onChange({ ...value, datasets: e.target.checked ? "all" : [] })} />
            All
          </label>
          {value.datasets !== "all" && (
            <div className="adm-scope__sets">
              {data.catalog.datasets.map((d) => (
                <label key={d.id} className="choice choice--inline">
                  <input type="checkbox" checked={(value.datasets as string[]).includes(d.id)} onChange={() => onChange({ ...value, datasets: toggle(value.datasets, d.id) })} />
                  {d.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </Disclosure>
    </div>
  );
}

export type CellState = "granted" | "inherited" | "excepted" | "none" | "added" | "removed";

/**
 * Modules down the side, actions across the top. Cells show where each permission comes from:
 * granted by the role, inherited from its parent, taken away by an exception, or changed by an edit.
 */
export function PermissionMatrix({
  cell,
  onToggle,
  locked,
  caption,
}: {
  cell: (m: ModuleKey, a: Action) => CellState;
  onToggle?: (m: ModuleKey, a: Action) => void;
  locked?: (m: ModuleKey, a: Action) => string | null;
  caption: string;
}) {
  const groups = [...new Set(MODULES.map((m) => m.group))];
  return (
    <div className="adm-matrix-wrap">
      <table className="adm-matrix">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Module</th>
            {ACTIONS.map((a) => (
              <th key={a.key} scope="col" title={a.hint}>
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g}>
              <tr className="adm-matrix__group">
                <th colSpan={ACTIONS.length + 1} scope="colgroup">
                  {g}
                </th>
              </tr>
              {MODULES.filter((m) => m.group === g).map((m) => (
                <tr key={m.key}>
                  <th scope="row">{m.label}</th>
                  {ACTIONS.map((a) => {
                    if (!m.actions.includes(a.key)) return <td key={a.key} className="adm-matrix__na" aria-label="Not applicable" />;
                    const st = cell(m.key, a.key);
                    const lock = locked?.(m.key, a.key) ?? null;
                    const on = st === "granted" || st === "inherited" || st === "added";
                    const label = `${m.label}: ${a.label} — ${st === "inherited" ? "inherited" : st === "excepted" ? "removed by exception" : st === "added" ? "added" : st === "removed" ? "removed" : on ? "granted" : "not granted"}`;
                    return (
                      <td key={a.key} className={`adm-matrix__cell is-${st}`}>
                        {onToggle ? (
                          <button type="button" aria-pressed={on} aria-label={label} title={lock ?? undefined} disabled={!!lock} onClick={() => onToggle(m.key, a.key)}>
                            <CellMark st={st} />
                          </button>
                        ) : (
                          <span role="img" aria-label={label}>
                            <CellMark st={st} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="adm-matrix__legend" aria-hidden="true">
        <span><CellMark st="granted" /> Granted</span>
        <span><CellMark st="inherited" /> Inherited</span>
        <span><CellMark st="excepted" /> Exception</span>
        {onToggle && (
          <>
            <span><CellMark st="added" /> Adding</span>
            <span><CellMark st="removed" /> Removing</span>
          </>
        )}
      </p>
    </div>
  );
}

function CellMark({ st }: { st: CellState }) {
  if (st === "none") return <span className="adm-mark adm-mark--none" />;
  if (st === "excepted" || st === "removed") return <span className={`adm-mark adm-mark--${st}`}><Icon name="minus" size={12} strokeWidth={2.6} /></span>;
  return (
    <span className={`adm-mark adm-mark--${st}`}>
      <Icon name={st === "added" ? "plus" : "check"} size={12} strokeWidth={2.6} />
    </span>
  );
}

/** Compare two permission sets cell by cell. */
export function diffCell(before: PermissionSet, after: PermissionSet) {
  return (m: ModuleKey, a: Action): CellState => {
    const b = has(before, m, a);
    const n = has(after, m, a);
    if (n && !b) return "added";
    if (b && !n) return "removed";
    return n ? "granted" : "none";
  };
}
