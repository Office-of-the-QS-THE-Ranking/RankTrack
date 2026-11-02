"use client";

/*
 * Analytics › Data requests: the Office's memoranda as campaigns. A request asks each unit for the indicators it owns
 * (or a chosen set), tracks what each sent, reminds on a schedule, tells the Office when a unit is past due, and
 * thanks units once everything is in. Letters follow the Office's own wording: the request, the follow-up for units
 * that haven't sent, and the thank-you.
 */
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Hint } from "@/components/admin/ui";
import { RowMenu } from "@/components/publications/PostManager";
import { Icon } from "@/components/ui/Icon";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { SearchField } from "@/components/ui/search-field";
import { Sheet } from "@/components/workspace/parts";
import { toast } from "@/components/ui/toast";
import { createCampaign, deleteCampaign, remindCampaign, updateCampaign } from "@/app/actions/analytics";
import type { CampaignCard, CollectionDesk } from "@/lib/analytics/desk-types";
import { count, day, daysTo } from "@/lib/analytics/format";
import { UNIT_CATEGORY_LABELS } from "@/lib/unit-categories";
import { EmptyState, ReadyRing, useRun } from "./parts";

type Letter = { kind: "request" | "followup" | "thanks"; campaign: CampaignCard; unit: CampaignCard["units"][number] };

/** The Office's letters, as its Drive folder words them. */
function letterText({ kind, campaign, unit }: Letter, indicators: Map<string, string>) {
  const items = unit.codes.map((c) => `  • ${indicators.get(c) ?? c}`).join("\n");
  const memo = campaign.memo ? ` (${campaign.memo})` : "";
  const head = `${day(new Date().toISOString())}\n\nThe Head\n${unit.name}\nUniversity of Santo Tomas\n\n`;
  const sign = "\n\nSincerely,\n\nDirector\nOffice of QS/THE Rankings";
  if (kind === "request")
    return `${head}In line with the memorandum${memo} on ${campaign.editionLabel}, we respectfully request your office to submit the following data and supporting evidence on or before ${day(campaign.due)}:\n\n${items}\n\nPlease send them through the Hub's Data requests page, one self-contained, publicly accessible file or page per item where possible.${campaign.message ? `\n\n${campaign.message}` : ""}${sign}`;
  if (kind === "followup")
    return `${head}In connection with the memorandum${memo} on ${campaign.editionLabel}, we note that your office has not yet sent ${unit.requested - unit.submitted} of the ${count(unit.requested, "item")} requested, due ${day(campaign.due)}.\n\nMay we respectfully ask for an update on the status of your submission and the reasons for any delay, so that we can provide the support you need. The items still open are:\n\n${items}${sign}`;
  return `${head}The Office of QS/THE Rankings extends its sincerest appreciation for your timely and complete response to the memorandum${memo} on ${campaign.editionLabel}. Your accurate, verifiable data strengthens the University's standing in the rankings and the narrative of its impact.\n\nThank you for your continued support and partnership.${sign}`;
}

