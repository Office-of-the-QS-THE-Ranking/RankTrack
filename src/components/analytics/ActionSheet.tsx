"use client";

/*
 * Adding or changing an action item, wherever the plan is shown: the Scorecard's Action items and a ranking's Action
 * plan tab. Saving goes through the same action either way, so there is one plan.
 */
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { Sheet } from "@/components/workspace/parts";
import { deleteAction, saveAction } from "@/app/actions/analytics";
import type { RankingAction, UnitRef } from "@/lib/analytics/desk-types";
import { PLAN_STATUSES, type PlanState } from "@/lib/analytics/types";
import { useRun } from "./parts";

export type ActionDraft = { id?: string; edition: string; code: string; action: string; owner: string; due: string; status: PlanState; progress: number; note: string };

export const newAction = (edition: string): ActionDraft => ({ edition, code: "", action: "", owner: "", due: "", status: "Not started", progress: 0, note: "" });

export const draftOf = (a: RankingAction): ActionDraft => ({ id: a.id, edition: a.edition, code: a.code ?? "", action: a.action, owner: a.owner ?? "", due: a.due ?? "", status: a.status, progress: a.progress, note: a.note });

export function ActionSheet({ draft, editions, units, onClose }: { draft: ActionDraft; editions: { id: string; label: string }[]; units: UnitRef[]; onClose: () => void }) {
  const { run, pending } = useRun();
  const [editing, setEditing] = useState(draft);
  return (
    <Sheet title={editing.id ? "Action item" : "New action item"} onClose={onClose}>
      {(close) => (
        <form
          className="ws-sheet__body"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const r = await run(() => saveAction({ ...editing, code: editing.code || undefined, owner: editing.owner || undefined, due: editing.due || undefined }));
            if (r.ok) close();
          }}
        >
          <label className="an-field">
            <span>What will be done</span>
            <input className="input" required maxLength={300} value={editing.action} onChange={(e) => setEditing({ ...editing, action: e.target.value })} />
          </label>
          <div className="an-row2">
            <label className="an-field">
              <span>Edition</span>
              <Select className="select" value={editing.edition} onChange={(v) => setEditing({ ...editing, edition: v })}>
                {editions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="an-field">
              <span>Owner</span>
              <Select className="select" value={editing.owner} onChange={(v) => setEditing({ ...editing, owner: v })} searchable placeholder="No unit">
                <option value="">No unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="an-row2">
            <label className="an-field">
              <span>Due</span>
              <DateField value={editing.due} onChange={(d) => setEditing({ ...editing, due: d })} />
            </label>
            <label className="an-field">
              <span>Status</span>
              <Select className="select" value={editing.status} onChange={(v) => setEditing({ ...editing, status: v as PlanState })}>
                {PLAN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="an-field">
            <span>Progress</span>
            <NumberField value={editing.progress} onChange={(n) => setEditing({ ...editing, progress: Number.isFinite(n) ? n : 0 })} min={0} max={100} step={5} suffix="%" aria-label="Progress" />
          </label>
          <label className="an-field">
            <span>Note</span>
            <textarea className="textarea" rows={3} maxLength={2000} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
          </label>
          <footer className="ws-sheet__foot">
            {editing.id && (
              <button
                type="button"
                className="btn btn--ghost an-left"
                disabled={pending}
                onClick={async () => {
                  const r = await run(() => deleteAction({ id: editing.id! }));
                  if (r.ok) close();
                }}
              >
                <Icon name="trash" size={15} /> Remove
              </button>
            )}
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn--dark" disabled={pending}>
              Save
            </button>
          </footer>
        </form>
      )}
    </Sheet>
  );
}
