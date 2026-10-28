"use client";

/*
 * Digital Forms: the Workspace's repository of electronic forms (application forms, proposals, surveys,
 * evaluations, registrations, terminal reports), each with its details, its own responder link, its responses and their analytics.
 * A night header files the forms by kind; they show as cards (a drawn form, its status, its responses this week)
 * or as a table. A form opens in a full-size window (FormWindow.tsx), whose address (?form=…) can be shared. In a
 * unit's Workspace the Office's open forms sit beside the unit's own, to fill in and pass on.
 */
import { useEffect, useMemo, useState } from "react";
import type { Command, CommandResult } from "@/lib/governance/commands";
import type { FormItem, FormsDesk } from "@/lib/governance/hub-types";
import { FORM_KINDS, formKindLabel, formPath } from "@/lib/forms/kinds";
import { dayLabel, plural } from "@/lib/forms/format";
import type { FormKind, FormStatus } from "@/lib/forms/types";
import { useGovern } from "@/components/hub/HubProvider";
import { RowMenu, SortMark, type MenuItem } from "@/components/publications/PostManager";
import { Icon } from "@/components/ui/Icon";
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

/** What a form card or row offers. */
export function formMenu(f: FormItem, { copy, open, act, remove, build }: { copy: () => void; open: () => void; act: (cmd: Command) => Promise<CommandResult>; remove: () => void; build?: () => void }): (MenuItem | false)[] {
  return [
    { label: "Open", icon: "arrow-up-right", onSelect: open },
    !!build && f.manage && f.status === "draft" && { label: "Edit questions", icon: "layers", onSelect: build },
    f.status !== "draft" && { label: "Copy responder link", icon: "copy", onSelect: copy },
    f.manage && f.status !== "open" && { label: "Take responses", icon: "play", onSelect: () => void act({ type: "form.status", id: f.id, status: "open" }) },
    f.manage && f.status === "open" && { label: "Close responses", icon: "lock", onSelect: () => void act({ type: "form.status", id: f.id, status: "closed" }) },
    f.manage && { label: "Duplicate as a draft", icon: "copy", onSelect: () => void act({ type: "form.duplicate", id: f.id }) },
    f.manage && f.status === "draft" && { label: "Delete draft", icon: "trash", danger: true, onSelect: remove },
  ];
}

export function DigitalForms({ desk }: { desk: FormsDesk }) {
  useNoEmoji();
  const { run, pending } = useGovern();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<FormKind | null>(null);
  const [layout, setLayout] = useShelfLayout("ws-forms-layout");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ by: "status", dir: 1 });
  const [removing, setRemoving] = useState<FormItem | null>(null);
  /** The Forms Builder: a new form, or a draft's questions. */
  const [building, setBuilding] = useState<FormItem | "new" | null>(null);

  // ?form=<id> opens a form, so its window can be linked to and survives a reload.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("form");
    if (id && desk.forms.some((f) => f.id === id)) setOpenId(id);
  }, [desk.forms]);

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

  const used = FORM_KINDS.filter((k) => desk.forms.some((f) => f.kind === k.key));
  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const rows = desk.forms.filter(
      (f) => (!kind || f.kind === kind) && (!term || [f.title, f.description, f.reference ?? "", f.issuer?.name ?? "", formKindLabel(f.kind), f.code].some((t) => t.toLowerCase().includes(term))),
    );
    const key = (f: FormItem): string | number =>
      sort.by === "title" ? f.title.toLowerCase() : sort.by === "status" ? `${STATUS_ORDER[f.status]}${9_999_999_999_999 - Date.parse(f.updatedAt)}` : sort.by === "responses" ? (f.responses?.total ?? -1) : f.updatedAt;
    return rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
  }, [desk.forms, kind, term, sort]);

  const sortBy = (by: Sort["by"]) => setSort((s) => (s.by === by ? { by, dir: s.dir === 1 ? -1 : 1 } : { by, dir: by === "title" || by === "status" ? 1 : -1 }));
  const ariaSort = (by: Sort["by"]) => (sort.by === by ? (sort.dir === 1 ? "ascending" : "descending") : undefined);
  const openForm = openId ? desk.forms.find((f) => f.id === openId) : undefined;
  const menu = (f: FormItem) => formMenu(f, { copy: () => void copy(f), open: () => show(f.id), act, remove: () => setRemoving(f), build: () => setBuilding(f) });

  return (
    <div className="ws fm-shelf">
      <ShelfHero
        title="Digital Forms"
        chips={used.map((k) => ({ key: k.key, label: k.plural, count: desk.forms.filter((f) => f.kind === k.key).length, tone: k.key }))}
        total={desk.forms.length}
        picked={kind}
        onPick={(k) => setKind(k as FormKind | null)}
        filterLabel="Filter by kind"
        art={(["survey", "proposal", "application"] as FormKind[]).map((k) => (
          <FormArt key={k} kind={k} />
        ))}
      />

      <div className="content-tabs">
        <div className="content-tabs__controls">
          <div className="content-tabs__actions">
            {desk.canWrite && (
              <button type="button" className="btn content-tabs__action" onClick={() => setBuilding("new")}>
                <Icon name="plus" size={15} /> Create form
              </button>
            )}
            <LayoutSwitch layout={layout} onChange={setLayout} noun="forms" />
          </div>
          <div className="content-tabs__search">
            <SearchField value={q} onChange={setQ} placeholder="Search digital forms" label="Search digital forms" examples={["Search by title", "Search by office", "Search by form number"]} shortcuts />
          </div>
        </div>
      </div>

      {!desk.forms.length ? (
        <div className="ws-empty">
          <span className="ws-empty__art">
            <FormArt kind="application" size="lg" />
          </span>
          <p className="ws-empty__title">No digital forms yet</p>
          {desk.canWrite && (
            <button type="button" className="btn btn--dark btn--sm" onClick={() => setBuilding("new")}>
              <Icon name="plus" size={15} /> Create form
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
                  {f.shared && desk.unitId && <span className="ws-office">Office</span>}
                </span>
                <span className="fm-card__title">{f.title}</span>
                {f.issuer && <span className="fm-card__issuer">{f.issuer.name}</span>}
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
            <caption className="sr-only">Digital Forms</caption>
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
                          {f.issuer && ` · ${f.issuer.name}`}
                          {f.shared && desk.unitId && <span className="ws-office">Office</span>}
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
      )}

      {openForm && <FormWindow key={openForm.id} form={openForm} desk={desk} link={linkOf(openForm)} onCopy={() => void copy(openForm)} act={act} onRemove={() => setRemoving(openForm)} onBuild={() => setBuilding(openForm)} onClose={() => show(null)} />}
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
