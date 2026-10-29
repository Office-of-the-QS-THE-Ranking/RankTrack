"use client";

/*
 * The Student Portal's Assignments (user, 2026-10-29): the surveys the Office, or the Student's own unit, published
 * to the Student Portal. Each is answered once from its own link while signed in, which marks it answered here;
 * one that closed before it was answered leaves the list. Cards lead with what's still to answer, soonest first.
 */
import { useMemo, useState } from "react";
import { FormArt } from "@/components/forms/art";
import { Icon } from "@/components/ui/Icon";
import { ShelfHero } from "@/components/workspace/ShelfHero";
import { dayLabel, plural, stampLabel } from "@/lib/forms/format";
import { formPath } from "@/lib/forms/kinds";
import type { Assignment } from "@/lib/governance/hub-types";

type Show = "todo" | "done";

/** Days from today (Manila) to a closing day; negative once it's past. */
const daysTo = (day: string) => Math.round((Date.parse(`${day}T00:00:00+08:00`) - Date.now()) / 86_400_000);

export function Assignments({ items }: { items: Assignment[] }) {
  const [show, setShow] = useState<Show | null>(null);
  const todo = useMemo(
    () => items.filter((a) => !a.answered && a.open).sort((a, b) => (a.closesOn ?? "9999").localeCompare(b.closesOn ?? "9999") || a.title.localeCompare(b.title)),
    [items],
  );
  const done = useMemo(() => items.filter((a) => a.answered).sort((a, b) => b.answered!.at.localeCompare(a.answered!.at)), [items]);
  const shown = show === "todo" ? todo : show === "done" ? done : [...todo, ...done];

  return (
    <div className="ws fm-shelf st-desk">
      <ShelfHero
        title="Assignments"
        chips={[
          { key: "todo", label: "To answer", count: todo.length },
          { key: "done", label: "Answered", count: done.length },
        ].filter((c) => c.count)}
        total={items.length}
        picked={show}
        onPick={(k) => setShow(k as Show | null)}
        filterLabel="Filter assignments"
        art={(["survey", "survey", "evaluation"] as const).map((k, i) => (
          <FormArt key={i} kind={k} />
        ))}
      />

      {!items.length ? (
        <div className="ws-empty">
          <span className="ws-empty__art">
            <FormArt kind="survey" size="lg" />
          </span>
          <p className="ws-empty__title">No assignments right now</p>
        </div>
      ) : (
        <ul className="st-tasks">
          {shown.map((a) => {
            const days = a.closesOn ? daysTo(a.closesOn) : null;
            const soon = days !== null && days <= 3 && !a.answered;
            return (
              <li key={a.id} className="st-task" data-done={a.answered ? "" : undefined}>
                <span className="st-task__art">
                  <FormArt kind="survey" size="sm" />
                </span>
                <div className="st-task__text">
                  <p className="st-task__from">{a.from}</p>
                  <h2 className="st-task__title">{a.title}</h2>
                  {a.description && <p className="st-task__lead">{a.description}</p>}
                  <p className="st-task__meta">
                    <span>{plural(a.questions, "question")}</span>
                    {a.closesOn && !a.answered && (
                      <span className={soon ? "st-task__due is-soon" : "st-task__due"}>
                        <Icon name="calendar" size={13} />
                        {days === 0 ? "Closes today" : days === 1 ? "Closes tomorrow" : `Until ${dayLabel(a.closesOn)}`}
                      </span>
                    )}
                  </p>
                </div>
                <div className="st-task__end">
                  {a.answered ? (
                    <span className="st-task__done">
                      <Icon name="check-circle" size={16} />
                      <span>
                        <b>Answered</b>
                        <small>
                          {a.answered.ref} · {stampLabel(a.answered.at)}
                        </small>
                      </span>
                    </span>
                  ) : (
                    <a className="btn btn--dark btn--sm" href={formPath(a.code)} target="_blank" rel="noopener noreferrer">
                      Answer <Icon name="arrow-up-right" size={14} />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
