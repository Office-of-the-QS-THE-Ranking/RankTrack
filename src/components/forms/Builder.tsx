"use client";

/*
 * The Forms Builder: a form put together from the Hub's modules and UST's presets (docs/digital-forms.md) in a
 * full-size window. The palette on the left adds a question (click, or drag it into place); the canvas in the
 * middle shows each step as the responder page asks it, live; the inspector on the right edits what's selected:
 * a question's wording, rules and condition, a step, or the form itself. The review (sign-offs and the office's
 * own fields) is the canvas's last card. Saving sends the schema with form.save, which checks it with readSchema;
 * the same check runs here as you build, so what's wrong is named before you save.
 */
import { Component, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { closeModal } from "@/components/ui/modal-motion";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon, isIconName, type IconName } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { toast } from "@/components/ui/toast";
import { FolderModal, Sheet } from "@/components/workspace/parts";
import type { Command, CommandResult } from "@/lib/governance/commands";
import type { FormItem, FormsDesk } from "@/lib/governance/hub-types";
import {
  PALETTE,
  blankField,
  blankSchema,
  conditionChoices,
  conditionWords,
  copyOf,
  dependents,
  fieldsBefore,
  fitPreset,
  keyFrom,
  newSection,
  questionsIn,
  renameField,
  schemaProblem,
  takenIds,
  withoutField,
} from "@/lib/forms/builder";
import { plural } from "@/lib/forms/format";
import { HOLDER_KINDS } from "@/lib/forms/access";
import { FORM_KINDS, FORM_LIMITS, MODULE_NAMES } from "@/lib/forms/kinds";
import { fieldMap, type FormContext } from "@/lib/forms/modules";
import { PRESETS } from "@/lib/forms/presets";
import { COMDEV_PROPOSAL } from "@/lib/forms/templates/comdev-proposal";
import type { ChoiceOption, Condition, FieldSpec, FieldType, FormKind, FormSchema, SectionSpec, StageSpec, StageVerb, TableColumn, UnitSection } from "@/lib/forms/types";
import { UNIT_CATEGORY_LABELS } from "@/lib/unit-categories";
import { FormArt } from "./art";
import { FieldInput } from "./fields";
import { MODULE_ICON } from "./FormWindow";

/** Where a question sits: a step by index, or the office's review. */
type Box = number | "review";
type Pick = { kind: "field"; box: Box; index: number } | { kind: "section"; index: number } | { kind: "stage"; index: number } | null;
type Drag = { move: { box: Box; index: number } } | { add: FieldType } | { preset: string };
type Spot = { box: Box; index: number };

const DRAG = "application/x-hub-form-builder";

const SECTION_ICONS: IconName[] = ["clipboard", "user", "users", "building", "pin", "calendar", "target", "wallet", "shield", "sustainability", "pen", "list", "globe", "info"];

const STARTS = [
  { key: "blank", label: "Blank form", hint: "Start with one empty step" },
  { key: "comdev", label: "Community Development Project Proposal", hint: "UST SIMBAHAYAN · 8 steps with review" },
] as const;

type Details = { title: string; description: string; kind: FormKind };

const fieldsOf = (schema: FormSchema, box: Box) => (box === "review" ? (schema.review?.fields ?? []) : schema.sections[box].fields);

/** Puts a box's fields back. */
function withFields(schema: FormSchema, box: Box, fields: FieldSpec[]): FormSchema {
  if (box === "review") return { ...schema, review: { stages: schema.review?.stages ?? [], fields } };
  return { ...schema, sections: schema.sections.map((s, i) => (i === box ? { ...s, fields } : s)) };
}

/** A broken preview never takes the Builder down: the card says so until the question is fixed. */
class PreviewGuard extends Component<{ children: ReactNode; spec: FieldSpec }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { spec: FieldSpec }) {
    if (prev.spec !== this.props.spec && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? <p className="fb-card__broken">Finish this question’s settings to see it.</p> : this.props.children;
  }
}

