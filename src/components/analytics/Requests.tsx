"use client";

/*
 * The contributor workspace's Data requests: what the Office's open requests ask of this unit, item by item. Each item
 * takes the unit's answer (a figure, a choice, Yes or No with a policy's dates, text) and its evidence: a public link
 * where possible, or one of the unit's evidence records. Sent items go to the Office for review; returned ones come
 * back with the Office's note. The unit's activities (service learning, outreach, advocacy) are kept here too.
 */
import { useState } from "react";
import { Hint } from "@/components/command-control/ui";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { NumberField, Select } from "@/components/ui/pickers";
import { Sheet } from "@/components/workspace/parts";
import { addLink, removeLink, saveValue } from "@/app/actions/analytics";
import type { RequestsDesk } from "@/lib/analytics/desk-types";
import { day, daysTo } from "@/lib/analytics/format";
import type { Value } from "@/lib/analytics/types";
import { ActivitySheet, draftOf, type ActivityDraft } from "./Activities";
import { EmptyState, LinkLine, ReadyRing, ValueField, useRun } from "./parts";

type Item = RequestsDesk["items"][number];
type View = "requests" | "activities";

const STATE_CLASS: Record<Item["state"], string> = { "To do": "status--missing", Sent: "status--review", Validated: "status--ok", Returned: "status--revise", "Not applicable": "status--na" };

