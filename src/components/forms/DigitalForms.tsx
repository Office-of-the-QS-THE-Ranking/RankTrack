"use client";

/*
 * Digital Forms: a repository of electronic forms (application forms, proposals, surveys, evaluations,
 * registrations, terminal reports), each with its details, its own responder link, its responses and their analytics.
 * A night header files the forms by kind; they show as cards (a drawn form, its status, its responses this week)
 * or as a table. A form opens in a full-size window (FormWindow.tsx), whose address (?form=…) can be shared.
 *
 * The same shelf serves three places (lib/forms/access.ts): the Office's, where tabs set its own forms beside every
 * unit's and Student's published form (their responses reach the Office); a unit's Workspace, with the Office's
 * open forms beside the unit's own; and a Student's Evaluation Forms or Registrations page (`kind`), their own forms
 * of one kind. What a form offers follows the viewer's rights on it.
 */
import { useEffect, useId, useMemo, useState } from "react";
import type { Command, CommandResult } from "@/lib/governance/commands";
import type { FormItem, FormsDesk } from "@/lib/governance/hub-types";
import { publishes, type FormHolder } from "@/lib/forms/access";
import { FORM_KINDS, formKindLabel, formPath } from "@/lib/forms/kinds";
import { dayLabel, plural } from "@/lib/forms/format";
import type { FormKind, FormStatus } from "@/lib/forms/types";
import { useGovern } from "@/components/hub/HubProvider";
import { RowMenu, SortMark, type MenuItem } from "@/components/publications/PostManager";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toast";
import { Sheet } from "@/components/workspace/parts";
import { LayoutSwitch, ShelfHero, useShelfLayout } from "@/components/workspace/ShelfHero";
import { FormArt } from "./art";
import { FormBuilder } from "./Builder";
import { useNoEmoji } from "./controls";
import { FormWindow } from "./FormWindow";
import { ago, StatusMark } from "./marks";

type Sort = { by: "title" | "status" | "responses" | "updated"; dir: 1 | -1 };

const STATUS_ORDER: Record<FormStatus, number> = { open: 0, draft: 1, closed: 2 };

const SOURCES: { key: FormHolder; label: string }[] = [
  { key: "office", label: "Office" },
  { key: "unit", label: "Units" },
  { key: "student", label: "Students" },
];

/** What a form card or row offers, by the viewer's rights on it. */
export function formMenu(
  f: FormItem,
  { copy, open, act, remove, build, publish }: { copy: () => void; open: () => void; act: (cmd: Command) => Promise<CommandResult>; remove: () => void; build?: () => void; publish: () => void },
): (MenuItem | false)[] {
  const { may } = f;
  return [
    { label: "Open", icon: "arrow-up-right", onSelect: open },
    !!build && may.edit && f.status === "draft" && { label: "Edit questions", icon: "layers", onSelect: build },
    // A form filled in as copies is built from the Student Portal: its own link only previews it.
    f.status !== "draft" && !f.copies && { label: "Copy responder link", icon: "copy", onSelect: copy },
    may.status && f.status === "draft" && { label: publishes(f) ? "Publish" : "Take responses", icon: "play", onSelect: () => (publishes(f) ? publish() : void act({ type: "form.status", id: f.id, status: "open" })) },
    may.status && f.status === "closed" && { label: "Take responses", icon: "play", onSelect: () => void act({ type: "form.status", id: f.id, status: "open" }) },
    may.status && f.status === "open" && { label: "Close responses", icon: "lock", onSelect: () => void act({ type: "form.status", id: f.id, status: "closed" }) },
    may.portal && { label: f.students ? "Take off the Student Portal" : "Publish to Student Portal", icon: "education", onSelect: () => void act({ type: "form.portal", id: f.id, on: !f.students }) },
    may.duplicate && { label: "Duplicate as a draft", icon: "copy", onSelect: () => void act({ type: "form.duplicate", id: f.id }) },
    may.remove && { label: "Delete draft", icon: "trash", danger: true, onSelect: remove },
  ];
}

/** The small tags beside a form's kind: the Office's in a unit's Workspace, and on the Student Portal. */
function Tags({ f, desk }: { f: FormItem; desk: FormsDesk }) {
  return (
    <>
      {f.shared && desk.unitId && <span className="ws-office">Office</span>}
      {f.students && (
        <span className="ws-office fm-portal-tag">
          <Icon name="education" size={11} /> Student Portal
        </span>
      )}
    </>
  );
}

