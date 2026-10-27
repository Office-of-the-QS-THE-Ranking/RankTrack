"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { checkDeadlinesNow } from "@/app/actions/deadlines";
import { formatDate, type Ranking } from "@/lib/data";
import { DEADLINE_LABEL } from "@/lib/governance/deadline-read";
import type { DeadlineDesk } from "@/lib/governance/hub-types";
import type { DeadlineFinding } from "@/lib/governance/types";
import { useGovern, useHub } from "@/components/hub/HubProvider";
import { Icon } from "@/components/ui/Icon";
import { Drawer } from "@/components/ui/interactive";
import { DateField } from "@/components/ui/pickers";
import { cx } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";

type Row = { key: string; id?: string; label: string; due: string };

const long = (iso: string) => formatDate(iso, { day: "numeric", month: "short", year: "numeric" });

/** "just now", "3 h ago", "2 d ago", then the date. */
function since(iso?: string) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  if (m < 14 * 24 * 60) return `${Math.round(m / 1440)} d ago`;
  return long(iso.slice(0, 10));
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * A ranking's dates, for people who may change them: what the deadline check read from the ranking body's
 * website and is waiting, the deadline itself, and the other dates in its calendar. Opens from the Submission
 * due row, or by itself when the page is opened at #deadlines (the bell's links).
 */
export function DeadlineControl({ ranking }: { ranking: Ranking }) {
  const desk = useHub()?.deadlineDesk;
  const formId = useId();
  const { pending } = useGovern();
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (desk && location.hash === "#deadlines") setOpen(true);
  }, [desk]);
  if (!desk) return null;
  const waiting = desk.findings.filter((f) => f.slug === ranking.slug).length;
  return (
    <>
      <button
        type="button"
        className={cx("dl-edit", waiting > 0 && "has-news")}
        onClick={() => setOpen(true)}
        aria-label={waiting ? `Change dates: ${waiting} new ${waiting === 1 ? "date" : "dates"} found` : "Change dates"}
        title={waiting ? `${waiting} new ${waiting === 1 ? "date" : "dates"} found` : "Change dates"}
      >
        <Icon name="pen" size={15} />
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={ranking.short}
        title="Dates"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form={formId} className="btn btn--dark" disabled={pending || !dirty}>
              Save
            </button>
          </>
        }
      >
        <DeadlineForm formId={formId} ranking={ranking} desk={desk} onDirty={setDirty} onDone={() => setOpen(false)} />
      </Drawer>
    </>
  );
}

