"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type CSSProperties } from "react";
import { formatDate, type EvidenceStatus } from "@/lib/data";
import { bodyOfMapping } from "@/lib/governance/catalog";
import type { BodyKey } from "@/lib/governance/types";
import { useCan, useGovern, useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, Notice, SdgList, Status } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { StageTrack } from "./StageTrack";
import { useViews } from "@/components/reference/ReferenceProvider";

type Filter = "All" | EvidenceStatus;
const FILTERS: Filter[] = ["For review", "Needs revision", "Validated", "All"];

/* Rankings that commonly accept the same kind of evidence, by SDG. */
const SUGGEST: Record<number, string[]> = {
  3: ["THE Impact · SDG 3", "QS Sustainability · Social Impact", "WURI · Social Responsibility"],
  4: ["THE Impact · SDG 4", "QS Sustainability · Social Impact"],
  6: ["UI GreenMetric · Water", "QS Sustainability · Environmental Impact", "THE Impact · SDG 6"],
  7: ["UI GreenMetric · Energy and Climate Change", "THE Impact · SDG 7"],
  9: ["THE WUR · Industry", "WURI · Industrial Application"],
  10: ["THE Impact · SDG 10", "QS Sustainability · Social Impact"],
  11: ["THE Impact · SDG 11", "WURI · Social Responsibility"],
  13: ["THE Impact · SDG 13", "QS Sustainability · Environmental Impact"],
  17: ["THE Impact · SDG 17", "QS WUR · International Research Network", "THE WUR · International Outlook"],
};

const bodiesOf = (mapped: string[]) => [...new Set(mapped.map(bodyOfMapping).filter((b): b is BodyKey => !!b))];

/**
 * The validation queue. Items come from the governance store, limited to the units the reviewer may
 * see; accepting, returning and remapping go to the server, which checks the reviewer's role and their
 * ranking-body scope, refuses self-review, notifies the unit and writes the decision to the audit log.
 */
