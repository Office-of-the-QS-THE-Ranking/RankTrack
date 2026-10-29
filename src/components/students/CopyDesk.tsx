"use client";

/*
 * The Student Portal's Project Proposals and Terminal Reports (user, 2026-10-29). A Student (the Secretary of a
 * student organization, commission or council) never edits the form itself: Create picks one of the forms the
 * Office published to the Student Portal (the Community Development Project Proposal for now), names the copy and
 * chooses who can open it, and builds it. The copy has its own reference and an editable link, which the Student
 * forwards to their team; everyone with access fills it in together, and it's sent from there. The table lists only
 * the copies they built, with where each stands: a copy another Secretary added them to opens through its link.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildFormCopy } from "@/app/actions/form-copies";
import { AccessChoice, PeopleEditor } from "@/components/forms/copy-parts";
import { FormArt } from "@/components/forms/art";
import { ResponseMark } from "@/components/forms/marks";
import { useNoEmoji } from "@/components/forms/controls";
import { useViewer } from "@/components/hub/HubProvider";
import { RowMenu, SortMark } from "@/components/publications/PostManager";
import { Icon } from "@/components/ui/Icon";
import { SearchField } from "@/components/ui/search-field";
import { Select } from "@/components/ui/pickers";
import { InfoTooltip } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { Sheet } from "@/components/workspace/parts";
import { ShelfHero } from "@/components/workspace/ShelfHero";
import { COPY_LIMITS, copyPath, type CopyAccess } from "@/lib/forms/copies";
import { dayLabel, plural } from "@/lib/forms/format";
import { INCOMPLETE, STATUS_LABEL } from "@/lib/forms/review";
import { portalCatalog, type CatalogFilter, type CatalogOrder } from "@/lib/forms/portal-catalog";
import type { ResponseStatus } from "@/lib/forms/types";
import type { CopyDesk as Desk, PortalForm, StudentCopy } from "@/lib/governance/hub-types";

type Stand = "draft" | ResponseStatus;
type Sort = { by: "ref" | "status" | "edited"; dir: 1 | -1 };

const STAND_ORDER: Stand[] = ["draft", "returned", "received", "in-review", "approved", "declined"];
const standLabel = (s: Stand) => (s === "draft" ? INCOMPLETE : STATUS_LABEL[s]);
const EDIT_DATE = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const EDIT_TIME = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Manila" });

/** What the page calls its copies: proposals or terminal reports. */
const WORDS = {
  proposal: { title: "Project Proposals", one: "proposal", many: "proposals", create: "Create proposal" },
  "terminal-report": { title: "Terminal Reports", one: "terminal report", many: "terminal reports", create: "Create terminal report" },
} as const;

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, "ok");
  } catch {
    toast("Couldn’t copy. Open the copy and copy its address instead.", "error");
  }
}

