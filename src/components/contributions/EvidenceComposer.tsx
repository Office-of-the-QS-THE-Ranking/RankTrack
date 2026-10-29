"use client";

import { closeModal, openModal } from "@/components/ui/modal-motion";

/*
 * Submit evidence, a large dialog in the same four tabs a reviewer reads it in (ContributionRecord.tsx): the
 * Overview (title, background, type, period, result, beneficiaries and SDGs), the Narrative (the post composer's
 * document, publications/DocEditor.tsx), the Evidence (how strong it is, how it was verified, the files with what
 * each one is, and public links) and the References it cites. At the foot, the rankings it counts in beside Save
 * draft and Submit; the rankings open as a panel over the tabs. Every tab stays mounted, so the Hub's field checks
 * see every field, and a Submit that fails opens the tab holding the first problem. Submit asks for the
 * certification, uploads the files and sends one evidence.submit command, which the server checks, applies and
 * audits. Closing with unsaved work offers to keep it as a draft on this device.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useFlag, useGovern, useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { useReference, useViews } from "@/components/reference/ReferenceProvider";
import { Switch } from "@/components/admin/ui";
import { Dropzone, Panel, SdgPicker, UploadRow, sizeOf } from "@/components/publications/ComposerPanels";
import { DocEditor } from "@/components/publications/DocEditor";
import { Face } from "@/components/ui/Face";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { Select } from "@/components/ui/pickers";
import { cx } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { recheckField } from "@/components/ui/validation";
import { EVIDENCE_FILE_KINDS, EVIDENCE_LIMITS, EVIDENCE_SUMMARY, PUBLIC_URL, guessFileKind, isFileKind, type EvidenceFileKind } from "@/lib/governance/evidence-files";
import { initials } from "@/lib/governance/rbac";
import { familyOf } from "@/lib/reference";
import { plainText } from "@/lib/rich-text";
import { uploadEvidence } from "./evidence-upload";
import { KIND, SUBMISSION_TABS, fileKind, type SubmissionTab as Tab } from "./parts";
import { StageTrack } from "./StageTrack";

const TYPES = [
  { key: "Operational data", short: "Operations", icon: "energy", note: "Energy, water, waste, transport or campus figures" },
  { key: "Research output", short: "Research", icon: "flask", note: "Publications, citations, co-authorship" },
  { key: "Policy", short: "Policy", icon: "governance", note: "Approved policies and governance documents" },
  { key: "Narrative and outcomes", short: "Outcomes", icon: "heart", note: "Programmes with beneficiaries and results" },
  { key: "Financial data", short: "Finance", icon: "trend-up", note: "Research or industry income, budgets" },
  { key: "Teaching and course data", short: "Teaching", icon: "education", note: "Courses, curricula, learning outcomes" },
  { key: "Innovation or intellectual property", short: "Innovation", icon: "innovation", note: "Patents, utility models, new practices" },
] as const satisfies readonly { key: string; short: string; icon: IconName; note: string }[];
type DataType = (typeof TYPES)[number]["key"];

const GM_BY_SDG: Record<number, string> = {
  6: "Water",
  7: "Energy and Climate Change",
  11: "Setting and Infrastructure",
  12: "Waste",
  13: "Energy and Climate Change",
  15: "Setting and Infrastructure",
};

interface Match {
  key: string;
  ranking: string;
  indicator: string;
  why: string;
}

/** Every ranking indicator that can reuse evidence of this type for these goals. */
function recommend(type: DataType | "", sdgs: number[], sdgNames: Record<number, string>): Match[] {
  const out: Match[] = [];
  const add = (ranking: string, indicator: string, why: string) => {
    const key = `${ranking} · ${indicator}`;
    if (!out.some((m) => m.key === key)) out.push({ key, ranking, indicator, why });
  };
  switch (type) {
    case "Operational data":
      sdgs.forEach((s) => GM_BY_SDG[s] && add("UI GreenMetric", GM_BY_SDG[s], `Campus operations for SDG ${s}`));
      if (!sdgs.some((s) => GM_BY_SDG[s])) add("UI GreenMetric", "Setting and Infrastructure", "Campus operations data");
      add("QS Sustainability", "Environmental Impact", "Environmental sustainability lens");
      break;
    case "Research output":
      add("QS WUR", "Citations per Faculty", "Indexed outputs feed citations");
      add("THE WUR", "Research Quality", "Citation impact and research strength");
      add("QS by Subject", "Citations and H-index", "Subject research performance");
      break;
    case "Policy":
      add("QS Sustainability", "Governance", "Approved policies with public links");
      break;
    case "Narrative and outcomes":
      add("QS Sustainability", "Social Impact", "Knowledge exchange and community outcomes");
      add("WURI", "Social Responsibility", "Programmes serving communities");
      break;
    case "Financial data":
      add("THE WUR", "Research Environment", "Research income per staff");
      add("THE WUR", "Industry", "Industry income");
      break;
    case "Teaching and course data":
      add("UI GreenMetric", "Education and Research", "Sustainability courses");
      add("QS Sustainability", "Environmental Impact", "Environmental education lens");
      break;
    case "Innovation or intellectual property":
      add("WURI", "Industrial Application", "Innovation applied with partners");
      add("THE WUR", "Industry", "Patents citing UST research");
      break;
  }
  if (type) sdgs.forEach((s) => add("THE Impact", `SDG ${s}`, sdgNames[s]));
  return out;
}

type Attached = { key: string; file: File; kind: EvidenceFileKind };
type LinkRow = { key: string; url: string; label: string };
type RefRow = { key: string; title: string; source: string; url: string };

/** What Save draft keeps on this device. Files can't be kept, so they are attached again. */
type Draft = {
  type: DataType | "";
  period: string;
  title: string;
  background: string;
  body: string;
  result: string;
  measure: string;
  level: number;
  who: string;
  count: string;
  verified: string;
  sdgs: number[];
  links: { url: string; label: string }[];
  refs: { title: string; source: string; url: string }[];
  /** Older drafts kept a single link here. */
  url?: string;
  auto: boolean;
  picked: string[];
  savedAt: string;
};

type Fields = Omit<Draft, "period" | "auto" | "savedAt"> & { period?: string; auto?: boolean };

