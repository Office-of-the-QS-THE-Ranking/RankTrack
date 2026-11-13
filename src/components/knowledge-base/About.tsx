"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode, useTransition } from "react";
import { saveAbout } from "@/app/actions/office";
import { useCan, useHub, useRankings, useVariant } from "@/components/hub/HubProvider";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { ABOUT_PARTS, draftOf, type AboutDraft, type AboutPart, type Item } from "@/lib/office-about";
import { usePending } from "@/components/ui/ButtonBusy";

type Col = { key: keyof Item; label: string; long?: boolean; required?: boolean; max: number };

/** The text a part holds, for the Knowledge Base's search. */
export function aboutText(d: AboutDraft, part: AboutPart): string {
  const items = (xs: Item[]) => xs.map((x) => [x.title, x.body, x.person, x.owners, x.timing].join(" ")).join(" ");
  switch (part) {
    case "purpose":
      return [d.summary, d.purpose, items(d.functions)].join(" ");
    case "vision":
      return [d.vision, d.mission, items(d.objectives)].join(" ");
    case "portfolio":
      return "ranking portfolio";
    case "deliverables":
      return items(d.deliverables);
    case "team":
      return [items(d.team), items(d.workplan)].join(" ");
    case "coordination":
      return [d.reportsTo, items(d.coordination)].join(" ");
    case "policies":
      return items(d.policies);
    case "contact":
      return [d.name, d.location, d.landmark, d.phone, d.email, d.street, d.city].join(" ");
    case "faq":
      return items(d.faq);
  }
}

/**
 * Knowledge Base › About the Office: what the public /about page says, part by part. Editors of the Knowledge
 * Center change it here and the website shows it on its next load; everyone else reads it. The ranking portfolio
 * follows System Configuration.
 */