export function CopyDesk({ desk }: { desk: Desk }) {
  useNoEmoji();
  const words = WORDS[desk.kind as keyof typeof WORDS] ?? WORDS.proposal;
  const [q, setQ] = useState("");
  const [stand, setStand] = useState<Stand | null>(null);
  const [sort, setSort] = useState<Sort>({ by: "edited", dir: -1 });
  const [building, setBuilding] = useState(false);
  const linkOf = (c: StudentCopy) => `${desk.origin}${copyPath(c.form.code, c.token)}`;

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const rows = desk.copies.filter((c) => (!stand || c.status === stand) && (!term || [c.ref, c.label, c.form.title, c.edited.by].some((t) => t.toLowerCase().includes(term))));
    const key = (c: StudentCopy): string | number => (sort.by === "ref" ? c.ref : sort.by === "status" ? STAND_ORDER.indexOf(c.status) : c.edited.at);
    return rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
  }, [desk.copies, stand, term, sort]);
  const sortBy = (by: Sort["by"]) => setSort((s) => (s.by === by ? { by, dir: s.dir === 1 ? -1 : 1 } : { by, dir: by === "edited" ? -1 : 1 }));
  const ariaSort = (by: Sort["by"]) => (sort.by === by ? (sort.dir === 1 ? "ascending" : "descending") : undefined);
  const stands = STAND_ORDER.filter((s) => desk.copies.some((c) => c.status === s));
  const canBuild = desk.forms.length > 0;

  return (
    <div className="ws fm-shelf st-desk">
      <ShelfHero
        title={words.title}
        chips={stands.map((s) => ({ key: s, label: standLabel(s), count: desk.copies.filter((c) => c.status === s).length }))}
        total={desk.copies.length}
        picked={stand}
        onPick={(k) => setStand(k as Stand | null)}
        filterLabel="Filter by status"
        art={[desk.kind, desk.kind, desk.kind].map((k, i) => (
          <FormArt key={i} kind={k} />
        ))}
      />

      <div className="content-tabs">
        <div className="content-tabs__controls">
          <div className="content-tabs__actions">
            {canBuild && (
              <button type="button" className="btn content-tabs__action" onClick={() => setBuilding(true)}>
                <Icon name="plus" size={15} /> {words.create}
              </button>
            )}
          </div>
          {desk.copies.length > 0 && (
            <div className="content-tabs__search">
              <SearchField value={q} onChange={setQ} placeholder={`Search ${words.many}`} label={`Search ${words.many}`} examples={["Search by reference", "Search by name"]} shortcuts />
            </div>
          )}
        </div>
      </div>

      {!desk.copies.length ? (
        <div className="ws-empty">
          <span className="ws-empty__art">
            <FormArt kind={desk.kind} size="lg" />
          </span>
          <p className="ws-empty__title">{canBuild ? `No ${words.many} yet` : `No ${words.one} forms on the Student Portal yet`}</p>
          {canBuild && (
            <button type="button" className="btn btn--dark btn--sm" onClick={() => setBuilding(true)}>
              <Icon name="plus" size={15} /> {words.create}
            </button>
          )}
        </div>
      ) : !shown.length ? (
        <div className="ws-card ws-none">
          <p>No {words.many} match.</p>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              setQ("");
              setStand(null);
            }}
          >
            Show all {words.many}
          </button>
        </div>
      ) : (
        <div className="ws-card st-copies-scroll" role="region" aria-label={`${words.title} table`} tabIndex={0}>
          <table className="ws-table st-copies">
            <caption className="sr-only">{words.title}</caption>
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort("ref")}>
                  <button type="button" className="pm-sort" onClick={() => sortBy("ref")}>
                    {desk.kind === "proposal" ? "Proposal Title" : "Terminal Report Title"} <SortMark on={sort.by === "ref"} dir={sort.dir} />
                  </button>
                </th>
                <th scope="col" className="st-col-access">
                  Access
                </th>
                <th scope="col" className="st-col-status" aria-sort={ariaSort("status")}>
                  <button type="button" className="pm-sort" onClick={() => sortBy("status")}>
                    Status <SortMark on={sort.by === "status"} dir={sort.dir} />
                  </button>
                </th>
                <th scope="col" className="ws-col-date" aria-sort={ariaSort("edited")}>
                  <button type="button" className="pm-sort" onClick={() => sortBy("edited")}>
                    Last Edit <SortMark on={sort.by === "edited"} dir={sort.dir} />
                  </button>
                </th>
                <th scope="col" className="ws-col-menu">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.token} className="ws-row fm-row-click" onClick={(e) => !(e.target as Element).closest("button, a") && window.open(linkOf(c), "_blank", "noopener")}>
                  <td className="ws-col-name">
                    <div className="ws-file">
                      <FormArt kind={c.form.kind} size="sm" />
                      <span className="ws-name">
                        <a className="ws-name__link fm-table__title" href={linkOf(c)} target="_blank" rel="noopener noreferrer">
                          {c.label}
                        </a>
                        <b className="st-ref">{c.ref}</b>
                        <span className="st-copy-form">{c.form.title}</span>
                      </span>
                    </div>
                  </td>
                  <td className="st-col-access">
                    <span className="st-access" title={c.access === "private" ? "Only people added" : "Anyone with the link"}>
                      <Icon name={c.access === "private" ? "lock-keyhole" : "link"} size={14} />
                      <span>{c.access === "private" ? "Private" : "Public"}</span>
                    </span>
                  </td>
                  <td className="st-col-status">
                    <div className="st-copy-status">
                      <ResponseMark status={c.status} />
                      <div className="st-copy-progress" data-complete={c.progress === 100 || c.status !== "draft" ? "true" : "false"}>
                        <progress className="st-copy-progress__bar" max={100} value={c.progress} aria-label={`Form completion for ${c.label}`} />
                        <span>{c.progress}%</span>
                      </div>
                    </div>
                  </td>
                  <td className="ws-col-date">
                    <time className="st-edited" dateTime={c.edited.at} title={c.edited.by ? `By ${c.edited.by}` : undefined}>
                      <span>{EDIT_DATE.format(new Date(c.edited.at))}</span>
                      <span className="st-edited__time">{EDIT_TIME.format(new Date(c.edited.at))} PHT</span>
                    </time>
                  </td>
                  <td className="ws-col-menu">
                    <RowMenu
                      label={`Actions for ${c.ref}`}
                      items={[
                        { label: c.status === "draft" ? "Open and edit" : "Open", icon: "arrow-up-right", onSelect: () => window.open(linkOf(c), "_blank", "noopener") },
                        { label: "Copy link", icon: "copy", onSelect: () => void copyText(linkOf(c), "Link copied. Forward it to your team.") },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {building && <BuildSheet desk={desk} words={words} onClose={() => setBuilding(false)} />}
      <p className="sr-only" aria-live="polite">
        {term || stand ? plural(shown.length, words.one, words.many) : ""}
      </p>
    </div>
  );
}