function CampaignBlock({ c, desk, onLetter }: { c: CampaignCard; desk: CollectionDesk; onLetter: (l: Letter) => void }) {
  const { run, pending } = useRun();
  const [due, setDue] = useState<string | null>(null);
  const requested = c.units.reduce((s, u) => s + u.requested, 0);
  const sent = c.units.reduce((s, u) => s + u.submitted, 0);
  const validated = c.units.reduce((s, u) => s + u.validated, 0);
  const d = daysTo(c.due);
  return (
    <section className={`an-camp${c.status === "Closed" ? " is-closed" : ""}`} id={c.id}>
      <header className="an-camp__head">
        <ReadyRing value={requested ? (sent / requested) * 100 : 0} size={52} />
        <div className="an-camp__title">
          <h2>
            {c.code} · {c.title}
          </h2>
          <p className="an-muted">
            {c.editionLabel}
            {c.memo ? ` · ${c.memo}` : ""} · {c.status === "Closed" ? "Closed" : d >= 0 ? `due in ${d} d (${day(c.due)})` : `${-d} d past due (${day(c.due)})`} · {sent}/{requested} sent · {validated} validated
          </p>
        </div>
        {desk.can.manage && (
          <RowMenu
            label={`Actions for ${c.code}`}
            disabled={pending}
            items={[
              c.status === "Open" && { label: "Remind everyone still owing", icon: "bell", onSelect: () => void run(() => remindCampaign({ id: c.id })) },
              c.status === "Open" && { label: "Change the due date", icon: "calendar", onSelect: () => setDue(c.due) },
              { label: c.status === "Open" ? "Close the request" : "Reopen the request", icon: c.status === "Open" ? "check-circle" : "refresh", onSelect: () => void run(() => updateCampaign({ id: c.id, status: c.status === "Open" ? "Closed" : "Open" })) },
              { label: "Remove", icon: "trash", danger: true, onSelect: () => void run(() => deleteCampaign({ id: c.id })) },
            ]}
          />
        )}
      </header>
      <div className="ws-card">
        <table className="ws-table an-table">
          <caption className="sr-only">{c.title} by unit</caption>
          <thead>
            <tr>
              <th scope="col">Unit</th>
              <th scope="col" className="an-col-sent">Sent</th>
              <th scope="col" className="an-col-num">Validated</th>
              <th scope="col" className="an-col-num">Returned</th>
              <th scope="col" className="an-col-state">Status</th>
              <th scope="col" className="an-col-menu">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...c.units]
              .sort((a, b) => b.requested - b.submitted - (a.requested - a.submitted) || a.name.localeCompare(b.name))
              .map((u) => {
                const done = u.submitted >= u.requested;
                return (
                  <tr key={u.unit} className="ws-row">
                    <td>
                      <span className="an-ind__name">{u.name}</span>
                      <span className="an-ind__sub">
                        {u.reminders ? count(u.reminders, "reminder") : "No reminders yet"}
                        {u.lastAt ? ` · last sent ${day(u.lastAt)}` : ""}
                      </span>
                    </td>
                    <td className="an-col-sent">
                      <span className="an-meter an-meter--inline" role="img" aria-label={`${u.submitted} of ${u.requested}`}>
                        <i style={{ width: `${u.requested ? (u.submitted / u.requested) * 100 : 0}%` }} />
                      </span>
                      {u.submitted}/{u.requested}
                    </td>
                    <td className="an-col-num" data-label="Validated">{u.validated}</td>
                    <td className="an-col-num" data-label="Returned">{u.revisions || ""}</td>
                    <td className="an-col-state">
                      {done ? (
                        <span className="status status--ok">
                          <i className="status__shape" aria-hidden="true" />
                          {u.thanked ? "Thanked" : "Complete"}
                        </span>
                      ) : u.escalated ? (
                        <span className="status status--revise">
                          <i className="status__shape" aria-hidden="true" />
                          With the Director
                        </span>
                      ) : u.overdue ? (
                        <span className="status status--revise">
                          <i className="status__shape" aria-hidden="true" />
                          Overdue
                        </span>
                      ) : (
                        <span className="status status--missing">
                          <i className="status__shape" aria-hidden="true" />
                          Open
                        </span>
                      )}
                    </td>
                    <td className="an-col-menu">
                      <RowMenu
                        label={`Actions for ${u.name}`}
                        disabled={pending}
                        items={[
                          desk.can.manage && c.status === "Open" && !done && { label: "Remind now", icon: "bell", onSelect: () => void run(() => remindCampaign({ id: c.id, units: [u.unit] })) },
                          { label: "Request letter", icon: "mail", onSelect: () => onLetter({ kind: "request", campaign: c, unit: u }) },
                          !done && { label: "Follow-up letter", icon: "mail", onSelect: () => onLetter({ kind: "followup", campaign: c, unit: u }) },
                          done && { label: "Thank-you letter", icon: "mail", onSelect: () => onLetter({ kind: "thanks", campaign: c, unit: u }) },
                          desk.can.manage && c.status === "Open" && { label: "Take off this request", icon: "user-minus", danger: true, onSelect: () => void run(() => updateCampaign({ id: c.id, drop: [u.unit] })) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {due !== null && (
        <Sheet title="Due date" onClose={() => setDue(null)} className="ws-sheet--confirm">
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run(() => updateCampaign({ id: c.id, due: due }));
                if (r.ok) close();
              }}
            >
              <DateField value={due} onChange={setDue} required aria-label="Due date" />
              <footer className="ws-sheet__foot">
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
      )}
    </section>
  );
}

function NewRequest({ desk, onClose }: { desk: CollectionDesk; onClose: () => void }) {
  const { run, pending } = useRun();
  const editions = desk.editions;
  const [edition, setEdition] = useState(editions[0]?.id ?? "");
  const e = editions.find((x) => x.id === edition);
  const [title, setTitle] = useState(e ? `${e.label} data` : "");
  const [memo, setMemo] = useState("");
  const [due, setDue] = useState("");
  const [message, setMessage] = useState("");
  const [remind, setRemind] = useState(7);
  const [escalate, setEscalate] = useState(3);
  const [mode, setMode] = useState<"owned" | "chosen">("owned");
  const [units, setUnits] = useState<Set<string>>(new Set());
  const [codes, setCodes] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const owned = useMemo(() => new Map(e?.owners.map((o) => [o.unit, o.codes]) ?? []), [e]);
  const sections = (Object.keys(UNIT_CATEGORY_LABELS) as (keyof typeof UNIT_CATEGORY_LABELS)[]).map((k) => ({ key: k, label: UNIT_CATEGORY_LABELS[k], units: desk.units.filter((u) => u.section === k) }));
  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };
  const items = e?.indicators.filter((i) => !q.trim() || `${i.ref ?? i.code} ${i.name}`.toLowerCase().includes(q.trim().toLowerCase())) ?? [];
  const asked = [...units].map((u) => ({ unit: u, codes: mode === "owned" ? (owned.get(u) ?? []) : [...codes] })).filter((u) => u.codes.length);
  return (
    <Sheet title="New data request" onClose={onClose} className="an-sheet--wide">
      {(close) => (
        <form
          className="ws-sheet__body"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const r = await run(() => createCampaign({ edition, title, memo, message, due, remindDays: remind, escalateDays: escalate, units: asked }));
            if (r.ok) close();
          }}
        >
          <div className="an-row2">
            <label className="an-field">
              <span>Edition</span>
              <Select
                className="select"
                value={edition}
                onChange={(v) => {
                  setEdition(v);
                  setCodes(new Set());
                  const next = editions.find((x) => x.id === v);
                  if (next) setTitle(`${next.label} data`);
                }}
              >
                {editions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="an-field">
              <span>Memorandum</span>
              <input className="input" maxLength={120} value={memo} onChange={(ev) => setMemo(ev.target.value)} placeholder="UST: S052-00-ME03" />
            </label>
          </div>
          <label className="an-field">
            <span>Title</span>
            <input className="input" required maxLength={160} value={title} onChange={(ev) => setTitle(ev.target.value)} />
          </label>
          <div className="an-row3">
            <label className="an-field">
              <span>Due</span>
              <DateField value={due} onChange={setDue} required min={new Date().toISOString().slice(0, 10)} />
            </label>
            <label className="an-field">
              <span>
                Remind every <Hint text="Units that still owe items get a reminder in the Hub this often, until the due date and after." />
              </span>
              <NumberField value={remind} onChange={(n) => setRemind(Number.isFinite(n) ? n : 7)} min={1} max={60} suffix="days" aria-label="Remind every" />
            </label>
            <label className="an-field">
              <span>
                Tell the Office after <Hint text="This many days past due, the Office is told so the Director can follow up. Reminders then stop." />
              </span>
              <NumberField value={escalate} onChange={(n) => setEscalate(Number.isFinite(n) ? n : 3)} min={0} max={60} suffix="days" aria-label="Escalate after" />
            </label>
          </div>
          <label className="an-field">
            <span>Message to units</span>
            <textarea className="textarea" rows={3} maxLength={4000} value={message} onChange={(ev) => setMessage(ev.target.value)} />
          </label>

          <div className="an-ask">
            <div className="an-ask__mode" role="radiogroup" aria-label="What to ask">
              <button type="button" role="radio" aria-checked={mode === "owned"} className={`an-yesno__opt${mode === "owned" ? " is-on" : ""}`} onClick={() => setMode("owned")}>
                What each unit owns
              </button>
              <button type="button" role="radio" aria-checked={mode === "chosen"} className={`an-yesno__opt${mode === "chosen" ? " is-on" : ""}`} onClick={() => setMode("chosen")}>
                The same items for all
              </button>
            </div>
            {mode === "chosen" && (
              <div className="an-ask__items">
                <SearchField value={q} onChange={setQ} placeholder="Search items" label="Search items" />
                <ul className="an-checklist an-checklist--pick">
                  {items.slice(0, 400).map((i) => (
                    <li key={i.code}>
                      <label>
                        <input type="checkbox" checked={codes.has(i.code)} onChange={() => setCodes(toggle(codes, i.code))} />
                        <span className="an-ind__code">{i.ref ?? i.code}</span> {i.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="an-ask__units">
              {sections.map((s) => (
                <fieldset key={s.key} className="an-unitset">
                  <legend>
                    {s.label}
                    <button type="button" className="an-linkbtn" onClick={() => setUnits(new Set([...units, ...s.units.filter((u) => mode === "chosen" || owned.has(u.id)).map((u) => u.id)]))}>
                      Add all
                    </button>
                  </legend>
                  {s.units.map((u) => {
                    const n = owned.get(u.id)?.length ?? 0;
                    return (
                      <label key={u.id} className={`an-unitpick${mode === "owned" && !n ? " is-none" : ""}`}>
                        <input type="checkbox" checked={units.has(u.id)} disabled={mode === "owned" && !n} onChange={() => setUnits(toggle(units, u.id))} />
                        <span>{u.name}</span>
                        {mode === "owned" && <span className="an-muted">{n || "—"}</span>}
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          </div>
          <footer className="ws-sheet__foot">
            <span className="an-muted an-left">
              {count(asked.length, "unit")} · {count(asked.reduce((s, u) => s + u.codes.length, 0), "item")}
            </span>
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn--dark" disabled={pending || !asked.length}>
              <Icon name="send" size={15} /> Send request
            </button>
          </footer>
        </form>
      )}
    </Sheet>
  );
}

export function Collection({ desk }: { desk: CollectionDesk }) {
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [letter, setLetter] = useState<Letter | null>(null);
  const focus = params.get("request");
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of desk.editions) for (const i of e.indicators) m.set(i.code, `${i.ref ?? i.code} ${i.name}`);
    return m;
  }, [desk.editions]);
  const open = desk.campaigns.filter((c) => c.status === "Open");
  const closed = desk.campaigns.filter((c) => c.status === "Closed");
  const text = letter ? letterText(letter, names) : "";
  return (
    <div className="an">
      <div className="content-tabs">
        <div className="content-tabs__controls">
          {desk.can.manage && desk.editions.length > 0 && (
            <div className="content-tabs__actions">
              <button type="button" className="btn content-tabs__action" onClick={() => setCreating(true)}>
                <Icon name="plus" size={16} /> New request
              </button>
            </div>
          )}
        </div>
      </div>
      {!desk.campaigns.length ? (
        <EmptyState icon="send" title="No data requests yet">Ask units for an edition’s data; the Hub reminds them and tracks what comes back.</EmptyState>
      ) : (
        <>
          {[...open, ...closed]
            .sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0))
            .map((c) => (
              <CampaignBlock key={c.id} c={c} desk={desk} onLetter={setLetter} />
            ))}
        </>
      )}
      {creating && <NewRequest desk={desk} onClose={() => setCreating(false)} />}
      {letter && (
        <Sheet title={letter.kind === "request" ? "Request letter" : letter.kind === "followup" ? "Follow-up letter" : "Thank-you letter"} onClose={() => setLetter(null)} className="an-sheet--wide">
          {(close) => (
            <div className="ws-sheet__body">
              <textarea className="textarea an-letter" rows={18} readOnly value={text} aria-label="Letter" />
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close}>
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn--dark"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(text);
                      toast("Letter copied.", "ok");
                    } catch {
                      toast("Couldn’t copy. Select the text and copy it.", "error");
                    }
                  }}
                >
                  <Icon name="copy" size={15} /> Copy
                </button>
              </footer>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