export function About({ term }: { term: string }) {
  const { office } = useViews();
  const can = useCan();
  const editable = useVariant() === "office" && can("knowledge", "edit");
  const saved = useMemo(() => draftOf(office), [office]);
  const shown = ABOUT_PARTS.filter((p) => !term || p.label.toLowerCase().includes(term) || aboutText(saved, p.key).toLowerCase().includes(term));
  // A link to one part of the page (#team, #privacy …) opens that part.
  const [part, setPart] = useState<AboutPart>("purpose");
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const hit = ABOUT_PARTS.find((p) => p.anchor === id) ?? (["privacy", "accessibility", "disclaimer"].includes(id) ? ABOUT_PARTS.find((p) => p.key === "policies") : undefined);
      if (hit) setPart(hit.key);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  const active = shown.find((p) => p.key === part) ?? shown[0] ?? ABOUT_PARTS[0];

  return (
    <div className="kb-about">
      <Tile glow={false} id="kb-about-rail" title="About the Office" className="kb-about__rail" aside={<InfoTooltip label="About this tab">Shown on the website’s About page. The ranking portfolio follows System Configuration.</InfoTooltip>}>
        <nav aria-label="Parts of the About page">
          <ul className="kb-about__parts">
            {shown.map((p) => (
              <li key={p.key}>
                <button type="button" className={`kb-about__part${p.key === active.key ? " is-on" : ""}`} aria-current={p.key === active.key ? "true" : undefined} onClick={() => setPart(p.key)}>
                  <Icon name={p.icon} size={16} />
                  <span>{p.label}</span>
                  {!p.editable && <span className="kb-about__auto">Auto</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <a href={`/about#${active.anchor}`} target="_blank" rel="noopener" className="kb-about__site">
          <Icon name="external" size={14} /> View on the website
        </a>
      </Tile>
      <Part key={`${active.key}:${JSON.stringify(saved)}`} part={active.key} label={active.label} saved={saved} editable={editable} />
    </div>
  );
}

function Part({ part, label, saved, editable }: { part: AboutPart; label: string; saved: AboutDraft; editable: boolean }) {
  const router = useRouter();
  const [d, setD] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  usePending(busy || refreshing);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const set = <K extends keyof AboutDraft>(k: K) => (v: AboutDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await saveAbout(part, d);
      toast(r.message, r.ok ? "ok" : "error");
      if (r.ok) startRefresh(() => router.refresh());
    } catch {
      toast("The server could not be reached. Check your connection and try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const ro = !editable;
  const text = (k: keyof AboutDraft & string, lbl: string, max: number, long?: boolean, type = "text") => (
    <Field key={k} label={lbl}>
      {long ? (
        <textarea className="textarea" value={d[k] as string} onChange={(e) => set(k)(e.target.value as never)} required maxLength={max} readOnly={ro} rows={3} />
      ) : (
        <input className="input" type={type} value={d[k] as string} onChange={(e) => set(k)(e.target.value as never)} required maxLength={max} readOnly={ro} />
      )}
    </Field>
  );
  const list = (k: keyof AboutDraft & string, lbl: string, noun: string, cols: Col[]) => (
    <Rows key={k} label={lbl} noun={noun} items={d[k] as Item[]} cols={cols} readOnly={ro} onChange={(v) => set(k)(v as never)} />
  );

  let body: ReactNode;
  switch (part) {
    case "purpose":
      body = [
        text("summary", "Summary", 600, true),
        text("purpose", "Our purpose", 600, true),
        list("functions", "Functions", "function", [{ key: "title", label: "Function", long: true, required: true, max: 300 }]),
      ];
      break;
    case "vision":
      body = [
        text("vision", "Vision", 600, true),
        text("mission", "Mission", 800, true),
        list("objectives", "Objectives", "objective", [
          { key: "title", label: "Objective", required: true, max: 120 },
          { key: "body", label: "What it means", long: true, max: 600 },
        ]),
      ];
      break;
    case "portfolio":
      body = <Portfolio />;
      break;
    case "deliverables":
      body = list("deliverables", "Deliverables", "deliverable", [
        { key: "title", label: "Deliverable", required: true, max: 120 },
        { key: "body", label: "What it covers", long: true, max: 600 },
      ]);
      break;
    case "team":
      body = [
        list("team", "Team", "team member", [
          { key: "title", label: "Role", required: true, max: 120 },
          { key: "person", label: "Name", max: 120 },
          { key: "body", label: "Looks after", long: true, max: 400 },
        ]),
        list("workplan", "Roles and responsibilities", "responsibility", [
          { key: "title", label: "Responsibility", required: true, max: 160 },
          { key: "owners", label: "Who carries it out", max: 300 },
          { key: "timing", label: "When", max: 160 },
        ]),
      ];
      break;
    case "coordination":
      body = [
        text("reportsTo", "Reports to", 160),
        list("coordination", "Reporting lines and partners", "line", [
          { key: "title", label: "Who", required: true, max: 120 },
          { key: "body", label: "Their part", long: true, max: 500 },
        ]),
      ];
      break;
    case "policies":
      body = list("policies", "Policies", "policy", [
        { key: "title", label: "Policy", required: true, max: 120 },
        { key: "body", label: "Statement", long: true, max: 1600 },
      ]);
      break;
    case "contact":
      body = (
        <div className="kb-about__grid">
          {text("name", "Office name", 160)}
          {text("email", "Email", 160, false, "email")}
          {text("phone", "Phone", 80)}
          {text("location", "Room", 200)}
          {text("landmark", "Landmark", 200)}
          {text("street", "Street", 200)}
          {text("city", "City", 200)}
        </div>
      );
      break;
    case "faq":
      body = list("faq", "Questions", "question", [
        { key: "title", label: "Question", required: true, max: 240 },
        { key: "body", label: "Answer", long: true, max: 1200 },
      ]);
      break;
  }

  const savable = editable && part !== "portfolio";
  return (
    <Tile glow={false} id="kb-about-part" title={label} className="kb-about__main">
      <form className="kb-about__form" onSubmit={submit}>
        {body}
        {savable && (
          <div className="kb-about__bar">
            <button type="button" className="btn btn--ghost" disabled={!dirty || busy} onClick={() => setD(saved)}>
              Undo changes
            </button>
            <button type="submit" className="btn btn--primary" disabled={!dirty || busy}>
              {busy ? "Saving…" : "Save and publish"}
            </button>
          </div>
        )}
      </form>
    </Tile>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

/** A list the page shows in order: each row's fields, with move, remove and add. */
function Rows({ label, noun, items, cols, readOnly, onChange }: { label: string; noun: string; items: Item[]; cols: Col[]; readOnly: boolean; onChange: (v: Item[]) => void }) {
  const edit = (i: number, k: keyof Item, v: string) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, by: number) => {
    const next = [...items];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  return (
    <fieldset className="field kb-about__rows">
      <legend className="field__label">
        {label} <em>{items.length}</em>
      </legend>
      <ol>
        {items.map((x, i) => (
          <li key={i} className="kb-about__row">
            <span className="kb-about__n" aria-hidden="true">
              {i + 1}
            </span>
            <div className={`kb-about__cells kb-about__cells--${cols.length}`}>
              {cols.map((c) => (
                <label key={c.key} className={`field${c.long ? " kb-about__long" : ""}`}>
                  <span className="sr-only">
                    {c.label} {i + 1}
                  </span>
                  {c.long ? (
                    <textarea className="textarea" placeholder={c.label} value={x[c.key] ?? ""} onChange={(e) => edit(i, c.key, e.target.value)} required={c.required} maxLength={c.max} readOnly={readOnly} rows={2} />
                  ) : (
                    <input className="input" placeholder={c.label} value={x[c.key] ?? ""} onChange={(e) => edit(i, c.key, e.target.value)} required={c.required} maxLength={c.max} readOnly={readOnly} />
                  )}
                </label>
              ))}
            </div>
            {!readOnly && (
              <span className="kb-about__tools">
                <button type="button" className="kb-about__tool" aria-label={`Move ${noun} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <Icon name="arrow-up" size={15} />
                </button>
                <button type="button" className="kb-about__tool" aria-label={`Move ${noun} ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="arrow-down" size={15} />
                </button>
                <button type="button" className="kb-about__tool" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  <Icon name="trash" size={15} />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!readOnly && items.length < 30 && (
        <button type="button" className="btn btn--ghost btn--sm kb-about__add" onClick={() => onChange([...items, { title: "" }])}>
          <Icon name="plus" size={14} /> Add {noun}
        </button>
      )}
    </fieldset>
  );
}

/** The rankings the website lists: those System Configuration tracks, marked public or kept inside. */
function Portfolio() {
  const rankings = useRankings();
  const hub = useHub();
  const { families } = useViews();
  const isPublic = (slug: string) => !hub || hub.publicSlugs.includes(slug);
  const inOffice = useVariant() === "office";
  return (
    <div className="kb-about__portfolio">
      <ul>
        {rankings.map((r) => (
          <li key={r.slug}>
            <span className="kb-about__rk">
              <b>{r.short}</b>
              <span>{families[r.family]?.name ?? r.name}</span>
            </span>
            <span className={`chip${isPublic(r.slug) ? " chip--gold" : ""}`}>{isPublic(r.slug) ? "On the website" : "Inside only"}</span>
          </li>
        ))}
      </ul>
      {inOffice && (
        <Link href="/admin/command-control/config" className="btn btn--ghost btn--sm">
          <Icon name="settings" size={14} /> System Configuration
        </Link>
      )}
    </div>
  );
}