/* ---------- Create: a copy of a published form ---------- */

function BuildSheet({ desk, words, onClose }: { desk: Desk; words: (typeof WORDS)[keyof typeof WORDS]; onClose: () => void }) {
  const router = useRouter();
  const viewer = useViewer();
  const [formId, setFormId] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const detailsForm = useRef<HTMLFormElement>(null);
  const [advanceToInvites, setAdvanceToInvites] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [order, setOrder] = useState<CatalogOrder>("alphabetical");
  const [label, setLabel] = useState("");
  const [access, setAccess] = useState<CopyAccess>("private");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [built, setBuilt] = useState<{ ref: string; url: string } | null>(null);
  const form = desk.forms.find((f) => f.id === formId);
  const choices = useMemo(() => portalCatalog(desk.forms, desk.copies, query, filter, order), [desk.forms, desk.copies, query, filter, order]);
  const owner = viewer ? { name: viewer.name, email: viewer.email.toLowerCase(), avatar: viewer.avatar } : null;

  useEffect(() => {
    if (step === 3) document.getElementById("st-copy-people")?.focus();
  }, [step]);

  useEffect(() => {
    if (!advanceToInvites || step !== 2) return;
    setAdvanceToInvites(false);
    if (detailsForm.current?.reportValidity()) setStep(3);
  }, [advanceToInvites, step]);

  const goToStep = (next: 1 | 2 | 3) => {
    if (busy || next === step || (next > 1 && !form)) return;
    if (next === 3) {
      if (access !== "private") return;
      setStep(2);
      setAdvanceToInvites(true);
      return;
    }
    setStep(next);
  };

  const build = async () => {
    if (!form) return toast(`Choose the ${words.one} form.`, "error");
    setBusy(true);
    const r = await buildFormCopy({ code: form.code, label, access, members }).catch(() => ({ ok: false as const, message: "The Hub could not be reached. Check your connection and try again." }));
    setBusy(false);
    toast(r.message, r.ok ? "ok" : "error");
    if (!r.ok) return;
    setBuilt({ ref: r.ref, url: `${desk.origin}${r.path}` });
    router.refresh();
  };

  return (
    <Sheet title={built ? `${built.ref} is ready` : words.create} onClose={onClose} className="fm-sheet st-sheet">
      {(close) =>
        built ? (
          <div className="ws-sheet__body st-built">
            <div className="st-built__top">
              <span className="st-built__seal" aria-hidden="true">
                <Icon name="check" size={26} strokeWidth={2.6} />
              </span>
              <p className="st-built__ref">{built.ref}</p>
              <p className="st-built__name">{label}</p>
            </div>
            <div className="st-built__link">
              <span className="st-built__label">Editable link</span>
              <p className="fm-linkbox">
                <Icon name="link" size={16} />
                <span className="fm-linkbox__url">{built.url.replace(/^https?:\/\//, "")}</span>
              </p>
              <div className="st-built__actions">
                <button type="button" className="btn btn--dark btn--sm" onClick={() => void copyText(built.url, "Link copied. Forward it to your team.")}>
                  <Icon name="copy" size={15} /> Copy link
                </button>
                <a className="btn btn--sm" href={built.url} target="_blank" rel="noopener noreferrer">
                  Open <Icon name="arrow-up-right" size={14} />
                </a>
              </div>
              <p className="st-built__note">
                <Icon name={access === "private" ? "lock-keyhole" : "users"} size={14} />
                {access === "private" ? "Only the people you added can open it, signed in with Google." : "Anyone you forward it to can fill it in with you."}
              </p>
            </div>
            <footer className="ws-sheet__foot">
              <button type="button" className="btn" onClick={close} autoFocus>
                Done
              </button>
            </footer>
          </div>
        ) : step === 1 ? (
          <div className="ws-sheet__body fm-sheet__body st-catalog">
            <BuildSteps step={step} invitationOnly={access === "private"} onPick={goToStep} hasForm={!!form} busy={busy} />
            <div className="st-catalog__intro">
              <h3 id="st-build-form" className="fm-sheet__section-title">Choose a form</h3>
              <InfoTooltip label="How to choose a form" escapeClipping>
                Select a form to continue with your {words.one}.
              </InfoTooltip>
            </div>
            <div className="content-tabs st-catalog__toolbar">
              <div className="content-tabs__controls">
                <div className="content-tabs__actions">
                  <Select className="select content-tabs__action" value={filter} onChange={(v) => setFilter(v as CatalogFilter)} aria-label="Filter forms">
                    <option value="all">Filter: All forms</option>
                    <option value="used">Filter: Previously used</option>
                    <option value="unused">Filter: Not used yet</option>
                  </Select>
                  <Select className="select content-tabs__action" value={order} onChange={(v) => setOrder(v as CatalogOrder)} aria-label="Reorder forms">
                    <option value="alphabetical">Reorder: Alphabetically</option>
                    <option value="newest">Reorder: Newly added</option>
                    <option value="recent">Reorder: Recently used</option>
                  </Select>
                </div>
                <div className="content-tabs__search">
                  <SearchField value={query} onChange={setQuery} placeholder="Search forms" label="Search available forms" />
                </div>
              </div>
            </div>
            <div className="st-catalog__scroll" tabIndex={0} role="region" aria-labelledby="st-build-form">
              <div className="st-forms">
                {choices.map((f) => (
                  <FormChoice key={f.id} form={f} on={f.id === formId} onPick={() => { setFormId(f.id); setStep(2); }} />
                ))}
              </div>
              {!choices.length && (
                <div className="st-catalog__empty">
                  <p>No forms match your search or filter.</p>
                  <button type="button" className="btn btn--sm" onClick={() => { setQuery(""); setFilter("all"); }}>Show all forms</button>
                </div>
              )}
            </div>
            <footer className="ws-sheet__foot st-catalog__foot">
              <span className="st-catalog__count" role="status">{plural(choices.length, "form")} available</span>
              <button type="button" className="btn" onClick={close}>Cancel</button>
            </footer>
          </div>
        ) : (
          <form
            key={step}
            ref={detailsForm}
            className="ws-sheet__body fm-sheet__body"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === 2 && access === "private") {
                setStep(3);
                return;
              }
              void build();
            }}
          >
            <BuildSteps step={step} invitationOnly={access === "private"} onPick={goToStep} hasForm={!!form} busy={busy} />
            <div className="fm-sheet__scroll st-build">
              {form && (
                <div className="st-selected-form">
                  <FormArt kind={form.kind} size="sm" />
                  <div><span>Selected form</span><b>{form.title}</b></div>
                  <button type="button" className="btn btn--sm st-selected-form__change" onClick={() => setStep(1)} disabled={busy}>
                    Change form
                  </button>
                </div>
              )}
              {step === 2 ? (
                <>
                  <section className="st-build__sec">
                    <label className="field">
                      <span className="field__label">File name</span>
                      <input
                        className="input"
                        value={label}
                        title=""
                        required
                        maxLength={COPY_LIMITS.label}
                        placeholder={desk.kind === "terminal-report" ? "Terminal Report - Community Outreach Day" : "Community Development Project - Barangay 412"}
                        autoComplete="off"
                        autoFocus
                        data-missing="Name the copy, like the project it’s for."
                        onChange={(e) => setLabel(e.target.value)}
                      />
                    </label>
                  </section>
                  <section className="st-build__sec" aria-labelledby="st-build-access">
                    <h3 className="fm-sheet__section-title" id="st-build-access">
                      Who can open it
                    </h3>
                    <AccessChoice value={access} onChange={setAccess} name="st-copy-access" />
                  </section>
                </>
              ) : (
                <section className="st-build__sec" aria-labelledby="st-build-invite">
                  <h3 className="fm-sheet__section-title" id="st-build-invite">Invite people</h3>
                  {owner && form && <PeopleEditor id="st-copy-people" code={form.code} owner={owner} value={members} onChange={setMembers} />}
                </section>
              )}
            </div>
            <footer className="ws-sheet__foot">
              <button type="button" className="btn st-build-back" onClick={() => setStep(step === 3 ? 2 : 1)} disabled={busy}>
                Back
              </button>
              <button type="submit" className="btn btn--dark" disabled={busy || !form || (access === "private" && !owner)} aria-busy={busy || undefined}>
                {step === 2 && access === "private" ? "Next" : <><Icon name="spark" size={15} /> {busy ? "Building…" : "Build Form"}</>}
              </button>
            </footer>
          </form>
        )
      }
    </Sheet>
  );
}

