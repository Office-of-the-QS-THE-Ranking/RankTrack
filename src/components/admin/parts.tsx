"use client";

/*
 * Pieces shared by Account Management and Roles & Permissions: the unit picker, the scope editor and
 * the permission matrix.
 */
import { Fragment, useMemo, useState } from "react";
import { ACTIONS, MODULES } from "@/lib/governance/catalog";
import type { UnitRow } from "@/lib/governance/console-types";
import { has, unitPath } from "@/lib/governance/rbac";
import type { Action, BodyKey, ModuleKey, OrgUnit, PermissionSet, Scope } from "@/lib/governance/types";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Disclosure, Hint, plural, useConsole } from "./ui";
import { Select } from "@/components/ui/pickers";

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
  }, [data.units, filter]);
}

export function UnitSelect({ value, onChange, filter, placeholder = "Choose a unit", label, id, required }: { value: string; onChange: (id: string) => void; filter?: (u: UnitRow) => boolean; placeholder?: string; label: string; id?: string; required?: boolean }) {
  const tree = useUnitTree(filter);
  return (
    <Select id={id} className="select" value={value} onChange={onChange} aria-label={label} required={required}>
      <option value="">{placeholder}</option>
      {tree.map(({ unit, depth }) => (
        <option key={unit.id} value={unit.id} disabled={unit.status !== "Active"} data-depth={depth}>
          {unit.name}
          {unit.status !== "Active" ? " (archived)" : ""}
        </option>
      ))}
    </Select>
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

export type CellState = "granted" | "wide" | "none" | "added" | "removed";

const ACTION_ICON: Record<Action, IconName> = { view: "eye", create: "plus", edit: "pen", delete: "trash", submit: "send", approve: "check-circle", export: "download", manage: "sliders" };

const LEGEND: Record<CellState, string> = { granted: "Granted", wide: "University-wide only", none: "Not granted", added: "Adding", removed: "Removing" };

/**
 * Modules down the side, actions across the top; a blank cell is an action the module doesn't have. A preview
 * marks what a change adds and removes; a role marks what only its University-wide holders get as `wide`.
 * With `fold`, a group with nothing granted shows as one line until opened.
 */
export function PermissionMatrix({ cell, caption, labels, fold = false }: { cell: (m: ModuleKey, a: Action) => CellState; caption: string; labels?: Partial<Record<CellState, string>>; fold?: boolean }) {
  const [hot, setHot] = useState<number | null>(null);
  const [opened, setOpened] = useState<string[]>([]);
  const groups = [...new Set(MODULES.map((m) => m.group))];
  const states = new Set(MODULES.flatMap((m) => m.actions.map((a) => cell(m.key, a))));
  const legend = { ...LEGEND, ...labels };
  const held = (st: CellState) => st !== "none" && st !== "removed";
  return (
    <div className="adm-matrix-wrap" onPointerLeave={() => setHot(null)}>
      <div className="adm-matrix-scroll">
        <table
          className="adm-matrix"
          onPointerOver={(e) => {
            const c = (e.target as Element).closest<HTMLTableCellElement>("td, th");
            setHot(c && c.colSpan === 1 && c.cellIndex > 0 ? c.cellIndex : null);
          }}
        >
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            <col />
            {ACTIONS.map((a, i) => (
              <col key={a.key} className={hot === i + 1 ? "is-hot" : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Module</th>
              {ACTIONS.map((a, i) => (
                <th key={a.key} scope="col" className={hot === i + 1 ? "is-hot" : undefined} data-tip={a.hint}>
                  <span className="adm-matrix__act">
                    <Icon name={ACTION_ICON[a.key]} size={15} />
                    {a.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const mods = MODULES.filter((m) => m.group === g);
              const total = mods.reduce((n, m) => n + m.actions.length, 0);
              const count = mods.reduce((n, m) => n + m.actions.filter((a) => held(cell(m.key, a))).length, 0);
              const changed = mods.some((m) => m.actions.some((a) => cell(m.key, a) === "removed"));
              const folded = fold && !count && !changed && !opened.includes(g);
              return (
                <Fragment key={g}>
                  <tr className="adm-matrix__group">
                    <th colSpan={ACTIONS.length + 1} scope="colgroup">
                      <span className="adm-matrix__group-in">
                        <span className="adm-matrix__group-name">{g}</span>
                        <span className="adm-matrix__group-count num">
                          <b>{count}</b> of {total}
                        </span>
                        {fold && !count && !changed && (
                          <button type="button" className="adm-matrix__fold" aria-expanded={!folded} onClick={() => setOpened((o) => (folded ? [...o, g] : o.filter((x) => x !== g)))}>
                            {folded ? `Show ${plural(mods.length, "module")}` : "Hide"}
                            <Icon name="chevron-down" size={14} />
                          </button>
                        )}
                      </span>
                    </th>
                  </tr>
                  {!folded &&
                    mods.map((m) => (
                      <tr key={m.key} className={m.actions.some((a) => cell(m.key, a) !== "none") ? undefined : "is-empty"}>
                        <th scope="row">{m.label}</th>
                        {ACTIONS.map((a) => {
                          if (!m.actions.includes(a.key)) return <td key={a.key} className="adm-matrix__na" aria-label="Not applicable" />;
                          const st = cell(m.key, a.key);
                          return (
                            <td key={a.key} className={`adm-matrix__cell is-${st}`}>
                              <span role="img" aria-label={`${m.label}: ${a.label} — ${legend[st].toLowerCase()}`}>
                                <CellMark st={st} />
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="adm-matrix__legend" aria-hidden="true">
        {(["granted", "wide", "added", "removed", "none"] as const)
          .filter((st) => st === "granted" || states.has(st))
          .map((st) => (
            <span key={st}>
              <CellMark st={st} /> {legend[st]}
            </span>
          ))}
      </p>
    </div>
  );
}

export function CellMark({ st }: { st: CellState }) {
  if (st === "none") return <span className="adm-mark adm-mark--none" />;
  if (st === "removed") return <span className="adm-mark adm-mark--removed"><Icon name="minus" size={12} strokeWidth={2.6} /></span>;
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