const EMPTY: Fields = {
  type: "",
  title: "",
  background: "",
  body: "",
  result: "",
  measure: "",
  level: 3,
  who: "",
  count: "",
  verified: "",
  sdgs: [],
  links: [],
  refs: [],
  picked: [],
};

const draftKey = (account: string, unit: string) => `hub:evidence-draft:${account}:${unit}`;

function readDraft(key: string): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? "null") as Draft | null;
    return d && typeof d === "object" && typeof d.title === "string" && Array.isArray(d.sdgs) ? d : null;
  } catch {
    return null;
  }
}

const rowKey = () => crypto.randomUUID();
const badUrl = (u: string) => !!u && (!PUBLIC_URL.test(u) || u.length > EVIDENCE_LIMITS.url);

/** Title wraps like text but stays one line. */
const oneLine = (v: string) => v.replace(/\s*[\r\n]+\s*/g, " ");

function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Keeps a hidden field's own rule (setCustomValidity) in step with the form. */
function useValidity(ref: RefObject<HTMLInputElement | null>, message: string) {
  useEffect(() => ref.current?.setCustomValidity(message), [ref, message]);
}

/** A web address field that asks for the whole address, https:// and all. */
function UrlInput({ value, onValue, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: string; onValue: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const v = value.trim();
  useValidity(ref, badUrl(v) ? "Enter the full link, starting with https://" : "");
  return <input ref={ref} type="url" inputMode="url" autoComplete="off" spellCheck={false} value={value} onChange={(e) => onValue(e.target.value)} {...rest} />;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

const COLORS: Record<string, string> = { pdf: "#e5484d", sheet: "#1f9d55", doc: "#2f6fde", slides: "#e2711d", image: "#8e4ec6", other: "#6b6b6b" };

export function EvidenceComposer({ onClose, onSent }: { onClose: () => void; onSent?: (id: string) => void }) {
  const { evidenceLevels, sdgNames } = useViews();
  const reference = useReference();
  const hub = useHub();
  const viewer = useViewer();
  const rankings = useRankings();
  const smart = useFlag("smart-matching");
  const { run } = useGovern();
  const ids = useId();

  const periods = useMemo(() => hub?.periods ?? [], [hub]);
  const uploads = hub?.uploads ?? { maxFileMB: 25, maxFiles: 10, types: ["PDF", "XLSX", "CSV"] };
  const unitSlug = viewer?.portal.unitId ?? "";
  const storage = viewer ? draftKey(viewer.id, unitSlug) : null;
  const firstOpen = periods.find((p) => p.accepting)?.label ?? "";

  const [type, setType] = useState<DataType | "">(EMPTY.type);
  const [period, setPeriod] = useState(firstOpen);
  const [title, setTitle] = useState(EMPTY.title);
  const [background, setBackground] = useState(EMPTY.background);
  const [body, setBody] = useState(EMPTY.body);
  const [result, setResult] = useState(EMPTY.result);
  const [measure, setMeasure] = useState(EMPTY.measure);
  const [level, setLevel] = useState(EMPTY.level);
  const [who, setWho] = useState(EMPTY.who);
  const [count, setCount] = useState(EMPTY.count);
  const [verified, setVerified] = useState(EMPTY.verified);
  const [sdgs, setSdgs] = useState<number[]>(EMPTY.sdgs);
  const [files, setFiles] = useState<Attached[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [auto, setAuto] = useState(smart);
  const [picked, setPicked] = useState<string[]>(EMPTY.picked);
  /** Remounts the document when a draft comes back or the form starts over: the editor reads its story once. */
  const [doc, setDoc] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("Overview");
  /** A Submit has failed, so the tabs show what each still needs. */
  const [tried, setTried] = useState(false);
  /** The row just added, which takes focus. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [ranks, setRanks] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | number | "send">(null);
  const [sent, setSent] = useState<null | { ref: string; title: string; rankings: number }>(null);
  const [leaving, setLeaving] = useState(false);
  /** The form as last saved or restored, to tell whether closing would lose anything. */
  const [savedSig, setSavedSig] = useState("");
  const snapNext = useRef(true);

  const root = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const backgroundRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyProxy = useRef<HTMLInputElement>(null);
  const typeGrid = useRef<HTMLDivElement>(null);
  const sdgWrap = useRef<HTMLDivElement>(null);
  const dropWrap = useRef<HTMLDivElement>(null);
  const filesProxy = useRef<HTMLInputElement>(null);
  const reachRow = useRef<HTMLButtonElement>(null);
  const reachProxy = useRef<HTMLInputElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);

  /* ---------- What the evidence adds up to ---------- */

  const story = plainText(body);
  const tracked = useMemo(() => new Set(rankings.map((r) => r.short)), [rankings]);
  // Only rankings System Configuration tracks can receive evidence.
  const matches = useMemo(() => recommend(type, sdgs, sdgNames).filter((m) => tracked.has(m.ranking)), [type, sdgs, sdgNames, tracked]);
  const chosen = auto ? matches.map((m) => m.key) : picked.filter((p) => matches.some((m) => m.key === p));
  const groups = useMemo(() => {
    const out: { ranking: string; color: string; items: Match[] }[] = [];
    for (const m of matches) {
      let g = out.find((x) => x.ranking === m.ranking);
      if (!g) {
        const r = rankings.find((x) => x.short === m.ranking);
        g = { ranking: m.ranking, color: r ? familyOf(reference, r.family).color : "#6b6b6b", items: [] };
        out.push(g);
      }
      g.items.push(m);
    }
    return out;
  }, [matches, rankings, reference]);
  const reach = groups.filter((g) => g.items.some((m) => chosen.includes(m.key)));
  const kind = TYPES.find((t) => t.key === type);
  const periodNote = periods.find((p) => p.label === period)?.note;

  const linkList = links.map((l) => ({ url: l.url.trim(), label: l.label.trim() })).filter((l) => l.url);
  const refList = refs.map((r) => ({ title: r.title.trim(), source: r.source.trim(), url: r.url.trim() })).filter((r) => r.title || r.source || r.url);

  /** What each tab still needs, counted as the Hub's checks would find it. */
  const problems: Record<Tab, number> = {
    Overview: [title.trim().length < 4, !type, !period, !result.trim(), !who.trim(), !sdgs.length].filter(Boolean).length,
    Narrative: story.length > EVIDENCE_SUMMARY.text ? 1 : 0,
    Evidence: (files.length || linkList.length ? 0 : 1) + linkList.filter((l) => badUrl(l.url)).length,
    References: refList.filter((r) => !r.title || badUrl(r.url)).length,
  };
  const counts: Record<Tab, number | undefined> = {
    Overview: undefined,
    Narrative: undefined,
    Evidence: files.length + linkList.length || undefined,
    References: refList.length || undefined,
  };

  const dirty = !!(type || title.trim() || background.trim() || story.trim() || result.trim() || who.trim() || verified.trim() || sdgs.length || files.length || linkList.length || refList.length);
  const sig = JSON.stringify([type, period, title.trim(), background.trim(), story.trim() ? body : "", result, measure, level, who, count, verified, sdgs, linkList, refList, auto, picked]);
  const unsaved = files.length > 0 || (dirty && sig !== savedSig);

  // What the form holds when it opens, or just after a draft comes back, counts as saved.
  useEffect(() => {
    if (!snapNext.current) return;
    snapNext.current = false;
    setSavedSig(sig);
  }, [sig]);

  /* ---------- Opening and closing ---------- */

  useEffect(() => {
    const d = root.current;
    if (d && !d.open) openModal(d);
    titleRef.current?.focus();
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const d = leaveDialog.current;
    if (leaving && d && !d.open) openModal(d);
  }, [leaving]);

  const requestClose = () => {
    if (busy !== null) return;
    if (!sent && unsaved) setLeaving(true);
    else closeModal(root.current, onClose);
  };

  /* ---------- The Hub's field checks, on what stands for each group of choices ---------- */

  useValidity(bodyProxy, story.length > EVIDENCE_SUMMARY.text ? `Shorten the narrative to ${EVIDENCE_SUMMARY.text.toLocaleString("en")} characters.` : "");
  useValidity(filesProxy, files.length || linkList.length ? "" : "Attach a file or add a public link.");
  useValidity(reachProxy, chosen.length ? "" : matches.length ? "Keep at least one ranking." : "Choose a type and an SDG to see where this counts.");

  const reachLen = chosen.length;
  useEffect(() => {
    [typeGrid, sdgWrap, dropWrap, reachRow].forEach((r) => recheckField(r.current));
    recheckField(bodyRef.current);
  }, [type, sdgs, files, linkList.length, reachLen, story.length]);

  // The title grows with what is written, and with the page's width.
  useLayoutEffect(() => fit(titleRef.current), [title, doc, tab]);
  useEffect(() => {
    const box = titleRef.current?.parentElement;
    if (!box) return;
    const ro = new ResizeObserver(() => fit(titleRef.current));
    ro.observe(box);
    return () => ro.disconnect();
  }, [doc, sent]);

  /* ---------- Drafts on this device ---------- */

  const apply = (d: Fields) => {
    setType(TYPES.some((t) => t.key === d.type) ? d.type : "");
    setPeriod(d.period && periods.some((p) => p.label === d.period && p.accepting) ? d.period : firstOpen);
    setTitle(d.title);
    setBackground(typeof d.background === "string" ? d.background : "");
    setBody(d.body);
    setResult(d.result);
    setMeasure(d.measure);
    setLevel(d.level >= 1 && d.level <= Math.max(1, evidenceLevels.length) ? d.level : 3);
    setWho(d.who);
    setCount(d.count);
    setVerified(d.verified);
    setSdgs(d.sdgs.filter((n) => Number.isInteger(n) && n >= 1 && n <= 17));
    const kept = Array.isArray(d.links) ? d.links : [];
    const all = [...kept, ...(d.url && !kept.some((l) => l.url === d.url) ? [{ url: d.url, label: "" }] : [])];
    setLinks(all.slice(0, EVIDENCE_LIMITS.links).map((l) => ({ key: rowKey(), url: String(l.url ?? ""), label: String(l.label ?? "") })));
    setRefs((Array.isArray(d.refs) ? d.refs : []).slice(0, EVIDENCE_LIMITS.references).map((r) => ({ key: rowKey(), title: String(r.title ?? ""), source: String(r.source ?? ""), url: String(r.url ?? "") })));
    setAuto(smart && (d.auto ?? true));
    setPicked(d.picked);
    setDoc((n) => n + 1);
  };

  useEffect(() => {
    if (!storage) return;
    const d = readDraft(storage);
    if (!d) return;
    apply(d);
    setSavedAt(d.savedAt);
    snapNext.current = true;
    toast("Draft restored.", "info");
    // Once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);

  /** Keeps the form on this device; false when the browser won't. */
  const saveDraft = () => {
    if (!storage) return false;
    const at = new Date().toISOString();
    const d: Draft = { type, period, title, background, body, result, measure, level, who, count, verified, sdgs, links: linkList, refs: refList, auto, picked, savedAt: at };
    try {
      localStorage.setItem(storage, JSON.stringify(d));
    } catch {
      toast("This browser won’t keep drafts. Submit when you’re ready instead.", "error");
      return false;
    }
    setSavedAt(at);
    setSavedSig(sig);
    toast(files.length ? "Draft saved. Attach the files again when you return." : "Draft saved on this device.", "ok");
    return true;
  };

  const forget = () => {
    try {
      if (storage) localStorage.removeItem(storage);
    } catch {
      // Nothing kept, nothing to remove.
    }
    setSavedAt(null);
  };

  const startOver = () => {
    forget();
    apply(EMPTY);
    setFiles([]);
    setRanks(false);
    setTried(false);
    setTab("Overview");
    snapNext.current = true;
  };

  // Leaving the page with unsaved work asks first.
  useEffect(() => {
    if (!unsaved || sent) return;
    const stay = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", stay);
    return () => window.removeEventListener("beforeunload", stay);
  }, [unsaved, sent]);

  /* ---------- The rankings panel ---------- */

  /** Done and Esc go back to the bar that opened it; clicking elsewhere leaves focus where the click put it. */
  const closeRanks = () => {
    setRanks(false);
    requestAnimationFrame(() => reachRow.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!ranks) return;
    const away = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".pc-doc, [data-side-trigger], .pick, .fieldwarn, .ec-confirm, .pc-leave, .toasts")) return;
      setRanks(false);
    };
    document.addEventListener("click", away, true);
    return () => document.removeEventListener("click", away, true);
  }, [ranks]);

  const show = (t: Tab) => {
    setTab(t);
    setRanks(false);
  };

  /* ---------- Files, links and references ---------- */

  /** Adds what fits and says why the rest didn't; returns how many were added. */
  const addFiles = (list: File[]) => {
    const ext = (n: string) => fileKind(n).ext.replace("JPEG", "JPG");
    const fits = list.filter((f) => {
      if (!uploads.types.includes(ext(f.name))) toast(`${f.name} isn’t accepted. Use ${uploads.types.join(", ")}.`, "error");
      else if (f.size > uploads.maxFileMB * 1_048_576) toast(`${f.name} is over ${uploads.maxFileMB} MB.`, "error");
      else if (files.some((x) => x.file.name === f.name && x.file.size === f.size)) return false;
      else return true;
      return false;
    });
    if (!fits.length) return 0;
    const room = uploads.maxFiles - files.length;
    if (room < fits.length) toast(room > 0 ? `Added ${room} of ${fits.length}. Attach up to ${uploads.maxFiles} files.` : `Attach up to ${uploads.maxFiles} files.`, "info");
    if (room <= 0) return 0;
    const added = fits.slice(0, room);
    setFiles((xs) => [...xs, ...added.map((file) => ({ key: rowKey(), file, kind: guessFileKind(file.name) }))]);
    return added.length;
  };

  const addLink = () => {
    const key = rowKey();
    setLinks((xs) => [...xs, { key, url: "", label: "" }]);
    setFresh(key);
  };
  const setLink = (key: string, part: Partial<LinkRow>) => setLinks((xs) => xs.map((l) => (l.key === key ? { ...l, ...part } : l)));

  const addRef = () => {
    const key = rowKey();
    setRefs((xs) => [...xs, { key, title: "", source: "", url: "" }]);
    setFresh(key);
  };
  const setRef = (key: string, part: Partial<RefRow>) => setRefs((xs) => xs.map((r) => (r.key === key ? { ...r, ...part } : r)));

  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    setDropping(false);
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    addFiles([...e.dataTransfer.files]);
    show("Evidence");
  };

  /* ---------- Sending ---------- */

  useEffect(() => {
    const d = confirmDialog.current;
    if (confirming && d && !d.open) openModal(d);
  }, [confirming]);

  /**
   * Runs before the browser checks the fields: it opens the tab that holds the first problem, so the Hub's checks
   * can focus it there. Reading `validity` fires no `invalid` event; the check that follows marks every field.
   */
  const jump = () => {
    const form = formRef.current;
    if (!form) return;
    const bad = Array.from(form.elements).find(
      (el): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) && el.willValidate && !el.validity.valid,
    );
    if (!bad) return;
    setTried(true);
    const pane = bad.closest<HTMLElement>("[data-tab]")?.dataset.tab as Tab | undefined;
    if (pane)
      flushSync(() => {
        setTab(pane);
        setRanks(false);
      });
  };

  /** Every field passed the Hub's checks: the certification comes next. */
  const review = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy === null) setConfirming(true);
  };

  const send = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy !== null) return;
    setBusy(0);
    const up = await uploadEvidence(
      files.map((f) => f.file),
      { unitSlug },
      (p) => setBusy(p),
    );
    if (!up.ok) {
      setBusy(null);
      return toast(up.message, "error");
    }
    setBusy("send");
    const r = await run({
      type: "evidence.submit",
      unitSlug,
      input: {
        title,
        type,
        period,
        background: background.trim(),
        summary: story.trim() ? body : "",
        result: `${result} ${measure}`.trim(),
        beneficiaries: `${who.trim()}${count ? `, ${count}` : ""}`,
        verifiedBy: verified.trim(),
        level: level as 1 | 2 | 3 | 4 | 5,
        sdgs,
        files: up.files.map((f, i) => ({ ...f, kind: files[i]?.kind })),
        links: linkList,
        references: refList,
        mappedTo: chosen,
      },
    });
    setBusy(null);
    if (!r.ok) return toast(r.message, "error");
    const id = typeof r.data === "string" ? r.data : "";
    forget();
    closeModal(confirmDialog.current, () => setConfirming(false));
    setRanks(false);
    setSent({ ref: id, title: title.trim(), rankings: reach.length });
    if (id) onSent?.(id);
  };

  /** Esc steps back: out of a question, out of the rankings, then out of the dialog. */
  const back = () => {
    if (leaving) closeModal(leaveDialog.current, () => setLeaving(false));
    else if (confirming) {
      if (busy === null) closeModal(confirmDialog.current, () => setConfirming(false));
    } else if (ranks) closeRanks();
    else requestClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // Handled here so the browser never closes the dialog behind the person's back.
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      back();
    }
  };

  const head = (
    <header className="pc-head ec-head">
      <span className="ec-who">
        <span className="pc-avatar ec-who__avatar" aria-hidden="true">
          <Face src={viewer?.avatar}>{initials(viewer?.name ?? "")}</Face>
        </span>
        <span className="ec-who__text">
          <b>{viewer?.name}</b>
          <span>
            {viewer?.portal.unitName}
            {viewer?.portal.programName ? ` · ${viewer.portal.programName}` : ""}
          </span>
        </span>
      </span>
      <h2 id={`${ids}-heading`} className="pc-head__title">
        Submit evidence
      </h2>
      <button type="button" className="pc-iconbtn ec-head__close" aria-label="Close" onClick={requestClose} disabled={busy !== null}>
        <Icon name="close" size={18} />
      </button>
    </header>
  );

  /* ---------- Sent ---------- */

  if (sent) {
    return (
      <dialog
        ref={root}
        className="pc ec"
        aria-labelledby={`${ids}-heading`}
        onKeyDown={onKeyDown}
        onCancel={(e) => {
          e.preventDefault();
          closeModal(root.current, onClose);
        }}
      >
        <div className="pc__form">
          {head}
          <div className="ec-done">
            <section className="ec-sent" aria-labelledby={`${ids}-sent`}>
              <span className="ec-sent__mark" aria-hidden="true">
                <Icon name="check" size={28} strokeWidth={2.4} />
              </span>
              {sent.ref && <p className="ec-sent__ref num">{sent.ref}</p>}
              <h2 id={`${ids}-sent`} className="ec-sent__title" tabIndex={-1}>
                Sent for validation
              </h2>
              <p className="ec-sent__line">
                <b>{sent.title}</b>
                <span>Counts in {plural(sent.rankings, "ranking")} once accepted</span>
              </p>
              <StageTrack stage={0} status="For review" />
              <div className="ec-sent__actions">
                <button type="button" className="btn btn--dark" onClick={() => closeModal(root.current, onClose)} autoFocus>
                  Done
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    startOver();
                    setSent(null);
                  }}
                >
                  Submit another
                </button>
              </div>
            </section>
          </div>
        </div>
      </dialog>
    );
  }

  /* ---------- The rankings, over the tabs ---------- */

  const panelId = `${ids}-panel`;
  const rankingsPanel = (
    <Panel id={panelId} title="Rankings" note={chosen.length ? `${plural(reach.length, "ranking")} · ${plural(chosen.length, "indicator")}` : undefined} onDone={closeRanks}>
      {smart && matches.length > 0 && (
        <div className="ec-auto">
          <span className="ec-auto__text">
            <b>Match automatically</b>
            <span>Every suggestion counts</span>
          </span>
          <Switch checked={auto} onChange={setAuto} label="Match rankings automatically" />
        </div>
      )}
      {matches.length === 0 ? (
        <div className="ec-none">
          <span className="ec-none__art" aria-hidden="true">
            <Icon name="layers" size={26} strokeWidth={1.5} />
          </span>
          <b>Nothing to match yet</b>
          <span>Choose a type and an SDG in the Overview.</span>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.ranking} className="ec-rk" aria-label={g.ranking}>
            <h4 className="ec-rk__name">
              <i style={{ background: g.color }} aria-hidden="true" />
              {g.ranking}
            </h4>
            <ul className="ec-rk__list">
              {g.items.map((m) => (
                <li key={m.key}>
                  <label className="ec-ind" data-auto={auto ? "" : undefined}>
                    {auto ? (
                      <span className="ec-ind__auto" aria-label="Matched">
                        <Icon name="check" size={12} strokeWidth={2.8} />
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={chosen.includes(m.key)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.key] : p.filter((x) => x !== m.key)))}
                      />
                    )}
                    <span className="ec-ind__text">
                      <b>{m.indicator}</b>
                      <span>{m.why}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Panel>
  );

  const busyLabel = busy === "send" ? "Sending…" : busy !== null ? `Uploading ${Math.round(busy * 100)}%` : "Submit for validation";
  const tabsId = `${ids}-tabs`;
  const [a, b] = uploads.types.length > 1 ? uploads.types : [uploads.types[0] ?? "PDF", "XLSX"];

  return (
    <dialog
      ref={root}
      className="pc ec"
      aria-labelledby={`${ids}-heading`}
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        back();
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <form ref={formRef} className="pc__form" onSubmit={review}>
        {head}
        <div className="ec-frame" inert={confirming || leaving}>
          <div className="ec-tabs">
            <Tabs
              tabs={SUBMISSION_TABS.map((t) => {
                const flag = tried && problems[t] > 0;
                return { key: t, label: t, count: flag ? problems[t] : counts[t], countTone: flag ? ("alert" as const) : undefined };
              })}
              value={tab}
              onChange={show}
              label="Parts of your evidence"
              idBase={tabsId}
            />
          </div>

          <div className="ec-body">
            <div className="ec-main" inert={ranks}>
              <TabPanel idBase={tabsId} index={SUBMISSION_TABS.indexOf(tab)} className="ec-tab">
                {/* ---------- Overview ---------- */}
                <div className="ec-pane" data-tab="Overview" hidden={tab !== "Overview"}>
                  <div className="ec-sheet">
                    <section className="ec-card ec-card--lead" aria-label="Title and background">
                      <label className="sr-only" htmlFor={`${ids}-title`}>
                        Title
                      </label>
                      <textarea
                        ref={titleRef}
                        id={`${ids}-title`}
                        className="ec-title"
                        rows={1}
                        value={title}
                        onChange={(e) => setTitle(oneLine(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                          e.preventDefault();
                          backgroundRef.current?.focus();
                        }}
                        placeholder="Title"
                        required
                        minLength={4}
                        maxLength={160}
                        data-missing="Add a title."
                        autoComplete="off"
                      />
                      <div className="ec-bg">
                        <label className="ec-label" htmlFor={`${ids}-bg`}>
                          Background <em>optional</em>
                        </label>
                        <textarea
                          ref={backgroundRef}
                          id={`${ids}-bg`}
                          className="ec-bg__input"
                          rows={3}
                          value={background}
                          maxLength={EVIDENCE_LIMITS.background}
                          placeholder="Why was this needed? Two or three sentences."
                          onChange={(e) => setBackground(e.target.value)}
                        />
                        {background.length > 0 && (
                          <span className="ec-counter num" aria-hidden="true">
                            {background.length}/{EVIDENCE_LIMITS.background}
                          </span>
                        )}
                      </div>
                    </section>

                    <section className="ec-card" aria-labelledby={`${ids}-type`}>
                      <h3 id={`${ids}-type`} className="ec-label">
                        Type
                      </h3>
                      <div className="ec-proxied">
                        <div ref={typeGrid} className="ec-types" role="radiogroup" aria-labelledby={`${ids}-type`}>
                          {TYPES.map((t) => (
                            <label key={t.key} className="ec-type" title={t.note}>
                              <input type="radio" className="sr-only" name={`${ids}-type-choice`} value={t.key} checked={type === t.key} onChange={() => setType(t.key)} />
                              <span className="ec-type__icon" aria-hidden="true">
                                <Icon name={t.icon} size={19} strokeWidth={1.6} />
                              </span>
                              <span className="ec-type__name">{t.short}</span>
                            </label>
                          ))}
                        </div>
                        <input className="pick-proxy" tabIndex={-1} aria-hidden="true" required value={type} onChange={() => {}} data-missing="Choose the type of evidence." />
                      </div>
                      {kind && <p className="ec-caption">{kind.note}</p>}
                      <div className="ec-period">
                        <label className="ec-label" htmlFor={`${ids}-period-pick`}>
                          Period
                        </label>
                        <Select
                          id={`${ids}-period-pick`}
                          className="select ec-period__pick"
                          value={period}
                          onChange={setPeriod}
                          required
                          placeholder={periods.some((p) => p.accepting) ? "Choose a period" : "No period is open"}
                        >
                          {periods.map((p) => (
                            <option key={p.id} value={p.label} disabled={!p.accepting}>
                              {p.accepting ? p.label : `${p.label} · closed`}
                            </option>
                          ))}
                        </Select>
                        {periodNote && <p className="ec-caption">{periodNote}</p>}
                      </div>
                    </section>

                    <div className="ec-duo">
                      <section className="ec-card ec-card--gold" aria-labelledby={`${ids}-res`}>
                        <span className="ec-card__icon" aria-hidden="true">
                          <Icon name="target" size={16} />
                        </span>
                        <h3 id={`${ids}-res`} className="ec-label">
                          Result
                        </h3>
                        <div className="ec-figure">
                          <label className="ec-figure__value">
                            <span className="sr-only">Result</span>
                            <input
                              value={result}
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="4,820"
                              maxLength={60}
                              required
                              data-missing="Enter the result, like 4,820."
                              onChange={(e) => setResult(e.target.value)}
                            />
                          </label>
                          <label className="ec-figure__unit">
                            <span className="sr-only">What it counts</span>
                            <input value={measure} autoComplete="off" placeholder="cubic metres of rainwater reused" maxLength={120} onChange={(e) => setMeasure(e.target.value)} />
                          </label>
                        </div>
                      </section>

                      <section className="ec-card" aria-labelledby={`${ids}-who`}>
                        <span className="ec-card__icon ec-card__icon--soft" aria-hidden="true">
                          <Icon name="users" size={16} />
                        </span>
                        <h3 id={`${ids}-who`} className="ec-label">
                          Beneficiaries
                        </h3>
                        <div className="ec-fields">
                          <label className="field">
                            <span className="field__label">Who benefited</span>
                            <input
                              className="input"
                              value={who}
                              maxLength={120}
                              autoComplete="off"
                              required
                              data-missing="Say who benefited."
                              placeholder="Residents of Barangay 455"
                              onChange={(e) => setWho(e.target.value)}
                            />
                          </label>
                          <label className="field">
                            <span className="field__label">
                              How many <em>optional</em>
                            </span>
                            <input
                              className="input num"
                              value={count}
                              inputMode="numeric"
                              maxLength={14}
                              autoComplete="off"
                              placeholder="1,200"
                              onChange={(e) => setCount(e.target.value.replace(/[^\d,]/g, ""))}
                            />
                          </label>
                        </div>
                      </section>
                    </div>

                    <section className="ec-card" aria-labelledby={`${ids}-sdg`}>
                      <div className="ec-card__head">
                        <h3 id={`${ids}-sdg`} className="ec-label">
                          SDGs
                        </h3>
                        <span className="ec-card__note" aria-live="polite">
                          {sdgs.length ? sdgs.map((n) => `SDG ${n}`).join(", ") : "Select at least one"}
                        </span>
                        {sdgs.length > 0 && (
                          <button type="button" className="ec-clear" onClick={() => setSdgs([])}>
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="ec-proxied">
                        <div ref={sdgWrap} className="ec-sdgwrap">
                          <SdgPicker value={sdgs} onToggle={(n) => setSdgs((v) => (v.includes(n) ? v.filter((x) => x !== n) : [...v, n].sort((x, y) => x - y)))} />
                        </div>
                        <input className="pick-proxy" tabIndex={-1} aria-hidden="true" required value={sdgs.join(",")} onChange={() => {}} data-missing="Select at least one SDG." />
                      </div>
                    </section>
                  </div>
                </div>

                {/* ---------- Narrative ---------- */}
                <div className="ec-pane ec-pane--doc" data-tab="Narrative" hidden={tab !== "Narrative"}>
                  <DocEditor
                    key={doc}
                    id={`${ids}-doc`}
                    html={body}
                    label="Narrative"
                    contentLabel="What your unit did"
                    placeholder="What did your unit do? The challenge, the work, who took part, what changed."
                    pageRef={bodyRef}
                    inert={confirming || leaving || ranks}
                    onChange={setBody}
                    onPhotos={(list) => {
                      const n = addFiles(list);
                      if (n) toast(`${plural(n, "picture")} added to Evidence.`, "ok");
                    }}
                    lead={<p className={cx("ec-doc__title", !title.trim() && "is-empty")}>{title.trim() || "Untitled"}</p>}
                    after={<input ref={bodyProxy} className="pick-proxy" tabIndex={-1} aria-hidden="true" value={story} onChange={() => {}} />}
                  />
                </div>

                {/* ---------- Evidence ---------- */}
                <div className="ec-pane" data-tab="Evidence" hidden={tab !== "Evidence"}>
                  <div className="ec-sheet">
                    <section className="ec-card" aria-labelledby={`${ids}-lvl`}>
                      <h3 id={`${ids}-lvl`} className="ec-label">
                        Strength
                      </h3>
                      <div className="ec-steps" role="radiogroup" aria-labelledby={`${ids}-lvl`}>
                        {evidenceLevels.map((l, i) => (
                          <label key={l} className="ec-step">
                            <input type="radio" className="sr-only" name={`${ids}-level`} checked={level === i + 1} onChange={() => setLevel(i + 1)} />
                            <span className="ec-step__bars" aria-hidden="true">
                              {evidenceLevels.map((_, k) => (
                                <i key={k} data-on={k <= i ? "" : undefined} />
                              ))}
                            </span>
                            <span className="ec-step__n">Level {i + 1}</span>
                            <span className="ec-step__text">{l}</span>
                          </label>
                        ))}
                      </div>
                      <label className="field ec-verify">
                        <span className="field__label">
                          How it was verified <em>optional</em>
                        </span>
                        <span className="input-group">
                          <Icon name="shield-check" size={16} />
                          <input value={verified} maxLength={EVIDENCE_LIMITS.verifiedBy} autoComplete="off" placeholder="Survey of residents, before and after" onChange={(e) => setVerified(e.target.value)} />
                        </span>
                      </label>
                    </section>

                    <section className="ec-card" aria-labelledby={`${ids}-files`}>
                      <div className="ec-card__head">
                        <h3 id={`${ids}-files`} className="ec-label">
                          Files
                        </h3>
                        <span className="ec-card__note num">
                          {files.length} of {uploads.maxFiles}
                        </span>
                      </div>
                      <div className="ec-proxied">
                        <div ref={dropWrap} className="ec-dropwrap">
                          <Dropzone
                            multiple
                            noun="files"
                            accept={uploads.types.map((t) => `.${t.toLowerCase()}`).join(",")}
                            sheets={[
                              [a.slice(0, 4), COLORS[fileKind(`x.${a}`).kind]],
                              [b.slice(0, 4), COLORS[fileKind(`x.${b}`).kind]],
                            ]}
                            hint={
                              <>
                                Reports, survey copies, photos · {uploads.types.join(", ")} · up to {uploads.maxFileMB}&nbsp;MB each
                              </>
                            }
                            disabled={files.length >= uploads.maxFiles ? `${uploads.maxFiles} files is the most a submission takes.` : undefined}
                            onFiles={addFiles}
                          />
                        </div>
                        <input ref={filesProxy} className="pick-proxy" tabIndex={-1} aria-hidden="true" value={files.length} onChange={() => {}} />
                      </div>
                      {files.length > 0 && (
                        <ul className="dz-list ec-filelist" aria-label="Attached files">
                          {files.map(({ key, file, kind: k }) => {
                            const f = fileKind(file.name);
                            return (
                              <li key={key}>
                                <UploadRow
                                  badge={
                                    <span className={`cv-file__ext is-${f.kind}`} aria-hidden="true">
                                      {f.ext}
                                    </span>
                                  }
                                  name={file.name}
                                  meta={sizeOf(file.size)}
                                  actions={
                                    <Select
                                      className="select select--sm ec-kind"
                                      value={k}
                                      aria-label={`What ${file.name} is`}
                                      onChange={(v) => isFileKind(v) && setFiles((xs) => xs.map((x) => (x.key === key ? { ...x, kind: v } : x)))}
                                    >
                                      {EVIDENCE_FILE_KINDS.map((o) => (
                                        <option key={o} value={o}>
                                          {o}
                                        </option>
                                      ))}
                                    </Select>
                                  }
                                  onRetry={() => {}}
                                  onRemove={() => setFiles((xs) => xs.filter((x) => x.key !== key))}
                                  removeLabel={`Remove ${file.name}`}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {files.length > 1 && (
                        <ul className="ec-kinds" aria-label="Files by kind">
                          {EVIDENCE_FILE_KINDS.filter((o) => files.some((x) => x.kind === o)).map((o) => (
                            <li key={o}>
                              <Icon name={KIND[o].icon} size={13} />
                              {KIND[o].many} <b className="num">{files.filter((x) => x.kind === o).length}</b>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="ec-card" aria-labelledby={`${ids}-links`}>
                      <div className="ec-card__head">
                        <h3 id={`${ids}-links`} className="ec-label">
                          Links
                        </h3>
                        <span className="ec-card__note">Pages that open without signing in</span>
                      </div>
                      {links.length > 0 && (
                        <ul className="ec-rows">
                          {links.map((l, i) => (
                            <li key={l.key} className="ec-linkrow">
                              <span className="ec-linkrow__icon" aria-hidden="true">
                                <Icon name="globe" size={16} />
                              </span>
                              <UrlInput
                                className="input ec-linkrow__url"
                                value={l.url}
                                onValue={(url) => setLink(l.key, { url })}
                                placeholder="https://www.ust.edu.ph/…"
                                aria-label={`Link ${i + 1}`}
                                autoFocus={fresh === l.key}
                              />
                              <input
                                className="input ec-linkrow__label"
                                value={l.label}
                                maxLength={EVIDENCE_LIMITS.linkLabel}
                                autoComplete="off"
                                placeholder="Name, optional"
                                aria-label={`Name of link ${i + 1}`}
                                onChange={(e) => setLink(l.key, { label: e.target.value })}
                              />
                              <button type="button" className="ec-x" aria-label={`Remove link ${i + 1}`} onClick={() => setLinks((xs) => xs.filter((x) => x.key !== l.key))}>
                                <Icon name="close" size={16} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {links.length < EVIDENCE_LIMITS.links && (
                        <button type="button" className="ec-add" onClick={addLink}>
                          <Icon name="plus" size={16} /> Add link
                        </button>
                      )}
                    </section>
                  </div>
                </div>

                {/* ---------- References ---------- */}
                <div className="ec-pane" data-tab="References" hidden={tab !== "References"}>
                  <div className="ec-sheet">
                    {refs.length === 0 ? (
                      <div className="ec-card ec-empty">
                        <span className="ec-empty__art" aria-hidden="true">
                          <Icon name="quote" size={26} strokeWidth={1.5} />
                        </span>
                        <b>No references yet</b>
                        <span>Studies, news or documents this work draws on.</span>
                        <button type="button" className="btn btn--dark ec-empty__add" onClick={addRef}>
                          <Icon name="plus" size={16} /> Add reference
                        </button>
                      </div>
                    ) : (
                      <>
                        <ol className="ec-refs" aria-label="References">
                          {refs.map((r, i) => (
                            <li key={r.key} className="ec-card ec-ref">
                              <span className="ec-ref__n num" aria-hidden="true">
                                {i + 1}
                              </span>
                              <div className="ec-ref__fields">
                                <input
                                  className="ec-ref__title"
                                  value={r.title}
                                  maxLength={EVIDENCE_LIMITS.referenceTitle}
                                  autoComplete="off"
                                  placeholder="Title"
                                  aria-label={`Title of reference ${i + 1}`}
                                  required={!!(r.source.trim() || r.url.trim())}
                                  data-missing="Give this reference a title, or remove it."
                                  autoFocus={fresh === r.key}
                                  onChange={(e) => setRef(r.key, { title: e.target.value })}
                                />
                                <div className="ec-ref__row">
                                  <input
                                    className="input"
                                    value={r.source}
                                    maxLength={EVIDENCE_LIMITS.referenceSource}
                                    autoComplete="off"
                                    placeholder="Authors or outlet, year"
                                    aria-label={`Source of reference ${i + 1}`}
                                    onChange={(e) => setRef(r.key, { source: e.target.value })}
                                  />
                                  <UrlInput className="input" value={r.url} onValue={(url) => setRef(r.key, { url })} placeholder="https://…" aria-label={`Link of reference ${i + 1}`} />
                                </div>
                              </div>
                              <button type="button" className="ec-x" aria-label={`Remove reference ${i + 1}`} onClick={() => setRefs((xs) => xs.filter((x) => x.key !== r.key))}>
                                <Icon name="close" size={16} />
                              </button>
                            </li>
                          ))}
                        </ol>
                        {refs.length < EVIDENCE_LIMITS.references && (
                          <button type="button" className="ec-add" onClick={addRef}>
                            <Icon name="plus" size={16} /> Add reference
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </TabPanel>
            </div>

            {ranks && (
              <div className="pc-sidewrap" inert={leaving}>
                {rankingsPanel}
              </div>
            )}
          </div>

          <footer className="pc-foot ec-foot">
            <div className="ec-proxied ec-foot__reach">
              <button
                ref={reachRow}
                type="button"
                className="ec-reach"
                aria-expanded={ranks}
                aria-controls={ranks ? panelId : undefined}
                aria-label={`Counts in ${plural(reach.length, "ranking")}. Choose rankings.`}
                data-side-trigger="rankings"
                data-empty={reach.length ? undefined : ""}
                onClick={() => (ranks ? closeRanks() : setRanks(true))}
              >
                <b className="ec-reach__n num">{reach.length}</b>
                <span className="ec-reach__text">
                  <span className="ec-reach__label">
                    {reach.length === 1 ? "ranking" : "rankings"}
                    {chosen.length > 0 && <small> · {plural(chosen.length, "indicator")}</small>}
                  </span>
                  <span className="ec-reach__list">
                    {reach.length ? (
                      <>
                        {reach.slice(0, reach.length > 3 ? 2 : 3).map((g) => (
                          <span key={g.ranking} className="ec-reach__chip">
                            <i style={{ background: g.color }} />
                            {g.ranking}
                          </span>
                        ))}
                        {reach.length > 3 && <span className="ec-reach__chip">+{reach.length - 2}</span>}
                      </>
                    ) : (
                      <span className="ec-reach__hint">{matches.length ? "Tick at least one" : "Pick a type and SDGs"}</span>
                    )}
                  </span>
                </span>
                <Icon name="chevron" size={16} className="ec-reach__chev" />
              </button>
              <input ref={reachProxy} className="pick-proxy" tabIndex={-1} aria-hidden="true" value={chosen.length} onChange={() => {}} />
            </div>
            {savedAt && (
              <span className="ec-foot__draft">
                Draft saved
                <button type="button" onClick={startOver}>
                  Start over
                </button>
              </span>
            )}
            <div className="pc-actions">
              <button type="button" className="btn pc-actions__btn" onClick={saveDraft} disabled={!dirty}>
                Save draft
              </button>
              <button type="submit" className="btn btn--dark pc-actions__btn" onClick={jump}>
                <Icon name="send" size={16} /> Submit
              </button>
            </div>
          </footer>
        </div>
      </form>

      {dropping && (
        <span className="pc-drop" aria-hidden="true">
          <Icon name="paperclip" size={22} />
          Drop to attach
        </span>
      )}

      {confirming && (
        <dialog
          ref={confirmDialog}
          className="pc-leave ec-confirm"
          aria-labelledby={`${ids}-confirm`}
          onCancel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (busy === null) closeModal(confirmDialog.current, () => setConfirming(false));
          }}
        >
          <form className="pc-leave__card" onSubmit={send}>
            <h3 id={`${ids}-confirm`} className="pc-leave__title">
              Ready to send?
            </h3>
            <ul className="ec-recap" aria-label="This submission">
              <li>
                <Icon name={kind?.icon ?? "evidence"} size={14} />
                {kind?.short}
              </li>
              <li>
                <Icon name="calendar" size={14} />
                {period}
              </li>
              <li>
                <Icon name="paperclip" size={14} />
                {[files.length ? plural(files.length, "file") : "", linkList.length ? plural(linkList.length, "link") : ""].filter(Boolean).join(" · ")}
              </li>
              {refList.length > 0 && (
                <li>
                  <Icon name="quote" size={14} />
                  {plural(refList.length, "reference")}
                </li>
              )}
              <li className="ec-recap__gold">
                <Icon name="layers" size={14} />
                {plural(reach.length, "ranking")}
              </li>
            </ul>
            <label className="ec-certify">
              <input type="checkbox" required data-missing="Tick to certify the submission." />
              <span>I certify this is accurate and approved by the unit head.</span>
            </label>
            {typeof busy === "number" && (
              <span className="ec-upload" role="progressbar" aria-label="Uploading files" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(busy * 100)}>
                <span style={{ transform: `scaleX(${busy})` }} />
              </span>
            )}
            <div className="pc-leave__actions">
              <button type="button" className="btn" disabled={busy !== null} onClick={() => closeModal(confirmDialog.current, () => setConfirming(false))}>
                Back
              </button>
              <button type="submit" className="btn btn--dark" disabled={busy !== null}>
                {busyLabel}
              </button>
            </div>
          </form>
        </dialog>
      )}

      {leaving && (
        <dialog
          ref={leaveDialog}
          className="pc-leave ec-leave"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${ids}-leave`}
          aria-describedby={`${ids}-leave-text`}
          onCancel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closeModal(leaveDialog.current, () => setLeaving(false));
          }}
        >
          <div className="pc-leave__card">
            <h3 id={`${ids}-leave`} className="pc-leave__title">
              Keep this as a draft?
            </h3>
            <p id={`${ids}-leave-text`} className="pc-leave__text">
              {files.length ? "Drafts stay on this device. Files need attaching again." : "Drafts stay on this device until you submit."}
            </p>
            <div className="pc-leave__actions">
              <button type="button" className="btn btn--danger pc-discard ec-leave__discard" onClick={() => closeModal(root.current, onClose)}>
                Discard
              </button>
              <button type="button" className="btn" onClick={() => closeModal(leaveDialog.current, () => setLeaving(false))}>
                Keep editing
              </button>
              <button type="button" className="btn btn--dark" autoFocus onClick={() => saveDraft() && closeModal(root.current, onClose)}>
                Save draft
              </button>
            </div>
          </div>
        </dialog>
      )}
    </dialog>
  );
}