/** One published form to build from: its art, title, issuer and size. */
function FormChoice({ form, on, onPick }: { form: PortalForm; on: boolean; onPick: () => void }) {
  return (
    <button type="button" className="st-form" data-on={on || undefined} onClick={onPick} autoFocus={on} aria-label={`Choose ${form.title}`}>
      <span className="st-form__art">
        <FormArt kind={form.kind} size="sm" />
      </span>
      <span className="st-form__text">
        <b>{form.title}</b>
        <small>
          {[form.issuer, form.closesOn ? `until ${dayLabel(form.closesOn)}` : undefined].filter(Boolean).join(" · ")}
        </small>
      </span>
      <span className="st-form__tick" aria-hidden="true">
        <Icon name={on ? "check" : "arrow-up-right"} size={12} strokeWidth={2.8} />
      </span>
    </button>
  );
}

function BuildSteps({ step, invitationOnly, onPick, hasForm, busy }: { step: 1 | 2 | 3; invitationOnly: boolean; onPick: (step: 1 | 2 | 3) => void; hasForm: boolean; busy: boolean }) {
  return <ol className="st-build-steps" aria-label="Creation steps">
    <li data-done={step > 1 || undefined}><button type="button" aria-current={step === 1 ? "step" : undefined} onClick={() => onPick(1)} disabled={busy}><span>1</span> Choose a form</button></li>
    <li data-done={step > 2 || undefined}><button type="button" aria-current={step === 2 ? "step" : undefined} onClick={() => onPick(2)} disabled={busy || !hasForm}><span>2</span> File name & access</button></li>
    {invitationOnly && <li><button type="button" aria-current={step === 3 ? "step" : undefined} onClick={() => onPick(3)} disabled={busy || !hasForm}><span>3</span> Invite people</button></li>}
  </ol>;
}