function DeadlineForm({ formId, ranking, desk, onDirty, onDone }: { formId: string; ranking: Ranking; desk: DeadlineDesk; onDirty: (dirty: boolean) => void; onDone: () => void }) {
  const router = useRouter();
  const { run, pending } = useGovern();
  const [checking, startCheck] = useTransition();
  const findings = desk.findings.filter((f) => f.slug === ranking.slug);
  const origin = desk.origin[ranking.slug];
  const source = desk.sources.find((s) => s.slugs.includes(ranking.slug));
  const saved = useMemo(() => desk.entries.filter((e) => e.slug === ranking.slug), [desk.entries, ranking.slug]);

  const initial = useMemo(() => ({ deadline: ranking.deadline, rows: saved.map((e) => ({ key: e.id, id: e.id, label: e.label, due: e.due })) }), [ranking.deadline, saved]);
  const [deadline, setDeadline] = useState(initial.deadline);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [dirty, setDirtyState] = useState(false);
  const setDirty = (v: boolean) => {
    setDirtyState(v);
    onDirty(v);
  };
  // A date applied from the check, or saved elsewhere, shows here unless the form is being edited.
  useEffect(() => {
    if (dirty) return;
    setDeadline(initial.deadline);
    setRows(initial.rows);
  }, [initial, dirty]);

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };
  const setRow = (key: string, patch: Partial<Row>) => edit(setRows)(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const decide = async (f: DeadlineFinding, apply: boolean) => {
    const r = await run({ type: apply ? "deadline.apply" : "deadline.dismiss", id: f.id });
    toast(r.message, r.ok ? "ok" : "error");
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run({
      type: "deadline.set",
      slug: ranking.slug,
      deadline: deadline !== ranking.deadline ? deadline : undefined,
      entries: rows.map((x) => ({ id: x.id, label: x.label, due: x.due })),
    });
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok) {
      setDirty(false);
      onDone();
    }
  };

  const check = () =>
    startCheck(async () => {
      const r = await checkDeadlinesNow();
      toast(r.message, r.ok ? "ok" : "error");
      if (r.ok) router.refresh();
    });

  return (
    <form id={formId} className="dl" onSubmit={save}>
      {source && (
        <section className={cx("dl-source", source.status && `is-${source.status.toLowerCase()}`)} aria-label="Where the dates come from">
          <span className="dl-source__dot" aria-hidden="true" />
          <span className="dl-source__text">
            <a href={source.page} target="_blank" rel="noopener noreferrer">
              {source.name}
              <Icon name="external" size={12} />
            </a>
            <small>
              {source.kind === "manual" ? source.note : `${source.status === "Failed" ? source.note : source.status === "Waiting" ? "Not published yet" : "Read daily"} · checked ${since(source.checkedAt)}`}
            </small>
          </span>
          {source.kind !== "manual" && (
            <button type="button" className="btn btn--sm" disabled={checking} onClick={check}>
              <Icon name="refresh" size={14} className={cx(checking && "dl-spin")} /> {checking ? "Checking…" : "Check now"}
            </button>
          )}
        </section>
      )}

      {findings.length > 0 && (
        <section className="dl-sec" aria-labelledby={`${formId}-found`}>
          <h3 id={`${formId}-found`} className="dl-sec__title">
            <span className="dl-pulse" aria-hidden="true" />
            Found on the web
          </h3>
          <ul className="dl-finds">
            {findings.map((f) => {
              const now = f.target === "deadline" ? ranking.deadline : saved.find((e) => e.label === f.label)?.due;
              return (
                <li key={f.id} className="dl-find">
                  <div className="dl-find__dates">
                    <span className="dl-find__new">
                      <small>New</small>
                      <b>{long(f.due)}</b>
                    </span>
                    {now && (
                      <span className="dl-find__old">
                        <small>Now</small>
                        <s>{long(now)}</s>
                      </span>
                    )}
                  </div>
                  <p className="dl-find__label">{f.label}</p>
                  {f.quote && <blockquote className="dl-find__quote">{f.quote}</blockquote>}
                  <div className="dl-find__foot">
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="dl-find__src">
                      {host(f.url)}
                      <Icon name="external" size={12} />
                    </a>
                    <span className="dl-find__when">{since(f.foundAt)}</span>
                    <span className="dl-find__acts">
                      <button type="button" className="btn btn--sm" disabled={pending} onClick={() => void decide(f, false)}>
                        Dismiss
                      </button>
                      <button type="button" className="btn btn--sm btn--dark" disabled={pending} onClick={() => void decide(f, true)}>
                        Apply
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="dl-sec" aria-labelledby={`${formId}-deadline`}>
        <h3 id={`${formId}-deadline`} className="dl-sec__title">
          Deadline
        </h3>
        <div className="dl-deadline">
          <DateField className="input" value={deadline} required aria-label={`${ranking.short} deadline`} onChange={edit(setDeadline)} />
          <p className="dl-origin">
            {origin?.deadlineSource === "Automatic" && origin.deadlineUrl ? (
              <>
                <Icon name="globe" size={13} />
                From {host(origin.deadlineUrl)}
                {origin.deadlineAt && ` · ${since(origin.deadlineAt)}`}
              </>
            ) : origin?.deadlineSource === "Manual" ? (
              <>
                <Icon name="pen" size={13} />
                Set by {origin.deadlineBy ?? "the Office"}
                {origin.deadlineAt && ` · ${since(origin.deadlineAt)}`}
              </>
            ) : (
              <>
                <Icon name="clock" size={13} />
                Default, not confirmed
              </>
            )}
          </p>
        </div>
      </section>

      <section className="dl-sec" aria-labelledby={`${formId}-other`}>
        <h3 id={`${formId}-other`} className="dl-sec__title">
          Other dates {rows.length > 0 && <span className="count">{rows.length}</span>}
        </h3>
        {rows.length > 0 && (
          <ul className="dl-rows">
            {rows.map((r) => (
              <li key={r.key} className="dl-row">
                <input
                  className="input"
                  value={r.label}
                  required
                  maxLength={120}
                  placeholder="Survey contacts close"
                  aria-label="What closes"
                  onChange={(e) => {
                    e.currentTarget.setCustomValidity(e.target.value.trim().toLowerCase() === DEADLINE_LABEL.toLowerCase() ? "The deadline has its own field above." : "");
                    setRow(r.key, { label: e.target.value });
                  }}
                />
                <DateField className="input" value={r.due} required aria-label={`Date for ${r.label || "this item"}`} onChange={(v) => setRow(r.key, { due: v })} />
                <button type="button" className="dl-x" aria-label={`Remove ${r.label || "this date"}`} title="Remove" onClick={() => edit(setRows)(rows.filter((x) => x.key !== r.key))}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="dl-add"
          disabled={rows.length >= 20}
          onClick={() => edit(setRows)([...rows, { key: `new-${Date.now()}`, label: "", due: "" }])}
        >
          <Icon name="plus" size={14} strokeWidth={2.4} /> Add a date
        </button>
      </section>

    </form>
  );
}