export function FormBuilder({ form, desk, act, onSaved, onClose }: { form?: FormItem; desk: FormsDesk; act: (cmd: Command) => Promise<CommandResult>; onSaved: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { sdgNames } = useViews();
  const paletteTabs = useId();
  const stepTabs = useId();
  // The kinds this form may be (lib/forms/access.ts): a Student's evaluations and registrations, a unit's all but
  // the Office's proposals and terminal reports. A Student's form has no sign-offs, so no Review.
  const kinds = form ? HOLDER_KINDS[form.holder.kind] : desk.create;
  const reviewed = (form?.holder.kind ?? desk.holder) !== "student";
  const starts = STARTS.filter((s) => s.key !== "comdev" || kinds.includes("proposal"));
  const [started, setStarted] = useState(!!form || starts.length < 2);
  const [details, setDetails] = useState<Details>({ title: form?.title ?? "", description: form?.description ?? "", kind: form?.kind ?? kinds[0] ?? "application" });
  const [schema, setSchema] = useState<FormSchema>(() => (form ? structuredClone(form.schema) : blankSchema()));
  const [pick, setPick] = useState<Pick>(null);
  /** The step on the canvas, by section id, or the review. */
  const [view, setView] = useState<string>(() => (form ? form.schema.sections[0]?.id : "section1") ?? "review");
  const [palette, setPalette] = useState<"Questions" | "Presets">("Questions");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** Questions added in this sitting: their keys still follow their labels. */
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());

  const problem = useMemo(() => schemaProblem(schema), [schema]);
  const fields = useMemo(() => fieldMap(schema.sections, schema.review?.fields ?? []), [schema]);
  const ctx: FormContext = { units: desk.units, answers: {}, fields, sdgNames };
  const questions = questionsIn(schema);
  const shownIndex = schema.sections.findIndex((s) => s.id === view);
  const box: Box = view === "review" ? "review" : Math.max(0, shownIndex);
  /** Shows a step (or the review) on the canvas. */
  const go = (b: Box, sections = schema.sections) => setView(b === "review" ? "review" : (sections[b]?.id ?? sections[0].id));

  const change = (next: FormSchema) => {
    setSchema(next);
    setDirty(true);
  };
  const changeDetails = (d: Partial<Details>) => {
    setDetails((x) => ({ ...x, ...d }));
    setDirty(true);
  };

  /** Where the next question goes: after the selected one, or at the end of the step in view. */
  const target = (): Spot => {
    if (pick?.kind === "field" && pick.box === box) return { box, index: pick.index + 1 };
    return { box, index: fieldsOf(schema, box).length };
  };

  const insert = (made: FieldSpec[], at: Spot) => {
    const list = [...fieldsOf(schema, at.box)];
    list.splice(at.index, 0, ...made);
    change(withFields(schema, at.box, list));
    setFresh((s) => new Set([...s, ...made.map((f) => f.id)]));
    setPick({ kind: "field", box: at.box, index: at.index + made.length - 1 });
    go(at.box);
  };

  const addModule = (type: FieldType, at = target()) => {
    const before = at.box === "review" ? [...schema.sections.flatMap((s) => s.fields), ...(schema.review?.fields ?? []).slice(0, at.index)] : fieldsBefore(schema, { section: at.box, index: at.index });
    const made = blankField(type, takenIds(schema), before);
    if (!made) return toast("Add a budget before its summary.", "info");
    insert([made], at);
  };

  const addPreset = (key: string, at = target()) => {
    const drop = fitPreset(key, schema);
    if (!drop) return;
    if (drop.review) {
      const review = { stages: [...(schema.review?.stages ?? []), ...drop.stages], fields: [...(schema.review?.fields ?? []), ...drop.fields] };
      change({ ...schema, review });
      setPick(drop.stages.length ? { kind: "stage", index: review.stages.length - 1 } : drop.fields.length ? { kind: "field", box: "review", index: review.fields.length - 1 } : null);
      setFresh((s) => new Set([...s, ...drop.fields.map((f) => f.id)]));
      go("review");
      return;
    }
    if (!drop.fields.length) return toast("The form already asks this.", "info");
    insert(drop.fields, at.box === "review" ? { box: schema.sections.length - 1, index: schema.sections[schema.sections.length - 1].fields.length } : at);
  };

  const moveField = (from: { box: Box; index: number }, to: Spot) => {
    const spec = fieldsOf(schema, from.box)[from.index];
    let next = withFields(schema, from.box, fieldsOf(schema, from.box).filter((_, i) => i !== from.index));
    const index = from.box === to.box && to.index > from.index ? to.index - 1 : to.index;
    const list = [...fieldsOf(next, to.box)];
    list.splice(index, 0, spec);
    next = withFields(next, to.box, list);
    change(next);
    setPick({ kind: "field", box: to.box, index });
    go(to.box);
  };

  const removeField = (box: Box, index: number) => {
    const spec = fieldsOf(schema, box)[index];
    const readers = dependents(schema, spec.id);
    change(withoutField(schema, spec.id));
    setPick(null);
    if (readers.length) toast(`Removed. Check ${readers.slice(0, 2).join(" and ")}${readers.length > 2 ? " and others" : ""}: they read it.`, "info");
  };

  const updateField = (box: Box, index: number, spec: FieldSpec) => {
    const old = fieldsOf(schema, box)[index];
    let next = withFields(schema, box, fieldsOf(schema, box).map((f, i) => (i === index ? spec : f)));
    // A question added in this sitting keeps a key that follows its label, so answers and exports read well.
    if (fresh.has(old.id) && spec.label !== old.label && spec.id === old.id) {
      const taken = takenIds(schema);
      taken.delete(old.id);
      const id = keyFrom(spec.label, taken);
      if (id !== old.id) {
        next = renameField(next, old.id, id);
        setFresh((s) => new Set([...[...s].filter((x) => x !== old.id), id]));
      }
    }
    change(next);
  };

  const updateSection = (index: number, s: SectionSpec) => change({ ...schema, sections: schema.sections.map((x, i) => (i === index ? s : x)) });

  const moveSection = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= schema.sections.length) return;
    const sections = [...schema.sections];
    [sections[index], sections[to]] = [sections[to], sections[index]];
    change({ ...schema, sections });
    setPick({ kind: "section", index: to });
  };

  const removeSection = (index: number) => {
    if (schema.sections.length === 1) return toast("A form keeps at least one step.", "info");
    let next = schema;
    for (const f of schema.sections[index].fields) next = withoutField(next, f.id);
    const sections = next.sections.filter((_, i) => i !== index);
    change({ ...next, sections });
    const at = Math.max(0, index - 1);
    setPick({ kind: "section", index: at });
    go(at, sections);
  };

  const addStep = () => {
    const s = newSection(schema);
    change({ ...schema, sections: [...schema.sections, s] });
    setPick({ kind: "section", index: schema.sections.length });
    setView(s.id);
  };

  const setStages = (stages: StageSpec[]) => change({ ...schema, review: { stages, fields: schema.review?.fields ?? [] } });

  /* ---------- Dragging ---------- */

  const begin = (e: DragEvent, d: Drag) => {
    e.dataTransfer.setData(DRAG, "1");
    e.dataTransfer.effectAllowed = "move" in d ? "move" : "copy";
    setDrag(d);
  };
  const over = (e: DragEvent, at: Spot) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    if (spot?.box !== at.box || spot.index !== at.index) setSpot(at);
  };
  const overCard = (e: DragEvent, box: Box, index: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    over(e, { box, index: e.clientY > r.top + r.height / 2 ? index + 1 : index });
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    const at = spot;
    const d = drag;
    setDrag(null);
    setSpot(null);
    if (!at || !d) return;
    if ("move" in d) moveField(d.move, at);
    else if ("add" in d) addModule(d.add, at);
    else addPreset(d.preset, at);
  };
  const end = () => {
    setDrag(null);
    setSpot(null);
  };

  /* ---------- Saving ---------- */

  const save = async () => {
    if (!details.title.trim()) {
      setPick(null);
      return toast("Give the form a title.", "error");
    }
    if (problem) return toast(problem, "error");
    setBusy(true);
    const r = await act({
      type: "form.save",
      // A new form is the Student's own, the unit's, or the Office's, as the page it's made on. Team copies follow from the kind.
      ...(form ? { id: form.id, reference: form.reference, issuerId: form.issuer?.id, closesOn: form.closesOn } : desk.holder === "student" ? { own: true } : desk.unitId ? { unitId: desk.unitId } : {}),
      title: details.title,
      description: details.description,
      kind: details.kind,
      schema,
    });
    setBusy(false);
    if (!r.ok) return;
    setDirty(false);
    const id = form?.id ?? (r.data && typeof r.data === "object" && "id" in r.data ? String((r.data as { id: string }).id) : null);
    if (id) closeModal(dialog.current, () => onSaved(id));
  };

  const close = () => (dirty ? setLeaving(true) : closeModal(dialog.current));

  /* ---------- Start ---------- */

  if (!started)
    return (
      <FolderModal label="Create form" onClose={onClose} className="fm-window fb" dialogRef={dialog}>
        <header className="fm-window__head">
          <span className="fm-window__art">
            <FormArt kind={details.kind} size="sm" />
          </span>
          <div className="fm-window__titles">
            <span className="fm-window__eyebrow">Forms Builder</span>
            <h2 className="fm-window__title">Create form</h2>
          </div>
          <div className="fm-window__actions">
            <button type="button" className="ws-modal__x" aria-label="Close" onClick={() => closeModal(dialog.current)}>
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>
        <div className="fm-window__body fb-start">
          <ul className="fb-start__list">
            {starts.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  className="fb-start__card"
                  onClick={() => {
                    if (s.key === "comdev") {
                      setSchema(structuredClone(COMDEV_PROPOSAL.schema));
                      setDetails({ title: COMDEV_PROPOSAL.title, description: COMDEV_PROPOSAL.description, kind: COMDEV_PROPOSAL.kind });
                    }
                    setStarted(true);
                    setDirty(s.key === "comdev");
                  }}
                >
                  <span className="fb-start__art">
                    <FormArt kind={s.key === "comdev" ? "proposal" : "application"} />
                  </span>
                  <span className="fb-start__name">{s.label}</span>
                  <span className="fb-start__hint">{s.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </FolderModal>
    );

  const picked = pick?.kind === "field" ? fieldsOf(schema, pick.box)[pick.index] : undefined;

  return (
    <FolderModal label={form ? `Edit questions of ${form.title}` : "Create form"} onClose={onClose} className="fm-window fb" dialogRef={dialog}>
      <header className="fm-window__head fb-head">
        <span className="fm-window__art">
          <FormArt kind={details.kind} size="sm" />
        </span>
        <div className="fm-window__titles">
          <span className="fm-window__eyebrow">Forms Builder{form && <span className="fm-window__ref">Draft</span>}</span>
          <input
            className="fb-head__title"
            value={details.title}
            maxLength={FORM_LIMITS.title}
            placeholder="Untitled form"
            aria-label="Form title"
            title=""
            onChange={(e) => changeDetails({ title: e.target.value })}
          />
        </div>
        <div className="fm-window__actions">
          <span className="fb-state" data-ok={!problem || undefined} title={problem ?? undefined}>
            <Icon name={problem ? "alert" : "check"} size={14} />
            <span>{problem ? "Needs a fix" : `${plural(schema.sections.length, "step")} · ${plural(questions, "question")}`}</span>
          </span>
          <button type="button" className="btn content-tabs__action" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn btn--dark btn--sm fb-save" disabled={busy} onClick={() => void save()}>
            <Icon name="check" size={14} /> {form ? "Save questions" : "Create draft"}
          </button>
        </div>
      </header>

      <div className="fb-body">
        {/* Palette */}
        <aside className="fb-palette" aria-label="Add to the form">
          <Tabs<"Questions" | "Presets"> label="Add" idBase={paletteTabs} tabs={["Questions", "Presets"]} value={palette} onChange={setPalette} />
          <TabPanel idBase={paletteTabs} index={palette === "Questions" ? 0 : 1} className="fb-palette__scroll">
            {palette === "Questions"
              ? PALETTE.map((g) => (
                  <section key={g.group} className="fb-palette__group">
                    <h3>{g.group}</h3>
                    <ul>
                      {g.types.map((t) => (
                        <li key={t}>
                          <button type="button" className="fb-tool" draggable onDragStart={(e) => begin(e, { add: t })} onDragEnd={end} onClick={() => addModule(t)}>
                            <span className="fb-tool__icon">
                              <Icon name={MODULE_ICON[t]} size={15} />
                            </span>
                            {MODULE_NAMES[t]}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              : (["Who", "What", "Where and when", "Money", "Safety", "Sign", "Review"] as const).filter((group) => reviewed || group !== "Review").map((group) => (
                  <section key={group} className="fb-palette__group">
                    <h3>{group}</h3>
                    <ul>
                      {PRESETS.filter((p) => p.group === group).map((p) => (
                        <li key={p.key}>
                          <button
                            type="button"
                            className="fb-tool fb-tool--preset"
                            draggable={group !== "Review"}
                            onDragStart={(e) => begin(e, { preset: p.key })}
                            onDragEnd={end}
                            onClick={() => addPreset(p.key)}
                          >
                            <span className="fb-tool__icon">
                              <Icon name={group === "Review" ? "governance" : "spark"} size={15} />
                            </span>
                            {p.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
          </TabPanel>
        </aside>

        {/* Canvas: the steps as pills, each its own page */}
        <div className="fb-canvas" onClick={(e) => e.target === e.currentTarget && setPick(null)}>
          <div className="fb-tabs">
            <Tabs<string>
              label="Steps"
              idBase={stepTabs}
              tabs={[
                ...schema.sections.map((s, i) => ({ key: s.id, label: `${i + 1}. ${s.title.trim() || "Untitled step"}`, count: s.fields.filter((f) => f.type !== "note").length || undefined })),
                ...(reviewed ? [{ key: "review", label: "Review", count: (schema.review?.stages.length ?? 0) + (schema.review?.fields.length ?? 0) || undefined }] : []),
              ]}
              value={box === "review" ? "review" : schema.sections[box].id}
              onChange={(k) => {
                setView(k);
                const i = schema.sections.findIndex((s) => s.id === k);
                setPick(i >= 0 ? { kind: "section", index: i } : null);
              }}
              actions={
                <button type="button" className="btn content-tabs__action" onClick={addStep}>
                  <Icon name="plus" size={15} /> Add a step
                </button>
              }
            />
          </div>
          <TabPanel idBase={stepTabs} index={box === "review" ? schema.sections.length : box} className="fb-page">
            <div onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setSpot(null)}>
            {box !== "review" ? (
              (() => {
                const si = box;
                const s = schema.sections[si];
                return (
                  <section key={s.id} className="fb-step" data-picked={(pick?.kind === "section" && pick.index === si) || undefined}>
                    <header className="fb-step__head" onClick={() => setPick({ kind: "section", index: si })}>
                      <span className="fb-step__num">{String(si + 1).padStart(2, "0")}</span>
                      <span className="fb-step__icon" aria-hidden="true">
                        {isIconName(s.icon) ? <Icon name={s.icon} size={16} /> : <Icon name="list" size={16} />}
                      </span>
                      <input
                        className="fb-step__title"
                        value={s.title}
                        maxLength={60}
                        aria-label={`Step ${si + 1} title`}
                        title=""
                        onFocus={() => setPick({ kind: "section", index: si })}
                        onChange={(e) => updateSection(si, { ...s, title: e.target.value })}
                      />
                      {s.showIf && (
                        <span className="fb-when" title={conditionWords(s.showIf, fields)}>
                          <Icon name="workflow" size={12} /> Sometimes
                        </span>
                      )}
                      <span className="fb-step__tools">
                        <button type="button" className="fb-icon-btn" aria-label="Move step earlier" disabled={si === 0} onClick={() => moveSection(si, -1)}>
                          <Icon name="chevron" size={14} className="fb-left" />
                        </button>
                        <button type="button" className="fb-icon-btn" aria-label="Move step later" disabled={si === schema.sections.length - 1} onClick={() => moveSection(si, 1)}>
                          <Icon name="chevron" size={14} />
                        </button>
                        <button type="button" className="fb-icon-btn" aria-label="Remove step" disabled={schema.sections.length === 1} onClick={() => removeSection(si)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </span>
                    </header>
                    <FieldList
                      box={si}
                      specs={s.fields}
                      pick={pick}
                      spot={spot}
                      ctx={ctx}
                      dragging={!!drag}
                      onPick={(i) => setPick({ kind: "field", box: si, index: i })}
                      onDragStart={(e, i) => begin(e, { move: { box: si, index: i } })}
                      onDragEnd={end}
                      onOver={over}
                      onOverCard={overCard}
                      onDrop={drop}
                      onMove={(i, by) => moveField({ box: si, index: i }, { box: si, index: by < 0 ? i - 1 : i + 2 })}
                      onCopy={(i) => insert([copyOf(s.fields[i], takenIds(schema))], { box: si, index: i + 1 })}
                      onRemove={(i) => removeField(si, i)}
                    />
                    {si < schema.sections.length - 1 ? (
                      <button type="button" className="fb-next" onClick={() => (go(si + 1), setPick({ kind: "section", index: si + 1 }))}>
                        Next: {schema.sections[si + 1].title.trim() || "Untitled step"} <Icon name="arrow" size={14} />
                      </button>
                    ) : (
                      <button type="button" className="fb-next" onClick={addStep}>
                        <Icon name="plus" size={14} /> Add a step after this one
                      </button>
                    )}
                  </section>
                );
              })()
            ) : (
              <section className="fb-step fb-review" aria-label="Review">
              <header className="fb-step__head">
                <span className="fb-step__icon" aria-hidden="true">
                  <Icon name="governance" size={16} />
                </span>
                <span className="fb-step__name">Review</span>
                <span className="fb-step__meta">Only the people who run the form see this</span>
              </header>
              <ol className="fb-stages">
                {(schema.review?.stages ?? []).map((st, i) => (
                  <li key={st.id}>
                    <button type="button" className="fb-stage" data-picked={(pick?.kind === "stage" && pick.index === i) || undefined} onClick={() => setPick({ kind: "stage", index: i })}>
                      <span className="fm-chain__num">{i + 1}</span>
                      <span className="fm-chain__verb">{st.verb}</span>
                      <span className="fm-chain__role">{st.role}</span>
                      {st.showIf && <span className="fm-chain__when">When it applies</span>}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="fb-add-inline"
                    onClick={() => {
                      const stages = schema.review?.stages ?? [];
                      setStages([...stages, { id: keyFrom("sign off", takenIds(schema), "signOff"), role: "Approver", verb: "Approved" }]);
                      setPick({ kind: "stage", index: stages.length });
                    }}
                  >
                    <Icon name="plus" size={14} /> Add a sign-off
                  </button>
                </li>
              </ol>
              <FieldList
                box="review"
                specs={schema.review?.fields ?? []}
                pick={pick}
                spot={spot}
                ctx={ctx}
                dragging={!!drag}
                empty="Drop fields only the office fills in"
                onPick={(i) => setPick({ kind: "field", box: "review", index: i })}
                onDragStart={(e, i) => begin(e, { move: { box: "review", index: i } })}
                onDragEnd={end}
                onOver={over}
                onOverCard={overCard}
                onDrop={drop}
                onMove={(i, by) => moveField({ box: "review", index: i }, { box: "review", index: by < 0 ? i - 1 : i + 2 })}
                onCopy={(i) => insert([copyOf(fieldsOf(schema, "review")[i], takenIds(schema))], { box: "review", index: i + 1 })}
                onRemove={(i) => removeField("review", i)}
              />
              </section>
            )}
            </div>
          </TabPanel>
        </div>

        {/* Inspector */}
        <aside className="fb-inspector" aria-label="Settings">
          {problem && (
            <p className="fb-problem" role="status">
              <Icon name="alert" size={15} /> {problem}
            </p>
          )}
          {pick?.kind === "field" && picked ? (
            <FieldSettings
              key={`${pick.box}-${pick.index}`}
              spec={picked}
              before={pick.box === "review" ? [...schema.sections.flatMap((s) => s.fields), ...(schema.review?.fields ?? []).slice(0, pick.index)] : fieldsBefore(schema, { section: pick.box, index: pick.index })}
              fields={fields}
              from={schema.from}
              review={pick.box === "review"}
              sdgNames={sdgNames}
              onChange={(spec) => updateField(pick.box, pick.index, spec)}
              onFrom={(from) => change({ ...schema, from })}
              onRemove={() => removeField(pick.box, pick.index)}
              steps={pick.box === "review" ? undefined : schema.sections.map((s, i) => `${i + 1}. ${s.title.trim() || "Untitled step"}`)}
              step={pick.box === "review" ? undefined : pick.box}
              onStep={(to) => pick.box !== "review" && to !== pick.box && moveField({ box: pick.box, index: pick.index }, { box: to, index: schema.sections[to].fields.length })}
            />
          ) : pick?.kind === "section" && schema.sections[pick.index] ? (
            <SectionSettings
              key={pick.index}
              section={schema.sections[pick.index]}
              before={fieldsBefore(schema, { section: pick.index, index: 0 })}
              fields={fields}
              sdgNames={sdgNames}
              onChange={(s) => updateSection(pick.index, s)}
            />
          ) : pick?.kind === "stage" && schema.review?.stages[pick.index] ? (
            <StageSettings
              key={pick.index}
              stage={schema.review.stages[pick.index]}
              count={schema.review.stages.length}
              index={pick.index}
              before={schema.sections.flatMap((s) => s.fields).filter((f) => f.type !== "note")}
              fields={fields}
              sdgNames={sdgNames}
              onChange={(st) => setStages(schema.review!.stages.map((x, i) => (i === pick.index ? st : x)))}
              onMove={(by) => {
                const stages = [...schema.review!.stages];
                const to = pick.index + by;
                [stages[pick.index], stages[to]] = [stages[to], stages[pick.index]];
                setStages(stages);
                setPick({ kind: "stage", index: to });
              }}
              onRemove={() => {
                setStages(schema.review!.stages.filter((_, i) => i !== pick.index));
                setPick(null);
              }}
            />
          ) : (
            <FormSettings details={details} kinds={form && form.status !== "draft" ? [details.kind] : kinds} onChange={changeDetails} />
          )}
        </aside>
      </div>

      {leaving && (
        <Sheet title="Leave without saving?" onClose={() => setLeaving(false)} className="ws-sheet--confirm">
          {(closeSheet) => (
            <div className="ws-sheet__body">
              <p className="ws-sheet__text">{form ? "Your changes to these questions are lost." : "This form isn’t created yet; what you built is lost."}</p>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={closeSheet} autoFocus>
                  Keep building
                </button>
                <button type="button" className="btn btn--danger" onClick={() => closeModal(dialog.current)}>
                  Leave
                </button>
              </footer>
            </div>
          )}
        </Sheet>
      )}
    </FolderModal>
  );
}

/* ---------- The canvas's questions ---------- */

function FieldList({
  box,
  specs,
  pick,
  spot,
  ctx,
  dragging,
  empty = "Drop a question here, or pick one on the left",
  onPick,
  onDragStart,
  onDragEnd,
  onOver,
  onOverCard,
  onDrop,
  onMove,
  onCopy,
  onRemove,
}: {
  box: Box;
  specs: FieldSpec[];
  pick: Pick;
  spot: Spot | null;
  ctx: FormContext;
  dragging: boolean;
  empty?: string;
  onPick: (i: number) => void;
  onDragStart: (e: DragEvent, i: number) => void;
  onDragEnd: () => void;
  onOver: (e: DragEvent, at: Spot) => void;
  onOverCard: (e: DragEvent, box: Box, i: number) => void;
  onDrop: (e: DragEvent) => void;
  onMove: (i: number, by: -1 | 1) => void;
  onCopy: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const at = (i: number) => spot?.box === box && spot.index === i;
  let n = 0;
  return (
    <ol className="fb-fields" data-dragging={dragging || undefined} data-drop-end={(at(specs.length) && specs.length > 0) || undefined} data-drop-empty={(at(0) && !specs.length) || undefined} onDragOver={(e) => onOver(e, { box, index: specs.length })} onDrop={onDrop}>
      {!specs.length && <li className="fb-fields__empty">{empty}</li>}
      {specs.map((spec, i) => {
        const on = pick?.kind === "field" && pick.box === box && pick.index === i;
        const num = spec.type === "note" ? null : ++n;
        return (
          <li
            key={spec.id}
            className="fb-card"
            data-picked={on || undefined}
            data-drop={at(i) || undefined}
            data-half={spec.half || undefined}
            onDragOver={(e) => onOverCard(e, box, i)}
            onDrop={onDrop}
            onClick={() => onPick(i)}
          >
            <div className="fb-card__bar">
              <span className="fb-card__grip" draggable onDragStart={(e) => onDragStart(e, i)} onDragEnd={onDragEnd} title="Drag to move" aria-hidden="true">
                <Icon name="grip" size={14} />
              </span>
              <span className="fb-card__kind">
                <Icon name={MODULE_ICON[spec.type]} size={12} />
                {num !== null && <b>{typeof box === "number" ? `${box + 1}.${num}` : num}</b>}
                {MODULE_NAMES[spec.type]}
                {!spec.required && spec.type !== "note" && spec.type !== "consent" && " · optional"}
              </span>
              {spec.showIf && (
                <span className="fb-when" title={conditionWords(spec.showIf, ctx.fields)}>
                  <Icon name="workflow" size={12} /> Sometimes
                </span>
              )}
              <span className="fb-card__tools">
                <button type="button" className="fb-icon-btn" aria-label={`Move ${spec.label} up`} disabled={i === 0} onClick={(e) => (e.stopPropagation(), onMove(i, -1))}>
                  <Icon name="chevron" size={14} className="fb-up" />
                </button>
                <button type="button" className="fb-icon-btn" aria-label={`Move ${spec.label} down`} disabled={i === specs.length - 1} onClick={(e) => (e.stopPropagation(), onMove(i, 1))}>
                  <Icon name="chevron" size={14} className="fb-down" />
                </button>
                <button type="button" className="fb-icon-btn" aria-label={`Duplicate ${spec.label}`} onClick={(e) => (e.stopPropagation(), onCopy(i))}>
                  <Icon name="copy" size={14} />
                </button>
                <button type="button" className="fb-icon-btn" aria-label={`Remove ${spec.label}`} onClick={(e) => (e.stopPropagation(), onRemove(i))}>
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </div>
            <div className="fb-card__preview" inert>
              <PreviewGuard spec={spec}>
                <FieldInput spec={spec} value={undefined} onChange={() => {}} ctx={ctx} id={`fb-${spec.id}`} />
              </PreviewGuard>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- The inspector ---------- */

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="fb-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Text({ label, value, onChange, max = 200, placeholder, area }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; max?: number; placeholder?: string; area?: boolean }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {area ? (
        <textarea className="textarea" rows={3} title="" value={value ?? ""} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value || undefined)} />
      ) : (
        <input className="input" title="" value={value ?? ""} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value || undefined)} />
      )}
    </label>
  );
}

/** A whole number; 0 or empty means none. */
function Num({ label, value, onChange, min = 0, max = 100_000_000 }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <NumberField className="input" value={value ?? NaN} min={min} max={max} onChange={(n) => onChange(Number.isFinite(n) && n > 0 ? n : undefined)} aria-label={label} />
    </label>
  );
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean | undefined; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="fb-check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/** Lines of words, each its own input. */
function Lines({ label, values, onChange, noun, max = 20, area }: { label: string; values: string[]; onChange: (v: string[]) => void; noun: string; max?: number; area?: boolean }) {
  return (
    <div className="fb-lines">
      <span className="field__label">{label}</span>
      <ol>
        {values.map((v, i) => (
          <li key={i}>
            {area ? (
              <textarea className="textarea" rows={2} title="" value={v} aria-label={`${noun} ${i + 1}`} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
            ) : (
              <input className="input" title="" value={v} aria-label={`${noun} ${i + 1}`} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
            )}
            <button type="button" className="fb-icon-btn" aria-label={`Remove ${noun} ${i + 1}`} disabled={values.length <= 1} onClick={() => onChange(values.filter((_, j) => j !== i))}>
              <Icon name="close" size={13} />
            </button>
          </li>
        ))}
      </ol>
      {values.length < max && (
        <button type="button" className="fb-add-inline" onClick={() => onChange([...values, `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${values.length + 1}`])}>
          <Icon name="plus" size={13} /> Add {noun}
        </button>
      )}
    </div>
  );
}

/** Labels with stable values: renaming an option never breaks a condition that reads it. */
function Options({ label, options, onChange, noun = "option" }: { label: string; options: ChoiceOption[]; onChange: (o: ChoiceOption[]) => void; noun?: string }) {
  return (
    <Lines
      label={label}
      noun={noun}
      max={60}
      values={options.map((o) => o.label)}
      onChange={(labels) => {
        const taken = new Set(["other"]);
        const out = labels.map((l, i) => {
          const keep = options[i] && labels.length >= options.length ? options[i] : options.find((o) => o.label === l);
          const value = keep && !taken.has(keep.value) ? keep.value : keyFrom(l || noun, taken, noun);
          taken.add(value);
          return { ...(keep ?? {}), value, label: l };
        });
        onChange(out);
      }}
    />
  );
}

function ConditionEditor({ value, before, fields, sdgNames, onChange, what }: { value: Condition | undefined; before: FieldSpec[]; fields: Map<string, FieldSpec>; sdgNames?: Record<number, string>; onChange: (c: Condition | undefined) => void; what: string }) {
  const field = value ? fields.get(value.field) : undefined;
  const choices = field ? conditionChoices(field, sdgNames) : [];
  const mode = !value ? "always" : value.filled === false ? "empty" : value.filled ? "filled" : "is";
  return (
    <Group title={`When ${what} shows`}>
      {!before.length ? (
        <p className="fb-quiet">Always. A condition reads a question before it.</p>
      ) : (
        <>
          <label className="field">
            <span className="field__label">Shows</span>
            <Select
              className="select"
              value={value?.field ?? ""}
              onChange={(id) => {
                if (!id) return onChange(undefined);
                const f = fields.get(id)!;
                const opts = conditionChoices(f, sdgNames);
                onChange(opts.length ? { field: id, is: [opts[0].value] } : { field: id, filled: true });
              }}
            >
              <option value="">Always</option>
              {before.map((f) => (
                <option key={f.id} value={f.id}>
                  When {f.label}…
                </option>
              ))}
            </Select>
          </label>
          {value && field && (
            <>
              <label className="field">
                <span className="field__label">Is</span>
                <Select
                  className="select"
                  value={mode}
                  onChange={(m) => onChange(m === "filled" ? { field: value.field, filled: true } : m === "empty" ? { field: value.field, filled: false } : { field: value.field, is: [choices[0].value] })}
                >
                  {choices.length > 0 && <option value="is">One of these</option>}
                  <option value="filled">Answered</option>
                  <option value="empty">Left empty</option>
                </Select>
              </label>
              {mode === "is" && (
                <div className="fb-picks">
                  {choices.map((o) => (
                    <Check
                      key={o.value}
                      label={o.label}
                      checked={value.is?.includes(o.value)}
                      onChange={(on) => {
                        const is = on ? [...(value.is ?? []), o.value] : (value.is ?? []).filter((x) => x !== o.value);
                        onChange(is.length ? { field: value.field, is } : { field: value.field, filled: true });
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Group>
  );
}

function FormSettings({ details, kinds, onChange }: { details: Details; kinds: readonly FormKind[]; onChange: (d: Partial<Details>) => void }) {
  return (
    <div className="fb-settings">
      <header className="fb-settings__head">
        <span className="fb-settings__icon">
          <Icon name="clipboard" size={16} />
        </span>
        <h2>The form</h2>
      </header>
      <Group title="About">
        <Text label="Title" value={details.title} onChange={(v) => onChange({ title: v ?? "" })} max={FORM_LIMITS.title} placeholder="Untitled form" />
        <Text label="Description" value={details.description} onChange={(v) => onChange({ description: v ?? "" })} max={FORM_LIMITS.description} area />
        {kinds.length > 1 && (
          <label className="field">
            <span className="field__label">Kind</span>
            <Select className="select" value={details.kind} onChange={(v) => onChange({ kind: v as FormKind })}>
              {FORM_KINDS.filter((k) => kinds.includes(k.key)).map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </Select>
          </label>
        )}
      </Group>
      <p className="fb-quiet">Select a step or question to change it. Form number, issuing office and closing day are in Edit details.</p>
    </div>
  );
}

function SectionSettings({ section, before, fields, sdgNames, onChange }: { section: SectionSpec; before: FieldSpec[]; fields: Map<string, FieldSpec>; sdgNames?: Record<number, string>; onChange: (s: SectionSpec) => void }) {
  return (
    <div className="fb-settings">
      <header className="fb-settings__head">
        <span className="fb-settings__icon">{isIconName(section.icon) ? <Icon name={section.icon} size={16} /> : <Icon name="list" size={16} />}</span>
        <h2>Step</h2>
      </header>
      <Group title="Step">
        <Text label="Title" value={section.title} onChange={(v) => onChange({ ...section, title: v ?? "" })} max={60} />
        <label className="field">
          <span className="field__label">Icon</span>
          <Select className="select" value={section.icon ?? ""} onChange={(v) => onChange({ ...section, icon: v || undefined })}>
            <option value="">Number only</option>
            {SECTION_ICONS.map((n) => (
              <option key={n} value={n}>
                {n.charAt(0).toUpperCase() + n.slice(1)}
              </option>
            ))}
          </Select>
        </label>
      </Group>
      <ConditionEditor what="this step" value={section.showIf} before={before} fields={fields} sdgNames={sdgNames} onChange={(c) => onChange({ ...section, showIf: c })} />
    </div>
  );
}

function StageSettings({
  stage,
  index,
  count,
  before,
  fields,
  sdgNames,
  onChange,
  onMove,
  onRemove,
}: {
  stage: StageSpec;
  index: number;
  count: number;
  before: FieldSpec[];
  fields: Map<string, FieldSpec>;
  sdgNames?: Record<number, string>;
  onChange: (s: StageSpec) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="fb-settings">
      <header className="fb-settings__head">
        <span className="fb-settings__icon">
          <Icon name="governance" size={16} />
        </span>
        <h2>Sign-off {index + 1}</h2>
        <span className="fb-settings__tools">
          <button type="button" className="fb-icon-btn" aria-label="Earlier" disabled={index === 0} onClick={() => onMove(-1)}>
            <Icon name="chevron" size={14} className="fb-up" />
          </button>
          <button type="button" className="fb-icon-btn" aria-label="Later" disabled={index === count - 1} onClick={() => onMove(1)}>
            <Icon name="chevron" size={14} className="fb-down" />
          </button>
          <button type="button" className="fb-icon-btn" aria-label="Remove sign-off" onClick={onRemove}>
            <Icon name="trash" size={14} />
          </button>
        </span>
      </header>
      <Group title="Who signs">
        <Text label="Role" value={stage.role} onChange={(v) => onChange({ ...stage, role: v ?? "" })} max={80} placeholder="Dean" />
        <label className="field">
          <span className="field__label">Records it as</span>
          <Select className="select" value={stage.verb} onChange={(v) => onChange({ ...stage, verb: v as StageVerb })}>
            <option value="Noted">Noted</option>
            <option value="Endorsed">Endorsed</option>
            <option value="Approved">Approved</option>
          </Select>
        </label>
      </Group>
      <ConditionEditor what="this sign-off" value={stage.showIf} before={before} fields={fields} sdgNames={sdgNames} onChange={(c) => onChange({ ...stage, showIf: c })} />
    </div>
  );
}

function FieldSettings({
  spec,
  before,
  fields,
  from,
  review,
  sdgNames,
  onChange,
  onFrom,
  onRemove,
  steps,
  step,
  onStep,
}: {
  spec: FieldSpec;
  before: FieldSpec[];
  fields: Map<string, FieldSpec>;
  from: FormSchema["from"];
  review: boolean;
  sdgNames?: Record<number, string>;
  onChange: (s: FieldSpec) => void;
  onFrom: (f: FormSchema["from"]) => void;
  onRemove: () => void;
  /** The form's steps, to move the question to another. */
  steps?: string[];
  step?: number;
  onStep?: (to: number) => void;
}) {
  const set = (more: Partial<FieldSpec>) => onChange({ ...spec, ...more } as FieldSpec);
  const note = spec.type === "note";
  const emailish = (spec.type === "text" && spec.format === "email") || (spec.type === "people" && spec.ask.includes("email"));
  return (
    <div className="fb-settings">
      <header className="fb-settings__head">
        <span className="fb-settings__icon">
          <Icon name={MODULE_ICON[spec.type]} size={16} />
        </span>
        <h2>{MODULE_NAMES[spec.type]}</h2>
        <span className="fb-settings__tools">
          <button type="button" className="fb-icon-btn" aria-label="Remove question" onClick={onRemove}>
            <Icon name="trash" size={14} />
          </button>
        </span>
      </header>

      <Group title={note ? "Note" : "Question"}>
        {steps && step !== undefined && steps.length > 1 && (
          <label className="field">
            <span className="field__label">Step</span>
            <Select className="select" value={String(step)} onChange={(v) => onStep?.(Number(v))}>
              {steps.map((t, i) => (
                <option key={i} value={String(i)}>
                  {t}
                </option>
              ))}
            </Select>
          </label>
        )}
        <Text label={note ? "Name (for you)" : "Question"} value={spec.label} onChange={(v) => set({ label: v ?? "" })} />
        {note ? (
          <Text label="Words" value={spec.text} onChange={(v) => set({ text: v ?? "" } as Partial<FieldSpec>)} max={1000} area />
        ) : (
          <>
            <Text label="Help line" value={spec.help} onChange={(v) => set({ help: v })} max={300} placeholder="A short line under the question" />
            <Text label="More guidance" value={spec.hint} onChange={(v) => set({ hint: v })} max={1000} placeholder="Behind an info mark" area />
          </>
        )}
        {!note && spec.type !== "budgetsummary" && <Check label="Required" checked={spec.required} onChange={(on) => set({ required: on || undefined })} />}
        {!note && <Check label="Half width" checked={spec.half} onChange={(on) => set({ half: on || undefined })} hint="Two side by side on wide screens" />}
        {!note && !review && <Check label="Column in responses" checked={spec.column} onChange={(on) => set({ column: on || undefined })} />}
        {!review && spec.type === "text" && (
          <Check label="Names who sent it" checked={from?.name === spec.id} onChange={(on) => onFrom(on ? { name: spec.id, ...(from?.email && { email: from.email }) } : undefined)} hint="Shown in the responses table" />
        )}
        {!review && emailish && (
          <Check label="Respondent’s email" checked={from?.email === spec.id} onChange={(on) => from?.name && onFrom({ name: from.name, ...(on && { email: spec.id }) })} hint={from?.name ? undefined : "Choose the name question first"} />
        )}
      </Group>

      <TypeSettings spec={spec} before={before} onChange={onChange} />

      {!note && <ConditionEditor what="this question" value={spec.showIf} before={before} fields={fields} sdgNames={sdgNames} onChange={(c) => set({ showIf: c })} />}

      <p className="fb-key">
        Answer key <code>{spec.id}</code>
      </p>
    </div>
  );
}

function TypeSettings({ spec, before, onChange }: { spec: FieldSpec; before: FieldSpec[]; onChange: (s: FieldSpec) => void }) {
  switch (spec.type) {
    case "text": {
      const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
      return (
        <Group title="Answer">
          <label className="field">
            <span className="field__label">Format</span>
            <Select className="select" value={spec.format ?? "plain"} onChange={(v) => set({ format: v === "plain" ? undefined : (v as "email" | "phone") })}>
              <option value="plain">Any words</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </Select>
          </label>
          {spec.format === "email" && <Text label="Email domain" value={spec.domain} onChange={(v) => set({ domain: v?.toLowerCase() })} max={60} placeholder="ust.edu.ph" />}
          <Text label="Placeholder" value={spec.placeholder} onChange={(v) => set({ placeholder: v })} max={120} />
          <Num label="Most characters" value={spec.max} max={2000} onChange={(v) => set({ max: v })} />
          {spec.format !== "email" && <Check label="In capitals" checked={spec.caps} onChange={(on) => set({ caps: on || undefined })} hint="Letters only, for an organization’s name. Ask for a person with People." />}
        </Group>
      );
    }
    case "paragraph": {
      const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
      return (
        <Group title="Answer">
          <Text label="Placeholder" value={spec.placeholder} onChange={(v) => set({ placeholder: v })} />
          <div className="fb-pair">
            <Num label="Most characters" value={spec.max} max={20000} onChange={(v) => set({ max: v })} />
            <Num label="Most sentences" value={spec.sentences} max={50} onChange={(v) => set({ sentences: v })} />
          </div>
        </Group>
      );
    }
    case "choice": {
      const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
      return (
        <Group title="Options">
          <Options label="Options" options={spec.options} onChange={(options) => set({ options })} />
          <Check label="Allow several" checked={spec.multiple} onChange={(on) => set({ multiple: on || undefined, ...(!on && { min: undefined, max: undefined }) })} />
          {spec.multiple && (
            <div className="fb-pair">
              <Num label="At least" value={spec.min} max={60} onChange={(v) => set({ min: v })} />
              <Num label="At most" value={spec.max} max={60} onChange={(v) => set({ max: v })} />
            </div>
          )}
          <Check label="Others, in words" checked={!!spec.other} onChange={(on) => set({ other: on ? "Others" : undefined })} />
          <label className="field">
            <span className="field__label">Shown as</span>
            <Select className="select" value={spec.display ?? "cards"} onChange={(v) => set({ display: v as "cards" | "chips" })}>
              <option value="cards">Cards, for a few long options</option>
              <option value="chips">Chips, for many short ones</option>
            </Select>
          </label>
        </Group>
      );
    }
    case "yesno": {
      const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
      return (
        <Group title="Answer">
          <div className="fb-pair">
            <Text label="Yes reads" value={spec.yes} onChange={(v) => set({ yes: v })} max={40} placeholder="Yes" />
            <Text label="No reads" value={spec.no} onChange={(v) => set({ no: v })} max={40} placeholder="No" />
          </div>
        </Group>
      );
    }
    case "unit": {
      const sections = spec.sections ?? (["academic", "offices", "research"] as UnitSection[]);
      const toggle = (s: UnitSection, on: boolean) => {
        const next = on ? [...sections, s] : sections.filter((x) => x !== s);
        if (next.length) onChange({ ...spec, sections: next });
      };
      return (
        <Group title="Lists">
          {(["academic", "offices", "research"] as UnitSection[]).map((s) => (
            <Check key={s} label={UNIT_CATEGORY_LABELS[s]} checked={sections.includes(s)} onChange={(on) => toggle(s, on)} />
          ))}
        </Group>
      );
    }
    case "sdgs": {
      const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
      return (
        <Group title="Goals">
          <div className="fb-pair">
            <Num label="At least" value={spec.min} max={17} onChange={(v) => set({ min: v })} />
            <Num label="At most" value={spec.max} max={17} onChange={(v) => set({ max: v })} />
          </div>
        </Group>
      );
    }
    case "date": {
      const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
      return (
        <Group title="Days">
          <label className="field">
            <span className="field__label">Earliest</span>
            <DateField displayFormat="long" className="input" value={spec.min ?? ""} onChange={(d) => set({ min: d || undefined })} placeholder="Any day" aria-label="Earliest" />
          </label>
          <label className="field">
            <span className="field__label">Latest</span>
            <DateField displayFormat="long" className="input" value={spec.max ?? ""} onChange={(d) => set({ max: d || undefined })} placeholder="Any day" aria-label="Latest" />
          </label>
        </Group>
      );
    }
    case "number": {
      const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
      return (
        <Group title="Answer">
          <div className="fb-pair">
            <Num label="Least" value={spec.min} max={1_000_000} onChange={(v) => set({ min: v })} />
            <Num label="Most" value={spec.max} max={1_000_000} onChange={(v) => set({ max: v })} />
          </div>
          <Text label="Counts" value={spec.unit} onChange={(v) => set({ unit: v })} max={20} placeholder="people" />
        </Group>
      );
    }
    case "money":
      return (
        <Group title="Answer">
          <Num label="Most, in pesos" value={spec.max} onChange={(v) => onChange({ ...spec, max: v })} />
        </Group>
      );
    case "link":
      return (
        <Group title="Answer">
          <Text label="Placeholder" value={spec.placeholder} onChange={(v) => onChange({ ...spec, placeholder: v })} max={120} placeholder="https://" />
        </Group>
      );
    case "people": {
      const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
      const ask = (k: "phone" | "email", on: boolean) => set({ ask: on ? [...spec.ask.filter((x) => x !== k), k] : spec.ask.filter((x) => x !== k) });
      return (
        <Group title="People">
          <Check label="Ask for a phone" checked={spec.ask.includes("phone")} onChange={(on) => ask("phone", on)} />
          <Check label="Ask for an email" checked={spec.ask.includes("email")} onChange={(on) => ask("email", on)} />
          {spec.ask.includes("email") && <Text label="Email domain" value={spec.domain} onChange={(v) => set({ domain: v?.toLowerCase() })} max={60} placeholder="ust.edu.ph" />}
          <Check
            label="One per role"
            checked={!!spec.roles}
            onChange={(on) => set(on ? { roles: ["President", "Treasurer"], max: 2, min: undefined } : { roles: undefined })}
          />
          {spec.roles ? (
            <Lines label="Roles, in order" noun="role" max={10} values={spec.roles} onChange={(roles) => set({ roles, max: roles.length })} />
          ) : (
            <>
              <div className="fb-pair">
                <Num label="At least" value={spec.min} max={20} onChange={(v) => set({ min: v })} />
                <Num label="At most" value={spec.max} min={1} max={20} onChange={(v) => set({ max: v ?? 1 })} />
              </div>
              <Text label="One of them is a" value={spec.noun} onChange={(v) => set({ noun: v })} max={40} placeholder="contact person" />
            </>
          )}
        </Group>
      );
    }
    case "table":
      return <TableSettings spec={spec} before={before} onChange={onChange} />;
    case "counts":
      return (
        <Group title="Groups">
          <Lines
            label="Groups"
            noun="group"
            values={spec.rows.map((r) => r.label)}
            onChange={(labels) => {
              const taken = new Set<string>();
              onChange({
                ...spec,
                rows: labels.map((l, i) => {
                  const id = spec.rows[i] && labels.length >= spec.rows.length ? spec.rows[i].id : keyFrom(l || "group", taken, "group");
                  taken.add(id);
                  return { id, label: l };
                }),
              });
            }}
          />
          <Text label="Total reads" value={spec.total} onChange={(v) => onChange({ ...spec, total: v ?? "" })} max={60} />
        </Group>
      );
    case "budget": {
      const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
      const tables = before.filter((f) => f.type === "table");
      return (
        <Group title="Budget">
          <Lines
            label="Paid from"
            noun="source"
            max={6}
            values={spec.sources.map((s) => s.label)}
            onChange={(labels) => {
              const taken = new Set<string>();
              set({
                sources: labels.map((l, i) => {
                  const id = spec.sources[i] && labels.length >= spec.sources.length ? spec.sources[i].id : keyFrom(l || "source", taken, "source");
                  taken.add(id);
                  return { id, label: l };
                }),
              });
            }}
          />
          <Lines
            label="Categories"
            noun="category"
            max={12}
            values={spec.categories.map((c) => c.label)}
            onChange={(labels) => {
              const taken = new Set<string>();
              set({
                categories: labels.map((l, i) => {
                  const had = spec.categories[i] && labels.length >= spec.categories.length ? spec.categories[i] : undefined;
                  const id = had?.id ?? keyFrom(l || "category", taken, "category");
                  taken.add(id);
                  return had ? { ...had, label: l } : { id, label: l, custom: true, perDay: false };
                }),
              });
            }}
          />
          {tables.length > 0 && (
            <label className="field">
              <span className="field__label">One budget per row of</span>
              <Select className="select" value={spec.per ?? ""} onChange={(v) => set({ per: v || undefined })}>
                <option value="">One budget for the form</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <Check label="A hypothetical value" checked={spec.theoretical} onChange={(on) => set({ theoretical: on || undefined })} hint="No money is released" />
        </Group>
      );
    }
    case "budgetsummary": {
      const budgets = before.filter((f) => f.type === "budget");
      const budget = budgets.find((b) => b.id === spec.budget);
      return (
        <Group title="Adds up">
          <label className="field">
            <span className="field__label">Budget</span>
            <Select
              className="select"
              value={spec.budget}
              onChange={(v) => {
                const b = budgets.find((x) => x.id === v);
                if (b?.type === "budget") onChange({ ...spec, budget: v, source: b.sources[0].id });
              }}
            >
              {!budget && <option value={spec.budget}>Choose a budget before it</option>}
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </label>
          {budget?.type === "budget" && (
            <label className="field">
              <span className="field__label">Source</span>
              <Select className="select" value={spec.source} onChange={(v) => onChange({ ...spec, source: v })}>
                {budget.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </Group>
      );
    }
    case "consent":
      return (
        <Group title="Statements">
          <Lines
            label="Statements"
            noun="statement"
            max={10}
            area
            values={spec.statements.map((s) => s.text)}
            onChange={(texts) => {
              const taken = new Set<string>();
              onChange({
                ...spec,
                statements: texts.map((t, i) => {
                  const had = spec.statements[i] && texts.length >= spec.statements.length ? spec.statements[i] : undefined;
                  const id = had?.id ?? keyFrom(t.split(" ").slice(0, 3).join(" ") || "statement", taken, "statement");
                  taken.add(id);
                  return { ...had, id, text: t };
                }),
              });
            }}
          />
        </Group>
      );
    case "signature":
      return (
        <Group title="Signers">
          <Lines label="Signers, by role" noun="signer" max={6} values={spec.signers} onChange={(signers) => onChange({ ...spec, signers })} />
        </Group>
      );
    default:
      return null;
  }
}

const COLUMN_TYPES: { value: TableColumn["type"]; label: string }[] = [
  { value: "text", label: "Short answer" },
  { value: "name", label: "Person’s name" },
  { value: "paragraph", label: "Paragraph" },
  { value: "choice", label: "Choice" },
  { value: "date", label: "Date" },
  { value: "daterange", label: "Dates" },
  { value: "number", label: "Number" },
  { value: "money", label: "Amount" },
  { value: "link", label: "Link" },
];

function TableSettings({ spec, before, onChange }: { spec: Extract<FieldSpec, { type: "table" }>; before: FieldSpec[]; onChange: (s: FieldSpec) => void }) {
  const set = (m: Partial<typeof spec>) => onChange({ ...spec, ...m });
  const tables = before.filter((f) => f.type === "table");
  const setCol = (i: number, c: TableColumn) => set({ columns: spec.columns.map((x, j) => (j === i ? c : x)) });
  return (
    <>
      <Group title="Columns">
        <ol className="fb-cols">
          {spec.columns.map((c, i) => (
            <li key={c.id} className="fb-col">
              <div className="fb-col__row">
                <input className="input" title="" value={c.label} maxLength={80} aria-label={`Column ${i + 1}`} onChange={(e) => setCol(i, { ...c, label: e.target.value })} />
                <button type="button" className="fb-icon-btn" aria-label={`Remove column ${i + 1}`} disabled={spec.columns.length <= 1} onClick={() => set({ columns: spec.columns.filter((_, j) => j !== i).map((x) => (x.showIf?.column === c.id ? { ...x, showIf: undefined } : x)) })}>
                  <Icon name="close" size={13} />
                </button>
              </div>
              <div className="fb-pair">
                <Select
                  className="select select--sm"
                  value={c.type}
                  aria-label={`Column ${i + 1} type`}
                  onChange={(v) => setCol(i, { id: c.id, label: c.label, type: v as TableColumn["type"], required: c.required, ...(v === "choice" && { options: [{ value: "option1", label: "Option 1" }] }) })}
                >
                  {COLUMN_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <Check label="Required" checked={c.required} onChange={(on) => setCol(i, { ...c, required: on || undefined })} />
              </div>
              {c.type === "choice" && (
                <>
                  {tables.length > 0 && (
                    <Select
                      className="select select--sm"
                      value={c.optionsFrom ?? ""}
                      aria-label="Options from"
                      onChange={(v) => setCol(i, v ? { ...c, optionsFrom: v, options: undefined } : { ...c, optionsFrom: undefined, options: [{ value: "option1", label: "Option 1" }] })}
                    >
                      <option value="">Its own options</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          One per row of {t.label}
                        </option>
                      ))}
                    </Select>
                  )}
                  {!c.optionsFrom && <Options label="Options" options={c.options ?? []} onChange={(options) => setCol(i, { ...c, options })} />}
                </>
              )}
            </li>
          ))}
        </ol>
        {spec.columns.length < 12 && (
          <button
            type="button"
            className="fb-add-inline"
            onClick={() => {
              const taken = new Set(spec.columns.map((c) => c.id));
              set({ columns: [...spec.columns, { id: keyFrom(`column ${spec.columns.length + 1}`, taken, "column"), label: `Column ${spec.columns.length + 1}`, type: "text" }] });
            }}
          >
            <Icon name="plus" size={13} /> Add column
          </button>
        )}
      </Group>
      <Group title="Rows">
        <Check label="Fixed, named rows" checked={!!spec.rows} onChange={(on) => set(on ? { rows: ["Row 1", "Row 2"], min: undefined, max: undefined, add: undefined, numbered: undefined } : { rows: undefined, max: 10, add: "Add row" })} />
        {spec.rows ? (
          <Lines label="Rows" noun="row" values={spec.rows} onChange={(rows) => set({ rows })} />
        ) : (
          <>
            <div className="fb-pair">
              <Num label="At least" value={spec.min} max={50} onChange={(v) => set({ min: v })} />
              <Num label="At most" value={spec.max} max={50} onChange={(v) => set({ max: v })} />
            </div>
            <Text label="Rows are numbered as" value={spec.numbered} onChange={(v) => set({ numbered: v })} max={30} placeholder="Phase" />
            <Text label="Add button reads" value={spec.add} onChange={(v) => set({ add: v })} max={40} placeholder="Add row" />
          </>
        )}
      </Group>
    </>
  );
}