function ItemSheet({ item, desk, onClose }: { item: Item; desk: RequestsDesk; onClose: () => void }) {
  const { run, pending } = useRun();
  const [value, setValue] = useState<Value>(item.mine?.value ?? {});
  const [note, setNote] = useState(item.mine?.note ?? "");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [year, setYear] = useState(NaN);
  const [record, setRecord] = useState("");
  const [isPublic, setPublic] = useState<"" | "yes" | "no">("");
  const locked = !desk.can.submit || item.state === "Validated";
  const send = (extra: { draft?: boolean; notApplicable?: boolean } = {}) => run(() => saveValue({ edition: item.edition, code: item.code, unit: desk.unit.id, value, note, ...extra }));
  return (
    <Sheet title={`${item.ref ?? item.code} ${item.name}`} onClose={onClose} className="an-sheet--wide">
      {(close) => (
        <div className="ws-sheet__body">
          <p>
            <span className={`status ${STATE_CLASS[item.state]}`}>
              <i className="status__shape" aria-hidden="true" />
              {item.state}
            </span>
          </p>
          {item.mine?.reviewNote && (
            <p className="an-contrib__review">
              <Icon name="comment" size={14} /> {item.mine.reviewNote}
            </p>
          )}
          {item.guidance && <p className="ws-sheet__text an-pre">{item.guidance}</p>}
          <form
            className="an-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await send();
              if (r.ok) close();
            }}
          >
            <div className="an-field">
              <span>{item.input.type === "number" ? "Your unit’s figure" : "Your unit’s answer"}</span>
              <ValueField id={`r-${item.code}`} input={item.input} value={value} onChange={setValue} unit={item.unit} evidence={item.evidence} disabled={locked || pending} />
            </div>
            <label className="an-field">
              <span>Note to the Office</span>
              <textarea className="textarea" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} disabled={locked} placeholder="Source, period covered, who to ask" />
            </label>
            {!locked && (
              <div className="an-actions">
                <button type="button" className="btn btn--ghost" disabled={pending} onClick={() => void send({ notApplicable: true }).then((r) => r.ok && close())}>
                  Not applicable
                </button>
                <button type="button" className="btn" disabled={pending} onClick={() => void send({ draft: true })}>
                  Save draft
                </button>
                <button type="submit" className="btn btn--dark" disabled={pending}>
                  <Icon name="send" size={15} /> Send
                </button>
              </div>
            )}
          </form>

          {(item.evidence.required || item.links.length > 0) && (
            <section className="an-sec">
              <h3 className="an-h3">
                Evidence <Hint text="One self-contained file or page per link, not a folder. Evidence anyone can open counts for more: share Drive files to anyone with the link." />
              </h3>
              {item.links.length > 0 ? (
                <ul className="an-links">
                  {item.links.map((l) => (
                    <LinkLine
                      key={l.id}
                      link={l}
                      actions={
                        !locked && (
                          <button type="button" className="btn btn--icon btn--sm btn--ghost" aria-label="Remove link" disabled={pending} onClick={() => void run(() => removeLink({ id: l.id }))}>
                            <Icon name="trash" size={14} />
                          </button>
                        )
                      }
                    />
                  ))}
                </ul>
              ) : (
                <p className="an-muted">No evidence yet.</p>
              )}
              {!locked && (
                <form
                  className="an-form an-addlink"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await run(() => addLink({ edition: item.edition, code: item.code, unit: desk.unit.id, ...(record ? { evidenceId: record } : { url }), label, ...(Number.isFinite(year) && { year }), ...(isPublic && { public: isPublic === "yes" }) }));
                    if (r.ok) {
                      setUrl("");
                      setLabel("");
                      setRecord("");
                      setYear(NaN);
                    }
                  }}
                >
                  {desk.evidence.length > 0 && (
                    <Select className="select" value={record} onChange={setRecord} searchable placeholder="Link a web address instead" aria-label="Evidence record">
                      <option value="">Link a web address instead</option>
                      {desk.evidence.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </Select>
                  )}
                  {!record && <input className="input" type="url" required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Web address" data-missing="Paste the evidence's web address." />}
                  <div className="an-row3">
                    <input className="input" maxLength={300} placeholder="What it shows" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" />
                    <NumberField value={year} onChange={setYear} min={1990} max={2100} allowEmpty aria-label="Year" />
                    <Select className="select" value={isPublic} onChange={(v) => setPublic(v as "" | "yes" | "no")} aria-label="Public" placeholder="Public?">
                      <option value="">Public?</option>
                      <option value="yes">Anyone can open it</option>
                      <option value="no">Not public</option>
                    </Select>
                  </div>
                  <div className="an-actions">
                    <button type="submit" className="btn btn--sm btn--dark" disabled={pending}>
                      <Icon name="link" size={14} /> Link
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function Requests({ desk }: { desk: RequestsDesk }) {
  const [view, setView] = useState<View>("requests");
  const [open, setOpen] = useState<Item | null>(null);
  const [activity, setActivity] = useState<ActivityDraft | null>(null);
  const openCount = desk.items.filter((i) => i.state === "To do" || i.state === "Returned").length;
  const views = [
    { key: "requests" as const, label: "Requests", count: openCount || undefined, countTone: desk.items.some((i) => i.state === "Returned") ? ("alert" as const) : undefined },
    { key: "activities" as const, label: "Activities", count: desk.activities.length || undefined },
  ];
  return (
    <div className="an">
      {desk.campaigns.length > 0 && (
        <div className="an-reqheads">
          {desk.campaigns.map((c) => {
            const d = daysTo(c.due);
            return (
              <section key={c.id} className="an-card an-reqhead">
                <ReadyRing value={c.total ? ((c.total - c.open) / c.total) * 100 : 0} size={48} />
                <div>
                  <p className="an-reqhead__title">
                    <span className="an-dot" style={{ background: c.color }} aria-hidden="true" /> {c.title}
                  </p>
                  <p className="an-muted">
                    {c.memo ? `${c.memo} · ` : ""}
                    {c.status === "Closed" ? "Closed" : d >= 0 ? `Due ${day(c.due)}, in ${d} d` : `Was due ${day(c.due)}`} · {c.open ? `${c.open} of ${c.total} open` : "All sent"}
                  </p>
                  {c.message && <p className="an-reqhead__msg">{c.message}</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <Tabs
        tabs={views}
        value={view}
        onChange={setView}
        label="Data requests"
        idBase="an-req"
        actions={
          view === "activities" &&
          desk.can.submit && (
            <button type="button" className="btn content-tabs__action" onClick={() => setActivity({ ...draftOf(), unit: desk.unit.id, unitLabel: desk.unit.code || desk.unit.name })}>
              <Icon name="plus" size={16} /> Add activity
            </button>
          )
        }
      />
      <TabPanel idBase="an-req" index={views.findIndex((v) => v.key === view)} className="tabpanel">
        {view === "requests" &&
          (desk.items.length ? (
            desk.campaigns.map((c) => {
              const items = desk.items.filter((i) => i.campaign === c.id);
              return (
                <div key={c.id} className="ws-card an-reqlist">
                  <table className="ws-table an-table">
                    <caption className="sr-only">{c.title}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{c.editionLabel}</th>
                        <th scope="col" className="an-col-value">Your answer</th>
                        <th scope="col" className="an-col-num">Evidence</th>
                        <th scope="col" className="an-col-state">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr key={`${c.id}-${i.code}`} className="ws-row an-click" onClick={() => setOpen(i)}>
                          <td>
                            <button type="button" className="an-ind" onClick={(e) => (e.stopPropagation(), setOpen(i))}>
                              <span className="an-ind__code">{i.ref ?? i.code}</span>
                              <span className="an-ind__name">{i.name}</span>
                            </button>
                          </td>
                          <td className="an-col-value">{(i.state !== "Not applicable" && i.mine?.text) || <span className="an-dash">—</span>}</td>
                          <td className="an-col-num" data-label={i.links.length ? "Evidence" : undefined}>
                            {i.links.length || (i.evidence.required ? <span className="an-dash">—</span> : "")}
                          </td>
                          <td className="an-col-state">
                            <span className={`status ${STATE_CLASS[i.state]}`}>
                              <i className="status__shape" aria-hidden="true" />
                              {i.state}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          ) : (
            <EmptyState icon="inbox" title="No requests for your unit">When the Office asks for a ranking’s data, the items appear here.</EmptyState>
          ))}
        {view === "activities" &&
          (desk.activities.length ? (
            <div className="ws-card">
              <table className="ws-table an-table">
                <caption className="sr-only">Your unit’s activities</caption>
                <thead>
                  <tr>
                    <th scope="col">Activity</th>
                    <th scope="col" className="an-col-kind">Kind</th>
                    <th scope="col" className="an-col-year">Year</th>
                    <th scope="col" className="an-col-num">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {desk.activities.map((a) => (
                    <tr key={a.id} className={`ws-row${desk.can.submit ? " an-click" : ""}`} onClick={() => desk.can.submit && setActivity(draftOf(a))}>
                      <td>
                        <span className="an-ind__name">{a.title}</span>
                        <span className="an-ind__sub">{[a.proponent, a.community].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="an-col-kind">{a.kind}</td>
                      <td className="an-col-year">{a.year.replace("-", "–")}</td>
                      <td className="an-col-num">{a.reported ? <Icon name="check" size={15} /> : <span className="an-dash">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="collaboration" title="No activities yet">Add your unit’s service learning, community development and advocacy activities.</EmptyState>
          ))}
      </TabPanel>
      {open && <ItemSheet item={open} desk={desk} onClose={() => setOpen(null)} />}
      {activity && <ActivitySheet draft={activity} units={[{ id: desk.unit.id, name: desk.unit.name }]} lockUnit onClose={() => setActivity(null)} canDelete={desk.can.submit} />}
    </div>
  );
}