export function DigitalForms({ desk, kind: only, title = "Digital Forms" }: { desk: FormsDesk; kind?: FormKind; title?: string }) {
  useNoEmoji();
  const { run, pending } = useGovern();
  const tabsId = useId();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<FormKind | null>(null);
  const [source, setSource] = useState<FormHolder>("office");
  const [layout, setLayout] = useShelfLayout("ws-forms-layout");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ by: "status", dir: 1 });
  const [removing, setRemoving] = useState<FormItem | null>(null);
  const [publishing, setPublishing] = useState<FormItem | null>(null);
  /** The Forms Builder: a new form, or a draft's questions. */
  const [building, setBuilding] = useState<FormItem | "new" | null>(null);
  // The Office's page sets its own forms beside every unit's and Student's published one.
  const sourced = desk.holder === "office";

  // ?form=<id> opens a form, so its window can be linked to and survives a reload.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("form");
    const f = id ? desk.forms.find((x) => x.id === id) : undefined;
    if (!f) return;
    setOpenId(f.id);
    if (sourced) setSource(f.holder.kind);
  }, [desk.forms, sourced]);

  const show = (id: string | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("form", id);
    else url.searchParams.delete("form");
    window.history.replaceState(window.history.state, "", url);
  };

  const act = async (cmd: Command) => {
    const r = await run(cmd);
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok && cmd.type === "form.duplicate" && r.data && typeof r.data === "object" && "id" in r.data) show(String((r.data as { id: string }).id));
    if (r.ok && cmd.type === "form.delete") show(null);
    return r;
  };

  const linkOf = (f: FormItem) => `${desk.origin}${formPath(f.code)}`;
  const copy = async (f: FormItem) => {
    try {
      await navigator.clipboard.writeText(linkOf(f));
      toast("Responder link copied.", "ok");
    } catch {
      toast("Couldn’t copy. Open the form and copy its address instead.", "error");
    }
  };

  const inSource = useMemo(() => desk.forms.filter((f) => !sourced || f.holder.kind === source), [desk.forms, sourced, source]);
  const used = only ? [] : FORM_KINDS.filter((k) => inSource.some((f) => f.kind === k.key));
  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const rows = inSource.filter(
      (f) =>
        (!kind || f.kind === kind) &&
        (!term || [f.title, f.description, f.reference ?? "", f.issuer?.name ?? "", f.holder.name, formKindLabel(f.kind), f.code].some((t) => t.toLowerCase().includes(term))),
    );
    const key = (f: FormItem): string | number =>
      sort.by === "title" ? f.title.toLowerCase() : sort.by === "status" ? `${STATUS_ORDER[f.status]}${9_999_999_999_999 - Date.parse(f.updatedAt)}` : sort.by === "responses" ? (f.responses?.total ?? -1) : f.updatedAt;
    return rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
  }, [inSource, kind, term, sort]);

  const sortBy = (by: Sort["by"]) => setSort((s) => (s.by === by ? { by, dir: s.dir === 1 ? -1 : 1 } : { by, dir: by === "title" || by === "status" ? 1 : -1 }));
  const ariaSort = (by: Sort["by"]) => (sort.by === by ? (sort.dir === 1 ? "ascending" : "descending") : undefined);
  const openForm = openId ? desk.forms.find((f) => f.id === openId) : undefined;
  const menu = (f: FormItem) => formMenu(f, { copy: () => void copy(f), open: () => show(f.id), act, remove: () => setRemoving(f), build: () => setBuilding(f), publish: () => setPublishing(f) });
  const noun = only ? formKindLabel(only).toLowerCase().replace(/ form$/, "") : "form";
  const canCreate = desk.create.length > 0 && (!sourced || source === "office");
  const create = (
    <button type="button" className="btn content-tabs__action" onClick={() => setBuilding("new")}>
      <Icon name="plus" size={15} /> Create {only ? formKindLabel(only).toLowerCase() : "form"}
    </button>
  );
  const search = (
    <SearchField
      value={q}
      onChange={setQ}
      placeholder={`Search ${title.toLowerCase()}`}
      label={`Search ${title.toLowerCase()}`}
      examples={sourced && source !== "office" ? ["Search by title", source === "student" ? "Search by organization" : "Search by unit"] : ["Search by title", "Search by office", "Search by form number"]}
      shortcuts
    />
  );
  const actions = (
    <>
      {canCreate && create}
      <LayoutSwitch layout={layout} onChange={setLayout} noun={`${noun}s`} />
    </>
  );
  const counts = Object.fromEntries(SOURCES.map((s) => [s.key, desk.forms.filter((f) => f.holder.kind === s.key).length])) as Record<FormHolder, number>;

  const list = !inSource.length ? (
    <div className="ws-empty">
      <span className="ws-empty__art">
        <FormArt kind={only ?? "application"} size="lg" />
      </span>
      <p className="ws-empty__title">
        {sourced && source !== "office" ? (source === "unit" ? "No published unit forms yet" : "No published student forms yet") : `No ${only ? FORM_KINDS.find((k) => k.key === only)!.plural.toLowerCase() : "digital forms"} yet`}
      </p>
      {canCreate && (
        <button type="button" className="btn btn--dark btn--sm" onClick={() => setBuilding("new")}>
          <Icon name="plus" size={15} /> Create {only ? formKindLabel(only).toLowerCase() : "form"}
        </button>
      )}
    </div>
  ) : !shown.length ? (
    <div className="ws-card ws-none">
      <p>No forms match.</p>
      <button
        type="button"
        className="btn btn--sm"
        onClick={() => {
          setQ("");
          setKind(null);
        }}
      >
        Show all forms
      </button>
    </div>
  ) : layout === "files" ? (
    <ul className="fm-cards">
      {shown.map((f) => (
        <li key={f.id} className="fm-card" data-status={f.status}>
          <button type="button" className="fm-card__open" onClick={() => show(f.id)} aria-label={`Open ${f.title}`}>
            <span className="fm-card__art">
              <FormArt kind={f.kind} />
            </span>
            <span className="fm-card__kind">
              {formKindLabel(f.kind)}
              <Tags f={f} desk={desk} />
            </span>
            <span className="fm-card__title">{f.title}</span>
            {sourced && f.holder.kind !== "office" ? <span className="fm-card__issuer">{f.holder.name}</span> : f.issuer && <span className="fm-card__issuer">{f.issuer.name}</span>}
          </button>
          <span className="fm-card__menu">
            <RowMenu label={`Actions for ${f.title}`} items={menu(f)} disabled={pending} />
          </span>
          <span className="fm-card__foot">
            <StatusMark status={f.status} />
            {f.responses?.total ? (
              <span className="fm-card__count" title={f.responses.lastAt ? `Last response ${ago(f.responses.lastAt)}` : undefined}>
                <b>{f.responses.total}</b> {f.responses.total === 1 ? "response" : "responses"}
                {f.responses.week > 0 && <em>+{f.responses.week} this week</em>}
              </span>
            ) : (
              f.closesOn && <span className="fm-card__count">Until {dayLabel(f.closesOn)}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <div className="ws-card">
      <table className="ws-table fm-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col" aria-sort={ariaSort("title")}>
              <button type="button" className="pm-sort" onClick={() => sortBy("title")}>
                Form <SortMark on={sort.by === "title"} dir={sort.dir} />
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort("status")}>
              <button type="button" className="pm-sort" onClick={() => sortBy("status")}>
                Status <SortMark on={sort.by === "status"} dir={sort.dir} />
              </button>
            </th>
            <th scope="col" className="fm-col-num" aria-sort={ariaSort("responses")}>
              <button type="button" className="pm-sort" onClick={() => sortBy("responses")}>
                Responses <SortMark on={sort.by === "responses"} dir={sort.dir} />
              </button>
            </th>
            <th scope="col" className="ws-col-date" aria-sort={ariaSort("updated")}>
              <button type="button" className="pm-sort" onClick={() => sortBy("updated")}>
                Updated <SortMark on={sort.by === "updated"} dir={sort.dir} />
              </button>
            </th>
            <th scope="col" className="ws-col-menu">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((f) => (
            <tr key={f.id} className="ws-row fm-row-click" onClick={(e) => !(e.target as Element).closest("button, a") && show(f.id)}>
              <td className="ws-col-name">
                <div className="ws-file">
                  <FormArt kind={f.kind} size="sm" />
                  <span className="ws-name">
                    <button type="button" className="ws-name__link fm-table__title" onClick={() => show(f.id)}>
                      {f.title}
                    </button>
                    <span className="ws-name__sub">
                      {formKindLabel(f.kind)}
                      {sourced && f.holder.kind !== "office" ? ` · ${f.holder.name}` : f.issuer && ` · ${f.issuer.name}`}
                      <Tags f={f} desk={desk} />
                    </span>
                  </span>
                </div>
              </td>
              <td>
                <StatusMark status={f.status} />
              </td>
              <td className="fm-col-num">{f.responses?.total || <span className="ws-none-mark">—</span>}</td>
              <td className="ws-col-date">
                <time dateTime={f.updatedAt}>{ago(f.updatedAt)}</time>
              </td>
              <td className="ws-col-menu">
                <RowMenu label={`Actions for ${f.title}`} items={menu(f)} disabled={pending} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="ws fm-shelf">
      <ShelfHero
        title={title}
        chips={used.map((k) => ({ key: k.key, label: k.plural, count: inSource.filter((f) => f.kind === k.key).length, tone: k.key }))}
        total={inSource.length}
        picked={kind}
        onPick={(k) => setKind(k as FormKind | null)}
        filterLabel="Filter by kind"
        art={(only ? ([only, only === "evaluation" ? "survey" : "application", "proposal"] as FormKind[]) : (["survey", "proposal", "application"] as FormKind[])).map((k, i) => (
          <FormArt key={`${k}${i}`} kind={k} />
        ))}
      />

      {sourced ? (
        <>
          <Tabs<FormHolder>
            label="Whose forms"
            idBase={tabsId}
            tabs={SOURCES.map((s) => ({ key: s.key, label: s.label, count: counts[s.key] || undefined }))}
            value={source}
            onChange={(s) => {
              setSource(s);
              setKind(null);
            }}
            actions={actions}
            search={search}
          />
          <TabPanel idBase={tabsId} index={SOURCES.findIndex((s) => s.key === source)}>
            {list}
          </TabPanel>
        </>
      ) : (
        <>
          <div className="content-tabs">
            <div className="content-tabs__controls">
              <div className="content-tabs__actions">{actions}</div>
              <div className="content-tabs__search">{search}</div>
            </div>
          </div>
          {list}
        </>
      )}

      {openForm && (
        <FormWindow
          key={openForm.id}
          form={openForm}
          desk={desk}
          link={linkOf(openForm)}
          onCopy={() => void copy(openForm)}
          act={act}
          onRemove={() => setRemoving(openForm)}
          onBuild={() => setBuilding(openForm)}
          onPublish={() => setPublishing(openForm)}
          onClose={() => show(null)}
        />
      )}
      {building && (
        <FormBuilder
          key={building === "new" ? "new" : building.id}
          form={building === "new" ? undefined : building}
          desk={desk}
          act={act}
          onSaved={(id) => {
            setBuilding(null);
            show(id);
          }}
          onClose={() => setBuilding(null)}
        />
      )}
      {publishing && (
        <Sheet title="Publish this form?" onClose={() => setPublishing(null)} className="ws-sheet--confirm">
          {(close) => (
            <div className="ws-sheet__body">
              <p className="ws-sheet__text">
                “{publishing.title}” starts taking responses, and they reach the Office of the QS/THE Rankings. Once published, it can’t be edited or deleted.
              </p>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close} autoFocus>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--dark"
                  disabled={pending}
                  onClick={async () => {
                    if ((await act({ type: "form.status", id: publishing.id, status: "open" })).ok) close();
                  }}
                >
                  <Icon name="send" size={16} /> Publish
                </button>
              </footer>
            </div>
          )}
        </Sheet>
      )}
      {removing && (
        <Sheet title="Delete this draft?" onClose={() => setRemoving(null)} className="ws-sheet--confirm">
          {(close) => (
            <div className="ws-sheet__body">
              <p className="ws-sheet__text">“{removing.title}” and its questions are deleted for good. It never took a response.</p>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close} autoFocus>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={pending}
                  onClick={async () => {
                    if ((await act({ type: "form.delete", id: removing.id })).ok) close();
                  }}
                >
                  <Icon name="trash" size={16} /> Delete
                </button>
              </footer>
            </div>
          )}
        </Sheet>
      )}
      <p className="sr-only" aria-live="polite">
        {term || kind ? plural(shown.length, "form") : ""}
      </p>
    </div>
  );
}