export function ValidationQueue() {
  const { evidenceLevels } = useViews();
  const params = useSearchParams();
  const hub = useHub();
  const viewer = useViewer();
  const can = useCan();
  const rankings = useRankings();
  const { run, pending } = useGovern();
  const tracked = useMemo(() => new Set(rankings.map((r) => r.short)), [rankings]);
  const items = hub?.evidence ?? [];
  const initialItem = params.get("item");
  const initialStatus = params.get("status") as Filter | null;
  const [filter, setFilter] = useState<Filter>(() => {
    if (initialStatus && FILTERS.includes(initialStatus)) return initialStatus;
    const hit = items.find((e) => e.id === initialItem);
    return hit ? hit.status : "For review";
  });
  const [selId, setSelId] = useState<string>(initialItem ?? "EV-2057");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, items.filter((i) => f === "All" || i.status === f).length])) as Record<Filter, number>,
    [items],
  );
  const shown = items.filter((i) => filter === "All" || i.status === filter);
  const sel = shown.find((i) => i.id === selId) ?? shown[0];
  const target = sel ? { unitId: (sel as typeof sel & { programId?: string }).programId ?? sel.unitSlug, bodies: bodiesOf(sel.mappedTo) } : {};
  const mayReview = !!sel && can("evidence", "approve", target);
  const own = !!sel && !!viewer && (sel.submittedById ? sel.submittedById === viewer.id : sel.submittedBy === viewer.name);
  const scopeBodies = viewer?.grants.filter((g) => g.perms.evidence?.includes("approve")).flatMap((g) => (g.bodies === "all" ? [] : g.bodies));
  const suggestions = useMemo(() => {
    if (!sel) return [];
    const all = new Set(sel.sdgs.flatMap((s) => SUGGEST[s] ?? []));
    return [...all].filter((s) => !sel.mappedTo.includes(s) && tracked.has(s.split(" · ")[0]));
  }, [sel, tracked]);

  const act = async (cmd: Parameters<typeof run>[0], after?: () => void) => {
    const r = await run(cmd);
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok) after?.();
  };
  const unit = sel ? hub?.units.find((u) => u.slug === sel.unitSlug) : undefined;

  return (
    <div className="queue-layout">
      <Card title="Validation queue" sub={`${counts["For review"]} waiting for review`} icon="list" className="queue-card">
        {!!scopeBodies?.length && !viewer?.grants.some((g) => g.perms.evidence?.includes("approve") && g.bodies === "all") && (
          <p className="small muted" style={{ marginBottom: 10 }}>
            You review evidence for {scopeBodies.map((b) => (b === "UI" ? "UI GreenMetric" : b)).join(", ")}.
          </p>
        )}
        <Segmented
          options={FILTERS.map((f) => ({ value: f, label: f, count: counts[f] }))}
          value={filter}
          onChange={setFilter}
          label="Filter by status"
          className="queue-filter"
        />
        {shown.length ? (
          <ul className="queue" aria-label={`${filter} submissions`}>
            {shown.map((i) => (
              <li key={i.id}>
                <button type="button" className="queue__item" aria-current={sel?.id === i.id ? "true" : undefined} onClick={() => setSelId(i.id)}>
                  <span className="queue__title">{i.title}</span>
                  <span className="queue__meta">
                    <span className="num">{i.id}</span> · {i.unit}
                  </span>
                  <span className="row row--between" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
                    <Status status={i.status} />
                    <span className="small muted">{formatDate(i.submitted)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="check-circle" title="Nothing waiting here">
            Every submission in this view has been handled.
          </Empty>
        )}
      </Card>

      {sel ? (
        <Card
          title={sel.title}
          sub={
            <>
              <span className="num">{sel.id}</span> · {sel.type} · submitted {formatDate(sel.submitted)} by {sel.submittedBy},{" "}
              {unit ? (
                <Link href={`/admin/units/${unit.slug}`} className="link small" style={{ display: "inline" }}>
                  {sel.unit}
                </Link>
              ) : (
                sel.unit
              )}
            </>
          }
          actions={<Status status={sel.status} />}
          className="review-card"
        >
          <StageTrack stage={sel.stage} status={sel.status} />

          {!mayReview && (
            <div className="mt-4">
              <Notice tone="plain" icon="lock">
                {can("evidence", "approve") ? "This item is outside the ranking bodies or units you review. You can read it; another reviewer decides it." : "Your role can read submissions but not validate them."}
              </Notice>
            </div>
          )}
          {mayReview && own && (
            <div className="mt-4">
              <Notice tone="warn">You submitted this item, so another reviewer must decide it.</Notice>
            </div>
          )}

          <dl className="kv mt-6">
            <dt>Reporting period</dt>
            <dd>{sel.period}</dd>
            <dt>Contribution</dt>
            <dd>{sel.summary || "—"}</dd>
            <dt>Measurable result</dt>
            <dd>
              <b style={{ fontWeight: 600 }}>{sel.result}</b>
            </dd>
            <dt>Beneficiaries</dt>
            <dd>{sel.beneficiaries}</dd>
            <dt>Evidence quality</dt>
            <dd>
              <span className="level">
                {evidenceLevels.map((l, k) => (
                  <i key={l} className={k < sel.level ? "is-on" : undefined} title={l} />
                ))}
                <span className="small">{evidenceLevels[sel.level - 1]}</span>
              </span>
            </dd>
            <dt>SDGs</dt>
            <dd>
              <SdgList sdgs={sel.sdgs} />
            </dd>
            <dt>Files</dt>
            <dd className="chips">
              {sel.files.map((f, i) => {
                const file = sel.attachments?.find((a) => a.name === f && !sel.files.slice(0, i).includes(f));
                return file ? (
                  <a key={file.src} className="chip chip--outline" href={file.src} download={file.name}>
                    <Icon name="paperclip" size={13} /> {f}
                  </a>
                ) : (
                  <span key={`${f}-${i}`} className="chip chip--outline">
                    <Icon name="paperclip" size={13} /> {f}
                  </span>
                );
              })}
            </dd>
          </dl>

          <section className="review-block" aria-labelledby="map-h">
            <h3 id="map-h">Mapped to indicators</h3>
            <p className="small muted">Uncheck to remove a mapping. The unit is credited in every ranking that keeps it.</p>
            <div className="choices mt-3">
              {sel.mappedTo.map((m) => (
                <label key={m} className="choice" title={tracked.has(m.split(" · ")[0]) ? undefined : "This ranking is not tracked at the moment"}>
                  <input type="checkbox" checked disabled={!mayReview || pending || own} onChange={() => void act({ type: "evidence.map", id: sel.id, remove: m })} />
                  {m}
                  {!tracked.has(m.split(" · ")[0]) && <span className="muted small"> (not tracked)</span>}
                </label>
              ))}
            </div>
            {mayReview && !own && suggestions.length > 0 && (
              <>
                <p className="small text-2 mt-4">
                  <b style={{ fontWeight: 600 }}>Also usable in</b>, based on its SDGs and data type:
                </p>
                <div className="choices mt-2">
                  {suggestions.map((m) => (
                    <label key={m} className="choice choice--suggest">
                      <input type="checkbox" checked={false} disabled={pending} onChange={() => void act({ type: "evidence.map", id: sel.id, add: m })} />
                      <Icon name="plus" size={14} /> {m}
                    </label>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="review-block" id="comments" aria-labelledby="cm-h">
            <h3 id="cm-h">Reviewer comments</h3>
            {sel.comments.length ? (
              <div className="stack mt-3" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
                {sel.comments.map((c) => (
                  <div key={c.date + c.text} className="comment">
                    <p className="comment__who">
                      {c.by}, {c.role} · {formatDate(c.date)}
                    </p>
                    <p style={{ whiteSpace: "pre-line" }}>{c.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted mt-2">No comments yet.</p>
            )}
            {mayReview && !own && (
              <>
                <label className="field mt-4">
                  <span className="field__label">
                    Comment to the unit <em>(required to request a revision)</em>
                  </span>
                  <textarea
                    className="textarea"
                    value={note}
                    aria-invalid={noteError || undefined}
                    aria-describedby={noteError ? "note-err" : undefined}
                    onChange={(e) => {
                      setNote(e.target.value);
                      if (e.target.value.trim()) setNoteError(false);
                    }}
                    placeholder="Be specific: which period, which figure, which document."
                  />
                  {noteError && (
                    <span className="field__error" id="note-err">
                      <Icon name="alert" size={14} /> Say what the unit should change before requesting a revision.
                    </span>
                  )}
                </label>
                <div className="btns-row mt-4">
                  <button
                    type="button"
                    className="btn btn--dark"
                    disabled={pending || sel.status === "Validated"}
                    onClick={() =>
                      void act({ type: "evidence.review", id: sel.id, decision: "accept", note }, () => {
                        setNote("");
                        setNoteError(false);
                      })
                    }
                  >
                    <Icon name="check" size={18} /> Accept and map
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={pending}
                    onClick={() => {
                      if (!note.trim()) {
                        setNoteError(true);
                        return;
                      }
                      void act({ type: "evidence.review", id: sel.id, decision: "revise", note }, () => {
                        setNote("");
                        setNoteError(false);
                      });
                    }}
                  >
                    <Icon name="comment" size={18} /> Request revision
                  </button>
                </div>
              </>
            )}
          </section>
        </Card>
      ) : (
        <Card>
          <Empty icon="evidence" title="Select a submission">
            Choose an item from the queue to review it.
          </Empty>
        </Card>
      )}
    </div>
  );
}
